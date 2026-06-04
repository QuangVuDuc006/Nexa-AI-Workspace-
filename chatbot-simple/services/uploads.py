from __future__ import annotations

import base64
import mimetypes
from io import BytesIO
from pathlib import Path

from werkzeug.utils import secure_filename


IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
TEXT_MIME_TYPES = {"text/plain", "text/markdown", "text/x-markdown"}
TEXT_EXTENSIONS = {"txt", "md"}
DOCUMENT_EXTENSIONS = {"pdf", "docx"}
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


class UploadError(ValueError):
    def __init__(self, message, status_code=422, code="unsupported_file"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def extension_for(filename):
    return Path(filename or "").suffix.removeprefix(".").lower()


def guess_mime_type(filename, fallback="application/octet-stream"):
    guessed, _encoding = mimetypes.guess_type(filename or "")
    return guessed or fallback


def supported_kind(filename, mime_type):
    extension = extension_for(filename)
    mime_type = (mime_type or "").lower()

    if extension in IMAGE_EXTENSIONS or mime_type in IMAGE_MIME_TYPES:
        return "image"

    if extension in TEXT_EXTENSIONS or mime_type in TEXT_MIME_TYPES:
        return "text"

    if extension in DOCUMENT_EXTENSIONS:
        return "text"

    return ""


def sanitize_filename(filename):
    return secure_filename(filename or "attachment")[:160] or "attachment"


def extract_text(filename, mime_type, data):
    extension = extension_for(filename)

    if extension in TEXT_EXTENSIONS or (mime_type or "").lower() in TEXT_MIME_TYPES:
        return data.decode("utf-8", errors="replace")

    if extension == "pdf":
        try:
            from pypdf import PdfReader
        except ImportError as error:
            raise UploadError("PDF upload support is not installed.", status_code=500, code="pdf_support_missing") from error

        try:
            reader = PdfReader(BytesIO(data))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages).strip()
        except Exception as error:
            raise UploadError("Could not extract text from this PDF.", code="pdf_extraction_failed") from error

    if extension == "docx":
        try:
            from docx import Document
        except ImportError as error:
            raise UploadError("DOCX upload support is not installed.", status_code=500, code="docx_support_missing") from error

        try:
            document = Document(BytesIO(data))
            paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text]
            return "\n".join(paragraphs).strip()
        except Exception as error:
            raise UploadError("Could not extract text from this DOCX file.", code="docx_extraction_failed") from error

    raise UploadError("Unsupported file type.")


def file_to_data_url(mime_type, data):
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def process_uploaded_file(file_storage, settings):
    filename = sanitize_filename(file_storage.filename)
    raw = file_storage.read()
    size = len(raw)
    mime_type = file_storage.mimetype or guess_mime_type(filename)
    kind = supported_kind(filename, mime_type)

    if not kind:
        raise UploadError(
            f"{filename} is not supported. Upload txt, md, pdf, docx, or supported image files."
        )

    if size <= 0:
        raise UploadError(f"{filename} is empty.", code="empty_file")

    if size > settings.max_upload_bytes:
        raise UploadError(
            f"{filename} is larger than the configured upload limit.",
            status_code=413,
            code="file_too_large",
        )

    if kind == "image":
        if mime_type not in IMAGE_MIME_TYPES:
            mime_type = guess_mime_type(filename, "image/png")

        if mime_type not in IMAGE_MIME_TYPES:
            raise UploadError(f"{filename} is not a supported image file.")

        if size > settings.max_image_bytes:
            raise UploadError(
                f"{filename} is larger than the configured image limit.",
                status_code=413,
                code="image_too_large",
            )

        return {
            "id": "",
            "kind": "image",
            "name": filename,
            "mimeType": mime_type,
            "mime_type": mime_type,
            "size": size,
            "dataUrl": file_to_data_url(mime_type, raw),
        }

    content = extract_text(filename, mime_type, raw)

    if not content.strip():
        raise UploadError(f"No readable text was found in {filename}.", code="empty_extracted_text")

    return {
        "id": "",
        "kind": "text",
        "name": filename,
        "mimeType": mime_type,
        "mime_type": mime_type,
        "size": size,
        "content": content[: settings.max_attachment_chars],
    }
