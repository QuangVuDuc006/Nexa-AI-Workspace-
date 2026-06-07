from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file

from services.auth import login_required
from services.database import db_session
from services.http import error_response
from services.rag.document_service import (
    create_document_with_chunks,
    delete_document,
    document_url,
    get_document_metadata,
    list_documents_by_user,
    serialize_document,
)
from services.rag.embedding_service import EmbeddingError, EmbeddingService
from services.rag.vector_store import search_relevant_chunks
from services.security import client_ip, csrf_protect, rate_limit
from services.uploads import UploadError, process_uploaded_document

from .common import db_user


def chunk_preview(text, max_length=500):
    text = str(text or "").strip()

    if len(text) <= max_length:
        return text

    return text[: max_length - 3].rstrip() + "..."


def serialize_search_result(item):
    chunk = item["chunk"]
    document = item["document"]

    return {
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
        "preview": chunk_preview(chunk.content),
    }


def create_document_blueprint(deps):
    bp = Blueprint("document_routes", __name__)

    @bp.post("/api/documents/upload")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def upload_document():
        if not deps.settings.rag_enabled:
            return error_response(503, "rag_disabled", "Document RAG is disabled.")

        if "file" not in request.files:
            return error_response(400, "missing_file", "Upload a file.")

        db = db_session()
        user = db_user(db)

        try:
            uploaded = process_uploaded_document(request.files["file"], deps.settings)
            document, chunks = create_document_with_chunks(
                db,
                user.id,
                uploaded["filename"],
                uploaded["mime_type"],
                uploaded["pages"],
                deps.settings,
                source_bytes=uploaded.get("raw"),
            )
            db.commit()
            return jsonify({
                "document": serialize_document(document, len(chunks)),
                "chunkCount": len(chunks),
                "chunk_count": len(chunks),
            })
        except UploadError as error:
            db.rollback()
            current_app.logger.warning("Document upload failed", extra={"code": error.code, "ip": client_ip()})
            return error_response(error.status_code, error.code, str(error))
        except EmbeddingError as error:
            db.rollback()
            current_app.logger.warning("Document embedding failed", extra={"ip": client_ip(), "error": str(error)})
            return error_response(502, "embedding_failed", str(error))
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_document", str(error))

    @bp.get("/api/documents")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def list_documents():
        db = db_session()
        user = db_user(db)
        return jsonify({"documents": list_documents_by_user(db, user.id)})

    @bp.get("/api/documents/<document_id>/content")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def document_content(document_id):
        db = db_session()
        user = db_user(db)
        document = get_document_metadata(db, user.id, document_id)

        if not document or not document.storage_path:
            return error_response(404, "not_found", "Document source file was not found.")

        path = Path(document.storage_path)

        if not path.exists():
            return error_response(404, "not_found", "Document source file is unavailable.")

        return send_file(
            path,
            mimetype=document.mime_type,
            as_attachment=False,
            download_name=document.filename,
            max_age=300,
        )

    @bp.delete("/api/documents/<document_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def delete_user_document(document_id):
        db = db_session()
        user = db_user(db)

        if not delete_document(db, user.id, document_id):
            db.rollback()
            return error_response(404, "not_found", "Document was not found.")

        db.commit()
        return jsonify({"ok": True})

    @bp.post("/api/documents/search")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def search_documents():
        if not deps.settings.rag_enabled:
            return jsonify({"chunks": [], "results": []})

        data = request.get_json(silent=True) or {}
        query = str(data.get("query") or "").strip()

        if not query:
            return error_response(422, "invalid_query", "Search query is required.")

        try:
            top_k = max(1, min(int(data.get("top_k") or data.get("topK") or deps.settings.rag_top_k), 20))
        except (TypeError, ValueError):
            top_k = deps.settings.rag_top_k

        db = db_session()
        user = db_user(db)

        try:
            embedding_service = EmbeddingService.from_settings(deps.settings)
            query_embedding = embedding_service.create_embedding(query)
            results = search_relevant_chunks(db, user.id, query_embedding, top_k)
            serialized = [serialize_search_result(item) for item in results]
            return jsonify({"chunks": serialized, "results": serialized})
        except EmbeddingError as error:
            return error_response(502, "embedding_failed", str(error))

    return bp
