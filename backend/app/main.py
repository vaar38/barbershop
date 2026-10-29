from fastapi import FastAPI

from app.routers import appointments, auth, branches, categories, masters, services, shifts, stats, users

app = FastAPI()
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(branches.router)
app.include_router(categories.router)
app.include_router(services.router)
app.include_router(masters.router)
app.include_router(appointments.router)
app.include_router(shifts.router)
app.include_router(stats.router)


@app.get("/api/health")
def get_health():
    return {"status": "ok"}
