from __future__ import annotations

import logging

from services.database import db_session
from services.rag.embedding_service import EmbeddingError, EmbeddingService
from services.rag.document_service import document_url
from services.rag.vector_store import search_relevant_chunks


logger = logging.getLogger(__name__)


def citation_label(index, document, chunk):
    parts = [f"[[source:{index}]] {document.filename}"]

    if chunk.page_number:
        parts.append(f"page {chunk.page_number}")
    else:
        parts.append(f"chunk {chunk.chunk_index + 1}")

    if chunk.section_title:
        parts.append(f'section "{chunk.section_title}"')

    if chunk.start_char is not None and chunk.end_char is not None:
        parts.append(f"chars {chunk.start_char}-{chunk.end_char}")

    return " - ".join(parts)


def source_summary(document, chunk):
    parts = [document.filename]

    if chunk.page_number:
        parts.append(f"page {chunk.page_number}")

    if chunk.section_title:
        parts.append(f'section "{chunk.section_title}"')

    parts.append(f"chunk {chunk.chunk_index + 1}")
    return " - ".join(parts)


def format_context_result(results):
    citations = []
    lines = []
    chunks = []

    for index, item in enumerate(results, start=1):
        chunk = item["chunk"]
        document = item["document"]
        label = citation_label(index, document, chunk)
        citations.append({
            "id": str(index),
            "citation_id": str(index),
            "citationId": str(index),
            "index": index,
            "label": label,
            "documentId": document.id,
            "document_id": document.id,
            "filename": document.filename,
            "pageNumber": chunk.page_number,
            "page_number": chunk.page_number,
            "chunkIndex": chunk.chunk_index,
            "chunk_index": chunk.chunk_index,
            "sectionTitle": chunk.section_title,
            "section_title": chunk.section_title,
            "startChar": chunk.start_char,
            "start_char": chunk.start_char,
            "endChar": chunk.end_char,
            "end_char": chunk.end_char,
            "sourceExcerpt": chunk.source_excerpt,
            "source_excerpt": chunk.source_excerpt,
            "source": source_summary(document, chunk),
            "url": document_url(document, chunk.page_number),
            "score": item["score"],
        })
        lines.append(f"{label}\n{chunk.content}")
        chunks.append({
            "documentId": document.id,
            "filename": document.filename,
            "pageNumber": chunk.page_number,
            "page_number": chunk.page_number,
            "chunkIndex": chunk.chunk_index,
            "chunk_index": chunk.chunk_index,
            "sectionTitle": chunk.section_title,
            "section_title": chunk.section_title,
            "startChar": chunk.start_char,
            "start_char": chunk.start_char,
            "endChar": chunk.end_char,
            "end_char": chunk.end_char,
            "sourceExcerpt": chunk.source_excerpt,
            "source_excerpt": chunk.source_excerpt,
            "url": document_url(document, chunk.page_number),
            "score": item["score"],
            "content": chunk.content,
        })

    context_text = "\n\n".join(lines)

    return {
        "context_text": context_text,
        "citations": citations,
        "chunks": chunks,
    }


def empty_context():
    return {
        "context_text": "",
        "citations": [],
        "chunks": [],
    }


def build_rag_context(user_id, user_message, *, db=None, settings=None, top_k=None):
    if settings is not None and not getattr(settings, "rag_enabled", True):
        return empty_context()

    message = str(user_message or "").strip()

    if not user_id or not message:
        return empty_context()

    owns_session = db is None
    db = db or db_session()

    try:
        resolved_top_k = top_k or getattr(settings, "rag_top_k", 5)
        embedding_service = EmbeddingService.from_settings(settings) if settings else EmbeddingService()
        query_embedding = embedding_service.create_embedding(message)
        results = search_relevant_chunks(db, user_id, query_embedding, resolved_top_k)
        return format_context_result(results)
    except EmbeddingError as error:
        logger.warning("RAG embedding unavailable", extra={"user_id": user_id, "error": str(error)})
        return empty_context()
    except Exception as error:
        logger.warning("RAG retrieval unavailable", extra={"user_id": user_id, "error": str(error)})
        return empty_context()
    finally:
        if owns_session:
            db.close()
