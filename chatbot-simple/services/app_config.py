import os
from dataclasses import dataclass
from pathlib import Path


def env_value(name, default=""):
    return os.getenv(name, default).strip()


def env_bool(name, default=False):
    value = env_value(name).lower()

    if value in {"1", "true", "yes", "on"}:
        return True

    if value in {"0", "false", "no", "off"}:
        return False

    return default


def env_int(name, default):
    try:
        return int(env_value(name, str(default)))
    except ValueError:
        return default


def env_csv(name):
    return tuple(item.strip() for item in env_value(name).split(",") if item.strip())


def normalize_database_url(url):
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url.removeprefix("postgres://")

    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url.removeprefix("postgresql://")

    return url


@dataclass(frozen=True)
class AppSettings:
    environment: str
    secret_key: str
    provider_credential_key: str
    database_url: str
    upload_storage_dir: Path
    session_cookie_secure: bool
    session_cookie_samesite: str
    csrf_enabled: bool
    admin_emails: tuple[str, ...]
    admin_uids: tuple[str, ...]
    rate_limit_window_seconds: int
    chat_rate_limit_per_window: int
    api_rate_limit_per_window: int
    max_upload_bytes: int
    max_image_bytes: int
    max_attachment_chars: int
    max_total_attachment_chars: int
    ai_request_timeout: int

    @property
    def is_production(self):
        return self.environment == "production"


def load_settings(app_root):
    app_root = Path(app_root)
    environment = env_value("APP_ENV", env_value("FLASK_ENV", "development")).lower()
    secret_key = env_value("SECRET_KEY")

    if environment == "production" and not secret_key:
        raise RuntimeError(
            "SECRET_KEY is required in production. Set a stable SECRET_KEY before starting the app."
        )

    if not secret_key:
        secret_key = "dev-only-change-me"

    database_url_env = env_value("DATABASE_URL")
    if environment == "production":
        if not database_url_env:
            raise RuntimeError(
                "DATABASE_URL environment variable is required in production environment."
            )
        if not (database_url_env.startswith("postgres://") or database_url_env.startswith("postgresql://") or database_url_env.startswith("postgresql+psycopg2://")):
            raise RuntimeError(
                "DATABASE_URL must be a PostgreSQL connection string in production environment."
            )
        database_url = normalize_database_url(database_url_env)
    else:
        if database_url_env:
            database_url = normalize_database_url(database_url_env)
        else:
            database_url = f"sqlite:///{(app_root / 'instance' / 'chatbot.sqlite3').as_posix()}"

    return AppSettings(
        environment=environment,
        secret_key=secret_key,
        provider_credential_key=env_value("PROVIDER_CREDENTIAL_KEY", secret_key),
        database_url=database_url,
        upload_storage_dir=Path(env_value("UPLOAD_STORAGE_DIR", str(app_root / "instance" / "uploads"))),
        session_cookie_secure=env_bool("SESSION_COOKIE_SECURE", environment == "production"),
        session_cookie_samesite=env_value("SESSION_COOKIE_SAMESITE", "Lax") or "Lax",
        csrf_enabled=env_bool("CSRF_ENABLED", True),
        admin_emails=tuple(email.lower() for email in env_csv("ADMIN_EMAILS")),
        admin_uids=env_csv("ADMIN_UIDS"),
        rate_limit_window_seconds=env_int("RATE_LIMIT_WINDOW_SECONDS", 60),
        chat_rate_limit_per_window=env_int("CHAT_RATE_LIMIT_PER_WINDOW", 30),
        api_rate_limit_per_window=env_int("API_RATE_LIMIT_PER_WINDOW", 120),
        max_upload_bytes=env_int("MAX_UPLOAD_BYTES", 12 * 1024 * 1024),
        max_image_bytes=env_int("MAX_IMAGE_BYTES", 5 * 1024 * 1024),
        max_attachment_chars=env_int("MAX_ATTACHMENT_CHARS", 120_000),
        max_total_attachment_chars=env_int("MAX_TOTAL_ATTACHMENT_CHARS", 240_000),
        ai_request_timeout=env_int("AI_REQUEST_TIMEOUT", 60),
    )
