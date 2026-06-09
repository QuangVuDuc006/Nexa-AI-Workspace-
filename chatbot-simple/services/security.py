from __future__ import annotations

import secrets
from functools import wraps
from urllib.parse import urlparse

from flask import current_app, jsonify, request, session
from flask_limiter import Limiter
from werkzeug.exceptions import RequestEntityTooLarge, TooManyRequests

from services.auth import current_user
from services.http import error_response

try:
    import redis
except ImportError:  # pragma: no cover - dependency is declared for deployment.
    redis = None


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
RATE_LIMIT_CATEGORY_ATTRS = {
    "auth": "rate_limit_auth",
    "api": "rate_limit_api",
    "chat": "rate_limit_chat",
    "stream": "rate_limit_stream",
    "upload": "rate_limit_upload",
    "provider_test": "rate_limit_provider_test",
    "memory": "rate_limit_memory",
    "documents": "rate_limit_documents",
    "api_rate_limit_per_window": "rate_limit_api",
    "chat_rate_limit_per_window": "rate_limit_chat",
}
_limiter = None


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


def rate_limit_key():
    user = current_user() or {}
    user_id = str(user.get("id") or "").strip()

    if user_id:
        return f"user:{user_id}"

    return f"ip:{request.remote_addr or 'unknown'}"


def rate_limit_response():
    return jsonify({
        "error": "Too many requests",
        "message": "Rate limit exceeded. Please try again later.",
    }), 429


def rate_limit_value(category):
    def value():
        settings = current_app.config["APP_SETTINGS"]
        setting_name = RATE_LIMIT_CATEGORY_ATTRS.get(category, category)
        limit = getattr(settings, setting_name, None)

        if not limit:
            raise RuntimeError(f"Unknown rate limit category: {category}")

        return limit

    return value


def rate_limit_storage_uri(settings):
    if settings.rate_limit_backend == "redis":
        return settings.redis_url

    return "memory://"


def validate_redis_rate_limiter(settings):
    if settings.rate_limit_backend != "redis":
        return True

    if redis is None:
        if settings.rate_limit_fail_open:
            return False
        raise RuntimeError("Flask-Limiter Redis support is required when RATE_LIMIT_BACKEND=redis.")

    try:
        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
        return True
    except Exception as error:
        if settings.rate_limit_fail_open:
            current_app.logger.error(
                "Redis rate limiter is unavailable; RATE_LIMIT_FAIL_OPEN=true so requests will not be limited.",
                extra={"error": str(error)},
            )
            return False

        raise RuntimeError("Redis rate limiter is unavailable.") from error


def init_rate_limiter(app):
    global _limiter

    settings = app.config["APP_SETTINGS"]

    with app.app_context():
        limiter_enabled = validate_redis_rate_limiter(settings)

    _limiter = Limiter(
        key_func=rate_limit_key,
        app=app,
        storage_uri=rate_limit_storage_uri(settings),
        strategy="fixed-window",
        headers_enabled=True,
        enabled=limiter_enabled,
    )

    @app.errorhandler(TooManyRequests)
    def handle_rate_limit_exceeded(_error):
        return rate_limit_response()

    @app.errorhandler(RequestEntityTooLarge)
    def handle_upload_too_large(_error):
        settings = current_app.config["APP_SETTINGS"]
        return error_response(
            413,
            "file_too_large",
            f"Upload exceeds the {settings.max_upload_mb} MB upload limit.",
        )


def rate_limit(limit_attr):
    def decorator(fn):
        if _limiter is None:
            @wraps(fn)
            def wrapper(*args, **kwargs):
                return fn(*args, **kwargs)

            return wrapper

        return _limiter.shared_limit(
            rate_limit_value(limit_attr),
            scope=limit_attr,
            key_func=rate_limit_key,
            error_message="Rate limit exceeded. Please try again later.",
        )(fn)

    return decorator


def install_security_hooks(app):
    init_rate_limiter(app)

    @app.before_request
    def enforce_origin():
        return validate_origin()
