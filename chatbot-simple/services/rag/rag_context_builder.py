from __future__ import annotations

import logging
import re
import unicodedata

from sqlalchemy import and_, select

from services.database import Attachment, Conversation, Document, DocumentChunk, Message, db_session, utc_now
from services.rag.embedding_service import EmbeddingError, EmbeddingService
from services.rag.document_service import document_url
from services.rag.vector_store import search_attached_document_chunks, search_relevant_chunks


logger = logging.getLogger(__name__)
MIN_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT = 2
MAX_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT = 5
MAX_MULTI_DOCUMENT_CONTEXT_CHUNKS = 30
MAX_DOCUMENT_SWEEP_CHUNKS_PER_DOCUMENT = 6
MAX_DOCUMENT_SWEEP_CONTEXT_CHUNKS = 36
DOCUMENT_SWEEP_CONTEXT_CHAR_BUDGET = 24_000
DOCUMENT_SWEEP_MIN_DOCUMENT_CHAR_BUDGET = 3_500
DOCUMENT_SWEEP_MAX_DOCUMENT_CHAR_BUDGET = 6_500
CHUNK_CONTEXT_TRUNCATION_SUFFIX = "\n[Chunk truncated to keep all selected files in context.]"
MULTI_DOCUMENT_PATTERNS = (
    "all uploaded files",
    "all attached files",
    "all files",
    "all documents",
    "all pdf",
    "each file",
    "every file",
    "multiple files",
    "uploaded files",
    "attached files",
    "tat ca file",
    "tat ca cac file",
    "tat ca tai lieu",
    "toan bo file",
    "toan bo tai lieu",
    "cac file",
    "cac tai lieu",
    "nhieu file",
)


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


def normalize_query_text(value):
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(text.split())


def ordered_document_ids(document_ids):
    ordered = []

    for document_id in document_ids or []:
        document_id = str(document_id or "").strip()

        if document_id and document_id not in ordered:
            ordered.append(document_id)

    return ordered


def is_multi_document_summary_request(message, document_ids):
    if len(ordered_document_ids(document_ids)) < 2:
        return False

    return looks_like_multi_document_summary_request(message)


def looks_like_multi_document_summary_request(message):
    normalized = normalize_query_text(message)

    if any(pattern in normalized for pattern in MULTI_DOCUMENT_PATTERNS):
        return True

    return bool(
        re.search(r"\b(summarize|summary|tom tat|tong hop)\b.*\b(files?|documents?|pdfs?|tai lieu)\b", normalized)
        or re.search(r"\b(files?|documents?|pdfs?|tai lieu)\b.*\b(summarize|summary|tom tat|tong hop)\b", normalized)
    )


def list_user_document_ids(db, user_id):
    return [
        str(document_id)
        for document_id in db.scalars(
            select(Document.id)
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.asc(), Document.id.asc())
        ).all()
        if str(document_id or "").strip()
    ]


def retrieval_limits(message, document_ids, top_k):
    document_count = len(ordered_document_ids(document_ids))
    resolved_top_k = max(1, int(top_k or 5))

    if is_multi_document_summary_request(message, document_ids):
        per_document_limit = max(
            MIN_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT,
            min(resolved_top_k, MAX_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT),
        )
        minimum_per_document = min(MIN_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT, per_document_limit)
        max_total = min(
            MAX_MULTI_DOCUMENT_CONTEXT_CHUNKS,
            max(document_count * minimum_per_document, document_count * per_document_limit),
        )
        return per_document_limit, max_total, minimum_per_document, "multi_document_summary"

    return min(resolved_top_k, MAX_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT), MAX_MULTI_DOCUMENT_CONTEXT_CHUNKS, 1, "attached_documents"


def resolve_conversation_document_ids(db, user_id, conversation_id=None, document_ids=None, include_conversation=True):
    ordered_ids = ordered_document_ids(document_ids)
    conversation_id = str(conversation_id or "").strip()

    if conversation_id and include_conversation:
        stmt = (
            select(Attachment.document_id)
            .join(Message, Message.id == Attachment.message_id)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                and_(
                    Conversation.user_id == user_id,
                    Conversation.id == conversation_id,
                    Attachment.document_id != "",
                )
            )
            .order_by(Message.created_at, Attachment.created_at, Attachment.id)
        )

        for document_id in db.scalars(stmt).all():
            document_id = str(document_id or "").strip()

            if document_id and document_id not in ordered_ids:
                ordered_ids.append(document_id)

    if not ordered_ids:
        return []

    existing_ids = {
        document.id
        for document in db.scalars(
            select(Document).where(and_(Document.user_id == user_id, Document.id.in_(ordered_ids)))
        ).all()
    }

    return [document_id for document_id in ordered_ids if document_id in existing_ids]


def representative_positions(total, limit):
    total = max(0, int(total or 0))
    limit = max(1, int(limit or 1))

    if total <= limit:
        return list(range(total))

    if limit == 1:
        return [0]

    positions = []

    for index in range(limit):
        position = round(index * (total - 1) / (limit - 1))

        if position not in positions:
            positions.append(position)

    cursor = 0

    while len(positions) < limit and cursor < total:
        if cursor not in positions:
            positions.append(cursor)

        cursor += 1

    return sorted(positions)


def truncate_chunk_content(content, max_chars):
    content = str(content or "").strip()
    max_chars = max(0, int(max_chars or 0))

    if max_chars <= 0:
        return ""

    if len(content) <= max_chars:
        return content

    if max_chars <= len(CHUNK_CONTEXT_TRUNCATION_SUFFIX):
        return content[:max_chars].rstrip()

    return content[: max_chars - len(CHUNK_CONTEXT_TRUNCATION_SUFFIX)].rstrip() + CHUNK_CONTEXT_TRUNCATION_SUFFIX


def fitted_chunk_items(document, selected_chunks, document_char_budget):
    selected_chunks = [chunk for chunk in selected_chunks or [] if str(getattr(chunk, "content", "") or "").strip()]

    if not selected_chunks:
        return [], 0

    document_char_budget = max(500, int(document_char_budget or 0))
    per_chunk_budget = max(700, document_char_budget // len(selected_chunks))
    items = []
    used_chars = 0

    for chunk in selected_chunks:
        remaining = max(0, document_char_budget - used_chars)

        if remaining <= 0:
            break

        content = truncate_chunk_content(chunk.content, min(per_chunk_budget, remaining))

        if not content:
            continue

        used_chars += len(content)
        items.append({
            "chunk": chunk,
            "document": document,
            "score": 1.0,
            "content": content,
        })

    return items, used_chars


def fetch_document_sweep_chunks(db, user_id, document_ids, per_document_limit=MAX_DOCUMENT_SWEEP_CHUNKS_PER_DOCUMENT):
    ordered_ids = ordered_document_ids(document_ids)
    per_document_limit = max(1, min(int(per_document_limit or MAX_DOCUMENT_SWEEP_CHUNKS_PER_DOCUMENT), 8))
    document_count = max(1, len(ordered_ids))
    document_char_budget = max(
        DOCUMENT_SWEEP_MIN_DOCUMENT_CHAR_BUDGET,
        min(DOCUMENT_SWEEP_MAX_DOCUMENT_CHAR_BUDGET, DOCUMENT_SWEEP_CONTEXT_CHAR_BUDGET // document_count),
    )

    if not ordered_ids:
        return [], [], []

    documents = {
        document.id: document
        for document in db.scalars(
            select(Document).where(and_(Document.user_id == user_id, Document.id.in_(ordered_ids)))
        ).all()
    }
    results = []
    diagnostics = []
    document_stats = []

    for document_id in ordered_ids:
        document = documents.get(document_id)

        if not document:
            diagnostics.append({
                "documentId": document_id,
                "filename": document_id,
                "issue": "Document was not found for this user.",
                "chunkCount": 0,
                "extractedTextLength": 0,
            })
            document_stats.append({
                "documentId": document_id,
                "filename": document_id,
                "chunkCount": 0,
                "selectedCount": 0,
                "tokenEstimate": 0,
            })
            continue

        chunks = list(
            db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document.id)
                .order_by(DocumentChunk.chunk_index)
            ).all()
        )
        extracted_text_length = sum(len(str(chunk.content or "")) for chunk in chunks)

        if not chunks:
            diagnostics.append({
                "documentId": document.id,
                "filename": document.filename,
                "issue": "No chunks were saved for this file after extraction/chunking.",
                "chunkCount": 0,
                "extractedTextLength": extracted_text_length,
            })
            document_stats.append({
                "documentId": document.id,
                "filename": document.filename,
                "chunkCount": 0,
                "selectedCount": 0,
                "tokenEstimate": 0,
            })
            continue

        selected_chunks = [chunks[position] for position in representative_positions(len(chunks), per_document_limit)]
        fitted_items, selected_chars = fitted_chunk_items(document, selected_chunks, document_char_budget)
        token_estimate = sum(max(1, len(str(item.get("content") or "")) // 4) for item in fitted_items)
        document_stats.append({
            "documentId": document.id,
            "filename": document.filename,
            "chunkCount": len(chunks),
            "selectedCount": len(fitted_items),
            "tokenEstimate": token_estimate,
            "charBudget": document_char_budget,
            "selectedChars": selected_chars,
        })
        results.extend(fitted_items)

    return results, diagnostics, document_stats


def chunk_preview(text, max_length=220):
    text = " ".join(str(text or "").split())

    if len(text) <= max_length:
        return text

    return text[: max_length - 3].rstrip() + "..."


def result_content(item):
    return str(item.get("content") if item.get("content") is not None else item["chunk"].content)


def retrieval_diagnostics(db, user_id, document_ids, results):
    ordered_ids = ordered_document_ids(document_ids)

    if not ordered_ids:
        return []

    documents = {
        document.id: document
        for document in db.scalars(
            select(Document).where(and_(Document.user_id == user_id, Document.id.in_(ordered_ids)))
        ).all()
    }
    selected_counts = {}

    for item in results or []:
        selected_counts[item["document"].id] = selected_counts.get(item["document"].id, 0) + 1

    diagnostics = []

    for document_id in ordered_ids:
        document = documents.get(document_id)

        if not document:
            diagnostics.append({
                "documentId": document_id,
                "filename": document_id,
                "issue": "Document was not found for this user.",
                "chunkCount": 0,
                "extractedTextLength": 0,
            })
            continue

        chunks = list(
            db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document.id)
                .order_by(DocumentChunk.chunk_index)
            ).all()
        )
        extracted_text_length = sum(len(str(chunk.content or "")) for chunk in chunks)

        if not chunks:
            issue = "No chunks were saved for this file after extraction/chunking."
        elif extracted_text_length <= 0:
            issue = "Extracted chunks are empty."
        elif selected_counts.get(document.id, 0) <= 0:
            issue = "No retrievable chunks were selected for this file."
        else:
            continue

        diagnostics.append({
            "documentId": document.id,
            "filename": document.filename,
            "issue": issue,
            "chunkCount": len(chunks),
            "extractedTextLength": extracted_text_length,
        })

    return diagnostics


def log_retrieval(message, top_k, mode, results, diagnostics):
    if not results:
        logger.warning(
            "RAG retrieval returned no chunks query=%r top_k=%s mode=%s",
            str(message or "")[:300],
            top_k,
            mode,
        )

    for item in results or []:
        chunk = item["chunk"]
        document = item["document"]
        logger.warning(
            "RAG retrieval result query=%r top_k=%s mode=%s filename=%s chunk_index=%s page=%s score=%.4f preview=%r",
            str(message or "")[:300],
            top_k,
            mode,
            document.filename,
            chunk.chunk_index,
            chunk.page_number,
            float(item["score"] or 0),
            chunk_preview(result_content(item)),
        )

    for diagnostic in diagnostics or []:
        logger.warning(
            "RAG retrieval diagnostic query=%r filename=%s issue=%s chunks=%s extracted_text_length=%s",
            str(message or "")[:300],
            diagnostic["filename"],
            diagnostic["issue"],
            diagnostic["chunkCount"],
            diagnostic["extractedTextLength"],
        )


def log_document_sweep(message, document_stats):
    filenames = [stat["filename"] for stat in document_stats or []]
    logger.warning(
        "RAG document sweep documents query=%r filenames=%s",
        str(message or "")[:300],
        filenames,
    )

    for stat in document_stats or []:
        logger.warning(
            "RAG document sweep document filename=%s chunk_count=%s selected_chunk_count=%s token_estimate=%s char_budget=%s selected_chars=%s",
            stat["filename"],
            stat["chunkCount"],
            stat["selectedCount"],
            stat["tokenEstimate"],
            stat.get("charBudget", 0),
            stat.get("selectedChars", 0),
        )


def format_context_result(results, diagnostics=None, group_by_document=False, markdown_document_headings=False):
    citations = []
    lines = []
    chunks = []
    current_document_id = None
    used_document_ids = set()

    diagnostics = diagnostics or []

    if diagnostics:
        lines.append("Document retrieval diagnostics:")

        for diagnostic in diagnostics:
            lines.append(
                f"- {diagnostic['filename']}: {diagnostic['issue']} "
                f"(chunks: {diagnostic['chunkCount']}, extracted text length: {diagnostic['extractedTextLength']})"
            )

    for index, item in enumerate(results, start=1):
        chunk = item["chunk"]
        document = item["document"]
        if document.id not in used_document_ids:
            used_document_ids.add(document.id)
            document.last_used_at = utc_now()

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
        if group_by_document and current_document_id != document.id:
            current_document_id = document.id
            if markdown_document_headings:
                lines.append(f"### {document.filename}")
            else:
                lines.append(f"Document context for {document.filename}:")

        content = result_content(item)
        lines.append(f"{label}\n{content}")
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
            "content": content,
        })

    context_text = "\n\n".join(lines)

    return {
        "context_text": context_text,
        "citations": citations,
        "chunks": chunks,
        "diagnostics": diagnostics,
    }


def empty_context():
    return {
        "context_text": "",
        "citations": [],
        "chunks": [],
        "diagnostics": [],
    }


def build_rag_context(user_id, user_message, *, db=None, settings=None, top_k=None, document_ids=None, conversation_id=None):
    if settings is not None and not getattr(settings, "rag_enabled", True):
        return empty_context()

    message = str(user_message or "").strip()

    if not user_id or not message:
        return empty_context()

    owns_session = db is None
    db = db or db_session()

    try:
        resolved_top_k = top_k or getattr(settings, "rag_top_k", 5)
        request_document_ids = ordered_document_ids(document_ids)
        scoped_document_ids = resolve_conversation_document_ids(
            db,
            user_id,
            conversation_id=conversation_id,
            document_ids=request_document_ids,
            include_conversation=not bool(request_document_ids),
        )
        if not scoped_document_ids and looks_like_multi_document_summary_request(message):
            scoped_document_ids = list_user_document_ids(db, user_id)
            logger.warning(
                "RAG all-user-document fallback query=%r user_document_count=%s user_document_ids=%s",
                message[:300],
                len(scoped_document_ids),
                scoped_document_ids,
            )
        logger.warning(
            "RAG scoped documents query=%r request_document_count=%s scoped_document_count=%s scoped_document_ids=%s",
            message[:300],
            len(request_document_ids),
            len(scoped_document_ids),
            scoped_document_ids,
        )

        if scoped_document_ids and is_multi_document_summary_request(message, scoped_document_ids):
            document_count = len(scoped_document_ids)
            per_document_limit = max(
                1,
                min(
                    MAX_DOCUMENT_SWEEP_CHUNKS_PER_DOCUMENT,
                    max(MIN_MULTI_DOCUMENT_CHUNKS_PER_DOCUMENT, MAX_DOCUMENT_SWEEP_CONTEXT_CHUNKS // max(1, document_count)),
                ),
            )
            results, diagnostics, document_stats = fetch_document_sweep_chunks(
                db,
                user_id,
                scoped_document_ids,
                per_document_limit=per_document_limit,
            )
            log_document_sweep(message, document_stats)
            log_retrieval(message, resolved_top_k, "document_sweep", results, diagnostics)
            return format_context_result(
                results,
                diagnostics=diagnostics,
                group_by_document=True,
                markdown_document_headings=True,
            )

        embedding_service = EmbeddingService.from_settings(settings) if settings else EmbeddingService()
        query_embedding = embedding_service.create_embedding(message)
        diagnostics = []

        if scoped_document_ids:
            per_document_limit, max_total, min_per_document, retrieval_mode = retrieval_limits(
                message,
                scoped_document_ids,
                resolved_top_k,
            )
            results = search_attached_document_chunks(
                db,
                user_id,
                query_embedding,
                scoped_document_ids,
                per_document_limit=per_document_limit,
                max_total=max_total,
                min_per_document=min_per_document,
            )
            diagnostics = retrieval_diagnostics(db, user_id, scoped_document_ids, results)
        else:
            retrieval_mode = "global"
            results = search_relevant_chunks(db, user_id, query_embedding, resolved_top_k)

        log_retrieval(message, resolved_top_k, retrieval_mode, results, diagnostics)
        return format_context_result(
            results,
            diagnostics=diagnostics,
            group_by_document=retrieval_mode in {"multi_document_summary", "attached_documents"},
        )
    except EmbeddingError as error:
        logger.warning("RAG embedding unavailable", extra={"user_id": user_id, "error": str(error)})
        return empty_context()
    except Exception as error:
        logger.warning("RAG retrieval unavailable", extra={"user_id": user_id, "error": str(error)})
        return empty_context()
    finally:
        if owns_session:
            db.close()
