import os
from zoneinfo import ZoneInfo

from dotenv import load_dotenv


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/fade")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
TIMEZONE = os.getenv("TIMEZONE", "Europe/Moscow")
TZ = ZoneInfo(TIMEZONE)
ACCESS_TOKEN_MINUTES = 30
REFRESH_TOKEN_DAYS = 7
