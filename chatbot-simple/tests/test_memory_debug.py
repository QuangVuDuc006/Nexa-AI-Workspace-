import logging
from types import SimpleNamespace

from conftest import login


class FakeRouter:
    def __init__(self, *args, **kwargs):
        pass

    def prepare_stream(self, provider_id, message, model=None, attachments=None):
        return SimpleNamespace(
            provider="fake",
            model="fake-model",
            chunks=iter(["memory debug reply"]),
        )


def post_chat(client, token, conversation_id="conv-memory-debug"):
    return client.post(
        "/api/chat",
        json={
            "conversationId": conversation_id,
            "conversationTitle": "Memory debug",
            "userMessageId": f"{conversation_id}-user",
            "assistantMessageId": f"{conversation_id}-assistant",
            "message": "Remember this.",
            "attachments": [],
        },
        headers={"X-CSRF-Token": token},
    )


def memory_debug_records(caplog):
    return [record for record in caplog.records if record.getMessage().startswith("memory_debug")]


def test_memory_debug_logs_disabled_by_default(app_module, monkeypatch, caplog):
    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)
    caplog.set_level(logging.WARNING)

    with app.test_client() as client:
        token = login(client, uid="memory-debug-default")
        page = client.get("/chat")
        response = post_chat(client, token)

    assert page.status_code == 200
    assert b'data-memory-debug="false"' in page.data
    assert response.status_code == 200
    assert memory_debug_records(caplog) == []


def test_memory_debug_logs_can_be_enabled(app_module, monkeypatch, caplog):
    monkeypatch.setenv("NEXA_MEMORY_DEBUG", "true")
    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)
    caplog.set_level(logging.WARNING)

    with app.test_client() as client:
        token = login(client, uid="memory-debug-enabled")
        page = client.get("/chat")
        response = post_chat(client, token, conversation_id="conv-memory-debug-enabled")

    assert page.status_code == 200
    assert b'data-memory-debug="true"' in page.data
    assert response.status_code == 200
    assert [record.getMessage() for record in memory_debug_records(caplog)] == [
        "memory_debug chat incoming",
        "memory_debug chat provider_context",
        "memory_debug chat resolved_conversation",
        "memory_debug chat assistant_persisted",
    ]
