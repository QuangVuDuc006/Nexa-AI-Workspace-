from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import and_, select

from services.database import AuditLog, Attachment, Conversation, Message, User, new_id, utc_now
from services.uploads import IMAGE_MIME_TYPES, sanitize_filename


SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$")


def timestamp_ms(value):
    if not value:
        return int(datetime.now(timezone.utc).timestamp() * 1000)

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return int(value.timestamp() * 1000)


def clean_client_id(value, prefix):
    value = str(value or "").strip()

    if value and SAFE_ID_RE.match(value):
        return value

    return new_id(prefix)


def clean_title(value):
    title = str(value or "New chat").strip()
    return title[:100] or "New chat"


def safe_user_path(user_id):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(user_id or "user"))[:120] or "user"


def upsert_user(db, user_data):
    uid = str(user_data["id"]).strip()
    user = db.get(User, uid)

    if not user:
        user = User(id=uid, created_at=utc_now())
        db.add(user)

    user.email = str(user_data.get("email") or "")
    user.display_name = str(user_data.get("display_name") or user.email or "Firebase user")
    user.photo_url = str(user_data.get("photo_url") or "")
    user.auth_provider = str(user_data.get("auth_provider") or "firebase")
    user.is_admin = bool(user_data.get("is_admin"))
    user.updated_at = utc_now()
    return user


def serialize_attachment(attachment):
    payload = {
        "id": attachment.id,
        "kind": attachment.kind,
        "name": attachment.name,
        "mimeType": attachment.mime_type,
        "mime_type": attachment.mime_type,
        "size": attachment.size,
    }

    if attachment.kind == "image":
        payload["url"] = f"/api/attachments/{attachment.id}/content"
        payload["previewUrl"] = payload["url"]

    return payload


def serialize_message(message):
    return {
        "id": message.id,
        "role": "user" if message.role == "user" else "ai",
        "text": message.text or "",
        "createdAt": timestamp_ms(message.created_at),
        "provider": message.provider or "",
        "model": message.model or "",
        "attachments": [serialize_attachment(attachment) for attachment in message.attachments],
        "feedback": message.feedback or None,
        "isError": bool(message.is_error),
        "isLoading": False,
        "isStopped": bool(message.is_stopped),
    }


def serialize_conversation(conversation, include_messages=False):
    payload = {
        "id": conversation.id,
        "title": conversation.title,
        "createdAt": timestamp_ms(conversation.created_at),
        "updatedAt": timestamp_ms(conversation.updated_at),
    }

    if include_messages:
        payload["messages"] = [serialize_message(message) for message in conversation.messages]

    return payload


def get_conversation_for_user(db, user_id, conversation_id):
    if not conversation_id:
        return None

    return db.scalar(
        select(Conversation).where(
            and_(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
    )


def ensure_conversation(db, user_id, conversation_id=None, title="New chat"):
    conversation_id = str(conversation_id or "").strip()

    if conversation_id:
        conversation = db.get(Conversation, conversation_id)

        if conversation and conversation.user_id != user_id:
            raise PermissionError("Conversation does not belong to this user.")

        if conversation:
            return conversation

    conversation = Conversation(
        id=clean_client_id(conversation_id, "conv"),
        user_id=user_id,
        title=clean_title(title),
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(conversation)
    return conversation


def list_user_conversations(db, user_id, limit=50, cursor=None):
    limit = max(1, min(int(limit or 50), 100))
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(limit + 1)
    )

    if cursor:
        try:
            cursor_date = datetime.fromisoformat(str(cursor).replace("Z", "+00:00"))
        except ValueError:
            cursor_date = None

        if cursor_date:
            stmt = stmt.where(Conversation.updated_at < cursor_date)

    rows = list(db.scalars(stmt).all())
    has_more = len(rows) > limit
    rows = rows[:limit]

    return {
        "conversations": [serialize_conversation(conversation, include_messages=True) for conversation in rows],
        "next_cursor": rows[-1].updated_at.isoformat() if has_more and rows else None,
    }


def default_state_for_user(db, user_id):
    result = list_user_conversations(db, user_id, limit=50)

    if not result["conversations"]:
        conversation = ensure_conversation(db, user_id)
        db.flush()
        result["conversations"] = [serialize_conversation(conversation, include_messages=True)]

    return result


def get_message_for_user(db, user_id, message_id):
    if not message_id:
        return None

    return db.scalar(
        select(Message)
        .join(Conversation)
        .where(and_(Message.id == message_id, Conversation.user_id == user_id))
    )


def get_attachment_for_user(db, user_id, attachment_id):
    if not attachment_id:
        return None

    return db.scalar(
        select(Attachment)
        .join(Message)
        .join(Conversation)
        .where(and_(Attachment.id == attachment_id, Conversation.user_id == user_id))
    )


def parse_data_url(data_url):
    data_url = str(data_url or "")

    if not data_url.startswith("data:") or ";base64," not in data_url:
        raise ValueError("Invalid image attachment.")

    header, encoded = data_url.split(";base64,", 1)
    mime_type = header.removeprefix("data:").strip().lower()

    if mime_type not in IMAGE_MIME_TYPES:
        raise ValueError("Only PNG, JPG, JPEG, WebP, and GIF images are supported.")

    try:
        return mime_type, base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise ValueError("Invalid image attachment.") from error


def write_image_attachment(settings, user_id, message_id, attachment_id, name, data_url):
    mime_type, raw = parse_data_url(data_url)

    if len(raw) > settings.max_image_bytes:
        raise ValueError("Image files must be 5 MB or smaller.")

    extension = Path(name).suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        extension = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }[mime_type]

    directory = settings.upload_storage_dir / safe_user_path(user_id) / message_id
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{attachment_id}-{sanitize_filename(Path(name).stem)[:80]}{extension}"
    path.write_bytes(raw)
    return mime_type, len(raw), str(path)


def hydrate_attachment_for_provider(db, user_id, raw_attachment):
    if not isinstance(raw_attachment, dict):
        raise ValueError("Each attachment must be an object.")

    kind = str(raw_attachment.get("kind") or "text").strip()
    existing_id = str(raw_attachment.get("id") or raw_attachment.get("serverId") or "").strip()

    if existing_id and not raw_attachment.get("content") and not raw_attachment.get("dataUrl") and not raw_attachment.get("data_url"):
        existing = get_attachment_for_user(db, user_id, existing_id)

        if not existing:
            raise ValueError("Attachment was not found.")

        if existing.kind == "image":
            path = Path(existing.storage_path)

            if not path.exists():
                raise ValueError("Image attachment is no longer available.")

            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return {
                "id": existing.id,
                "kind": "image",
                "name": existing.name,
                "mime_type": existing.mime_type,
                "size": existing.size,
                "data_url": f"data:{existing.mime_type};base64,{encoded}",
            }

        return {
            "id": existing.id,
            "kind": "text",
            "name": existing.name,
            "mime_type": existing.mime_type,
            "size": existing.size,
            "content": existing.content_text,
        }

    name = sanitize_filename(raw_attachment.get("name") or "attachment")
    mime_type = str(raw_attachment.get("mimeType") or raw_attachment.get("mime_type") or "text/plain").strip()

    try:
        size = int(raw_attachment.get("size") or 0)
    except (TypeError, ValueError):
        size = 0

    if kind == "image":
        data_url = str(raw_attachment.get("dataUrl") or raw_attachment.get("data_url") or "")
        parsed_mime, raw = parse_data_url(data_url)
        return {
            "id": existing_id,
            "kind": "image",
            "name": name,
            "mime_type": parsed_mime,
            "size": size or len(raw),
            "data_url": data_url,
        }

    if kind != "text":
        raise ValueError("Only text, PDF, DOCX, and image attachments are supported.")

    content = str(raw_attachment.get("content") or "")

    if not content.strip():
        return None

    return {
        "id": existing_id,
        "kind": "text",
        "name": name,
        "mime_type": mime_type,
        "size": size,
        "content": content,
    }


def normalize_attachments_for_provider(db, user_id, raw_attachments, settings):
    if raw_attachments in (None, ""):
        return []

    if not isinstance(raw_attachments, list):
        raise ValueError("Attachments must be a list.")

    attachments = []
    total_chars = 0

    for raw_attachment in raw_attachments:
        attachment = hydrate_attachment_for_provider(db, user_id, raw_attachment)

        if attachment is None:
            continue

        if attachment["kind"] == "text":
            remaining_chars = settings.max_total_attachment_chars - total_chars

            if remaining_chars <= 0:
                break

            content = attachment["content"][: min(settings.max_attachment_chars, remaining_chars)]
            total_chars += len(content)
            attachment["content"] = content

        attachments.append(attachment)

    return attachments


def persist_attachments(db, message, attachments, settings, user_id):
    if message.attachments:
        return

    for raw_attachment in attachments or []:
        name = sanitize_filename(raw_attachment.get("name") or "attachment")
        mime_type = str(raw_attachment.get("mime_type") or raw_attachment.get("mimeType") or "application/octet-stream")
        size = int(raw_attachment.get("size") or 0)
        attachment_id = clean_client_id(raw_attachment.get("id"), "att")

        if raw_attachment.get("kind") == "image":
            data_url = raw_attachment.get("data_url") or raw_attachment.get("dataUrl")
            mime_type, stored_size, storage_path = write_image_attachment(
                settings,
                user_id,
                message.id,
                attachment_id,
                name,
                data_url,
            )
            attachment = Attachment(
                id=attachment_id,
                message_id=message.id,
                kind="image",
                name=name,
                mime_type=mime_type,
                size=stored_size,
                storage_path=storage_path,
                created_at=utc_now(),
            )
        else:
            content = str(raw_attachment.get("content") or "")[: settings.max_attachment_chars]
            attachment = Attachment(
                id=attachment_id,
                message_id=message.id,
                kind="text",
                name=name,
                mime_type=mime_type or "text/plain",
                size=size,
                content_text=content,
                created_at=utc_now(),
            )

        db.add(attachment)


def ensure_message(db, conversation, message_id, role, text="", provider="", model="", attachments=None, settings=None):
    message_id = clean_client_id(message_id, "msg")
    message = db.get(Message, message_id)

    if message and message.conversation_id != conversation.id:
        raise PermissionError("Message does not belong to this conversation.")

    if not message:
        message = Message(
            id=message_id,
            conversation_id=conversation.id,
            role=role,
            text=text,
            provider=provider or "",
            model=model or "",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(message)
    else:
        message.text = text if role == "ai" else message.text or text
        message.provider = provider or message.provider
        message.model = model or message.model
        message.updated_at = utc_now()

    if attachments and settings:
        persist_attachments(db, message, attachments, settings, conversation.user_id)

    conversation.updated_at = utc_now()
    return message


def update_assistant_message(db, user_id, message_id, text, provider="", model="", is_error=False, is_stopped=False):
    message = get_message_for_user(db, user_id, message_id)

    if not message:
        raise ValueError("Message was not found.")

    if message.role != "ai":
        raise ValueError("Only assistant messages can be updated by this route.")

    message.text = text or ""
    message.provider = provider or message.provider
    message.model = model or message.model
    message.is_error = bool(is_error)
    message.is_stopped = bool(is_stopped)
    message.updated_at = utc_now()
    message.conversation.updated_at = utc_now()
    return message


def update_feedback(db, user_id, message_id, feedback):
    if feedback not in {"", "like", "dislike"}:
        raise ValueError("Feedback must be like, dislike, or empty.")

    message = get_message_for_user(db, user_id, message_id)

    if not message:
        raise ValueError("Message was not found.")

    if message.role != "ai":
        raise ValueError("Feedback is only supported for assistant messages.")

    message.feedback = feedback
    message.updated_at = utc_now()
    message.conversation.updated_at = utc_now()
    return message


def delete_message_for_user(db, user_id, message_id):
    message = get_message_for_user(db, user_id, message_id)

    if not message:
        raise ValueError("Message was not found.")

    conversation = message.conversation
    db.delete(message)
    conversation.updated_at = utc_now()


def delete_conversation_for_user(db, user_id, conversation_id):
    conversation = get_conversation_for_user(db, user_id, conversation_id)

    if not conversation:
        raise ValueError("Conversation was not found.")

    db.delete(conversation)


def clear_conversations_for_user(db, user_id):
    for conversation in db.scalars(select(Conversation).where(Conversation.user_id == user_id)):
        db.delete(conversation)


def audit_log(db, user_id, action, resource_type="", resource_id="", ip_address="", metadata=None):
    db.add(
        AuditLog(
            user_id=user_id or "",
            action=action,
            resource_type=resource_type or "",
            resource_id=resource_id or "",
            ip_address=ip_address or "",
            metadata_json=json.dumps(metadata or {}, sort_keys=True),
            created_at=utc_now(),
        )
    )
