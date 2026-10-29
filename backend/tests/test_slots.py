from datetime import datetime, timedelta

from conftest import DAY, at, book


def slots(api, world, services=None, master=None, day=DAY):
    ids = services or [world.haircut]
    return api.get(
        f"/api/masters/{master or world.master}/slots",
        params={"date": day.isoformat(), "service_ids": ids},
    )


def times(response):
    return [datetime.fromisoformat(s).strftime("%H:%M") for s in response.json()]


def test_slots_step_15_minutes_inside_shift(api, world):
    # смена 10:00–14:00, стрижка 45 минут → последнее начало 13:15
    result = times(slots(api, world))
    assert result[:3] == ["10:00", "10:15", "10:30"]
    assert result[-1] == "13:15"
    assert len(result) == 14


def test_duration_is_sum_of_services(api, world):
    # 45 + 30 = 75 минут → последнее начало 12:45
    assert times(slots(api, world, [world.haircut, world.beard]))[-1] == "12:45"


def test_busy_time_is_excluded(api, world):
    book(api, world, at(11))  # 11:00–11:45
    result = times(slots(api, world))
    for busy in ["10:30", "10:45", "11:00", "11:15", "11:30"]:
        assert busy not in result
    # интервалы полуоткрытые: 10:15–11:00 и 11:45–12:30 не пересекаются с 11:00–11:45
    assert "10:15" in result
    assert "11:45" in result


def test_cancelled_appointment_frees_time(api, world):
    appointment = book(api, world, at(11)).json()
    api.post(f"/api/appointments/{appointment['id']}/cancel", headers={"Authorization": f"Bearer {world.client}"})
    assert "11:00" in times(slots(api, world))


def test_other_master_is_not_affected(api, world):
    book(api, world, at(11))
    assert "11:00" in times(slots(api, world, master=world.other_master))


def test_no_shift_no_slots(api, world):
    response = slots(api, world, day=DAY + timedelta(days=5))
    assert response.status_code == 200
    assert response.json() == []


def test_service_master_does_not_do(api, world, db):
    from app.models import Service

    other = Service(category_id=world.category_id, name="Камуфляж седины", duration_min=30, base_price=1200)
    db.add(other)
    db.commit()
    assert slots(api, world, [other.id]).status_code == 422


def test_unknown_master(api, world):
    assert slots(api, world, master=999).status_code == 404
