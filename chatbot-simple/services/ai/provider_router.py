from dataclasses import dataclass

from services.ai.config import get_default_provider_id, get_provider_configs
from services.ai.errors import InvalidProviderError
from services.ai.providers.base import AIResponse
from services.ai.providers.gemini_provider import GeminiProvider
from services.ai.providers.openai_compatible_provider import OpenAICompatibleProvider
from services.ai.provider_registry import get_provider_definition


@dataclass(frozen=True)
class AIStream:
    provider: str
    model: str
    chunks: object


class ProviderRouter:
    def __init__(self, runtime_config=None):
        configs = get_provider_configs()
        self.providers = {
            "gemini": GeminiProvider(configs["gemini"]),
            "openai": OpenAICompatibleProvider(configs["openai"]),
            "openrouter": OpenAICompatibleProvider(configs["openrouter"]),
        }

        if runtime_config:
            definition = get_provider_definition(runtime_config.provider_id)
            if not definition:
                raise InvalidProviderError(
                    f"Invalid provider '{runtime_config.provider_id}'.",
                    provider=runtime_config.provider_id,
                )
            self.providers[runtime_config.provider_id] = definition.adapter_class(runtime_config)
            self.runtime_provider_id = runtime_config.provider_id
        else:
            self.runtime_provider_id = None

    def default_provider_id(self):
        if self.runtime_provider_id:
            return self.runtime_provider_id

        configured_default = get_default_provider_id()

        if configured_default in self.providers:
            return configured_default

        return next(iter(self.providers))

    def get_provider(self, provider_id=None):
        selected_provider = (provider_id or self.default_provider_id()).strip().lower()
        provider = self.providers.get(selected_provider)

        if not provider:
            raise InvalidProviderError(
                f"Invalid provider '{selected_provider}'.",
                provider=selected_provider,
            )

        return provider

    def generate(self, provider_id, message, model=None, attachments=None):
        provider = self.get_provider(provider_id)
        active_model = provider.resolve_model(model)
        provider.ensure_supports_attachments(active_model, attachments or [])
        reply = provider.generate_reply(message, active_model, attachments or [])
        return AIResponse(reply=reply, provider=provider.provider_id, model=active_model)

    def prepare_stream(self, provider_id, message, model=None, attachments=None):
        provider = self.get_provider(provider_id)
        active_model = provider.resolve_model(model)
        provider.ensure_supports_attachments(active_model, attachments or [])
        chunks = provider.stream_reply(message, active_model, attachments or [])
        return AIStream(provider=provider.provider_id, model=active_model, chunks=chunks)
