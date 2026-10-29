"""Демо-данные для показа: филиалы, услуги, мастера со сменами на две недели, админ и клиент.

Запуск из папки backend (после alembic upgrade head):
    python -m app.seed
В Docker:
    docker compose exec backend python -m app.seed

Если в базе уже есть филиалы, скрипт ничего не делает.
"""
from datetime import date, time, timedelta

from app.database import SessionLocal
from app.models import Branch, Master, MasterService, Role, Service, ServiceCategory, User, WorkShift
from app.security import hash_password

PASSWORD = "12345678"

BRANCHES = [
    ("Fade на Тверской", "ул. Тверская, 12", "+7 495 100-10-01"),
    ("Fade на Арбате", "ул. Арбат, 5", "+7 495 100-10-02"),
]

SERVICES = {
    "Стрижки": [
        ("Мужская стрижка", 45, 1500, "Мытьё головы и укладка включены"),
        ("Стрижка машинкой", 30, 900, "Одна насадка"),
        ("Детская стрижка", 30, 1000, "До 12 лет"),
    ],
    "Борода": [
        ("Оформление бороды", 30, 800, None),
        ("Королевское бритьё", 45, 1300, "Опасной бритвой, горячее полотенце"),
    ],
    "Уход": [
        ("Камуфляж седины", 30, 1200, None),
    ],
}

# имя, email, филиал (индекс), уровень, какие категории делает, о себе
MASTERS = [
    ("Иван Соколов", "ivan@fade.ru", 0, "top", ["Стрижки", "Борода"], "Стрижёт двенадцать лет, любит классику."),
    ("Олег Дьяков", "oleg@fade.ru", 0, "middle", ["Стрижки", "Уход"], None),
    ("Тимур Алиев", "timur@fade.ru", 1, "junior", ["Стрижки", "Борода"], "Короткие стрижки и фейды."),
    ("Анна Белова", "anna@fade.ru", 1, "middle", ["Стрижки", "Уход"], None),
]


def run():
    db = SessionLocal()
    if db.query(Branch).count():
        print("В базе уже есть данные — пропускаю.")
        return

    roles = {r.name: r.id for r in db.query(Role).all()}

    branches = [Branch(name=n, address=a, phone=p) for n, a, p in BRANCHES]
    db.add_all(branches)

    by_category = {}
    for cat_name, items in SERVICES.items():
        cat = ServiceCategory(name=cat_name)
        db.add(cat)
        db.flush()
        by_category[cat_name] = []
        for name, minutes, price, descr in items:
            service = Service(category_id=cat.id, name=name, duration_min=minutes, base_price=price, description=descr)
            db.add(service)
            by_category[cat_name].append(service)
    db.flush()

    db.add(User(role_id=roles["admin"], email="admin@fade.ru", password_hash=hash_password(PASSWORD), full_name="Администратор"))
    db.add(User(role_id=roles["client"], email="client@fade.ru", password_hash=hash_password(PASSWORD), full_name="Пётр Клиентов"))

    today = date.today()
    for full_name, email, branch_index, level, categories, bio in MASTERS:
        user = User(role_id=roles["master"], email=email, password_hash=hash_password(PASSWORD), full_name=full_name)
        db.add(user)
        db.flush()
        branch = branches[branch_index]
        master = Master(user_id=user.id, branch_id=branch.id, level=level, bio=bio)
        db.add(master)
        db.flush()
        for cat in categories:
            for service in by_category[cat]:
                db.add(MasterService(master_id=master.id, service_id=service.id))
        # смены на 14 дней вперёд, по воскресеньям выходной
        for i in range(14):
            day = today + timedelta(days=i)
            if day.weekday() == 6:
                continue
            db.add(WorkShift(master_id=master.id, branch_id=branch.id, work_date=day, start_time=time(10), end_time=time(20)))

    db.commit()
    print(f"Готово. Пароль у всех: {PASSWORD}")
    print("admin@fade.ru — администратор, client@fade.ru — клиент, ivan@fade.ru и др. — мастера")


if __name__ == "__main__":
    run()
