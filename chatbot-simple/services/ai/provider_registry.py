from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from urllib.parse import urlparse

from services.ai.providers.anthropic_provider import AnthropicProvider
from services.ai.providers.cohere_provider import CohereProvider
from services.ai.providers.gemini_provider import GeminiProvider
from services.ai.providers.openai_compatible_provider import OpenAICompatibleProvider


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    label: str
    default_base_url: str
    adapter_class: type
    host_markers: tuple[str, ...] = ()
    requires_api_key: bool = True

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "defaultBaseUrl": self.default_base_url,
            "requiresApiKey": self.requires_api_key,
        }


PROVIDER_DEFINITIONS = (
    ProviderDefinition("openai", "OpenAI", "https://api.openai.com/v1", OpenAICompatibleProvider, ("api.openai.com",)),
    ProviderDefinition("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", OpenAICompatibleProvider, ("openrouter.ai",)),
    ProviderDefinition("anthropic", "Anthropic Claude", "https://api.anthropic.com/v1", AnthropicProvider, ("api.anthropic.com",)),
    ProviderDefinition("gemini", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta", GeminiProvider, ("generativelanguage.googleapis.com",)),
    ProviderDefinition("kimi", "Kimi / Moonshot", "https://api.moonshot.ai/v1", OpenAICompatibleProvider, ("api.moonshot.ai",)),
    ProviderDefinition("groq", "Groq", "https://api.groq.com/openai/v1", OpenAICompatibleProvider, ("api.groq.com",)),
    ProviderDefinition("deepseek", "DeepSeek", "https://api.deepseek.com/v1", OpenAICompatibleProvider, ("api.deepseek.com",)),
    ProviderDefinition("together", "Together AI", "https://api.together.xyz/v1", OpenAICompatibleProvider, ("api.together.xyz",)),
    ProviderDefinition("mistral", "Mistral", "https://api.mistral.ai/v1", OpenAICompatibleProvider, ("api.mistral.ai",)),
    ProviderDefinition("cohere", "Cohere", "https://api.cohere.com", CohereProvider, ("api.cohere.com",)),
    ProviderDefinition("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1", OpenAICompatibleProvider, ("api.fireworks.ai",)),
    ProviderDefinition("perplexity", "Perplexity", "https://api.perplexity.ai", OpenAICompatibleProvider, ("api.perplexity.ai",)),
    ProviderDefinition("grok", "xAI Grok", "https://api.x.ai/v1", OpenAICompatibleProvider, ("api.x.ai",)),
    ProviderDefinition("ollama", "Ollama", "http://localhost:11434/v1", OpenAICompatibleProvider, ("localhost:11434", "127.0.0.1:11434"), False),
    ProviderDefinition("lmstudio", "LM Studio", "http://localhost:1234/v1", OpenAICompatibleProvider, ("localhost:1234", "127.0.0.1:1234"), False),
    ProviderDefinition("openai-compatible", "OpenAI-Compatible", "", OpenAICompatibleProvider, (), False),
    ProviderDefinition("custom", "Custom Provider", "", OpenAICompatibleProvider, (), False),
)
PROVIDERS = {provider.id: provider for provider in PROVIDER_DEFINITIONS}


def provider_catalog():
    return [provider.to_dict() for provider in PROVIDER_DEFINITIONS]


def get_provider_definition(provider_id):
    return PROVIDERS.get(str(provider_id or "").strip().lower())


def detect_provider_from_base_url(base_url):
    value = str(base_url or "").strip()
    if not value:
        return None

    parsed = urlparse(value if "://" in value else f"http://{value}")
    target = f"{parsed.netloc}{parsed.path}".lower().rstrip("/")

    for definition in PROVIDER_DEFINITIONS:
        if any(marker in target for marker in definition.host_markers):
            return definition

    return None


def detect_provider_from_key(api_key):
    value = str(api_key or "").strip()
    lower = value.lower()

    if lower.startswith("sk-or-v1-"):
        return PROVIDERS["openrouter"]
    if lower.startswith("sk-ant-"):
        return PROVIDERS["anthropic"]
    if lower.startswith("gsk_"):
        return PROVIDERS["groq"]
    if value.startswith("AIza"):
        return PROVIDERS["gemini"]
    if lower.startswith("pplx-"):
        return PROVIDERS["perplexity"]
    if lower.startswith("xai-"):
        return PROVIDERS["grok"]
    if lower.startswith("sk-"):
        return PROVIDERS["openai"]

    return None


def validate_base_url(base_url):
    value = str(base_url or "").strip().rstrip("/")
    if not value:
        return ""

    if len(value) > 2048:
        raise ValueError("Base URL is too long.")

    if "://" not in value:
        value = f"http://{value}"

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL must be a valid HTTP or HTTPS URL.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Base URL cannot contain credentials, query parameters, or fragments.")

    hostname = (parsed.hostname or "").lower()
    if hostname in {"metadata.google.internal", "metadata.azure.internal"}:
        raise ValueError("Cloud metadata endpoints cannot be used as provider Base URLs.")

    try:
        address = ipaddress.ip_address(hostname)
        if address.is_link_local or address.is_multicast or address.is_unspecified:
            raise ValueError("This network address cannot be used as a provider Base URL.")
        is_local_address = address.is_loopback or address.is_private
    except ValueError as error:
        if "cannot be used" in str(error):
            raise
        is_local_address = hostname == "localhost" or hostname.endswith(".local")

    if parsed.scheme == "http" and not is_local_address:
        raise ValueError("Use HTTPS for remote provider Base URLs.")

    return value


def normalize_base_url(definition, base_url=""):
    value = validate_base_url(base_url) or definition.default_base_url
    if not value:
        return ""

    parsed = urlparse(value)
    path = parsed.path.rstrip("/")
    canonical = urlparse(definition.default_base_url) if definition.default_base_url else None

    if canonical and parsed.netloc.lower() == canonical.netloc.lower() and not path:
        return definition.default_base_url.rstrip("/")

    if definition.id in {"ollama", "lmstudio"} and path in {"", "/api"}:
        return f"{parsed.scheme}://{parsed.netloc}/v1"

    return value.rstrip("/")
