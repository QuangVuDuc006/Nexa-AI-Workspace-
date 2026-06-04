from __future__ import annotations

from dataclasses import dataclass

from services.ai.config import DEFAULT_TIMEOUT_SECONDS, ProviderConfig
from services.ai.errors import AIProviderError, MissingProviderConfigError
from services.ai.models import choose_default_model, normalize_models
from services.ai.provider_registry import (
    PROVIDERS,
    detect_provider_from_base_url,
    detect_provider_from_key,
    get_provider_definition,
    normalize_base_url,
    validate_base_url,
)


@dataclass(frozen=True)
class DetectionResult:
    provider_id: str
    provider_label: str
    base_url: str
    models: tuple
    default_model: str
    connection_status: str = "connected"

    def to_dict(self):
        return {
            "success": True,
            "provider": self.provider_label,
            "providerType": self.provider_id,
            "baseUrl": self.base_url,
            "models": [model.to_dict() for model in self.models],
            "defaultModel": self.default_model,
            "connectionStatus": self.connection_status,
        }


def create_runtime_provider(definition, api_key, base_url, default_model="", timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    config = ProviderConfig(
        provider_id=definition.id,
        label=definition.label,
        api_key_env="",
        model_env="",
        api_key_value=str(api_key or "").strip(),
        default_model=str(default_model or "").strip(),
        base_url_env="runtime",
        base_url=normalize_base_url(definition, base_url),
        requires_api_key=definition.requires_api_key,
        timeout_seconds=timeout_seconds,
    )
    return definition.adapter_class(config)


def detection_candidates(provider_type, api_key, base_url):
    requested = str(provider_type or "auto").strip().lower()
    if requested != "auto":
        definition = get_provider_definition(requested)
        if not definition:
            return []
        return [(definition, normalize_base_url(definition, base_url))]

    known = detect_provider_from_base_url(base_url) or detect_provider_from_key(api_key)
    if known:
        return [(known, normalize_base_url(known, base_url))]

    value = validate_base_url(base_url)
    if not value:
        return []

    compatible = PROVIDERS["openai-compatible"]
    candidates = [(compatible, value)]
    if not value.endswith("/v1"):
        candidates.append((compatible, f"{value}/v1"))
    return candidates


def detect_models(provider_type="auto", api_key="", base_url="", timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    candidates = detection_candidates(provider_type, api_key, base_url)
    requested = str(provider_type or "auto").strip().lower()

    if not candidates:
        if requested in {"custom", "openai-compatible"}:
            raise MissingProviderConfigError("Base URL is required.", provider=requested)
        return DetectionResult("custom", "Custom Provider", validate_base_url(base_url), (), "", "manual")

    last_error = None
    for definition, candidate_url in candidates:
        try:
            provider = create_runtime_provider(definition, api_key, candidate_url, timeout_seconds=timeout_seconds)
            models = tuple(normalize_models(provider.list_models(), definition.id))
            return DetectionResult(
                definition.id,
                definition.label,
                candidate_url,
                models,
                choose_default_model(models),
                "connected" if models else "empty",
            )
        except AIProviderError as error:
            last_error = error

            if requested != "auto" or detect_provider_from_base_url(base_url) or detect_provider_from_key(api_key):
                raise

    if requested == "auto":
        return DetectionResult("custom", "Custom Provider", validate_base_url(base_url), (), "", "manual")

    if last_error:
        raise last_error

    raise MissingProviderConfigError("Provider detection failed.", provider=requested)
