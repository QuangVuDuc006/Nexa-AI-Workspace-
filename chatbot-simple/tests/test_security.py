from conftest import csrf_token, login


def test_sensitive_apis_require_auth(client):
    response = client.post(
        "/api/chat",
        json={"message": "hello"},
        headers={"X-CSRF-Token": csrf_token(client)},
    )
    assert response.status_code == 401


def test_state_changing_routes_require_csrf(client):
    login(client)
    response = client.post("/api/conversations", json={"title": "No csrf"})

    assert response.status_code == 403
    assert response.get_json()["code"] == "invalid_csrf_token"


def test_firebase_session_uses_verified_token_payload(app_module, client, monkeypatch):
    token = csrf_token(client)

    def fake_verify(_token):
        return {
            "uid": "trusted-uid",
            "email": "admin@example.com",
            "name": "Trusted Admin",
            "picture": "https://example.com/admin.png",
        }

    monkeypatch.setattr(app_module, "verify_firebase_id_token", fake_verify)
    response = client.post(
        "/api/firebase/session",
        json={
            "idToken": "verified-by-fake",
            "user": {
                "uid": "spoofed",
                "email": "attacker@example.com",
                "displayName": "Spoofed",
            },
        },
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["user"]["id"] == "trusted-uid"
    assert data["user"]["email"] == "admin@example.com"
    assert data["user"]["is_admin"] is True


def test_firebase_session_rejects_invalid_token(client):
    response = client.post(
        "/api/firebase/session",
        json={"idToken": "not-a-real-token"},
        headers={"X-CSRF-Token": csrf_token(client)},
    )

    assert response.status_code == 401
    assert response.get_json()["code"] == "invalid_firebase_token"


def test_provider_configuration_requires_auth_and_csrf(client):
    assert client.get("/api/providers").status_code == 401
    assert client.get("/api/models").status_code == 401

    login(client)
    response = client.post(
        "/api/providers",
        json={
            "providerType": "custom",
            "apiKey": "secret",
            "baseUrl": "https://example.com/v1",
            "selectedModel": "test-model",
        },
    )
    assert response.status_code == 403


def test_chat_page_exposes_provider_controls_without_keys(client):
    login(client)
    response = client.get("/chat")

    assert response.status_code == 200
    assert b"Provider Settings" in response.data
    assert b"Detect Models" in response.data
    assert b"active-provider-select" in response.data
    assert b"Switch active AI model" in response.data
    assert b"Provider type" not in response.data
    assert b"api-provider-select" not in response.data
    assert b"your_api_key_here" not in response.data


def test_user_conversations_are_isolated(client):
    user_a_token = login(client, uid="user-a", email="a@example.com")
    create_response = client.post(
        "/api/conversations",
        json={"id": "conv-shared-check", "title": "Private"},
        headers={"X-CSRF-Token": user_a_token},
    )
    assert create_response.status_code == 201

    login(client, uid="user-b", email="b@example.com")
    response = client.get("/api/conversations/conv-shared-check")

    assert response.status_code == 404
