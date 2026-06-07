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


def search_relevant_chunks(db, user_id, query_embedding, top_k=DEFAULT_TOP_K):
    top_k = max(1, min(int(top_k or DEFAULT_TOP_K), 20))
    stmt = (
        select(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(and_(Document.user_id == user_id, DocumentChunk.embedding != ""))
    )
    scored = []

    for chunk, document in db.execute(stmt).all():
        try:
            chunk_embedding = parse_embedding_payload(chunk.embedding)
        except EmbeddingError:
            continue

        score = cosine_similarity(query_embedding, chunk_embedding)

        if score > 0:
            scored.append({
                "chunk": chunk,
                "document": document,
                "score": score,
            })

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


class VectorStore:
    def __init__(self, db):
        self.db = db

    def insert_chunk_embeddings(self, document_id, chunks, embeddings):
        return insert_chunk_embeddings(self.db, document_id, chunks, embeddings)

    def search_relevant_chunks(self, user_id, query_embedding, top_k=DEFAULT_TOP_K):
        return search_relevant_chunks(self.db, user_id, query_embedding, top_k)
