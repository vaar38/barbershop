"""Общие настройки тестов.

Тесты работают с отдельной базой fade_test на том же сервере PostgreSQL, что указан в DATABASE_URL.
База создаётся сама, схема — настоящей миграцией Alembic (вместе с EXCLUDE-ограничением),
после каждого теста все таблицы, кроме ролей, очищаются.
"""
import os
from datetime import date, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

# Адрес тестовой базы нужно подставить ДО импорта приложения: engine создаётся при импорте app.database
load_dotenv(Path(__file__).parents[1] / ".env")
main_url = make_url(os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/fade"))
test_url = main_url.set(database="fade_test")
os.environ["DATABASE_URL"] = test_url.render_as_string(hide_password=False)

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import TZ  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Branch, Master, MasterService, Role, Service, ServiceCategory, User, WorkShift  # noqa: E402
from app.security import hash_password  # noqa: E402

PASSWORD = "12345678"
# день, на который ставим смену: послезавтра, чтобы «прошлое» и «за 2 часа» не мешали
DAY = date.today() + timedelta(days=2)


def at(hour, minute=0, day=DAY):
    """Время в поясе сети в формате, который принимает API."""
    return datetime.combine(day, time(hour, minute), tzinfo=TZ).isoformat()


@pytest.fixture(scope="session", autouse=True)
def database():
    server = create_engine(main_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as conn:
        if not conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = 'fade_test'")):
            conn.execute(text("CREATE DATABASE fade_test"))
    server.dispose()

    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE reviews, appointment_services, appointments, work_shifts, master_services, "
            "masters, services, service_categories, branches, users RESTART IDENTITY CASCADE"
        ))


@pytest.fixture
def api():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def add_user(db, role, email, full_name, phone=None):
    role_id = db.query(Role).filter(Role.name == role).first().id
    user = User(role_id=role_id, email=email, password_hash=hash_password(PASSWORD), full_name=full_name, phone=phone)
    db.add(user)
    db.flush()
    return user


def login(api, email):
    response = api.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(api, db):
    """Филиал, две услуги, топ-мастер со сменой 10:00–14:00, второй мастер, два клиента и админ."""
    branch = Branch(name="Fade на Тверской", address="ул. Тверская, 12")
    category = ServiceCategory(name="Стрижки")
    db.add_all([branch, category])
    db.flush()

    haircut = Service(category_id=category.id, name="Мужская стрижка", duration_min=45, base_price=1500)
    beard = Service(category_id=category.id, name="Оформление бороды", duration_min=30, base_price=800)
    db.add_all([haircut, beard])
    db.flush()

    masters = []
    for email, name, level in [("ivan@fade.ru", "Иван Соколов", "top"), ("oleg@fade.ru", "Олег Дьяков", "junior")]:
        user = add_user(db, "master", email, name)
        master = Master(user_id=user.id, branch_id=branch.id, level=level)
        db.add(master)
        db.flush()
        db.add_all([MasterService(master_id=master.id, service_id=s.id) for s in (haircut, beard)])
        db.add(WorkShift(master_id=master.id, branch_id=branch.id, work_date=DAY,
                         start_time=time(10), end_time=time(14)))
        masters.append(master)

    add_user(db, "client", "client@fade.ru", "Пётр Клиентов", "+7 900 000-00-00")
    add_user(db, "client", "client2@fade.ru", "Второй Клиент")
    add_user(db, "admin", "admin@fade.ru", "Администратор")
    db.commit()

    return SimpleNamespace(
        branch_id=branch.id,
        category_id=category.id,
        haircut=haircut.id,
        beard=beard.id,
        master=masters[0].id,
        other_master=masters[1].id,
        client=login(api, "client@fade.ru"),
        client2=login(api, "client2@fade.ru"),
        master_token=login(api, "ivan@fade.ru"),
        other_master_token=login(api, "oleg@fade.ru"),
        admin=login(api, "admin@fade.ru"),
    )


def book(api, world, start, services=None, token=None, master=None):
    body = {
        "master_id": master or world.master,
        "service_ids": services or [world.haircut],
        "start_at": start,
    }
    return api.post("/api/appointments", json=body, headers=auth(token or world.client))


def move_to_past(db, appointment_id, hours_ago=2):
    """Сдвигает запись в прошлое: так проверяем правила, зависящие от текущего времени."""
    db.execute(
        text("UPDATE appointments SET start_at = now() - make_interval(hours => :h), "
             "end_at = now() - make_interval(hours => :h) + interval '45 minutes' WHERE id = :id"),
        {"h": hours_ago, "id": appointment_id},
    )
    db.commit()


def move_to(db, appointment_id, minutes_from_now):
    db.execute(
        text("UPDATE appointments SET start_at = now() + make_interval(mins => :m), "
             "end_at = now() + make_interval(mins => :m) + interval '45 minutes' WHERE id = :id"),
        {"m": minutes_from_now, "id": appointment_id},
    )
    db.commit()
