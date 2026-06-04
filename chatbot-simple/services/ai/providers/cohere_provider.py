import json
import socket
import urllib.error
import urllib.request

from services.ai.errors import (
    APIResponseFormatError,
    APITimeoutError,
    ProviderAuthenticationError,
    RateLimitError,
    UpstreamAPIError,
)
from services.ai.providers.base import AIProvider, build_user_content


class CohereProvider(AIProvider):
    def headers(self):
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "NexaAI/1.0",
        }

    def request_json(self, endpoint, method="GET", body=None, model=""):
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(endpoint, data=payload, headers=self.headers(), method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code in {401, 403}:
                raise ProviderAuthenticationError("Invalid API key.", provider=self.provider_id, model=model) from error
            if error.code == 429:
                raise RateLimitError("Cohere rate limit reached.", provider=self.provider_id, model=model) from error
            raise UpstreamAPIError(
                f"Cohere request failed with status {error.code}.",
                provider=self.provider_id,
                model=model,
            ) from error
        except (TimeoutError, socket.timeout) as error:
            raise APITimeoutError("Cohere request timed out.", provider=self.provider_id, model=model) from error
        except urllib.error.URLError as error:
            raise UpstreamAPIError("Could not connect to Cohere.", provider=self.provider_id, model=model) from error
        except json.JSONDecodeError as error:
            raise APIResponseFormatError("Cohere returned invalid JSON.", provider=self.provider_id, model=model) from error

    def list_models(self):
        self.ensure_configured()
        payload = self.request_json(f"{self.config.base_url.rstrip('/')}/v1/models")
        return payload.get("models", [])

    def generate_reply(self, message, model, attachments):
        data = self.request_json(
            f"{self.config.base_url.rstrip('/')}/v2/chat",
            "POST",
            {
                "model": model,
                "messages": [{"role": "user", "content": build_user_content(message, attachments)}],
            },
            model,
        )
        reply = "".join(
            item.get("text", "")
            for item in (data.get("message") or {}).get("content", [])
            if isinstance(item, dict)
        ).strip()
        if not reply:
            raise APIResponseFormatError("Cohere did not return a response.", provider=self.provider_id, model=model)
        return reply
