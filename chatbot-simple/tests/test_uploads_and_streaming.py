from types import SimpleNamespace
from io import BytesIO

from conftest import login


def test_upload_accepts_text_and_rejects_unknown(client):
    token = login(client)
    response = client.post(
        "/api/uploads",
        data={"file": (BytesIO(b"hello from a text file"), "notes.txt")},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 200
    assert response.get_json()["attachment"]["content"] == "hello from a text file"

    bad_response = client.post(
        "/api/uploads",
        data={"file": (BytesIO(b"binary"), "archive.zip")},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )

    assert bad_response.status_code == 422
    assert bad_response.get_json()["code"] == "unsupported_file"


def test_streaming_chat_persists_messages(app_module, monkeypatch):
    routed_requests = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_requests.append((provider_id, model))
            return SimpleNamespace(
                provider="fake",
                model="fake-model",
                chunks=iter(["hello", " stream"]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client)
        response = client.post(
            "/api/chat/stream",
            json={
                "conversationId": "conv-stream-test",
                "conversationTitle": "Stream test",
                "userMessageId": "msg-user-stream",
                "assistantMessageId": "msg-ai-stream",
                "message": "Say hello",
                "provider": "attacker-controlled-provider",
                "model": "attacker-controlled-model",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        assert b'"type": "token"' in response.data
        assert b"hello" in response.data
        assert b"stream" in response.data
        assert routed_requests == [(None, None)]

        conversation = client.get("/api/conversations/conv-stream-test")

        assert conversation.status_code == 200
        messages = conversation.get_json()["conversation"]["messages"]
        assert [message["role"] for message in messages] == ["user", "ai"]
        assert messages[1]["text"] == "hello stream"
        assert messages[1]["provider"] == "fake"
        assert messages[1]["model"] == "fake-model"
