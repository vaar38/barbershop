from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    func,
)

from app.database import Base


# Роли пользователей: client, master, admin (заполняются миграцией: 1, 2, 3)
class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)


# Любой человек в системе: клиент, мастер или администратор
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)  # хэш bcrypt, не сам пароль
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20))
    # Попадает в каждый JWT. При выходе +1 — все старые токены перестают работать
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# Филиал барбершопа (точка с адресом)
class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    address = Column(String(255), nullable=False)
    phone = Column(String(20))
    # Закрытый филиал не удаляют (на него ссылаются старые записи), а выключают
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")


# Категория услуг: «Стрижки», «Борода» и т.п.
class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)


# Услуга из прайса
class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    duration_min = Column(SmallInteger, nullable=False)  # длительность в минутах
    base_price = Column(Numeric(10, 2), nullable=False)  # цена до умножения на уровень мастера
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    __table_args__ = (
        CheckConstraint("duration_min > 0", name="ck_services_duration"),
        CheckConstraint("base_price > 0", name="ck_services_price"),
    )


# Профиль мастера. Сам мастер — это User с ролью master, здесь только его доп. данные (1:1)
class Master(Base):
    __tablename__ = "masters"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    # junior / middle / top — от уровня зависит цена (коэффициент 1.0 / 1.2 / 1.5)
    level = Column(String(20), nullable=False)
    bio = Column(Text)
    photo_url = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    __table_args__ = (
        CheckConstraint("level IN ('junior', 'middle', 'top')", name="ck_masters_level"),
    )


# Какие услуги делает мастер (связь многие-ко-многим, только пары id)
class MasterService(Base):
    __tablename__ = "master_services"

    master_id = Column(Integer, ForeignKey("masters.id"), primary_key=True)
    service_id = Column(Integer, ForeignKey("services.id"), primary_key=True)


# Смена мастера: в какой день, где и с какого по какое время он работает.
# Хранится в местном времени (date + time), записываться можно только внутрь смены
class WorkShift(Base):
    __tablename__ = "work_shifts"

    id = Column(Integer, primary_key=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_work_shifts_time"),
    )


# Запись клиента к мастеру. end_at и total_price считает сервер.
# Пересечение активных записей одного мастера запрещено в базе (ex_appointments_no_overlap в миграции)
class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=False)
    # pending → confirmed → completed / no_show; отменённая — cancelled
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    total_price = Column(Numeric(10, 2), nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True))  # пусто, пока запись не отменена

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_appointments_time"),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')",
            name="ck_appointments_status",
        ),
        CheckConstraint("total_price >= 0", name="ck_appointments_price"),
    )


# Состав записи: какие услуги в неё входят.
# Цена и длительность — снимок на момент записи, чтобы смена прайса не меняла старые записи
class AppointmentService(Base):
    __tablename__ = "appointment_services"

    appointment_id = Column(Integer, ForeignKey("appointments.id"), primary_key=True)
    service_id = Column(Integer, ForeignKey("services.id"), primary_key=True)
    price = Column(Numeric(10, 2), nullable=False)
    duration_min = Column(SmallInteger, nullable=False)


# Отзыв клиента — только по выполненной записи, один на запись
class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), unique=True, nullable=False)
    rating = Column(SmallInteger, nullable=False)
    text = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
    )
