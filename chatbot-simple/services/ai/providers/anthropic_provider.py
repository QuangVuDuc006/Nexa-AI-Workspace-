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


class AnthropicProvider(AIProvider):
    def headers(self, accept="application/json"):
        return {
            "X-Api-Key": self.config.api_key or "",
            "Anthropic-Version": "2023-06-01",
            "Content-Type": "application/json",
            "Accept": accept,
            "User-Agent": "NexaAI/1.0",
        }

    def request_json(self, endpoint, method="GET", body=None, model=""):
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(endpoint, data=payload, headers=self.headers(), method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise self.wrap_http_error(error, model) from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Anthropic request timed out.", provider=self.provider_id, model=model) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Anthropic.", provider=self.provider_id, model=model) from error
        except json.JSONDecodeError as error:
            raise APIResponseFormatError("Anthropic returned invalid JSON.", provider=self.provider_id, model=model) from error

    def list_models(self):
        self.ensure_configured()
        payload = self.request_json(f"{self.config.base_url.rstrip('/')}/models")
        return payload.get("data", [])

    def build_body(self, message, model, attachments, stream=False):
        text_content = build_user_content(message, attachments)
        _text_attachments, image_attachments = split_attachments(attachments)
        content = [{"type": "text", "text": text_content}]

        for attachment in image_attachments:
            _header, encoded_data = attachment["data_url"].split(";base64,", 1)
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": attachment["mime_type"],
                    "data": encoded_data,
                },
            })

        return {
            "model": model,
            "max_tokens": 4096,
            "stream": stream,
            "messages": [{"role": "user", "content": content}],
        }

    def generate_reply(self, message, model, attachments):
        data = self.request_json(
            f"{self.config.base_url.rstrip('/')}/messages",
            "POST",
            self.build_body(message, model, attachments),
            model,
        )
        reply = "".join(
            item.get("text", "")
            for item in data.get("content", [])
            if isinstance(item, dict) and item.get("type") == "text"
        ).strip()
        if not reply:
            raise APIResponseFormatError("Anthropic did not return a response.", provider=self.provider_id, model=model)
        return reply

    def stream_reply(self, message, model, attachments):
        endpoint = f"{self.config.base_url.rstrip('/')}/messages"
        payload = json.dumps(self.build_body(message, model, attachments, stream=True)).encode("utf-8")
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
                        event = json.loads(line.removeprefix("data:").strip())
                    except json.JSONDecodeError:
                        continue
                    delta = event.get("delta") or {}
                    if event.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
                        if delta.get("text"):
                            yield delta["text"]
        except urllib.error.HTTPError as error:
            raise self.wrap_http_error(error, model) from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Anthropic request timed out.", provider=self.provider_id, model=model) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Anthropic.", provider=self.provider_id, model=model) from error

    def supports_images(self, model=None):
        return "claude-3" in str(model or "").lower() or "claude-4" in str(model or "").lower()

    def wrap_http_error(self, error, model):
        if error.code in {401, 403}:
            return ProviderAuthenticationError("Invalid API key.", provider=self.provider_id, model=model)
        if error.code == 429:
            return RateLimitError("Anthropic rate limit reached.", provider=self.provider_id, model=model)
        if error.code in {408, 504}:
            return APITimeoutError("Anthropic request timed out.", provider=self.provider_id, model=model)
        if error.code == 404 and model:
            return InvalidModelError(f"Invalid Anthropic model '{model}'.", provider=self.provider_id, model=model)
        return UpstreamAPIError(
            f"Anthropic request failed with status {error.code}.",
            provider=self.provider_id,
            model=model,
        )
