import json
import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import firebase_admin_auth


def fake_firebase_admin(monkeypatch):
    state = {
        "app": None,
        "certificate_inputs": [],
        "initialize_calls": [],
    }

    def get_app():
        if state["app"] is None:
            raise ValueError("The default Firebase app does not exist.")

        return state["app"]

    def certificate(value):
        state["certificate_inputs"].append(value)
        return {"certificate": value}

    def initialize_app(credential, options):
        app = {"credential": credential, "options": options}
        state["initialize_calls"].append(app)
        state["app"] = app
        return app

    monkeypatch.setattr(firebase_admin_auth.firebase_admin, "get_app", get_app)
    monkeypatch.setattr(firebase_admin_auth.firebase_admin, "initialize_app", initialize_app)
    monkeypatch.setattr(firebase_admin_auth.credentials, "Certificate", certificate)
    monkeypatch.setattr(firebase_admin_auth.google.auth, "default", lambda: (_ for _ in ()).throw(RuntimeError("no adc")))
    return state


def test_uses_firebase_credentials_json_environment_variable_once(monkeypatch, caplog):
    state = fake_firebase_admin(monkeypatch)
    cert_data = {"project_id": "render-project", "private_key": "secret"}
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", json.dumps(cert_data))
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "render-project")

    with caplog.at_level(logging.INFO, logger=firebase_admin_auth.__name__):
        first_app = firebase_admin_auth.initialize_firebase_admin()
        second_app = firebase_admin_auth.initialize_firebase_admin()

    assert first_app is second_app
    assert state["certificate_inputs"] == [cert_data]
    assert state["initialize_calls"] == [
        {
            "credential": {"certificate": cert_data},
            "options": {"projectId": "render-project"},
        }
    ]
    assert caplog.messages.count("Using Firebase credentials from FIREBASE_CREDENTIALS_JSON") == 1


def test_uses_firebase_credentials_file_path(monkeypatch, tmp_path, caplog):
    state = fake_firebase_admin(monkeypatch)
    credentials_path = tmp_path / "firebase-adminsdk.json"
    credentials_path.touch()
    monkeypatch.setenv("FIREBASE_CREDENTIALS", str(credentials_path))

    with caplog.at_level(logging.INFO, logger=firebase_admin_auth.__name__):
        firebase_admin_auth.initialize_firebase_admin()

    assert state["certificate_inputs"] == [str(credentials_path)]
    assert caplog.messages == ["Using Firebase credentials file from FIREBASE_CREDENTIALS"]


def test_keeps_legacy_firebase_credentials_json_compatibility(monkeypatch, caplog):
    state = fake_firebase_admin(monkeypatch)
    cert_data = {"project_id": "legacy-project", "private_key": "secret"}
    monkeypatch.setenv("FIREBASE_CREDENTIALS", json.dumps(cert_data))

    with caplog.at_level(logging.INFO, logger=firebase_admin_auth.__name__):
        firebase_admin_auth.initialize_firebase_admin()

    assert state["certificate_inputs"] == [cert_data]
    assert caplog.messages == ["Using Firebase credentials from FIREBASE_CREDENTIALS JSON value"]


def test_uses_local_firebase_credentials_file(monkeypatch, tmp_path, caplog):
    state = fake_firebase_admin(monkeypatch)
    local_credentials = tmp_path / "firebase-adminsdk.json"
    local_credentials.touch()
    monkeypatch.delenv("FIREBASE_CREDENTIALS_JSON", raising=False)
    monkeypatch.delenv("FIREBASE_CREDENTIALS", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.setattr(firebase_admin_auth, "LOCAL_FIREBASE_CREDENTIALS_FILE", local_credentials)

    with caplog.at_level(logging.INFO, logger=firebase_admin_auth.__name__):
        firebase_admin_auth.initialize_firebase_admin()

    assert state["certificate_inputs"] == [str(local_credentials)]
    assert caplog.messages == ["Using local Firebase credentials file"]


def test_rejects_invalid_firebase_credentials_json(monkeypatch):
    fake_firebase_admin(monkeypatch)
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", "{not-json")

    with pytest.raises(firebase_admin_auth.FirebaseVerificationError, match="FIREBASE_CREDENTIALS_JSON is invalid JSON"):
        firebase_admin_auth.initialize_firebase_admin()


def test_production_requires_explicit_credentials_or_adc(monkeypatch, tmp_path):
    fake_firebase_admin(monkeypatch)
    local_credentials = tmp_path / "firebase-adminsdk.json"
    local_credentials.touch()
    monkeypatch.setattr(firebase_admin_auth, "LOCAL_FIREBASE_CREDENTIALS_FILE", local_credentials)
    monkeypatch.delenv("FIREBASE_CREDENTIALS_JSON", raising=False)
    monkeypatch.delenv("FIREBASE_CREDENTIALS", raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(RuntimeError, match="Firebase Admin credentials are required in production"):
        firebase_admin_auth.initialize_firebase_admin()
