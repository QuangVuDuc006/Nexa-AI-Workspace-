from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from functools import wraps
from urllib.parse import urlparse

from flask import current_app, request, session

from services.auth import current_user
from services.http import error_response


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_rate_buckets = defaultdict(deque)


def get_csrf_token():
    token = session.get("csrf_token")

    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token

    return token


def origin_allowed():
    origin = request.headers.get("Origin") or request.headers.get("Referer")

    if not origin:
        return True

    try:
        parsed = urlparse(origin)
    except ValueError:
        return False

    return parsed.netloc == request.host


def validate_origin():
    if request.method not in UNSAFE_METHODS:
        return None

    if origin_allowed():
        return None

    current_app.logger.warning(
        "Rejected cross-origin state-changing request",
        extra={"path": request.path, "origin": request.headers.get("Origin") or request.headers.get("Referer")},
    )
    return error_response(403, "origin_forbidden", "Request origin is not allowed.")


def csrf_protect(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        settings = current_app.config["APP_SETTINGS"]

        if not settings.csrf_enabled or request.method not in UNSAFE_METHODS:
            return fn(*args, **kwargs)

        expected = get_csrf_token()
        provided = request.headers.get("X-CSRF-Token", "")

        if expected and secrets.compare_digest(expected, provided):
            return fn(*args, **kwargs)

        current_app.logger.warning("Rejected request with invalid CSRF token", extra={"path": request.path})
        return error_response(403, "invalid_csrf_token", "A valid CSRF token is required.")

    return wrapper


def client_ip():
    forwarded_for = request.headers.get("X-Forwarded-For", "")

    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    return request.remote_addr or "unknown"


def rate_limit(limit_attr):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            settings = current_app.config["APP_SETTINGS"]
            limit = getattr(settings, limit_attr)
            window = settings.rate_limit_window_seconds
            now = time.monotonic()
            user = current_user() or {}
            identity = user.get("id") or f"ip:{client_ip()}"
            key = (limit_attr, identity, client_ip())
            bucket = _rate_buckets[key]

            while bucket and now - bucket[0] >= window:
                bucket.popleft()

            if len(bucket) >= limit:
                return error_response(
                    429,
                    "rate_limited",
                    "Too many requests. Please slow down and try again shortly.",
                    retry_after=window,
                )

            bucket.append(now)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def install_security_hooks(app):
    @app.before_request
    def enforce_origin():
        return validate_origin()
