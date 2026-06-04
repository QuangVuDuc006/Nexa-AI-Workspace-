from dataclasses import dataclass

from services.ai.errors import (
    InvalidModelError,
    MissingAPIKeyError,
    MissingProviderConfigError,
    UnsupportedAttachmentError,
)


@dataclass(frozen=True)
class AIResponse:
    reply: str
    provider: str
    model: str

    def to_dict(self):
        return {
            "reply": self.reply,
            "provider": self.provider,
            "model": self.model,
        }


def split_attachments(attachments):
    text_attachments = []
    image_attachments = []

    for attachment in attachments or []:
        if attachment.get("kind") == "image":
            image_attachments.append(attachment)
        else:
            text_attachments.append(attachment)

    return text_attachments, image_attachments


def build_user_content(user_message, attachments):
    text_attachments, _image_attachments = split_attachments(attachments)

    if not text_attachments:
        return user_message

    sections = [
        user_message,
        "",
        "Use the attached text files as context. If a file is unrelated, ignore it.",
    ]

    for attachment in text_attachments:
        sections.extend([
            "",
            f"--- Attachment: {attachment['name']} ({attachment['mime_type']}) ---",
            attachment["content"],
        ])

    return "\n".join(sections)


class AIProvider:
    def __init__(self, config):
        self.config = config
        self.provider_id = config.provider_id
        self.label = config.label

    @property
    def default_model(self):
        return self.config.default_model

    def is_configured(self):
        return self.config.configured

    def ensure_configured(self):
        if self.config.requires_api_key and not self.config.api_key:
            raise MissingAPIKeyError(
                "This provider requires an API key.",
                provider=self.provider_id,
            )

        if self.config.base_url_env and not self.config.base_url:
            raise MissingProviderConfigError(
                f"Missing {self.config.base_url_env} in .env.",
                provider=self.provider_id,
            )

    def resolve_model(self, requested_model=None):
        model = (requested_model or self.default_model or "").strip()

        if not model:
            raise InvalidModelError(
                f"Missing model. Set {self.config.model_env} in .env or select a model.",
                provider=self.provider_id,
            )

        return model

    def available_models(self):
        return list(self.config.models)

    def list_models(self):
        self.ensure_configured()
        return self.available_models()

    def supports_images(self, model=None):
        return False

    def ensure_supports_attachments(self, model, attachments):
        _text_attachments, image_attachments = split_attachments(attachments)

        if image_attachments and not self.supports_images(model):
            raise UnsupportedAttachmentError(
                "This selected model does not support image input.",
                provider=self.provider_id,
                model=model,
            )

    def generate_reply(self, message, model, attachments):
        raise NotImplementedError

    def stream_reply(self, message, model, attachments):
        yield self.generate_reply(message, model, attachments)
