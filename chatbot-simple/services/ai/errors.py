class AIProviderError(Exception):
    status_code = 500
    code = "ai_provider_error"

    def __init__(self, message, *, provider=None, model=None, details=None):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.model = model
        self.details = details

    def to_dict(self):
        payload = {
            "error": self.message,
            "code": self.code,
        }

        if self.provider:
            payload["provider"] = self.provider

        if self.model:
            payload["model"] = self.model

        return payload


class MissingAPIKeyError(AIProviderError):
    status_code = 500
    code = "missing_api_key"


class MissingProviderConfigError(AIProviderError):
    status_code = 500
    code = "missing_provider_config"


class ProviderAuthenticationError(AIProviderError):
    status_code = 401
    code = "invalid_api_key"


class InvalidProviderError(AIProviderError):
    status_code = 400
    code = "invalid_provider"


class InvalidModelError(AIProviderError):
    status_code = 400
    code = "invalid_model"


class UnsupportedAttachmentError(AIProviderError):
    status_code = 400
    code = "unsupported_attachment"


class APITimeoutError(AIProviderError):
    status_code = 504
    code = "api_timeout"


class RateLimitError(AIProviderError):
    status_code = 429
    code = "api_rate_limit"


class APIResponseFormatError(AIProviderError):
    status_code = 502
    code = "api_response_format_mismatch"


class UpstreamAPIError(AIProviderError):
    status_code = 502
    code = "upstream_api_error"
