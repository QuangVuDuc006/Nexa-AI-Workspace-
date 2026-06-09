import base64
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import func, select

from conftest import login
from services.database import Attachment, Document, DocumentChunk, ProviderConnection, UserMemory, db_session


USER_A = "phase4-user-a"
USER_B = "phase4-user-b"
EMAIL_A = "phase4-a@example.com"
EMAIL_B = "phase4-b@example.com"
SENTINEL = "USER_A_PRIVATE_PHASE4_SENTINEL"


def assert_status_is_hidden(response):
    assert response.status_code in {403, 404}


def assert_no_user_a_data(response):
    assert SENTINEL not in response.get_data(as_text=True)


def login_a(client):
    return login(client, uid=USER_A, email=EMAIL_A)


def login_b(client):
    return login(client, uid=USER_B, email=EMAIL_B)


def provider_payload(api_key="sk-phase4-user-a-secret"):
    return {
        "providerType": "custom",
        "apiKey": api_key,
        "baseUrl": "https://phase4-provider.example/v1",
        "selectedModel": "phase4-private-model",
        "models": [{
            "id": "phase4-private-model",
            "name": f"{SENTINEL} Provider Model",
            "capabilities": ["text"],
            "supportsStreaming": True,
        }],
    }


def upload_document(client, token, content, filename="phase4-private.txt"):
    return client.post(
        "/api/documents/upload",
        data={"file": (BytesIO(content.encode("utf-8")), filename)},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )


def test_cross_user_conversation_and_message_routes_do_not_leak_or_mutate(client):
    token_a = login_a(client)
    imported = client.post(
        "/api/conversations/import",
        json={
            "conversations": [{
                "id": "phase4-user-a-conversation",
                "title": f"{SENTINEL} private conversation",
                "messages": [{
                    "id": "phase4-user-a-message",
                    "role": "user",
                    "text": f"{SENTINEL} private message body",
                }],
            }]
        },
        headers={"X-CSRF-Token": token_a},
    )
    assert imported.status_code == 200

    token_b = login_b(client)
    hidden_get = client.get("/api/conversations/phase4-user-a-conversation")
    hidden_patch = client.patch(
        "/api/conversations/phase4-user-a-conversation",
        json={"title": "user b overwrite attempt"},
        headers={"X-CSRF-Token": token_b},
    )
    hidden_delete = client.delete(
        "/api/conversations/phase4-user-a-conversation",
        headers={"X-CSRF-Token": token_b},
    )
    hidden_message_patch = client.patch(
        "/api/messages/phase4-user-a-message",
        json={"feedback": "like"},
        headers={"X-CSRF-Token": token_b},
    )
    hidden_message_delete = client.delete(
        "/api/messages/phase4-user-a-message",
        headers={"X-CSRF-Token": token_b},
    )
    import_foreign_conversation = client.post(
        "/api/conversations/import",
        json={
            "conversations": [{
                "id": "phase4-user-a-conversation",
                "title": "user b import overwrite attempt",
            }]
        },
        headers={"X-CSRF-Token": token_b},
    )
    import_foreign_message = client.post(
        "/api/conversations/import",
        json={
            "conversations": [{
                "id": "phase4-user-b-conversation",
                "title": "user b conversation",
                "messages": [{
                    "id": "phase4-user-a-message",
                    "role": "user",
                    "text": "user b duplicate message attempt",
                }],
            }]
        },
        headers={"X-CSRF-Token": token_b},
    )

    for response in (
        hidden_get,
        hidden_patch,
        hidden_delete,
        hidden_message_patch,
        hidden_message_delete,
        import_foreign_conversation,
        import_foreign_message,
    ):
        assert_status_is_hidden(response)
        assert_no_user_a_data(response)

    user_b_list = client.get("/api/conversations")
    assert user_b_list.status_code == 200
    assert_no_user_a_data(user_b_list)

    login_a(client)
    user_a_conversation = client.get("/api/conversations/phase4-user-a-conversation")
    assert user_a_conversation.status_code == 200
    assert SENTINEL in user_a_conversation.get_data(as_text=True)


def test_cross_user_provider_connections_are_hidden_and_not_destructible(client):
    token_a = login_a(client)
    saved = client.post(
        "/api/providers",
        json=provider_payload(),
        headers={"X-CSRF-Token": token_a},
    )
    assert saved.status_code == 201
    connection_id = saved.get_json()["savedProvider"]["id"]

    token_b = login_b(client)
    listed = client.get("/api/providers")
    assert listed.status_code == 200
    assert listed.get_json()["providers"] == []
    assert_no_user_a_data(listed)

    patch = client.patch(
        f"/api/providers/{connection_id}",
        json={"selectedModel": "phase4-user-b-model"},
        headers={"X-CSRF-Token": token_b},
    )
    activate = client.post(
        f"/api/providers/{connection_id}/activate",
        headers={"X-CSRF-Token": token_b},
    )
    delete = client.delete(
        f"/api/providers/{connection_id}",
        headers={"X-CSRF-Token": token_b},
    )

    for response in (patch, activate, delete):
        assert_status_is_hidden(response)
        assert_no_user_a_data(response)

    db = db_session()
    saved_connection = db.get(ProviderConnection, connection_id)
    assert saved_connection is not None
    assert saved_connection.user_id == USER_A


def test_cross_user_memories_and_personalization_are_isolated(client):
    token_a = login_a(client)
    personalization = client.put(
        "/api/personalization",
        json={"personalizationText": f"{SENTINEL} user A personalization"},
        headers={"X-CSRF-Token": token_a},
    )
    created = client.post(
        "/api/memory",
        json={"value": f"{SENTINEL} user A prefers private answers"},
        headers={"X-CSRF-Token": token_a},
    )
    assert personalization.status_code == 200
    assert created.status_code == 201
    memory_id = created.get_json()["memory"]["id"]

    token_b = login_b(client)
    profile = client.get("/api/personalization")
    memory_list = client.get("/api/memory")
    patch = client.patch(
        f"/api/memory/{memory_id}",
        json={"value": "user b overwrite attempt"},
        headers={"X-CSRF-Token": token_b},
    )
    delete = client.delete(f"/api/memory/{memory_id}", headers={"X-CSRF-Token": token_b})

    assert profile.status_code == 200
    assert profile.get_json()["personalizationText"] == ""
    assert_no_user_a_data(profile)
    assert memory_list.status_code == 200
    assert memory_list.get_json()["memories"] == []
    assert_no_user_a_data(memory_list)
    for response in (patch, delete):
        assert_status_is_hidden(response)
        assert_no_user_a_data(response)

    db = db_session()
    user_a_memory = db.get(UserMemory, memory_id)
    assert user_a_memory is not None
    assert user_a_memory.user_id == USER_A
    assert user_a_memory.status == "active"


def test_cross_user_documents_chunks_and_rag_retrieval_are_isolated(client):
    token_a = login_a(client)
    upload = upload_document(
        client,
        token_a,
        f"## Private Phase 4\n{SENTINEL} private retrieval chunk belongs only to user A.",
    )
    assert upload.status_code == 200
    document_id = upload.get_json()["document"]["id"]

    db = db_session()
    assert db.get(Document, document_id).user_id == USER_A
    assert db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == document_id)) > 0

    token_b = login_b(client)
    list_docs = client.get("/api/documents")
    read_content = client.get(f"/api/documents/{document_id}/content")
    search = client.post(
        "/api/documents/search",
        json={"query": SENTINEL, "top_k": 5},
        headers={"X-CSRF-Token": token_b},
    )
    delete = client.delete(f"/api/documents/{document_id}", headers={"X-CSRF-Token": token_b})

    assert list_docs.status_code == 200
    assert list_docs.get_json()["documents"] == []
    assert_no_user_a_data(list_docs)
    assert_status_is_hidden(read_content)
    assert_no_user_a_data(read_content)
    assert search.status_code == 200
    assert search.get_json()["chunks"] == []
    assert_no_user_a_data(search)
    assert_status_is_hidden(delete)
    assert_no_user_a_data(delete)

    db = db_session()
    assert db.get(Document, document_id) is not None
    assert db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == document_id)) > 0


def test_cross_user_attachment_content_and_message_delete_are_isolated(app_module, monkeypatch):
    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["ok"]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    image_data = base64.b64encode(b"phase4-private-image").decode("ascii")
    with app.test_client() as client:
        token_a = login_a(client)
        chat = client.post(
            "/api/chat",
            json={
                "conversationId": "phase4-attachment-conversation",
                "userMessageId": "phase4-attachment-message",
                "assistantMessageId": "phase4-attachment-assistant",
                "message": "store private image",
                "attachments": [{
                    "kind": "image",
                    "name": f"{SENTINEL}.png",
                    "mimeType": "image/png",
                    "dataUrl": f"data:image/png;base64,{image_data}",
                }],
            },
            headers={"X-CSRF-Token": token_a},
        )
        assert chat.status_code == 200

        db = db_session()
        attachment = db.scalar(select(Attachment).where(Attachment.message_id == "phase4-attachment-message"))
        assert attachment is not None
        attachment_id = attachment.id
        storage_path = Path(attachment.storage_path)
        assert storage_path.exists()

        token_b = login_b(client)
        read_attachment = client.get(f"/api/attachments/{attachment_id}/content")
        delete_message = client.delete(
            "/api/messages/phase4-attachment-message",
            headers={"X-CSRF-Token": token_b},
        )

        for response in (read_attachment, delete_message):
            assert_status_is_hidden(response)
            assert_no_user_a_data(response)

        db = db_session()
        assert db.get(Attachment, attachment_id) is not None
        assert storage_path.exists()
