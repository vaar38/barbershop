from fastapi import FastAPI

from app.routers import auth

app = FastAPI()
app.include_router(auth.router)


@app.get("/api/health")
def get_health():
    return {"status": "ok"}
