import importlib
import sys
from pathlib import Path

import pytest


@pytest.fixture()
def app_module(tmp_path, monkeypatch):
    project_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_dir))
    monkeypatch.setenv("APP_ENV", "testing")
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.sqlite3').as_posix()}")
    monkeypatch.setenv("UPLOAD_STORAGE_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    monkeypatch.setenv("CSRF_ENABLED", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "your_api_key_here")

    import app as module

    return importlib.reload(module)


@pytest.fixture()
def client(app_module):
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as test_client:
        yield test_client


def csrf_token(client):
    return client.get("/api/csrf").get_json()["csrfToken"]


def login(client, uid="user-1", email="user@example.com", is_admin=False):
    token = csrf_token(client)

    with client.session_transaction() as sess:
        sess["csrf_token"] = token
        sess["user"] = {
            "id": uid,
            "email": email,
            "display_name": email.split("@")[0],
            "photo_url": "",
            "auth_provider": "firebase",
            "is_admin": is_admin,
        }

    return token
