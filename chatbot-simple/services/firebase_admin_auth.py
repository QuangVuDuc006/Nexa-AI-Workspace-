from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

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


def firebase_project_id():
    return (
        os.getenv("FIREBASE_PROJECT_ID", "").strip()
        or os.getenv("VITE_FIREBASE_PROJECT_ID", "").strip()
        or None
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

        if os.getenv("FIREBASE_CREDENTIALS", "").strip():
            LOGGER.info("Using Firebase credentials from environment variable")

            try:
                cert_data = json.loads(os.environ["FIREBASE_CREDENTIALS"])
            except json.JSONDecodeError as error:
                raise FirebaseVerificationError("FIREBASE_CREDENTIALS is invalid JSON.") from error

            credential = credentials.Certificate(cert_data)
        else:
            if not LOCAL_FIREBASE_CREDENTIALS_FILE.exists():
                raise FirebaseVerificationError(
                    f"Local Firebase credentials file does not exist: {LOCAL_FIREBASE_CREDENTIALS_FILE}"
                )

            LOGGER.info("Using local Firebase credentials file")
            credential = credentials.Certificate(str(LOCAL_FIREBASE_CREDENTIALS_FILE))

        return firebase_admin.initialize_app(credential, options)


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
