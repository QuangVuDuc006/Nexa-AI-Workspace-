import logging
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import func, select

from conftest import login
from services.app_config import load_settings
from services.database import Attachment, Conversation, Document, DocumentChunk, Message, User, db_session, utc_now
from services.rag.chunking import DEFAULT_CHUNK_OVERLAP_CHARS, DEFAULT_CHUNK_SIZE_CHARS, chunk_text


def test_chunk_metadata_includes_start_and_end_chars():
    chunks = chunk_text("Intro text.\n\nBody text for retrieval.", chunk_size_chars=500, overlap_chars=0)

    assert chunks[0]["start_char"] == 0
    assert chunks[0]["end_char"] == len("Intro text.\n\nBody text for retrieval.")
    assert chunks[0]["source_excerpt"] == "Intro text. Body text for retrieval."


def test_chunk_metadata_captures_markdown_heading_section_title():
    chunks = chunk_text("## Installation\nRun the setup command.\n\nUsage\nAsk a question.", chunk_size_chars=500, overlap_chars=0)

    assert chunks[0]["section_title"] == "Installation"


def test_rag_config_defaults_are_tuned_for_moderate_context(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "testing")
    monkeypatch.setenv("SECRET_KEY", "test-secret")

    for name in ("RAG_TOP_K", "RAG_CHUNK_SIZE_CHARS", "RAG_CHUNK_OVERLAP_CHARS"):
        monkeypatch.delenv(name, raising=False)

    settings = load_settings(tmp_path)

    assert settings.rag_top_k == 5
    assert settings.rag_chunk_size_chars == 1500
    assert settings.rag_chunk_overlap_chars == 250
    assert DEFAULT_CHUNK_SIZE_CHARS == 1500
    assert DEFAULT_CHUNK_OVERLAP_CHARS == 250


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

        assert response.status_code == 200, response.get_json()
        assert routed_messages
        assert "Retrieved document context:" in routed_messages[0]
        assert "Retrieved-document answer rules:" in routed_messages[0]
        assert "Use retrieved chunks as evidence" in routed_messages[0]
        assert "Group related chunks into coherent sections" in routed_messages[0]
        assert "Do not only list file snippets" in routed_messages[0]
        assert "each major point should have at least 2-4 sentences" in routed_messages[0]
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


def test_chat_route_balances_rag_context_across_attached_documents(app_module, monkeypatch, caplog):
    routed_messages = []
    caplog.set_level(logging.WARNING)

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Balanced context."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-attached-balance-user")
        attachments = []

        for index in range(1, 5):
            response = client.post(
                "/api/uploads",
                data={
                    "file": (
                        BytesIO(f"Attached file {index} has unique marker attached-balance-{index}.".encode("utf-8")),
                        f"attached-{index}.txt",
                    )
                },
                content_type="multipart/form-data",
                headers={"X-CSRF-Token": token},
            )
            assert response.status_code == 200
            attachments.append(response.get_json()["attachment"])

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-attached-balance",
                "conversationTitle": "Attached balance",
                "userMessageId": "msg-attached-balance-user",
                "assistantMessageId": "msg-attached-balance-ai",
                "message": "Summarize all attached files.",
                "attachments": attachments,
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    logged = "\n".join(record.getMessage() for record in caplog.records)

    for index in range(1, 5):
        assert f"attached-{index}.txt" in routed_messages[0]
        assert f"attached-balance-{index}" in routed_messages[0]
        assert f"RAG ingestion complete" in logged
        assert f"filename=attached-{index}.txt" in logged
        assert f"RAG retrieval result" in logged

    assert "mode=document_sweep" in logged
    assert "### attached-1.txt" in routed_messages[0]
    assert "separate clearly named section for each file" in routed_messages[0]

    data = response.get_json()
    cited_filenames = {citation["filename"] for citation in data["citations"]}
    assert cited_filenames == {f"attached-{index}.txt" for index in range(1, 5)}


def test_legacy_upload_indexes_full_text_not_attachment_preview(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Full text indexed."]))

    monkeypatch.setenv("MAX_ATTACHMENT_CHARS", "24")
    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-full-upload-user")
        hidden_marker = "full-index-marker-after-preview"
        upload = client.post(
            "/api/uploads",
            data={
                "file": (
                    BytesIO((("Preview only. " * 20) + hidden_marker).encode("utf-8")),
                    "long-upload.txt",
                )
            },
            content_type="multipart/form-data",
            headers={"X-CSRF-Token": token},
        )
        assert upload.status_code == 200
        attachment = upload.get_json()["attachment"]
        assert hidden_marker not in attachment["content"]

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-full-upload",
                "conversationTitle": "Full upload",
                "userMessageId": "msg-full-upload-user",
                "assistantMessageId": "msg-full-upload-ai",
                "message": "Summarize all uploaded files.",
                "attachments": [attachment],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    assert hidden_marker in routed_messages[0]


def test_attached_document_with_no_chunks_adds_diagnostic(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Diagnostic noted."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="rag-empty-doc-user")
        db = db_session()
        from services.rag.document_service import create_document

        document = create_document(db, "rag-empty-doc-user", "empty.pdf", "application/pdf")
        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-empty-doc",
                "conversationTitle": "Empty doc",
                "userMessageId": "msg-empty-doc-user",
                "assistantMessageId": "msg-empty-doc-ai",
                "message": "Summarize all uploaded files.",
                "attachments": [{
                    "kind": "text",
                    "name": "empty.pdf",
                    "mimeType": "application/pdf",
                    "documentId": document.id,
                }],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    assert "Document retrieval diagnostics:" in routed_messages[0]
    assert "empty.pdf: No chunks were saved for this file after extraction/chunking." in routed_messages[0]
    assert "explicitly name the affected file" in routed_messages[0]


def test_multi_file_summary_sweeps_current_conversation_documents(app_module, monkeypatch, caplog):
    routed_messages = []
    caplog.set_level(logging.WARNING)

    filenames = [
        "4-PointProcessing.pdf",
        "5-SpatialFiltering1.pdf",
        "6-SpatialFiltering2.pdf",
        "7-FrequencyFiltering.pdf",
    ]

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            reply = "\n".join(f"### {filename}\nCovered." for filename in filenames)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter([reply]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        user_id = "rag-conversation-sweep-user"
        token = login(client, uid=user_id)
        db = db_session()
        db.add(User(id=user_id, email="sweep@example.com", display_name="Sweep"))
        conversation = Conversation(id="conv-document-sweep", user_id=user_id, title="Document sweep")
        message = Message(id="msg-document-sweep-seed", conversation_id=conversation.id, role="user", text="Uploaded files.")
        db.add(conversation)
        db.add(message)

        from services.rag.document_service import create_document_with_chunks

        for index, filename in enumerate(filenames, start=1):
            marker = f"sweep-marker-{index}"
            document, _chunks = create_document_with_chunks(
                db,
                user_id,
                filename,
                "application/pdf",
                [
                    {"content": f"{filename} introduction {marker}. " * 90, "page_number": 1},
                    {"content": f"{filename} representative middle content {marker}. " * 90, "page_number": 2},
                    {"content": f"{filename} closing summary {marker}. " * 90, "page_number": 3},
                ],
                app.config["APP_SETTINGS"],
            )
            db.add(Attachment(
                id=f"att-document-sweep-{index}",
                message_id=message.id,
                kind="text",
                name=filename,
                mime_type="application/pdf",
                document_id=document.id,
                created_at=utc_now(),
            ))

        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": conversation.id,
                "conversationTitle": "Document sweep",
                "userMessageId": "msg-document-sweep-user",
                "assistantMessageId": "msg-document-sweep-ai",
                "message": "tóm tắt các nội dung cần biết trong tất cả file",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    context = routed_messages[0]
    logged = "\n".join(record.getMessage() for record in caplog.records)

    assert len(context) <= 40_000
    assert "mode=document_sweep" in logged
    assert "RAG document sweep documents" in logged

    for index, filename in enumerate(filenames, start=1):
        assert f"### {filename}" in context
        assert f"sweep-marker-{index}" in context
        assert f"filename={filename}" in logged
        assert "selected_chunk_count=" in logged
        assert "token_estimate=" in logged
        assert "selected_chars=" in logged

    data = response.get_json()
    assert all(f"### {filename}" in data["reply"] for filename in filenames)
    assert {citation["filename"] for citation in data["citations"]} == set(filenames)


def test_multi_file_summary_sweeps_user_documents_when_no_attachments(app_module, monkeypatch, caplog):
    routed_messages = []
    caplog.set_level(logging.WARNING)
    filenames = [
        "4-PointProcessing.pdf",
        "5-SpatialFiltering1.pdf",
        "6-SpatialFiltering2.pdf",
        "7-FrequencyFiltering.pdf",
    ]

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["All user docs summarized."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        user_id = "rag-user-document-fallback"
        token = login(client, uid=user_id)
        db = db_session()

        from services.rag.document_service import create_document_with_chunks

        for index, filename in enumerate(filenames, start=1):
            create_document_with_chunks(
                db,
                user_id,
                filename,
                "application/pdf",
                [{"content": f"{filename} standalone marker fallback-{index}. " * 120, "page_number": 1}],
                app.config["APP_SETTINGS"],
                source_bytes=f"{filename} source bytes".encode("utf-8"),
            )

        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-user-doc-fallback",
                "conversationTitle": "User docs fallback",
                "userMessageId": "msg-user-doc-fallback-user",
                "assistantMessageId": "msg-user-doc-fallback-ai",
                "message": "tóm tắt tất cả nội dung cần biết trong file",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    context = routed_messages[0]
    logged = "\n".join(record.getMessage() for record in caplog.records)

    assert "RAG all-user-document fallback" in logged
    assert "mode=document_sweep" in logged

    for index, filename in enumerate(filenames, start=1):
        assert f"### {filename}" in context
        assert f"fallback-{index}" in context

    assert {citation["filename"] for citation in response.get_json()["citations"]} == set(filenames)


def test_multi_file_summary_context_budget_preserves_every_document_section(app_module, monkeypatch, caplog):
    routed_messages = []
    caplog.set_level(logging.WARNING)
    filenames = [
        "7-FrequencyFiltering.pdf",
        "6-SpatialFiltering2.pdf",
        "5-SpatialFiltering1.pdf",
        "4-PointProcessing.pdf",
    ]

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Budgeted."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        user_id = "rag-long-sweep-user"
        token = login(client, uid=user_id)
        db = db_session()
        db.add(User(id=user_id, email="long-sweep@example.com", display_name="Long Sweep"))
        conversation = Conversation(id="conv-long-sweep", user_id=user_id, title="Long sweep")
        message = Message(id="msg-long-sweep-seed", conversation_id=conversation.id, role="user", text="Uploaded long files.")
        db.add(conversation)
        db.add(message)

        from services.rag.document_service import create_document_with_chunks

        for index, filename in enumerate(filenames, start=1):
            marker = f"long-sweep-marker-{index}"
            pages = [
                {
                    "content": (
                        f"{filename} page {page} {marker}. "
                        + ("important lecture content for filtering and image processing. " * 120)
                    ),
                    "page_number": page,
                }
                for page in range(1, 9)
            ]
            document, _chunks = create_document_with_chunks(
                db,
                user_id,
                filename,
                "application/pdf",
                pages,
                app.config["APP_SETTINGS"],
            )
            db.add(Attachment(
                id=f"att-long-sweep-{index}",
                message_id=message.id,
                kind="text",
                name=filename,
                mime_type="application/pdf",
                document_id=document.id,
                created_at=utc_now(),
            ))

        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": conversation.id,
                "conversationTitle": "Long sweep",
                "userMessageId": "msg-long-sweep-user",
                "assistantMessageId": "msg-long-sweep-ai",
                "message": "tom tat cac noi dung can biet trong tat ca file",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    context = routed_messages[0]
    logged = "\n".join(record.getMessage() for record in caplog.records)

    assert len(context) <= 40_000
    assert context.count("### ") == 4
    assert "mode=document_sweep" in logged
    assert "char_budget=" in logged
    assert "selected_chars=" in logged

    for index, filename in enumerate(filenames, start=1):
        assert f"### {filename}" in context
        assert f"long-sweep-marker-{index}" in context


def test_current_request_attachments_do_not_mix_old_conversation_documents(app_module, monkeypatch, caplog):
    routed_messages = []
    caplog.set_level(logging.WARNING)
    current_filenames = [
        "5-SpatialFiltering1.pdf",
        "6-SpatialFiltering2.pdf",
        "7-FrequencyFiltering.pdf",
    ]

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(provider="fake", model="fake-model", chunks=iter(["Scoped answer."]))

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        user_id = "rag-request-scope-user"
        token = login(client, uid=user_id)
        db = db_session()
        db.add(User(id=user_id, email="scope@example.com", display_name="Scope"))
        conversation = Conversation(id="conv-request-scope", user_id=user_id, title="Request scope")
        old_message = Message(id="msg-request-scope-old", conversation_id=conversation.id, role="user", text="Old upload.")
        db.add(conversation)
        db.add(old_message)

        from services.rag.document_service import create_document_with_chunks

        old_document, _chunks = create_document_with_chunks(
            db,
            user_id,
            "Lec4_-_Design_Phase_Pt._1.pdf",
            "application/pdf",
            [{"content": "Old unrelated design lecture should not be retrieved.", "page_number": 1}],
            app.config["APP_SETTINGS"],
        )
        db.add(Attachment(
            id="att-request-scope-old",
            message_id=old_message.id,
            kind="text",
            name=old_document.filename,
            mime_type="application/pdf",
            document_id=old_document.id,
            created_at=utc_now(),
        ))

        db.commit()
        attachments = []

        for index, filename in enumerate(current_filenames, start=1):
            document, _chunks = create_document_with_chunks(
                db,
                user_id,
                filename,
                "application/pdf",
                [{"content": f"{filename} current request marker scope-current-{index}.", "page_number": 1}],
                app.config["APP_SETTINGS"],
            )
            attachments.append({
                "kind": "text",
                "name": filename,
                "mimeType": "application/pdf",
                "documentId": document.id,
            })

        db.commit()

        response = client.post(
            "/api/chat",
            json={
                "conversationId": conversation.id,
                "conversationTitle": "Request scope",
                "userMessageId": "msg-request-scope-user",
                "assistantMessageId": "msg-request-scope-ai",
                "message": "tổng hợp các kiến thức quan trọng trong file",
                "attachments": attachments,
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200, response.get_json()

    assert routed_messages
    context = routed_messages[0]
    logged = "\n".join(record.getMessage() for record in caplog.records)

    assert "request_document_count=3 scoped_document_count=3" in logged
    assert "Lec4_-_Design_Phase_Pt._1.pdf" not in context
    assert "Lec4_-_Design_Phase_Pt._1.pdf" not in {citation["filename"] for citation in response.get_json()["citations"]}

    for index, filename in enumerate(current_filenames, start=1):
        assert f"### {filename}" in context
        assert f"scope-current-{index}" in context


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


def test_upload_size_limit_returns_json_error(app_module, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="upload-size-limit-user")
        response = client.post(
            "/api/documents/upload",
            data={"file": (BytesIO(b"x" * ((1024 * 1024) + 1)), "large.txt")},
            content_type="multipart/form-data",
            headers={"X-CSRF-Token": token},
        )

    assert response.status_code == 413
    assert response.is_json
    assert response.get_json()["code"] == "file_too_large"
    assert "1 MB upload limit" in response.get_json()["error"]


def test_document_count_quota_blocks_new_upload(app_module, monkeypatch):
    monkeypatch.setenv("MAX_DOCUMENTS_PER_USER", "1")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="document-count-quota-user")
        first = upload_document(client, token, "First document content.")
        second = upload_document(client, token, "Second document content.", filename="second.txt")

    assert first.status_code == 200
    assert second.status_code == 403
    assert second.get_json()["error"] == "Storage limit reached. Delete old files or upgrade your plan before uploading more files."


def test_upload_storage_quota_blocks_new_document(app_module, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_STORAGE_MB_PER_USER", "1")
    monkeypatch.setenv("RAG_CHUNK_SIZE_CHARS", "2000000")
    monkeypatch.setenv("RAG_CHUNK_OVERLAP_CHARS", "0")
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="storage-quota-user")
        first = upload_document(client, token, "a" * (850 * 1024))
        second = upload_document(client, token, "b" * (250 * 1024), filename="second.txt")

    assert first.status_code == 200
    assert second.status_code == 403
    assert second.get_json()["error"] == "Storage limit reached. Delete old files or upgrade your plan before uploading more files."


def test_delete_document_removes_physical_source_file(client):
    token = login(client, uid="document-file-delete-user")
    upload = upload_document(client, token, "Delete this source file.")
    document_id = upload.get_json()["document"]["id"]

    db = db_session()
    document = db.get(Document, document_id)
    storage_path = Path(document.storage_path)

    assert storage_path.exists()
    assert storage_path.name.startswith(document_id)
    assert "notes" not in storage_path.name

    deleted = client.delete(f"/api/documents/{document_id}", headers={"X-CSRF-Token": token})

    assert deleted.status_code == 200
    assert not storage_path.exists()


def test_missing_document_source_file_returns_json_404(client):
    token = login(client, uid="missing-source-user")
    upload = upload_document(client, token, "This file will be removed.")
    document = upload.get_json()["document"]

    db = db_session()
    saved = db.get(Document, document["id"])
    Path(saved.storage_path).unlink()

    response = client.get(document["url"])

    assert response.status_code == 404
    assert response.is_json
    assert response.get_json()["error"] == "Document source file is unavailable."


def test_user_cannot_delete_another_users_document_file(client):
    token_a = login(client, uid="file-owner-a", email="a@example.com")
    upload = upload_document(client, token_a, "User A owns this file.")
    document_id = upload.get_json()["document"]["id"]

    db = db_session()
    document = db.get(Document, document_id)
    storage_path = Path(document.storage_path)

    token_b = login(client, uid="file-owner-b", email="b@example.com")
    response = client.delete(f"/api/documents/{document_id}", headers={"X-CSRF-Token": token_b})

    assert response.status_code == 404
    assert storage_path.exists()
    assert db.get(Document, document_id) is not None
