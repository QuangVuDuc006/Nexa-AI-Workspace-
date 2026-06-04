import sys
import json
import urllib.request
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from conftest import login
from services.ai.models import normalize_models
from services.ai.detector import detect_models
from services.ai.config import ProviderConfig
from services.ai.providers.openai_compatible_provider import OpenAICompatibleProvider
from services.ai.provider_registry import (
    detect_provider_from_base_url,
    detect_provider_from_key,
    provider_catalog,
    validate_base_url,
)
from services.database import ProviderConnection, db_session


def provider_payload(api_key="sk-super-sensitive-value"):
    return {
        "providerType": "custom",
        "apiKey": api_key,
        "baseUrl": "https://custom.example/v1",
        "selectedModel": "custom-chat-model",
        "models": [{
            "id": "custom-chat-model",
            "name": "Custom Chat Model",
            "capabilities": ["text", "tools", "streaming"],
            "supportsTools": True,
            "supportsStreaming": True,
        }],
    }


def test_provider_registry_and_model_normalization():
    assert len(provider_catalog()) == 17
    assert detect_provider_from_base_url("https://api.groq.com/openai/v1").id == "groq"
    assert detect_provider_from_base_url("http://localhost:11434").id == "ollama"
    assert detect_provider_from_key("sk-ant-example").id == "anthropic"
    assert validate_base_url("localhost:11434") == "http://localhost:11434"

    model = normalize_models(["gpt-5-example"], "openai")[0]
    assert model.supports_vision is True
    assert model.supports_tools is True
    assert "reasoning" in model.capabilities
    assert model.name == "GPT-5 Example"


def test_base_url_rejects_secret_bearing_and_insecure_remote_urls():
    for url in (
        "https://user:secret@example.com/v1",
        "https://example.com/v1?api_key=secret",
        "http://example.com/v1",
        "http://169.254.169.254/latest",
    ):
        try:
            validate_base_url(url)
        except ValueError:
            continue
        raise AssertionError(f"Expected Base URL to be rejected: {url}")


def test_openai_compatible_detection_and_streaming(monkeypatch):
    class FakeResponse:
        def __init__(self, body=b"", lines=()):
            self.body = body
            self.lines = lines

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return self.body

        def __iter__(self):
            return iter(self.lines)

    def fake_urlopen(request, timeout=None):
        assert timeout
        if request.full_url.endswith("/models"):
            return FakeResponse(json.dumps({"data": [{"id": "local-chat-model"}]}).encode())

        assert request.full_url.endswith("/chat/completions")
        return FakeResponse(lines=[
            b'data: {"choices":[{"delta":{"content":"hello"}}]}\n',
            b'data: {"choices":[{"delta":{"content":" world"}}]}\n',
            b"data: [DONE]\n",
        ])

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    result = detect_models("auto", "local-key", "https://compatible.example/v1")

    assert result.provider_id == "openai-compatible"
    assert result.default_model == "local-chat-model"

    config = ProviderConfig(
        provider_id="openai-compatible",
        label="OpenAI-Compatible",
        api_key_env="",
        model_env="",
        api_key_value="local-key",
        default_model="local-chat-model",
        base_url_env="runtime",
        base_url="https://compatible.example/v1",
        requires_api_key=False,
    )
    provider = OpenAICompatibleProvider(config)
    assert "".join(provider.stream_reply("hello", "local-chat-model", [])) == "hello world"


def test_saved_provider_key_is_encrypted_and_never_returned(client):
    raw_key = "sk-super-sensitive-value"
    token = login(client)
    response = client.post(
        "/api/providers",
        json=provider_payload(raw_key),
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 201
    assert raw_key not in response.get_data(as_text=True)
    saved = response.get_json()["savedProvider"]
    assert saved["maskedApiKey"].endswith(raw_key[-4:])
    assert "apiKey" not in saved

    listed = client.get("/api/providers")
    assert listed.status_code == 200
    assert raw_key not in listed.get_data(as_text=True)

    db = db_session()
    connection = db.get(ProviderConnection, saved["id"])
    assert connection.encrypted_api_key
    assert connection.encrypted_api_key != raw_key
    assert raw_key not in connection.encrypted_api_key


def test_provider_connections_are_account_isolated(client):
    token = login(client, uid="provider-user-a", email="a@example.com")
    response = client.post(
        "/api/providers",
        json=provider_payload(),
        headers={"X-CSRF-Token": token},
    )
    connection_id = response.get_json()["savedProvider"]["id"]

    login(client, uid="provider-user-b", email="b@example.com")
    data = client.get("/api/providers").get_json()

    assert data["providers"] == []
    assert client.post(
        f"/api/providers/{connection_id}/activate",
        headers={"X-CSRF-Token": token},
    ).status_code == 404


def test_detect_models_endpoint_normalizes_response(app_module, monkeypatch):
    class FakeResult:
        provider_id = "openai"
        provider_label = "OpenAI"
        base_url = "https://api.openai.com/v1"
        models = normalize_models(["gpt-test"], "openai")
        default_model = "gpt-test"
        connection_status = "connected"

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

    monkeypatch.setattr(app_module, "detect_models", lambda *_args, **_kwargs: FakeResult())
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client)
        response = client.post(
            "/api/providers/detect-models",
            json={"providerType": "auto", "apiKey": "sk-test"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["provider"] == "OpenAI"
        assert data["models"][0]["id"] == "gpt-test"
        assert data["models"][0]["supportsTools"] is True
        assert "apiKey" not in data
        assert "sk-test" not in response.get_data(as_text=True)


def test_chat_routes_through_active_saved_provider(app_module, monkeypatch):
    routed = []

    class FakeRouter:
        def __init__(self, runtime_config=None):
            self.runtime_config = runtime_config

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed.append((self.runtime_config.provider_id, provider_id, model))
            return SimpleNamespace(
                provider=provider_id,
                model=model,
                chunks=iter(["routed"]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client)
        saved = client.post(
            "/api/providers",
            json=provider_payload(),
            headers={"X-CSRF-Token": token},
        )
        assert saved.status_code == 201

        response = client.post(
            "/api/chat/stream",
            json={"message": "hello"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        assert b"routed" in response.data
        assert routed == [("custom", "custom", "custom-chat-model")]
