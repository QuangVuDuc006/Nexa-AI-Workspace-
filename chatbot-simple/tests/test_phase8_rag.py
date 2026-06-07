from io import BytesIO
from types import SimpleNamespace

from sqlalchemy import func, select

from conftest import login
from services.database import Document, DocumentChunk, db_session
from services.rag.chunking import chunk_text


def test_chunk_metadata_includes_start_and_end_chars():
    chunks = chunk_text("Intro text.\n\nBody text for retrieval.", chunk_size_chars=500, overlap_chars=0)

    assert chunks[0]["start_char"] == 0
    assert chunks[0]["end_char"] == len("Intro text.\n\nBody text for retrieval.")
    assert chunks[0]["source_excerpt"] == "Intro text. Body text for retrieval."


def test_chunk_metadata_captures_markdown_heading_section_title():
    chunks = chunk_text("## Installation\nRun the setup command.\n\nUsage\nAsk a question.", chunk_size_chars=500, overlap_chars=0)

    assert chunks[0]["section_title"] == "Installation"


def upload_document(client, token, content, filename="notes.txt"):
    return client.post(
        "/api/documents/upload",
        data={"file": (BytesIO(content.encode("utf-8")), filename)},
        content_type="multipart/form-data",
        headers={"X-CSRF-Token": token},
    )


def test_upload_document_creates_document(client):
    token = login(client, uid="rag-upload-doc")
    response = upload_document(client, token, "Alpha roadmap content about retrieval.")

    assert response.status_code == 200
    document = response.get_json()["document"]
    assert document["filename"] == "notes.txt"

    db = db_session()
    saved = db.get(Document, document["id"])
    assert saved is not None
    assert saved.user_id == "rag-upload-doc"


def test_upload_document_creates_chunks(client):
    token = login(client, uid="rag-upload-chunks")
    response = upload_document(
        client,
        token,
        "Alpha section.\n\n" + ("Beta retrieval content. " * 250),
    )

    assert response.status_code == 200
    document_id = response.get_json()["document"]["id"]

    db = db_session()
    chunks = list(db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document_id)).all())
    count = len(chunks)
    assert count >= 1
    assert chunks[0].start_char is not None
    assert chunks[0].end_char is not None
    assert chunks[0].source_excerpt


def test_document_search_returns_relevant_chunks(client):
    token = login(client, uid="rag-search-user")
    upload_document(client, token, "## Retrieval Policy\nAlpha retrieval policy lives here. Budget notes are separate.")

    response = client.post(
        "/api/documents/search",
        json={"query": "Alpha retrieval policy", "top_k": 3},
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 200
    chunks = response.get_json()["chunks"]
    assert chunks
    assert chunks[0]["filename"] == "notes.txt"
    assert "Alpha retrieval policy" in chunks[0]["preview"]
    assert chunks[0]["sectionTitle"] == "Retrieval Policy"
    assert chunks[0]["startChar"] == 0
    assert chunks[0]["endChar"] is not None
    assert chunks[0]["sourceExcerpt"]
    assert "embedding" not in chunks[0]
    assert "documentId" in chunks[0]


def test_document_search_is_user_isolated(client):
    token_a = login(client, uid="rag-user-a", email="a@example.com")
    upload_document(client, token_a, "Only user A has the private Alpha launch plan.")

    token_b = login(client, uid="rag-user-b", email="b@example.com")
    response = client.post(
        "/api/documents/search",
        json={"query": "private Alpha launch plan", "top_k": 5},
        headers={"X-CSRF-Token": token_b},
    )

    assert response.status_code == 200
    assert response.get_json()["chunks"] == []


def test_chat_route_includes_retrieved_rag_context(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Use source [[cite:1]]."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-chat-user")
        upload = upload_document(client, token, "Nexa RAG uses chunk retrieval and source citations.")
        assert upload.status_code == 200

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-rag-chat",
                "conversationTitle": "RAG chat",
                "userMessageId": "msg-rag-user",
                "assistantMessageId": "msg-rag-ai",
                "message": "How does Nexa RAG use retrieval citations?",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        assert routed_messages
        assert "Retrieved document context:" in routed_messages[0]
        assert "Use only the provided source labels" in routed_messages[0]
        assert "Do not create a final Sources section" in routed_messages[0]
        assert "[[source:1]] notes.txt - chunk 1 - chars 0-" in routed_messages[0]
        assert "Nexa RAG uses chunk retrieval and source citations." in routed_messages[0]
        data = response.get_json()
        assert data["citations"][0]["filename"] == "notes.txt"
        assert data["citations"][0]["label"] in routed_messages[0]
        assert data["citations"][0]["id"] == "1"
        assert data["citations"][0]["citation_id"] == "1"
        assert data["citations"][0]["document_id"]
        assert data["citations"][0]["url"].startswith("/api/documents/")
        assert data["assistant_message"]["citations"][0]["filename"] == "notes.txt"
        assert data["citations"][0]["source"] == "notes.txt - chunk 1"
        assert data["reply"] == "Use source [[cite:1]]."
        assert "Sources:" not in data["reply"]
        assert "documentId" in data["citations"][0]
        assert "embedding" not in data["citations"][0]


def test_chat_sources_include_page_section_and_chunk_without_internal_ids(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Installed with [[cite:1]]."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-chat-source-user")
        db = db_session()
        from services.rag.document_service import create_document_with_chunks

        document, _chunks = create_document_with_chunks(
            db,
            "rag-chat-source-user",
            "guide.pdf",
            "application/pdf",
            [{"content": "Installation\nRun the installer for Nexa.", "page_number": 3}],
            app.config["APP_SETTINGS"],
        )
        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-rag-source",
                "conversationTitle": "RAG source",
                "userMessageId": "msg-rag-source-user",
                "assistantMessageId": "msg-rag-source-ai",
                "message": "How do I run the installer?",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert document.id not in data["reply"]
        assert data["reply"] == "Installed with [[cite:1]]."
        assert "Sources:" not in data["reply"]
        assert data["citations"][0]["source"] == "guide.pdf - page 3 - section \"Installation\" - chunk 1"
        assert "[[source:1]] guide.pdf - page 3 - section \"Installation\" - chars 0-" in routed_messages[0]


def test_chat_route_still_works_when_rag_is_disabled(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["No RAG needed."]))

    monkeypatch.setenv("RAG_ENABLED", "false")
    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-disabled-user")
        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-rag-disabled",
                "conversationTitle": "RAG disabled",
                "userMessageId": "msg-rag-disabled-user",
                "assistantMessageId": "msg-rag-disabled-ai",
                "message": "Hello without RAG.",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        assert response.get_json()["reply"] == "No RAG needed."
        assert response.get_json()["citations"] == []
        assert "Retrieved document context:" not in routed_messages[0]


def test_delete_document_removes_chunks(client):
    token = login(client, uid="rag-delete-user")
    upload = upload_document(client, token, "Delete me after chunking.")
    document_id = upload.get_json()["document"]["id"]

    deleted = client.delete(f"/api/documents/{document_id}", headers={"X-CSRF-Token": token})

    assert deleted.status_code == 200

    db = db_session()
    assert db.get(Document, document_id) is None
    assert db.scalar(select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == document_id)) == 0


def test_document_content_endpoint_returns_uploaded_source_file(client):
    token = login(client, uid="rag-source-file-user")
    upload = upload_document(client, token, "Open this original source file.")
    document = upload.get_json()["document"]

    assert document["url"] == f"/api/documents/{document['id']}/content"

    response = client.get(document["url"])

    assert response.status_code == 200
    assert response.data == b"Open this original source file."
