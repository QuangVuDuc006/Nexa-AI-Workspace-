from types import SimpleNamespace

import pytest
from flask import Flask, jsonify

from services.app_config import load_settings
from services.security import rate_limit, validate_redis_rate_limiter

from conftest import csrf_token, login


def set_valid_production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/nexa")
    monkeypatch.setenv("PROVIDER_CREDENTIAL_KEY", "production-provider-key")
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", '{"project_id":"test","private_key":"secret"}')
    monkeypatch.setenv("VITE_FIREBASE_API_KEY", "api-key")
    monkeypatch.setenv("VITE_FIREBASE_AUTH_DOMAIN", "example.firebaseapp.com")
    monkeypatch.setenv("VITE_FIREBASE_PROJECT_ID", "test")
    monkeypatch.setenv("VITE_FIREBASE_STORAGE_BUCKET", "test.appspot.com")
    monkeypatch.setenv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123")
    monkeypatch.setenv("VITE_FIREBASE_APP_ID", "app")
    monkeypatch.setenv("AUTH_ALLOW_PUBLIC_SIGNIN", "true")


def firebase_test_client(app_module, monkeypatch, payload, **env):
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)

    def fake_verify(_token):
        return payload

    monkeypatch.setattr(app_module, "verify_firebase_id_token", fake_verify)
    app = app_module.create_app()
    app.config.update(TESTING=True)
    return app.test_client()


def post_firebase_session(client):
    return client.post(
        "/api/firebase/session",
        json={"idToken": "verified-by-fake"},
        headers={"X-CSRF-Token": csrf_token(client)},
    )


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


def test_firebase_session_allows_verified_email_when_required(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "verified-user",
            "email": "verified@example.com",
            "name": "Verified User",
            "email_verified": True,
        },
        AUTH_REQUIRE_EMAIL_VERIFIED="true",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == "verified@example.com"


def test_firebase_session_rejects_unverified_email_when_required(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "unverified-user",
            "email": "unverified@example.com",
            "name": "Unverified User",
            "email_verified": False,
        },
        AUTH_REQUIRE_EMAIL_VERIFIED="true",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 403
    assert response.get_json()["error"] == "Email verification required"


def test_firebase_session_allows_explicit_allowed_email(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "allowed-user",
            "email": "allowed@example.com",
            "name": "Allowed User",
        },
        AUTH_ALLOW_PUBLIC_SIGNIN="false",
        AUTH_ALLOWED_EMAILS="allowed@example.com",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == "allowed@example.com"


def test_firebase_session_rejects_disallowed_email(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "blocked-user",
            "email": "blocked@example.com",
            "name": "Blocked User",
        },
        AUTH_ALLOW_PUBLIC_SIGNIN="false",
        AUTH_ALLOWED_EMAILS="allowed@example.com",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 403
    assert response.get_json()["error"] == "This email is not allowed to access Nexa AI"


def test_firebase_session_allows_allowed_domain(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "domain-user",
            "email": "student@school.edu",
            "name": "Domain User",
        },
        AUTH_ALLOW_PUBLIC_SIGNIN="false",
        AUTH_ALLOWED_EMAIL_DOMAINS="school.edu",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == "student@school.edu"


def test_firebase_session_reports_missing_access_policy(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "policy-user",
            "email": "policy@example.com",
            "name": "Policy User",
        },
        AUTH_ALLOW_PUBLIC_SIGNIN="false",
        AUTH_ALLOWED_EMAILS="",
        AUTH_ALLOWED_EMAIL_DOMAINS="",
    ) as test_client:
        response = post_firebase_session(test_client)

    assert response.status_code == 503
    assert response.get_json()["error"] == "Authentication access policy is not configured"


def test_firebase_session_marks_session_permanent(app_module, monkeypatch):
    with firebase_test_client(
        app_module,
        monkeypatch,
        {
            "uid": "permanent-user",
            "email": "permanent@example.com",
            "name": "Permanent User",
        },
    ) as test_client:
        response = post_firebase_session(test_client)
        assert response.status_code == 200
        with test_client.session_transaction() as sess:
            assert sess.permanent is True
            assert sess["user"]["id"] == "permanent-user"


def test_logout_routes_clear_session(client):
    token = login(client)

    post_response = client.post("/logout", headers={"X-CSRF-Token": token})
    assert post_response.status_code == 302
    with client.session_transaction() as sess:
        assert "user" not in sess

    token = login(client)
    api_response = client.post("/api/firebase/logout", headers={"X-CSRF-Token": token})
    assert api_response.status_code == 200
    with client.session_transaction() as sess:
        assert "user" not in sess

    login(client)
    get_response = client.get("/logout")
    assert get_response.status_code == 302
    with client.session_transaction() as sess:
        assert "user" not in sess


def test_production_requires_provider_credential_key(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "production-secret-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/nexa")
    monkeypatch.delenv("PROVIDER_CREDENTIAL_KEY", raising=False)
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", '{"project_id":"test","private_key":"secret"}')
    monkeypatch.setenv("VITE_FIREBASE_API_KEY", "api-key")
    monkeypatch.setenv("VITE_FIREBASE_AUTH_DOMAIN", "example.firebaseapp.com")
    monkeypatch.setenv("VITE_FIREBASE_PROJECT_ID", "test")
    monkeypatch.setenv("VITE_FIREBASE_STORAGE_BUCKET", "test.appspot.com")
    monkeypatch.setenv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123")
    monkeypatch.setenv("VITE_FIREBASE_APP_ID", "app")
    monkeypatch.setenv("AUTH_ALLOW_PUBLIC_SIGNIN", "true")

    try:
        load_settings(tmp_path)
        assert False, "Expected production settings to require PROVIDER_CREDENTIAL_KEY"
    except RuntimeError as error:
        assert "PROVIDER_CREDENTIAL_KEY is required in production" in str(error)


def test_production_requires_redis_rate_limit_backend(monkeypatch, tmp_path):
    set_valid_production_env(monkeypatch)
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    with pytest.raises(RuntimeError, match="RATE_LIMIT_BACKEND=redis is required in production"):
        load_settings(tmp_path)


def test_production_requires_redis_url(monkeypatch, tmp_path):
    set_valid_production_env(monkeypatch)
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "redis")
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(RuntimeError, match="REDIS_URL is required"):
        load_settings(tmp_path)


def test_redis_rate_limiter_fails_closed_when_unreachable(monkeypatch):
    from services import security

    class BrokenRedis:
        def ping(self):
            raise OSError("redis down")

    monkeypatch.setattr(security.redis.Redis, "from_url", lambda *args, **kwargs: BrokenRedis())
    app = Flask(__name__)
    settings = SimpleNamespace(
        rate_limit_backend="redis",
        redis_url="redis://localhost:6379/0",
        rate_limit_fail_open=False,
    )
    app.config["APP_SETTINGS"] = settings

    with app.app_context(), pytest.raises(RuntimeError, match="Redis rate limiter is unavailable"):
        validate_redis_rate_limiter(settings)


def test_redis_rate_limiter_can_fail_open_when_configured(monkeypatch):
    from services import security

    class BrokenRedis:
        def ping(self):
            raise OSError("redis down")

    monkeypatch.setattr(security.redis.Redis, "from_url", lambda *args, **kwargs: BrokenRedis())
    app = Flask(__name__)
    settings = SimpleNamespace(
        rate_limit_backend="redis",
        redis_url="redis://localhost:6379/0",
        rate_limit_fail_open=True,
    )
    app.config["APP_SETTINGS"] = settings

    with app.app_context():
        assert validate_redis_rate_limiter(settings) is False


def test_memory_rate_limit_backend_limits_requests(app_module, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.setenv("RATE_LIMIT_API", "2 per minute")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as test_client:
        login(test_client)
        assert test_client.get("/api/conversations").status_code == 200
        assert test_client.get("/api/conversations").status_code == 200
        response = test_client.get("/api/conversations")

    assert response.status_code == 429
    assert response.is_json
    assert response.get_json() == {
        "error": "Too many requests",
        "message": "Rate limit exceeded. Please try again later.",
    }


def test_authenticated_rate_limits_are_keyed_by_user_id(app_module, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.setenv("RATE_LIMIT_API", "1 per minute")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as test_client:
        login(test_client, uid="user-a", email="a@example.com")
        assert test_client.get("/api/conversations").status_code == 200
        assert test_client.get("/api/conversations").status_code == 429

        login(test_client, uid="user-b", email="b@example.com")
        assert test_client.get("/api/conversations").status_code == 200


def test_unauthenticated_auth_limits_are_keyed_by_remote_addr(app_module, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.setenv("RATE_LIMIT_AUTH", "1 per minute")

    def fake_verify(_token):
        return {
            "uid": "firebase-user",
            "email": "firebase@example.com",
            "name": "Firebase User",
        }

    monkeypatch.setattr(app_module, "verify_firebase_id_token", fake_verify)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    def post_session(test_client, remote_addr, forwarded_for):
        return test_client.post(
            "/api/firebase/session",
            json={"idToken": "verified-by-fake"},
            headers={
                "X-CSRF-Token": csrf_token(test_client),
                "X-Forwarded-For": forwarded_for,
            },
            environ_base={"REMOTE_ADDR": remote_addr},
        )

    with app.test_client() as first_client:
        first_response = post_session(first_client, "203.0.113.10", "10.0.0.1")

    with app.test_client() as second_client:
        second_response = post_session(second_client, "203.0.113.10", "10.0.0.2")

    with app.test_client() as third_client:
        third_response = post_session(third_client, "203.0.113.11", "10.0.0.1")

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert third_response.status_code == 200


def test_existing_rate_limit_decorator_name_still_works(app_module, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.setenv("RATE_LIMIT_API", "1 per minute")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    @app.get("/test/legacy-rate-limit")
    @rate_limit("api_rate_limit_per_window")
    def legacy_limited_route():
        return jsonify({"ok": True})

    with app.test_client() as test_client:
        assert test_client.get("/test/legacy-rate-limit").status_code == 200
        response = test_client.get("/test/legacy-rate-limit")

    assert response.status_code == 429
    assert response.is_json


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
