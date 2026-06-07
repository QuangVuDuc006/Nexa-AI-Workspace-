from __future__ import annotations

from pathlib import Path

from sqlalchemy import and_, func, select
from sqlalchemy.orm import selectinload

from services.database import Document, DocumentChunk, new_id, utc_now
from services.persistence import safe_user_path, timestamp_ms
from services.rag.chunking import chunk_text
from services.rag.embedding_service import EmbeddingService
from services.rag.vector_store import insert_chunk_embeddings
from services.uploads import sanitize_filename


def serialize_document(document, chunk_count=None):
    if chunk_count is None:
        chunk_count = len(getattr(document, "chunks", []) or [])

    return {
        "id": document.id,
        "userId": document.user_id,
        "filename": document.filename,
        "mimeType": document.mime_type,
        "mime_type": document.mime_type,
        "chunkCount": int(chunk_count or 0),
        "url": document_url(document),
        "createdAt": timestamp_ms(document.created_at),
    }


def create_document(db, user_id, filename, mime_type):
    document = Document(
        id=new_id("doc"),
        user_id=user_id,
        filename=str(filename or "document")[:180],
        mime_type=str(mime_type or "application/octet-stream")[:120],
        created_at=utc_now(),
    )
    db.add(document)
    db.flush()
    return document


def document_url(document, page_number=None):
    if not getattr(document, "storage_path", ""):
        return ""

    url = f"/api/documents/{document.id}/content"

    if page_number and str(document.mime_type or "").lower() == "application/pdf":
        url += f"#page={int(page_number)}"

    return url


def save_document_source_file(settings, user_id, document, raw):
    if not raw:
        return ""

    directory = Path(settings.upload_storage_dir) / safe_user_path(user_id) / "documents"
    directory.mkdir(parents=True, exist_ok=True)
    filename = sanitize_filename(document.filename)
    path = directory / f"{document.id}-{filename}"
    path.write_bytes(raw)
    document.storage_path = str(path)
    return document.storage_path


def get_document(db, user_id, document_id):
    document_id = str(document_id or "").strip()

    if not document_id:
        return None

    return db.scalar(
        select(Document)
        .options(selectinload(Document.chunks))
        .where(and_(Document.id == document_id, Document.user_id == user_id))
    )


def get_document_metadata(db, user_id, document_id):
    return get_document(db, user_id, document_id)


def list_documents_by_user(db, user_id):
    count_stmt = (
        select(Document.id, func.count(DocumentChunk.id).label("chunk_count"))
        .outerjoin(DocumentChunk)
        .where(Document.user_id == user_id)
        .group_by(Document.id)
        .subquery()
    )
    stmt = (
        select(Document, count_stmt.c.chunk_count)
        .join(count_stmt, count_stmt.c.id == Document.id)
        .where(Document.user_id == user_id)
        .order_by(Document.created_at.desc(), Document.id.desc())
    )

    return [
        serialize_document(document, chunk_count)
        for document, chunk_count in db.execute(stmt).all()
    ]


def delete_document(db, user_id, document_id):
    document = get_document(db, user_id, document_id)

    if not document:
        return False

    db.delete(document)
    return True


def create_document_with_chunks(db, user_id, filename, mime_type, pages, settings, source_bytes=None):
    document = create_document(db, user_id, filename, mime_type)
    save_document_source_file(settings, user_id, document, source_bytes)
    chunks = chunk_text(
        pages,
        chunk_size_chars=getattr(settings, "rag_chunk_size_chars", 1500),
        overlap_chars=getattr(settings, "rag_chunk_overlap_chars", 250),
    )

    if not chunks:
        raise ValueError("No readable document chunks were created.")

    embedding_service = EmbeddingService.from_settings(settings)
    embeddings = [embedding_service.create_embedding(chunk["content"]) for chunk in chunks]
    insert_chunk_embeddings(db, document.id, chunks, embeddings)
    db.flush()
    return document, chunks
