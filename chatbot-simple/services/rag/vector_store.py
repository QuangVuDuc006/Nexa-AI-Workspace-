from __future__ import annotations

import math

from sqlalchemy import and_, select

from services.database import Document, DocumentChunk, new_id, utc_now
from services.rag.embedding_service import EmbeddingError, parse_embedding_payload, serialize_embedding


DEFAULT_TOP_K = 5


def cosine_similarity(left, right):
    if not left or not right or len(left) != len(right):
        return 0.0

    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))

    if left_norm <= 0 or right_norm <= 0:
        return 0.0

    return dot / (left_norm * right_norm)


def insert_chunk_embeddings(db, document_id, chunks, embeddings):
    if len(chunks) != len(embeddings):
        raise ValueError("Chunk and embedding counts must match.")

    records = []

    for chunk, embedding in zip(chunks, embeddings):
        record = DocumentChunk(
            id=new_id("chunk"),
            document_id=document_id,
            chunk_index=int(chunk["chunk_index"]),
            content=str(chunk["content"] or ""),
            embedding=serialize_embedding(embedding),
            page_number=chunk.get("page_number"),
            section_title=chunk.get("section_title"),
            start_char=chunk.get("start_char"),
            end_char=chunk.get("end_char"),
            source_excerpt=chunk.get("source_excerpt"),
            created_at=utc_now(),
        )
        db.add(record)
        records.append(record)

    db.flush()
    return records


def scored_document_chunks(db, user_id, query_embedding, document_ids=None):
    document_ids = [str(document_id) for document_id in (document_ids or []) if str(document_id or "").strip()]
    stmt = (
        select(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(and_(Document.user_id == user_id, DocumentChunk.embedding != ""))
    )

    if document_ids:
        stmt = stmt.where(Document.id.in_(document_ids))

    scored = []

    for chunk, document in db.execute(stmt).all():
        try:
            chunk_embedding = parse_embedding_payload(chunk.embedding)
        except EmbeddingError:
            continue

        score = cosine_similarity(query_embedding, chunk_embedding)
        scored.append({
            "chunk": chunk,
            "document": document,
            "score": score,
        })

    return scored


def search_relevant_chunks(db, user_id, query_embedding, top_k=DEFAULT_TOP_K, document_ids=None):
    top_k = max(1, min(int(top_k or DEFAULT_TOP_K), 20))
    scored = [item for item in scored_document_chunks(db, user_id, query_embedding, document_ids) if item["score"] > 0]

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def search_attached_document_chunks(
    db,
    user_id,
    query_embedding,
    document_ids,
    per_document_limit=DEFAULT_TOP_K,
    max_total=None,
    min_per_document=1,
):
    per_document_limit = max(1, min(int(per_document_limit or DEFAULT_TOP_K), 8))
    min_per_document = max(1, min(int(min_per_document or 1), per_document_limit))
    max_total = int(max_total) if max_total else None

    if max_total is not None:
        max_total = max(1, max_total)

    ordered_document_ids = []

    for document_id in document_ids or []:
        document_id = str(document_id or "").strip()

        if document_id and document_id not in ordered_document_ids:
            ordered_document_ids.append(document_id)

    if not ordered_document_ids:
        return []

    scored = scored_document_chunks(db, user_id, query_embedding, ordered_document_ids)
    by_document = {document_id: [] for document_id in ordered_document_ids}

    for item in scored:
        by_document.setdefault(item["document"].id, []).append(item)

    results = []
    selected_keys = set()

    def can_add():
        return max_total is None or len(results) < max_total

    def add_item(item):
        key = item["chunk"].id

        if key in selected_keys or not can_add():
            return False

        selected_keys.add(key)
        results.append(item)
        return True

    for document_id in ordered_document_ids:
        items = by_document.get(document_id, [])
        items.sort(key=lambda item: (-item["score"], item["chunk"].chunk_index))

        for item in items[:min_per_document]:
            if not add_item(item):
                break

    for offset in range(min_per_document, per_document_limit):
        added_any = False

        for document_id in ordered_document_ids:
            items = by_document.get(document_id, [])

            if offset >= len(items):
                continue

            if add_item(items[offset]):
                added_any = True

            if not can_add():
                return results

        if not added_any:
            break

    return results


class VectorStore:
    def __init__(self, db):
        self.db = db

    def insert_chunk_embeddings(self, document_id, chunks, embeddings):
        return insert_chunk_embeddings(self.db, document_id, chunks, embeddings)

    def search_relevant_chunks(self, user_id, query_embedding, top_k=DEFAULT_TOP_K):
        return search_relevant_chunks(self.db, user_id, query_embedding, top_k)
