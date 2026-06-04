import os
from dataclasses import dataclass


FALLBACK_PROVIDER = "gemini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_TIMEOUT_SECONDS = 60
PLACEHOLDER_VALUES = {
    "your_api_key_here",
    "your_gemini_api_key_here",
    "your_openai_api_key_here",
    "your_openrouter_api_key_here",
}


@dataclass(frozen=True)
class ProviderConfig:
    provider_id: str
    label: str
    api_key_env: str
    model_env: str
    api_key_value: str = ""
    default_model: str = ""
    base_url_env: str = ""
    base_url: str = ""
    models: tuple = ()
    image_models: tuple = ()
    supports_images_override: bool | None = None
    requires_api_key: bool = True
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS

    @property
    def api_key(self):
        if self.api_key_value:
            return self.api_key_value

        value = os.getenv(self.api_key_env, "").strip()

        if not value or value.lower() in PLACEHOLDER_VALUES:
            return None

        return value

    @property
    def configured(self):
        has_model = bool(self.default_model)
        has_base_url = not self.base_url_env or bool(self.base_url)
        has_api_key = not self.requires_api_key or bool(self.api_key)
        return bool(has_api_key and has_model and has_base_url)


def env_value(name, default=""):
    return os.getenv(name, default).strip()


def get_default_provider_id():
    return (env_value("AI_PROVIDER") or env_value("DEFAULT_AI_PROVIDER") or FALLBACK_PROVIDER).lower()


def env_int(name, default):
    try:
        return int(env_value(name, str(default)))
    except ValueError:
        return default


def env_csv(name):
    return tuple(item.strip() for item in env_value(name).split(",") if item.strip())


def env_bool_optional(name):
    value = env_value(name).lower()

    if value in {"1", "true", "yes", "on"}:
        return True

    if value in {"0", "false", "no", "off"}:
        return False

    return None


def models_from_env(list_env, default_model):
    models = env_csv(list_env)

    if models:
        return models

    return (default_model,) if default_model else ()


def get_provider_configs():
    timeout_seconds = env_int("AI_REQUEST_TIMEOUT", DEFAULT_TIMEOUT_SECONDS)
    gemini_model = env_value("GEMINI_MODEL", DEFAULT_GEMINI_MODEL) or DEFAULT_GEMINI_MODEL
    openai_model = env_value("OPENAI_MODEL")
    openrouter_model = env_value("OPENROUTER_MODEL")

    return {
        "gemini": ProviderConfig(
            provider_id="gemini",
            label="Gemini",
            api_key_env="GEMINI_API_KEY",
            model_env="GEMINI_MODEL",
            default_model=gemini_model,
            base_url="https://generativelanguage.googleapis.com/v1beta",
            models=models_from_env("GEMINI_MODELS", gemini_model),
            supports_images_override=env_bool_optional("GEMINI_SUPPORTS_IMAGES"),
            timeout_seconds=timeout_seconds,
        ),
        "openai": ProviderConfig(
            provider_id="openai",
            label="OpenAI compatible",
            api_key_env="OPENAI_API_KEY",
            model_env="OPENAI_MODEL",
            default_model=openai_model,
            base_url_env="OPENAI_BASE_URL",
            base_url=env_value("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            models=models_from_env("OPENAI_MODELS", openai_model),
            image_models=env_csv("OPENAI_IMAGE_MODELS"),
            supports_images_override=env_bool_optional("OPENAI_SUPPORTS_IMAGES"),
            timeout_seconds=timeout_seconds,
        ),
        "openrouter": ProviderConfig(
            provider_id="openrouter",
            label="OpenRouter",
            api_key_env="OPENROUTER_API_KEY",
            model_env="OPENROUTER_MODEL",
            default_model=openrouter_model,
            base_url_env="OPENROUTER_BASE_URL",
            base_url=env_value("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            models=models_from_env("OPENROUTER_MODELS", openrouter_model),
            image_models=env_csv("OPENROUTER_IMAGE_MODELS"),
            supports_images_override=env_bool_optional("OPENROUTER_SUPPORTS_IMAGES"),
            timeout_seconds=timeout_seconds,
        ),
    }
