from datetime import datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.config import TZ
from conftest import at, auth, book, move_to, move_to_past


# --- Создание записи ---

def test_server_computes_end_and_price(api, world, db):
    response = book(api, world, at(10), [world.haircut, world.beard])
    assert response.status_code == 201
    data = response.json()

    # 45 + 30 минут; (1500 + 800) × 1.5 у топ-мастера
    start = datetime.fromisoformat(data["start_at"])
    end = datetime.fromisoformat(data["end_at"])
    assert end - start == timedelta(minutes=75)
    assert data["total_price"] == "3450.00"
    assert data["status"] == "pending"
    assert data["client_name"] == "Пётр Клиентов"
    assert data["services"] == ["Мужская стрижка", "Оформление бороды"]

    # цена каждой услуги сохранена снимком
    prices = db.execute(
        text("SELECT price FROM appointment_services WHERE appointment_id = :id ORDER BY price"),
        {"id": data["id"]},
    ).scalars().all()
    assert [str(p) for p in prices] == ["1200.00", "2250.00"]


def test_price_does_not_change_after_price_list_update(api, world):
    appointment = book(api, world, at(10)).json()
    api.put(
        f"/api/services/{world.haircut}",
        json={"category_id": world.category_id, "name": "Мужская стрижка", "duration_min": 45, "base_price": 5000},
        headers=auth(world.admin),
    )
    again = api.get(f"/api/appointments/{appointment['id']}", headers=auth(world.client)).json()
    assert again["total_price"] == "2250.00"


def test_double_booking(api, world):
    assert book(api, world, at(11)).status_code == 201
    # то же время другим клиентом и пересечение «хвостом»
    assert book(api, world, at(11), token=world.client2).status_code == 409
    assert book(api, world, at(10, 30), token=world.client2).status_code == 409


def test_back_to_back_is_allowed(api, world):
    assert book(api, world, at(11)).status_code == 201        # 11:00–11:45
    assert book(api, world, at(11, 45)).status_code == 201    # сразу после — можно
    assert book(api, world, at(10, 15)).status_code == 201    # 10:15–11:00 — тоже можно


def test_last_slot_ends_exactly_at_shift_end(api, world):
    # запись впритык к концу смены: 13:15–14:00
    assert book(api, world, at(13, 15)).status_code == 201


def test_does_not_fit_in_shift(api, world):
    assert book(api, world, at(13, 30)).status_code == 422   # закончилась бы в 14:15
    assert book(api, world, at(9, 45)).status_code == 422    # раньше смены


def test_not_on_15_minute_grid(api, world):
    assert book(api, world, at(10, 10)).status_code == 422


def test_in_the_past(api, world):
    yesterday = (datetime.now(TZ) - timedelta(days=1)).replace(hour=11, minute=0, second=0, microsecond=0)
    assert book(api, world, yesterday.isoformat()).status_code == 422


def test_only_client_can_book(api, world):
    assert book(api, world, at(10), token=world.admin).status_code == 403
    assert book(api, world, at(10), token=world.master_token).status_code == 403


def test_database_blocks_overlap_without_api(api, world, db):
    """Даже если обойти проверку в коде, пересечение не даст записать сама база (EXCLUDE)."""
    book(api, world, at(11))
    client_id = db.execute(text("SELECT id FROM users WHERE email = 'client2@fade.ru'")).scalar()
    with pytest.raises(IntegrityError) as error:
        db.execute(
            text("INSERT INTO appointments (client_id, master_id, branch_id, start_at, end_at, total_price) "
                 "VALUES (:c, :m, :b, :s, :e, 100)"),
            {"c": client_id, "m": world.master, "b": world.branch_id, "s": at(11, 30), "e": at(12)},
        )
    db.rollback()
    assert "ex_appointments_no_overlap" in str(error.value)


# --- Кто что видит ---

def test_list_by_role(api, world):
    book(api, world, at(10))
    book(api, world, at(10), token=world.client2, master=world.other_master)

    assert len(api.get("/api/appointments", headers=auth(world.client)).json()) == 1
    assert len(api.get("/api/appointments", headers=auth(world.master_token)).json()) == 1
    assert len(api.get("/api/appointments", headers=auth(world.admin)).json()) == 2
    only_ivan = api.get("/api/appointments", params={"master_id": world.master}, headers=auth(world.admin))
    assert len(only_ivan.json()) == 1


def test_foreign_appointment_is_404(api, world):
    appointment = book(api, world, at(10)).json()
    url = f"/api/appointments/{appointment['id']}"

    assert api.get(url, headers=auth(world.client)).status_code == 200
    assert api.get(url, headers=auth(world.master_token)).status_code == 200
    assert api.get(url, headers=auth(world.admin)).status_code == 200
    # чужая запись выглядит как несуществующая
    assert api.get(url, headers=auth(world.client2)).status_code == 404
    assert api.get(url, headers=auth(world.other_master_token)).status_code == 404
    assert api.get("/api/appointments/9999", headers=auth(world.admin)).status_code == 404


# --- Отмена ---

def cancel(api, appointment_id, token):
    return api.post(f"/api/appointments/{appointment_id}/cancel", headers=auth(token))


def test_client_cancels_in_advance(api, world):
    appointment = book(api, world, at(10)).json()
    response = cancel(api, appointment["id"], world.client)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert cancel(api, appointment["id"], world.client).status_code == 409


def test_client_cannot_cancel_less_than_2_hours_before(api, world, db):
    appointment = book(api, world, at(10)).json()
    move_to(db, appointment["id"], 90)
    assert cancel(api, appointment["id"], world.client).status_code == 422
    # администратор может отменить в любое время
    assert cancel(api, appointment["id"], world.admin).status_code == 200


def test_who_can_cancel(api, world):
    appointment = book(api, world, at(10)).json()
    assert cancel(api, appointment["id"], world.master_token).status_code == 403
    assert cancel(api, appointment["id"], world.client2).status_code == 404


# --- Статусы ---

def set_status(api, appointment_id, status, token):
    return api.patch(f"/api/appointments/{appointment_id}/status", json={"status": status}, headers=auth(token))


def test_status_flow(api, world, db):
    appointment = book(api, world, at(10)).json()
    aid = appointment["id"]

    assert set_status(api, aid, "completed", world.master_token).status_code == 422   # сначала подтвердить
    assert set_status(api, aid, "confirmed", world.master_token).status_code == 200
    assert set_status(api, aid, "completed", world.master_token).status_code == 422   # визит ещё не начался

    move_to_past(db, aid)
    response = set_status(api, aid, "completed", world.master_token)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert set_status(api, aid, "no_show", world.master_token).status_code == 422     # итог уже стоит


def test_who_can_change_status(api, world):
    aid = book(api, world, at(10)).json()["id"]
    assert set_status(api, aid, "confirmed", world.client).status_code == 403
    assert set_status(api, aid, "confirmed", world.other_master_token).status_code == 404
    assert set_status(api, aid, "confirmed", world.admin).status_code == 200


# --- Отзывы ---

def completed_appointment(api, world, db):
    aid = book(api, world, at(10)).json()["id"]
    set_status(api, aid, "confirmed", world.admin)
    move_to_past(db, aid)
    set_status(api, aid, "completed", world.admin)
    return aid


def review(api, aid, token, rating=5):
    return api.post(f"/api/appointments/{aid}/review", json={"rating": rating, "text": "Отлично"}, headers=auth(token))


def test_review_after_visit(api, world, db):
    aid = completed_appointment(api, world, db)
    assert review(api, aid, world.client).status_code == 201
    assert review(api, aid, world.client).status_code == 409   # второй отзыв на ту же запись

    reviews = api.get(f"/api/masters/{world.master}/reviews").json()
    assert len(reviews) == 1
    assert reviews[0]["rating"] == 5


def test_review_rules(api, world, db):
    not_finished = book(api, world, at(12)).json()["id"]
    assert review(api, not_finished, world.client).status_code == 422   # визита ещё не было

    aid = completed_appointment(api, world, db)
    assert review(api, aid, world.client2).status_code == 404           # чужая запись
    assert review(api, aid, world.client, rating=6).status_code == 422  # оценка 1–5
