from __future__ import annotations

import hashlib
import json
import math
import re
import urllib.error
import urllib.request


DEFAULT_LOCAL_DIMENSIONS = 256
TOKEN_RE = re.compile(r"[\w\u00C0-\u1EF9]+", re.UNICODE)


class EmbeddingError(RuntimeError):
    pass


def parse_embedding_payload(value):
    if isinstance(value, list):
        return [float(item) for item in value]

    try:
        parsed = json.loads(str(value or "[]"))
    except (TypeError, json.JSONDecodeError) as error:
        raise EmbeddingError("Stored embedding is not valid JSON.") from error

    if not isinstance(parsed, list):
        raise EmbeddingError("Stored embedding must be a list.")

    return [float(item) for item in parsed]


def serialize_embedding(embedding):
    return json.dumps([float(item) for item in embedding], separators=(",", ":"))


def normalize_vector(vector):
    magnitude = math.sqrt(sum(float(value) * float(value) for value in vector))

    if magnitude <= 0:
        return [0.0 for _value in vector]

    return [float(value) / magnitude for value in vector]


def local_hash_embedding(text, dimensions=DEFAULT_LOCAL_DIMENSIONS):
    vector = [0.0] * dimensions
    tokens = TOKEN_RE.findall(str(text or "").lower())

    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = -1.0 if digest[4] % 2 else 1.0
        vector[index] += sign

    return normalize_vector(vector)


class EmbeddingService:
    def __init__(self, provider="local", model="local-hash-embedding", api_key="", timeout=30):
        self.provider = (provider or "local").strip().lower()
        self.model = (model or "local-hash-embedding").strip()
        self.api_key = str(api_key or "").strip()
        self.timeout = int(timeout or 30)

    @classmethod
    def from_settings(cls, settings):
        return cls(
            provider=getattr(settings, "embedding_provider", "local"),
            model=getattr(settings, "embedding_model", "local-hash-embedding"),
            api_key=getattr(settings, "embedding_api_key", ""),
            timeout=getattr(settings, "ai_request_timeout", 30),
        )

    def create_embedding(self, text):
        if self.provider in {"", "local", "hash", "simple"}:
            return local_hash_embedding(text)

        if self.provider in {"openai", "openai-compatible"}:
            return self._openai_embedding(text)

        raise EmbeddingError(
            f"Embedding provider '{self.provider}' is not supported. Set EMBEDDING_PROVIDER=local or openai."
        )

    def _openai_embedding(self, text):
        if not self.api_key:
            raise EmbeddingError("EMBEDDING_API_KEY is required for OpenAI-compatible embeddings.")

        payload = json.dumps({
            "model": self.model or "text-embedding-3-small",
            "input": str(text or ""),
        }).encode("utf-8")
        request = urllib.request.Request(
            "https://api.openai.com/v1/embeddings",
            data=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as error:
            raise EmbeddingError(f"Embedding request failed: {error}") from error
        except json.JSONDecodeError as error:
            raise EmbeddingError("Embedding provider returned invalid JSON.") from error

        try:
            embedding = body["data"][0]["embedding"]
        except (KeyError, IndexError, TypeError) as error:
            raise EmbeddingError("Embedding provider response did not contain an embedding.") from error

        return normalize_vector(embedding)


def create_embedding(text, settings=None):
    service = EmbeddingService.from_settings(settings) if settings else EmbeddingService()
    return service.create_embedding(text)
