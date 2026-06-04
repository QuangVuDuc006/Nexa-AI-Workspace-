from __future__ import annotations

import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials


class FirebaseVerificationError(Exception):
    pass


def firebase_project_id():
    return (
        os.getenv("FIREBASE_PROJECT_ID", "").strip()
        or os.getenv("VITE_FIREBASE_PROJECT_ID", "").strip()
        or None
    )


def initialize_firebase_admin():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    options = {}
    project_id = firebase_project_id()

    if project_id:
        options["projectId"] = project_id

    credentials_json = os.getenv("FIREBASE_ADMIN_CREDENTIALS_JSON", "").strip()
    credentials_path = (
        os.getenv("FIREBASE_ADMIN_CREDENTIALS", "").strip()
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    )

    if credentials_json:
        try:
            cert_data = json.loads(credentials_json)
        except json.JSONDecodeError as error:
            raise FirebaseVerificationError("FIREBASE_ADMIN_CREDENTIALS_JSON is invalid JSON.") from error

        return firebase_admin.initialize_app(credentials.Certificate(cert_data), options)

    if credentials_path:
        path = Path(credentials_path)

        if not path.exists():
            raise FirebaseVerificationError(f"Firebase Admin credentials file does not exist: {path}")

        return firebase_admin.initialize_app(credentials.Certificate(str(path)), options)

    return firebase_admin.initialize_app(options=options)


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
