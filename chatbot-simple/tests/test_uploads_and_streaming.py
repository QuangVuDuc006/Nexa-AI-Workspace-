from types import SimpleNamespace
from io import BytesIO
from pathlib import Path

from conftest import login
from services.database import Document, db_session


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


def test_deleting_conversation_removes_linked_document_file(app_module, monkeypatch):
    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            return SimpleNamespace(
                provider="fake",
                model="fake-model",
                chunks=iter(["stored"]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="conversation-document-cleanup")
        upload = client.post(
            "/api/uploads",
            data={"file": (BytesIO(b"conversation linked source"), "source-notes.txt")},
            content_type="multipart/form-data",
            headers={"X-CSRF-Token": token},
        )
        assert upload.status_code == 200
        attachment = upload.get_json()["attachment"]
        document_id = attachment["documentId"]

        db = db_session()
        document = db.get(Document, document_id)
        storage_path = Path(document.storage_path)
        assert storage_path.exists()

        chat = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-linked-document-cleanup",
                "conversationTitle": "Cleanup",
                "userMessageId": "msg-linked-document-cleanup",
                "assistantMessageId": "msg-linked-document-cleanup-ai",
                "message": "Use this document.",
                "attachments": [attachment],
            },
            headers={"X-CSRF-Token": token},
        )
        assert chat.status_code == 200

        deleted = client.delete(
            "/api/conversations/conv-linked-document-cleanup",
            headers={"X-CSRF-Token": token},
        )

        assert deleted.status_code == 200
        assert not storage_path.exists()
        assert db.get(Document, document_id) is None


def test_clear_history_removes_unreferenced_uploaded_documents(client):
    token = login(client, uid="clear-history-orphan-doc")
    upload = client.post(
        "/api/uploads",
        data={"file": (BytesIO(b"uploaded but never sent"), "orphan-notes.txt")},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )
    assert upload.status_code == 200
    document_id = upload.get_json()["attachment"]["documentId"]

    db = db_session()
    document = db.get(Document, document_id)
    storage_path = Path(document.storage_path)
    assert storage_path.exists()

    cleared = client.delete("/api/conversations", headers={"X-CSRF-Token": token})

    assert cleared.status_code == 200
    assert not storage_path.exists()
    assert db.get(Document, document_id) is None
