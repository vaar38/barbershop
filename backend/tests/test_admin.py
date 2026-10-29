from datetime import timedelta

from conftest import DAY, at, auth, book, login


def test_client_cannot_edit_catalog(api, world):
    response = api.post("/api/branches", json={"name": "X", "address": "Y"}, headers=auth(world.client))
    assert response.status_code == 403


def test_branch_crud(api, world):
    headers = auth(world.admin)
    created = api.post("/api/branches", json={"name": "Fade на Пресне", "address": "ул. Пресненская, 1"}, headers=headers)
    assert created.status_code == 201
    bid = created.json()["id"]

    assert api.post("/api/branches", json={"name": "Fade на Пресне", "address": "z"}, headers=headers).status_code == 409

    updated = api.put(f"/api/branches/{bid}", json={"name": "Fade на Пресне", "address": "ул. Пресненская, 2"},
                      headers=headers)
    assert updated.json()["address"] == "ул. Пресненская, 2"

    # закрытый филиал пропадает из списка, но остаётся в базе
    assert api.delete(f"/api/branches/{bid}", headers=headers).status_code == 204
    assert bid not in [b["id"] for b in api.get("/api/branches").json()]


def test_service_soft_delete(api, world):
    assert api.delete(f"/api/services/{world.beard}", headers=auth(world.admin)).status_code == 204
    names = [s["name"] for s in api.get("/api/services").json()]
    assert "Оформление бороды" not in names


def test_category_with_services_cannot_be_deleted(api, world):
    response = api.delete(f"/api/categories/{world.category_id}", headers=auth(world.admin))
    assert response.status_code == 409


def test_service_validation(api, world):
    body = {"category_id": world.category_id, "name": "Z", "duration_min": 30, "base_price": 0}
    assert api.post("/api/services", json=body, headers=auth(world.admin)).status_code == 422


def test_create_master_with_account(api, world):
    body = {
        "email": "new@fade.ru",
        "password": "12345678",
        "full_name": "Новый Мастер",
        "branch_id": world.branch_id,
        "level": "junior",
        "service_ids": [world.haircut],
    }
    response = api.post("/api/masters", json=body, headers=auth(world.admin))
    assert response.status_code == 201
    master_id = response.json()["id"]

    # мастер может войти и видит роль master
    me = api.get("/api/users/me", headers=auth(login(api, "new@fade.ru"))).json()
    assert me["role"] == "master"

    # и находится в каталоге по своей услуге
    found = api.get("/api/masters", params={"service_id": world.haircut}).json()
    assert master_id in [m["id"] for m in found]

    assert api.post("/api/masters", json=body, headers=auth(world.admin)).status_code == 409
    assert api.post("/api/masters", json={**body, "email": "x@fade.ru", "level": "senior"},
                    headers=auth(world.admin)).status_code == 422


def test_fired_master_disappears(api, world):
    assert api.delete(f"/api/masters/{world.other_master}", headers=auth(world.admin)).status_code == 204
    assert api.get(f"/api/masters/{world.other_master}").status_code == 404
    assert book(api, world, at(10), master=world.other_master).status_code == 404


def test_shifts(api, world):
    headers = auth(world.admin)
    url = f"/api/masters/{world.master}/shifts"
    day = DAY.isoformat()

    # вторая смена в тот же день и смена «наоборот» запрещены
    assert api.post(url, json={"work_date": day, "start_time": "15:00", "end_time": "18:00"},
                    headers=headers).status_code == 409
    next_day = DAY + timedelta(days=1)
    assert api.post(url, json={"work_date": next_day.isoformat(), "start_time": "14:00", "end_time": "10:00"},
                    headers=headers).status_code == 422

    # смены видит сам мастер, но не чужой
    params = {"date_from": day, "date_to": day}
    shifts = api.get(url, params=params, headers=auth(world.master_token))
    assert shifts.status_code == 200
    assert api.get(url, params=params, headers=auth(world.other_master_token)).status_code == 403

    # смену с записью удалить нельзя
    shift_id = shifts.json()[0]["id"]
    book(api, world, at(10))
    assert api.delete(f"/api/shifts/{shift_id}", headers=headers).status_code == 409


def test_stats(api, world):
    book(api, world, at(10))
    cancelled = book(api, world, at(12)).json()
    api.post(f"/api/appointments/{cancelled['id']}/cancel", headers=auth(world.client))

    params = {"date_from": DAY.isoformat(), "date_to": DAY.isoformat()}
    assert api.get("/api/stats", params=params, headers=auth(world.client)).status_code == 403

    stats = api.get("/api/stats", params=params, headers=auth(world.admin)).json()
    assert stats["total"] == 2
    assert stats["by_status"] == {"pending": 1, "cancelled": 1}
    assert float(stats["revenue"]) == 0
    assert stats["per_master"] == [{"master_id": world.master, "full_name": "Иван Соколов", "appointments": 1}]
