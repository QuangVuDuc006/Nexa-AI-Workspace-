from __future__ import annotations

from functools import wraps

from flask import redirect, request, session, url_for

from services.http import error_response


def normalize_email(email):
    return str(email or "").strip().lower()


def is_admin_identity(uid, email, settings):
    return bool(uid and uid in settings.admin_uids) or bool(normalize_email(email) in settings.admin_emails)


def current_user():
    return session.get("user")


def api_wants_json():
    return request.path.startswith("/api/") or request.accept_mimetypes.best == "application/json"


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user():
            return fn(*args, **kwargs)

        if api_wants_json():
            return error_response(401, "unauthorized", "Authentication is required.")

        return redirect(url_for("landing"))

    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        user = current_user() or {}

        if user.get("is_admin") is True:
            return fn(*args, **kwargs)

        return error_response(403, "forbidden", "Admin access is required.")

    return wrapper
