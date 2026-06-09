from io import BytesIO
from types import SimpleNamespace

from sqlalchemy import select

from conftest import login
from services.database import Conversation, Document, UserMemory, db_session
from services.rag.document_service import list_documents_by_user


def upload_document(client, token, content, filename="notes.txt"):
    payload = content if isinstance(content, bytes) else content.encode("utf-8")
    return client.post(
        "/api/documents/upload",
        data={"file": (BytesIO(payload), filename)},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )


def provider_payload(index=1):
    return {
        "providerType": "custom",
        "apiKey": f"sk-super-sensitive-quota-value-{index}",
        "baseUrl": f"https://custom-{index}.example/v1",
        "selectedModel": "custom-chat-model",
        "models": [{
            "id": "custom-chat-model",
            "name": "Custom Chat Model",
            "capabilities": ["text", "streaming"],
            "supportsStreaming": True,
        }],
    }


def test_storage_quota_endpoint_defaults_to_free_75mb(client):
    token = login(client, uid="storage-default-user")

    response = client.get("/api/storage/quota", headers={"X-CSRF-Token": token})

    assert response.status_code == 200
    storage = response.get_json()["storage"]
    assert storage["plan"] == "free"
    assert storage["limitBytes"] == 75 * 1024 * 1024
    assert storage["usedBytes"] == 0
    assert storage["isWarning"] is False
    assert storage["breakdown"]["filesBytes"] == 0


def test_storage_quota_warns_at_80_percent(app_module, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_STORAGE_MB_PER_USER", "1")
    monkeypatch.setenv("RAG_CHUNK_SIZE_CHARS", "2000000")
    monkeypatch.setenv("RAG_CHUNK_OVERLAP_CHARS", "0")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="storage-warning-user")
        upload = upload_document(client, token, b"a" * (850 * 1024))
        response = client.get("/api/storage/quota", headers={"X-CSRF-Token": token})

    assert upload.status_code == 200
    storage = response.get_json()["storage"]
    assert storage["limitBytes"] == 1024 * 1024
    assert storage["usedBytes"] >= 850 * 1024
    assert storage["isWarning"] is True
    assert storage["isFull"] is False


def test_delete_document_updates_storage_usage(client):
    token = login(client, uid="storage-delete-user")
    upload = upload_document(client, token, "Delete this quota usage.")
    document_id = upload.get_json()["document"]["id"]

    before = client.get("/api/storage/quota", headers={"X-CSRF-Token": token}).get_json()["storage"]
    deleted = client.delete(f"/api/documents/{document_id}", headers={"X-CSRF-Token": token})
    after = client.get("/api/storage/quota", headers={"X-CSRF-Token": token}).get_json()["storage"]

    assert deleted.status_code == 200
    assert before["usedBytes"] > 0
    assert after["usedBytes"] == 0


def test_document_list_uses_physical_file_size_when_metadata_is_zero(client):
    token = login(client, uid="storage-size-fallback-user")
    upload = upload_document(client, token, b"Physical size should still be visible.")
    document_id = upload.get_json()["document"]["id"]

    db = db_session()
    document = db.get(Document, document_id)
    document.size = 0
    db.commit()

    listed = list_documents_by_user(db, "storage-size-fallback-user", client.application.config["APP_SETTINGS"])

    assert listed[0]["size"] == len(b"Physical size should still be visible.")


def test_provider_connection_quota_blocks_new_connection(app_module, monkeypatch):
    monkeypatch.setenv("MAX_PROVIDER_CONNECTIONS_PER_USER", "1")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="provider-quota-user")
        first = client.post("/api/providers", json=provider_payload(1), headers={"X-CSRF-Token": token})
        second = client.post("/api/providers", json=provider_payload(2), headers={"X-CSRF-Token": token})

    assert first.status_code == 201
    assert second.status_code == 403
    assert second.get_json()["code"] == "provider_connection_quota_exceeded"


def test_chat_conversation_quota_blocks_new_conversation(app_module, monkeypatch):
    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["ok"]))

    monkeypatch.setenv("MAX_CONVERSATIONS_PER_USER", "1")
    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="conversation-quota-user")
        first = client.post(
            "/api/conversations",
            json={"id": "conv-quota-existing", "title": "Existing"},
            headers={"X-CSRF-Token": token},
        )
        second = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-quota-new",
                "conversationTitle": "New blocked chat",
                "message": "hello",
            },
            headers={"X-CSRF-Token": token},
        )

    db = db_session()
    saved = list(db.scalars(select(Conversation).where(Conversation.user_id == "conversation-quota-user")).all())

    assert first.status_code == 201
    assert second.status_code == 403
    assert second.get_json()["code"] == "conversation_quota_exceeded"
    assert [conversation.id for conversation in saved] == ["conv-quota-existing"]


def test_manual_memory_limit_uses_configured_free_plan_limit(app_module, monkeypatch):
    monkeypatch.setenv("MAX_MEMORIES_PER_USER", "2")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="memory-quota-user")

        for index in range(3):
            response = client.post(
                "/api/memory",
                json={"value": f"Useful memory number {index} for quota testing."},
                headers={"X-CSRF-Token": token},
            )
            assert response.status_code == 201

        listed = client.get("/api/memory", headers={"X-CSRF-Token": token})

    db = db_session()
    all_memories = list(db.scalars(select(UserMemory).where(UserMemory.user_id == "memory-quota-user")).all())

    assert len(listed.get_json()["memories"]) == 2
    assert sum(1 for memory in all_memories if memory.status == "archived") == 1
