from __future__ import annotations

from pathlib import Path

from sqlalchemy import and_, func, select

from services.database import Attachment, Conversation, Document, DocumentChunk, Message, User, UserMemory


DEFAULT_FREE_STORAGE_LIMIT_BYTES = 75 * 1024 * 1024
STORAGE_WARNING_RATIO = 0.8
QUOTA_MESSAGE = "Storage limit reached. Delete old files or upgrade your plan before uploading more files."


class StorageQuotaError(ValueError):
    pass


def storage_root(settings):
    return Path(settings.upload_storage_dir).resolve()


def safe_local_path(path, settings):
    if not path:
        return None

    root = storage_root(settings)
    candidate = Path(path).resolve()

    try:
        candidate.relative_to(root)
    except ValueError:
        return None

    return candidate


def local_file_size(path, settings):
    candidate = safe_local_path(path, settings)

    if not candidate or not candidate.is_file():
        return 0

    return candidate.stat().st_size


def delete_local_file(path, settings):
    candidate = safe_local_path(path, settings)

    if not candidate or not candidate.exists() or not candidate.is_file():
        return False

    candidate.unlink()
    root = storage_root(settings)
    parent = candidate.parent

    while parent != root and parent.exists():
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent

    return True


def document_count_for_user(db, user_id):
    return int(db.scalar(select(func.count(Document.id)).where(Document.user_id == user_id)) or 0)


def upload_storage_bytes_for_user(db, user_id, settings):
    total = 0

    documents = db.scalars(select(Document).where(Document.user_id == user_id)).all()
    for document in documents:
        stored_size = int(getattr(document, "size", 0) or 0)
        total += stored_size or local_file_size(getattr(document, "storage_path", ""), settings)

    attachments = db.scalars(
        select(Attachment)
        .join(Message)
        .join(Conversation)
        .where(and_(Conversation.user_id == user_id, Attachment.storage_path != ""))
    ).all()
    for attachment in attachments:
        stored_size = int(getattr(attachment, "size", 0) or 0)
        total += stored_size or local_file_size(getattr(attachment, "storage_path", ""), settings)

    return total


def embedding_storage_bytes_for_user(db, user_id):
    chunks = db.scalars(
        select(DocumentChunk)
        .join(Document)
        .where(Document.user_id == user_id)
    ).all()
    total = 0

    for chunk in chunks:
        total += len(str(chunk.embedding or "").encode("utf-8"))

    return total


def memory_storage_bytes_for_user(db, user_id):
    memories = db.scalars(select(UserMemory).where(UserMemory.user_id == user_id)).all()
    total = 0

    for memory in memories:
        total += len(str(memory.key or "").encode("utf-8"))
        total += len(str(memory.value or "").encode("utf-8"))

    return total


def storage_breakdown_for_user(db, user_id, settings):
    files = upload_storage_bytes_for_user(db, user_id, settings)
    embeddings = embedding_storage_bytes_for_user(db, user_id)
    memories = memory_storage_bytes_for_user(db, user_id)
    other = 0
    total = files + embeddings + memories + other

    return {
        "files": files,
        "embeddings": embeddings,
        "memory": memories,
        "other": other,
        "total": total,
    }


def storage_limit_for_user(user, settings=None):
    configured_limit = int(getattr(settings, "max_upload_storage_bytes_per_user", 0) or 0) if settings else 0
    user_limit = int(getattr(user, "storage_limit_bytes", 0) or 0)
    plan = str(getattr(user, "plan", "free") or "free").strip().lower()

    if plan != "free" and user_limit:
        return user_limit

    return configured_limit or user_limit or DEFAULT_FREE_STORAGE_LIMIT_BYTES


def sync_user_storage_usage(db, user, settings):
    breakdown = storage_breakdown_for_user(db, user.id, settings)
    user.storage_used_bytes = int(breakdown["total"])

    if not int(getattr(user, "storage_limit_bytes", 0) or 0):
        user.storage_limit_bytes = int(getattr(settings, "max_upload_storage_bytes_per_user", 0) or 0) or DEFAULT_FREE_STORAGE_LIMIT_BYTES

    if not str(getattr(user, "plan", "") or "").strip():
        user.plan = "free"

    db.flush()
    return breakdown


def storage_quota_payload(db, user, settings):
    breakdown = sync_user_storage_usage(db, user, settings)
    limit = storage_limit_for_user(user, settings)
    used = int(breakdown["total"])
    percent = round((used / limit) * 100, 1) if limit > 0 else 0
    warning_threshold = int(limit * STORAGE_WARNING_RATIO)

    return {
        "plan": getattr(user, "plan", "free") or "free",
        "usedBytes": used,
        "used_bytes": used,
        "limitBytes": limit,
        "limit_bytes": limit,
        "remainingBytes": max(0, limit - used),
        "remaining_bytes": max(0, limit - used),
        "percentUsed": percent,
        "percent_used": percent,
        "warningThresholdBytes": warning_threshold,
        "warning_threshold_bytes": warning_threshold,
        "isWarning": used >= warning_threshold,
        "is_warning": used >= warning_threshold,
        "isFull": used >= limit,
        "is_full": used >= limit,
        "breakdown": {
            "filesBytes": breakdown["files"],
            "files_bytes": breakdown["files"],
            "embeddingsBytes": breakdown["embeddings"],
            "embeddings_bytes": breakdown["embeddings"],
            "memoryBytes": breakdown["memory"],
            "memory_bytes": breakdown["memory"],
            "otherBytes": breakdown["other"],
            "other_bytes": breakdown["other"],
        },
    }


def ensure_document_quota(db, user_id, settings, incoming_bytes):
    if settings.max_documents_per_user > 0 and document_count_for_user(db, user_id) >= settings.max_documents_per_user:
        raise StorageQuotaError(QUOTA_MESSAGE)

    ensure_upload_storage_quota(db, user_id, settings, incoming_bytes)


def ensure_upload_storage_quota(db, user_id, settings, incoming_bytes):
    user = db.get(User, user_id)
    limit = storage_limit_for_user(user, settings) if user else int(getattr(settings, "max_upload_storage_bytes_per_user", 0) or 0)

    if limit <= 0:
        return

    current = storage_breakdown_for_user(db, user_id, settings)["total"]

    if current + int(incoming_bytes or 0) > limit:
        raise StorageQuotaError(QUOTA_MESSAGE)
