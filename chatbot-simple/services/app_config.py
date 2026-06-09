import os
import warnings
from dataclasses import dataclass
from datetime import timedelta
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


def env_bool_or_none(name):
    raw = os.getenv(name)

    if raw is None:
        return None

    value = raw.strip().lower()

    if value in {"1", "true", "yes", "on"}:
        return True

    if value in {"0", "false", "no", "off"}:
        return False

    return None


def env_int(name, default):
    try:
        return int(env_value(name, str(default)))
    except ValueError:
        return default


def env_csv(name):
    return tuple(item.strip() for item in env_value(name).split(",") if item.strip())


def env_limit(name, default):
    return env_value(name, default) or default


def legacy_rate_limit(count, window_seconds):
    if window_seconds == 60:
        return f"{count} per minute"

    if window_seconds == 3600:
        return f"{count} per hour"

    return f"{count} per {window_seconds} seconds"


def normalize_email(value):
    value = str(value or "").strip().lower()

    if value.startswith("[") and "](mailto:" in value and value.endswith(")"):
        value = value.split("](mailto:", 1)[1].rstrip(")")

    if value.startswith("mailto:"):
        value = value.removeprefix("mailto:")

    return value.strip()


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
    session_lifetime_minutes: int
    csrf_enabled: bool
    auth_allow_public_signin: bool
    auth_require_email_verified: bool
    auth_allowed_email_domains: tuple[str, ...]
    auth_allowed_emails: tuple[str, ...]
    admin_emails: tuple[str, ...]
    admin_uids: tuple[str, ...]
    rate_limit_backend: str
    redis_url: str
    rate_limit_fail_open: bool
    rate_limit_auth: str
    rate_limit_api: str
    rate_limit_chat: str
    rate_limit_stream: str
    rate_limit_upload: str
    rate_limit_provider_test: str
    rate_limit_memory: str
    rate_limit_documents: str
    rate_limit_window_seconds: int
    chat_rate_limit_per_window: int
    api_rate_limit_per_window: int
    max_upload_mb: int
    max_upload_bytes: int
    max_documents_per_user: int
    max_upload_storage_mb_per_user: int
    max_upload_storage_bytes_per_user: int
    max_conversations_per_user: int
    max_memories_per_user: int
    max_provider_connections_per_user: int
    max_image_bytes: int
    max_attachment_chars: int
    max_total_attachment_chars: int
    ai_request_timeout: int
    ai_max_output_tokens: int
    memory_debug_enabled: bool
    rag_enabled: bool
    vector_store: str
    embedding_provider: str
    embedding_model: str
    embedding_api_key: str
    rag_top_k: int
    rag_chunk_size_chars: int
    rag_chunk_overlap_chars: int

    @property
    def is_production(self):
        return self.environment == "production"

    @property
    def permanent_session_lifetime(self):
        return timedelta(minutes=max(1, int(self.session_lifetime_minutes or 1)))


DEV_SECRET_VALUES = {"", "dev-only-change-me", "change-me", "test-secret"}


def firebase_web_config_missing():
    web_env_names = (
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID",
    )
    return tuple(name for name in web_env_names if not env_value(name))


def firebase_admin_configured():
    return bool(
        env_value("FIREBASE_CREDENTIALS_JSON")
        or env_value("FIREBASE_CREDENTIALS")
        or env_value("GOOGLE_APPLICATION_CREDENTIALS")
    )


def load_settings(app_root):
    app_root = Path(app_root)
    environment = env_value("APP_ENV", env_value("FLASK_ENV", "development")).lower()
    is_production = environment == "production"
    secret_key = env_value("SECRET_KEY")

    if is_production and not secret_key:
        raise RuntimeError(
            "SECRET_KEY is required in production. Set a stable SECRET_KEY before starting the app."
        )

    if is_production and secret_key in DEV_SECRET_VALUES:
        raise RuntimeError("SECRET_KEY must be changed from the development default in production.")

    if is_production and env_bool("FLASK_DEBUG", False):
        raise RuntimeError("FLASK_DEBUG must not be true in production.")

    if not secret_key:
        secret_key = "dev-only-change-me"

    database_url_env = env_value("DATABASE_URL")
    if is_production:
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

    provider_credential_key = env_value("PROVIDER_CREDENTIAL_KEY")
    if is_production and not provider_credential_key:
        raise RuntimeError(
            "PROVIDER_CREDENTIAL_KEY is required in production and must not fall back to SECRET_KEY."
        )

    if not provider_credential_key:
        warnings.warn(
            "PROVIDER_CREDENTIAL_KEY is not set; falling back to SECRET_KEY for local development. "
            "Changing PROVIDER_CREDENTIAL_KEY later will make existing encrypted provider keys "
            "undecryptable until key rotation is implemented.",
            RuntimeWarning,
            stacklevel=2,
        )
        provider_credential_key = secret_key

    configured_public_signin = env_bool_or_none("AUTH_ALLOW_PUBLIC_SIGNIN")
    auth_allow_public_signin = configured_public_signin if configured_public_signin is not None else not is_production
    auth_allowed_email_domains = tuple(domain.lower().lstrip("@") for domain in env_csv("AUTH_ALLOWED_EMAIL_DOMAINS"))
    auth_allowed_emails = tuple(normalize_email(email) for email in env_csv("AUTH_ALLOWED_EMAILS"))

    if is_production:
        missing_firebase_web = firebase_web_config_missing()
        if missing_firebase_web:
            raise RuntimeError(
                "Firebase web configuration is required in production. Missing: "
                + ", ".join(missing_firebase_web)
            )

        if not firebase_admin_configured():
            raise RuntimeError(
                "Firebase Admin credentials are required in production. Set FIREBASE_CREDENTIALS_JSON, "
                "FIREBASE_CREDENTIALS, or GOOGLE_APPLICATION_CREDENTIALS."
            )

        if not auth_allow_public_signin and not auth_allowed_email_domains and not auth_allowed_emails:
            raise RuntimeError("Authentication access policy is not configured.")

    rate_limit_backend = env_value("RATE_LIMIT_BACKEND", "memory").lower() or "memory"
    redis_url = env_value("REDIS_URL")
    rate_limit_fail_open = env_bool("RATE_LIMIT_FAIL_OPEN", False)

    if rate_limit_backend not in {"memory", "redis"}:
        raise RuntimeError("RATE_LIMIT_BACKEND must be either 'memory' or 'redis'.")

    if is_production and rate_limit_backend != "redis":
        raise RuntimeError("RATE_LIMIT_BACKEND=redis is required in production.")

    if rate_limit_backend == "redis" and not redis_url:
        raise RuntimeError("REDIS_URL is required when RATE_LIMIT_BACKEND=redis.")

    if is_production and not redis_url:
        raise RuntimeError("REDIS_URL is required for production Redis rate limiting.")

    rate_limit_window_seconds = env_int("RATE_LIMIT_WINDOW_SECONDS", 60)
    chat_rate_limit_per_window = env_int("CHAT_RATE_LIMIT_PER_WINDOW", 30)
    api_rate_limit_per_window = env_int("API_RATE_LIMIT_PER_WINDOW", 120)
    max_upload_mb = max(1, env_int("MAX_UPLOAD_MB", 10))
    max_upload_bytes = env_int("MAX_UPLOAD_BYTES", max_upload_mb * 1024 * 1024)
    max_upload_storage_mb_per_user = max(1, env_int("MAX_UPLOAD_STORAGE_MB_PER_USER", 75))

    return AppSettings(
        environment=environment,
        secret_key=secret_key,
        provider_credential_key=provider_credential_key,
        database_url=database_url,
        upload_storage_dir=Path(env_value("UPLOAD_STORAGE_DIR", str(app_root / "instance" / "uploads"))),
        session_cookie_secure=True if is_production else env_bool("SESSION_COOKIE_SECURE", False),
        session_cookie_samesite=env_value("SESSION_COOKIE_SAMESITE", "Lax") or "Lax",
        session_lifetime_minutes=max(1, env_int("SESSION_LIFETIME_MINUTES", 1440)),
        csrf_enabled=env_bool("CSRF_ENABLED", True),
        auth_allow_public_signin=auth_allow_public_signin,
        auth_require_email_verified=env_bool("AUTH_REQUIRE_EMAIL_VERIFIED", False),
        auth_allowed_email_domains=auth_allowed_email_domains,
        auth_allowed_emails=auth_allowed_emails,
        admin_emails=tuple(email.lower() for email in env_csv("ADMIN_EMAILS")),
        admin_uids=env_csv("ADMIN_UIDS"),
        rate_limit_backend=rate_limit_backend,
        redis_url=redis_url,
        rate_limit_fail_open=rate_limit_fail_open,
        rate_limit_auth=env_limit("RATE_LIMIT_AUTH", "10 per minute"),
        rate_limit_api=env_limit(
            "RATE_LIMIT_API",
            legacy_rate_limit(api_rate_limit_per_window, rate_limit_window_seconds),
        ),
        rate_limit_chat=env_limit(
            "RATE_LIMIT_CHAT",
            legacy_rate_limit(chat_rate_limit_per_window, rate_limit_window_seconds),
        ),
        rate_limit_stream=env_limit("RATE_LIMIT_STREAM", "30 per minute"),
        rate_limit_upload=env_limit("RATE_LIMIT_UPLOAD", "10 per hour"),
        rate_limit_provider_test=env_limit("RATE_LIMIT_PROVIDER_TEST", "20 per hour"),
        rate_limit_memory=env_limit("RATE_LIMIT_MEMORY", "60 per minute"),
        rate_limit_documents=env_limit("RATE_LIMIT_DOCUMENTS", "60 per minute"),
        rate_limit_window_seconds=rate_limit_window_seconds,
        chat_rate_limit_per_window=chat_rate_limit_per_window,
        api_rate_limit_per_window=api_rate_limit_per_window,
        max_upload_mb=max_upload_mb,
        max_upload_bytes=max_upload_bytes,
        max_documents_per_user=max(0, env_int("MAX_DOCUMENTS_PER_USER", 0)),
        max_upload_storage_mb_per_user=max_upload_storage_mb_per_user,
        max_upload_storage_bytes_per_user=max_upload_storage_mb_per_user * 1024 * 1024,
        max_conversations_per_user=max(1, env_int("MAX_CONVERSATIONS_PER_USER", 100)),
        max_memories_per_user=max(1, env_int("MAX_MEMORIES_PER_USER", 30)),
        max_provider_connections_per_user=max(1, env_int("MAX_PROVIDER_CONNECTIONS_PER_USER", 5)),
        max_image_bytes=env_int("MAX_IMAGE_BYTES", 5 * 1024 * 1024),
        max_attachment_chars=env_int("MAX_ATTACHMENT_CHARS", 120_000),
        max_total_attachment_chars=env_int("MAX_TOTAL_ATTACHMENT_CHARS", 240_000),
        ai_request_timeout=env_int("AI_REQUEST_TIMEOUT", 180),
        ai_max_output_tokens=env_int("AI_MAX_OUTPUT_TOKENS", 8192),
        memory_debug_enabled=env_bool("NEXA_MEMORY_DEBUG", False),
        rag_enabled=env_bool("RAG_ENABLED", True),
        vector_store=env_value("VECTOR_STORE", "simple").lower() or "simple",
        embedding_provider=env_value("EMBEDDING_PROVIDER", "local").lower() or "local",
        embedding_model=env_value("EMBEDDING_MODEL", "local-hash-embedding"),
        embedding_api_key=env_value("EMBEDDING_API_KEY"),
        rag_top_k=max(1, env_int("RAG_TOP_K", 5)),
        rag_chunk_size_chars=max(500, env_int("RAG_CHUNK_SIZE_CHARS", 1500)),
        rag_chunk_overlap_chars=max(0, env_int("RAG_CHUNK_OVERLAP_CHARS", 250)),
    )
