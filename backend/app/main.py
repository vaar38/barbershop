from fastapi import FastAPI

from app.routers import auth, branches, categories, services, masters, appointments

app = FastAPI()
app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(categories.router)
app.include_router(services.router)
app.include_router(masters.router)
app.include_router(appointments.router)


@app.get("/api/health")
def get_health():
    return {"status": "ok"}
