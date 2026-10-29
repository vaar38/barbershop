from conftest import auth, login

USER = {"email": "new@fade.ru", "password": "12345678", "full_name": "Новый Клиент"}


def test_register_gives_client_role(api):
    response = api.post("/api/auth/register", json=USER)
    assert response.status_code == 201
    assert "password_hash" not in response.json()

    me = api.get("/api/users/me", headers=auth(login(api, USER["email"]))).json()
    assert me["role"] == "client"
    assert me["full_name"] == "Новый Клиент"


def test_register_same_email_twice(api):
    api.post("/api/auth/register", json=USER)
    assert api.post("/api/auth/register", json=USER).status_code == 409


def test_register_short_password(api):
    response = api.post("/api/auth/register", json={**USER, "password": "123"})
    assert response.status_code == 422


def test_login_wrong_password(api):
    api.post("/api/auth/register", json=USER)
    response = api.post("/api/auth/login", json={"email": USER["email"], "password": "wrong-pass"})
    assert response.status_code == 401


def test_me_without_token(api):
    assert api.get("/api/users/me").status_code in (401, 403)


def test_refresh_gives_new_pair(api):
    api.post("/api/auth/register", json=USER)
    tokens = api.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]}).json()

    response = api.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    assert api.get("/api/users/me", headers=auth(response.json()["access_token"])).status_code == 200


def test_refresh_token_is_not_access_token(api):
    api.post("/api/auth/register", json=USER)
    tokens = api.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]}).json()
    assert api.get("/api/users/me", headers=auth(tokens["refresh_token"])).status_code == 401


def test_logout_revokes_all_tokens(api):
    api.post("/api/auth/register", json=USER)
    tokens = api.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]}).json()
    other_device = login(api, USER["email"])

    assert api.post("/api/auth/logout", headers=auth(tokens["access_token"])).status_code == 204

    # после выхода не работают ни этот токен, ни токен с другого устройства, ни refresh
    assert api.get("/api/users/me", headers=auth(tokens["access_token"])).status_code == 401
    assert api.get("/api/users/me", headers=auth(other_device)).status_code == 401
    assert api.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_update_profile_keeps_other_fields(api):
    api.post("/api/auth/register", json={**USER, "phone": "+7 900 111-11-11"})
    token = login(api, USER["email"])

    response = api.patch("/api/users/me", json={"full_name": "Другое Имя"}, headers=auth(token))
    assert response.status_code == 200
    assert response.json()["full_name"] == "Другое Имя"
    assert response.json()["phone"] == "+7 900 111-11-11"
