import base64
import json
import socket
import urllib.error
import urllib.request

from services.ai.errors import (
    APIResponseFormatError,
    APITimeoutError,
    InvalidModelError,
    ProviderAuthenticationError,
    RateLimitError,
    UpstreamAPIError,
)
from services.ai.providers.base import AIProvider, build_user_content, split_attachments


class GeminiProvider(AIProvider):
    def normalize_model_name(self, name):
        return str(name or "").strip().removeprefix("models/")

    def headers(self, accept="application/json"):
        return {
            "Content-Type": "application/json",
            "Accept": accept,
            "X-Goog-Api-Key": self.config.api_key or "",
            "User-Agent": "NexaAI/1.0",
        }

    def list_models(self):
        self.ensure_configured()
        endpoint = f"{self.config.base_url.rstrip('/')}/models"
        request = urllib.request.Request(endpoint, headers=self.headers(), method="GET")

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise self.wrap_http_error(error, "") from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Gemini model detection timed out.", provider=self.provider_id) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Gemini.", provider=self.provider_id) from error
        except json.JSONDecodeError as error:
            raise APIResponseFormatError("Gemini returned invalid model data.", provider=self.provider_id) from error

        return [
            {
                **model,
                "id": self.normalize_model_name(model.get("name")),
                "display_name": model.get("displayName"),
            }
            for model in payload.get("models", [])
            if "generateContent" in model.get("supportedGenerationMethods", [])
        ]

    def available_models(self):
        if not self.config.api_key:
            return super().available_models()

        try:
            return [
                self.normalize_model_name(model.get("id") if isinstance(model, dict) else model)
                for model in self.list_models()
            ] or super().available_models()
        except Exception:
            return super().available_models()

    def resolve_model(self, requested_model=None):
        self.ensure_configured()
        return self.normalize_model_name(super().resolve_model(requested_model))

    def build_body(self, message, attachments):
        text_content = build_user_content(message, attachments)
        _text_attachments, image_attachments = split_attachments(attachments)
        parts = [{"text": text_content}]

        for attachment in image_attachments:
            _header, encoded_data = attachment["data_url"].split(";base64,", 1)
            parts.append({
                "inlineData": {
                    "mimeType": attachment["mime_type"],
                    "data": encoded_data,
                },
            })

        return {"contents": [{"role": "user", "parts": parts}]}

    def extract_text(self, payload):
        try:
            parts = payload["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError):
            return ""

        return "".join(part.get("text", "") for part in parts if isinstance(part, dict))

    def generate_reply(self, message, model, attachments):
        endpoint = f"{self.config.base_url.rstrip('/')}/models/{model}:generateContent"
        payload = json.dumps(self.build_body(message, attachments)).encode("utf-8")
        request = urllib.request.Request(endpoint, data=payload, headers=self.headers(), method="POST")

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise self.wrap_http_error(error, model) from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Gemini request timed out.", provider=self.provider_id, model=model) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Gemini.", provider=self.provider_id, model=model) from error
        except json.JSONDecodeError as error:
            raise APIResponseFormatError("Gemini returned invalid JSON.", provider=self.provider_id, model=model) from error

        reply = self.extract_text(data).strip()
        if not reply:
            raise APIResponseFormatError("Gemini did not return a response.", provider=self.provider_id, model=model)
        return reply

    def stream_reply(self, message, model, attachments):
        endpoint = f"{self.config.base_url.rstrip('/')}/models/{model}:streamGenerateContent?alt=sse"
        payload = json.dumps(self.build_body(message, attachments)).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=payload,
            headers=self.headers("text/event-stream"),
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    try:
                        text = self.extract_text(json.loads(line.removeprefix("data:").strip()))
                    except json.JSONDecodeError:
                        continue
                    if text:
                        yield text
        except urllib.error.HTTPError as error:
            raise self.wrap_http_error(error, model) from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Gemini request timed out.", provider=self.provider_id, model=model) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Gemini.", provider=self.provider_id, model=model) from error

    def supports_images(self, model=None):
        if self.config.supports_images_override is not None:
            return self.config.supports_images_override

        normalized_model = self.normalize_model_name(model or self.default_model).lower()
        return normalized_model.startswith("gemini-") and "tts" not in normalized_model

    def wrap_http_error(self, error, model):
        if error.code in {401, 403}:
            return ProviderAuthenticationError("Invalid API key.", provider=self.provider_id, model=model)
        if error.code == 429:
            return RateLimitError("Gemini rate limit reached.", provider=self.provider_id, model=model)
        if error.code in {408, 504}:
            return APITimeoutError("Gemini request timed out.", provider=self.provider_id, model=model)
        if error.code == 404:
            return InvalidModelError(f"Invalid Gemini model '{model}'.", provider=self.provider_id, model=model)
        return UpstreamAPIError(
            f"Gemini request failed with status {error.code}.",
            provider=self.provider_id,
            model=model,
        )
