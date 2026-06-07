from pathlib import Path

from flask import Blueprint, jsonify, send_file, request

from services.auth import login_required
from services.database import db_session
from services.http import error_response
from services.persistence import get_attachment_for_user
from services.rag.document_service import create_document_with_chunks, serialize_document
from services.rag.embedding_service import EmbeddingError
from services.security import client_ip, csrf_protect, rate_limit
from services.uploads import UploadError, process_uploaded_file

from .common import db_user


def create_upload_blueprint(deps):
    bp = Blueprint("upload_routes", __name__)

    @bp.post("/api/uploads")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def upload_file():
        from flask import current_app

        if "file" not in request.files:
            return error_response(400, "missing_file", "Upload a file.")

        try:
            attachment = process_uploaded_file(request.files["file"], deps.settings)
        except UploadError as error:
            current_app.logger.warning("Upload failed", extra={"code": error.code, "ip": client_ip()})
            return error_response(error.status_code, error.code, str(error))

        source_bytes = attachment.pop("_source_bytes", None)

        if deps.settings.rag_enabled and attachment.get("kind") == "text":
            db = db_session()
            user = db_user(db)

            try:
                document, chunks = create_document_with_chunks(
                    db,
                    user.id,
                    attachment["name"],
                    attachment["mime_type"],
                    attachment.get("content", ""),
                    deps.settings,
                    source_bytes=source_bytes,
                )
                db.commit()
                attachment["documentId"] = document.id
                attachment["document_id"] = document.id
                attachment["document"] = serialize_document(document, len(chunks))
            except (EmbeddingError, ValueError) as error:
                db.rollback()
                current_app.logger.warning("Legacy upload RAG indexing skipped", extra={"error": str(error)})

        return jsonify({"attachment": attachment})

    @bp.get("/api/attachments/<attachment_id>/content")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def attachment_content(attachment_id):
        db = db_session()
        user = db_user(db)
        attachment = get_attachment_for_user(db, user.id, attachment_id)

        if not attachment or attachment.kind != "image":
            return error_response(404, "not_found", "Attachment was not found.")

        path = Path(attachment.storage_path)

        if not path.exists():
            return error_response(404, "not_found", "Attachment content is unavailable.")

        return send_file(path, mimetype=attachment.mime_type, max_age=300)

    return bp
