from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

import google.auth
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials


LOGGER = logging.getLogger(__name__)
LOCAL_FIREBASE_CREDENTIALS_FILE = (
    Path(__file__).resolve().parents[2]
    / "chatbot-45f57-firebase-adminsdk-fbsvc-dc0dcdd2d1.json"
)
_FIREBASE_INIT_LOCK = threading.Lock()


class FirebaseVerificationError(Exception):
    pass


def env_value(name):
    return os.getenv(name, "").strip()


def is_production_environment():
    return env_value("FLASK_ENV").lower() == "production" or env_value("APP_ENV").lower() == "production"


def firebase_project_id():
    return (
        env_value("FIREBASE_PROJECT_ID")
        or env_value("VITE_FIREBASE_PROJECT_ID")
        or None
    )


def certificate_from_json(value, env_name):
    try:
        cert_data = json.loads(value)
    except json.JSONDecodeError as error:
        raise FirebaseVerificationError(f"{env_name} is invalid JSON.") from error

    if not isinstance(cert_data, dict):
        raise FirebaseVerificationError(f"{env_name} must contain a Firebase service account JSON object.")

    return credentials.Certificate(cert_data)


def certificate_from_path(value, env_name):
    credential_path = Path(value).expanduser()

    if not credential_path.exists():
        raise FirebaseVerificationError(f"{env_name} points to a credential file that does not exist.")

    return credentials.Certificate(str(credential_path))


def application_default_credentials_available():
    try:
        google.auth.default()
        return True
    except Exception:
        return False


def load_firebase_credentials():
    credentials_json = env_value("FIREBASE_CREDENTIALS_JSON")
    credentials_path_or_legacy_json = env_value("FIREBASE_CREDENTIALS")

    if credentials_json:
        LOGGER.info("Using Firebase credentials from FIREBASE_CREDENTIALS_JSON")
        return certificate_from_json(credentials_json, "FIREBASE_CREDENTIALS_JSON")

    if credentials_path_or_legacy_json:
        if credentials_path_or_legacy_json.startswith("{"):
            LOGGER.info("Using Firebase credentials from FIREBASE_CREDENTIALS JSON value")
            return certificate_from_json(credentials_path_or_legacy_json, "FIREBASE_CREDENTIALS")

        LOGGER.info("Using Firebase credentials file from FIREBASE_CREDENTIALS")
        return certificate_from_path(credentials_path_or_legacy_json, "FIREBASE_CREDENTIALS")

    if not is_production_environment() and LOCAL_FIREBASE_CREDENTIALS_FILE.exists():
        LOGGER.info("Using local Firebase credentials file")
        return credentials.Certificate(str(LOCAL_FIREBASE_CREDENTIALS_FILE))

    if application_default_credentials_available():
        LOGGER.info("Using Firebase Application Default Credentials")
        return credentials.ApplicationDefault()

    if is_production_environment():
        raise RuntimeError(
            "Firebase Admin credentials are required in production. Set FIREBASE_CREDENTIALS_JSON "
            "to the service account JSON, set FIREBASE_CREDENTIALS to a service account JSON file path, "
            "or configure Application Default Credentials."
        )

    raise FirebaseVerificationError(
        "Firebase Admin credentials were not found. For local development, set FIREBASE_CREDENTIALS_JSON, "
        "set FIREBASE_CREDENTIALS to a service account JSON file path, or place the local Firebase service "
        f"account file at {LOCAL_FIREBASE_CREDENTIALS_FILE}."
    )


def initialize_firebase_admin():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    with _FIREBASE_INIT_LOCK:
        try:
            return firebase_admin.get_app()
        except ValueError:
            pass

        options = {}
        project_id = firebase_project_id()

        if project_id:
            options["projectId"] = project_id

        return firebase_admin.initialize_app(load_firebase_credentials(), options)


def verify_firebase_id_token(id_token):
    if not id_token:
        raise FirebaseVerificationError("Firebase ID token is required.")

    try:
        initialize_firebase_admin()
        return firebase_auth.verify_id_token(id_token)
    except FirebaseVerificationError:
        raise
    except Exception as error:
        raise FirebaseVerificationError(f"Firebase ID token could not be verified: {error}") from error
