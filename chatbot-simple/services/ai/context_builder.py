from __future__ import annotations

import logging

from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from services.database import Conversation, Message, db_session


SYSTEM_PROMPT = (
    "You are Nexa AI, a helpful AI workspace assistant.\n"
    "Resolve references in the current user message such as 'nó', 'cái đó', "
    "'ý trên', 'bước trước', or 'làm tiếp' using the conversation history."
)
MINIMAL_SYSTEM_PROMPT = "You are Nexa AI."
MAX_FILE_CONTENT_CHARS = 20_000
MAX_CONTEXT_LENGTH = 40_000
TRUNCATION_SUFFIX = "\n[Truncated for context length.]"
ROLE_LABELS = {
    "user": "User",
    "ai": "Assistant",
    "assistant": "Assistant",
}
logger = logging.getLogger(__name__)


def truncate_text(text, max_length):
    text = str(text or "")

    if max_length <= 0:
        return ""

    if len(text) <= max_length:
        return text

    if max_length <= len(TRUNCATION_SUFFIX):
        return text[:max_length]

    return text[: max_length - len(TRUNCATION_SUFFIX)] + TRUNCATION_SUFFIX


def role_label(role):
    return ROLE_LABELS.get(str(role or "").lower(), "Assistant")


def get_conversation(db, conversation_id, user_id=None):
    conversation_id = str(conversation_id or "").strip()

    if not conversation_id:
        return None

    conditions = [Conversation.id == conversation_id]

    if user_id:
        conditions.append(Conversation.user_id == user_id)

    return db.scalar(select(Conversation).where(and_(*conditions)))


def get_recent_messages(db, conversation_id, user_id=None, max_messages=12):
    conversation_id = str(conversation_id or "").strip()

    if not conversation_id:
        return []

    max_messages = max(0, min(int(max_messages or 12), 12))

    if max_messages == 0:
        return []

    stmt = (
        select(Message)
        .join(Conversation)
        .options(selectinload(Message.attachments))
        .where(Conversation.id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(max_messages)
    )

    if user_id:
        stmt = stmt.where(Conversation.user_id == user_id)

    return list(reversed(db.scalars(stmt).all()))


def render_attachment_lines(attachments, file_budget):
    lines = []
    remaining = file_budget

    for attachment in attachments or []:
        if attachment.kind == "image":
            lines.append(f"[Image attachment: {attachment.name} ({attachment.mime_type})]")
            continue

        content = str(attachment.content_text or "")
        if not content.strip():
            lines.append(f"[Attachment: {attachment.name} ({attachment.mime_type})]")
            continue

        if remaining <= 0:
            lines.append(f"[Attachment omitted: {attachment.name} ({attachment.mime_type})]")
            continue

        snippet = truncate_text(content, min(len(content), remaining))
        remaining -= len(snippet)
        lines.extend([
            f"[Attachment: {attachment.name} ({attachment.mime_type})]",
            snippet,
        ])

    return lines, remaining


def render_messages(messages, max_file_content=MAX_FILE_CONTENT_CHARS):
    rendered = []
    file_budget = max(0, int(max_file_content or 0))

    for message in messages:
        text = str(message.text or "").strip()
        lines = [f"{role_label(message.role)}: {text}" if text else f"{role_label(message.role)}:"]
        attachment_lines, file_budget = render_attachment_lines(message.attachments, file_budget)

        if attachment_lines:
            lines.append("Attachments:")
            lines.extend(attachment_lines)

        rendered.append("\n".join(lines))

    return rendered


def compose_context(summary, history_text, current_user_message):
    sections = [
        f"System:\n{SYSTEM_PROMPT}",
    ]

    if summary:
        sections.append(f"Conversation summary:\n{summary}")

    sections.append("Conversation history:\n" + (history_text or "[No previous messages.]"))
    sections.append(f"Current user message:\n{current_user_message}")
    return "\n\n".join(sections)


def compact_current_message_context(current_user_message, max_context_length):
    prefix = f"System:\n{MINIMAL_SYSTEM_PROMPT}\n\nCurrent user message:\n"

    if len(prefix) >= max_context_length:
        return str(current_user_message or "")[:max_context_length]

    remaining = max_context_length - len(prefix)
    return prefix + truncate_text(current_user_message, remaining)


def longest_fitting_text(original, builder, max_context_length):
    low = 0
    high = len(str(original or ""))
    best = ""

    while low <= high:
        mid = (low + high) // 2
        candidate_text = truncate_text(original, mid)
        candidate = builder(candidate_text)

        if len(candidate) <= max_context_length:
            best = candidate_text
            low = mid + 1
        else:
            high = mid - 1

    return best


def fit_current_message(summary, current_user_message, max_context_length):
    context = compose_context(summary, "", current_user_message)

    if len(context) <= max_context_length:
        return summary, current_user_message

    if summary:
        summary = longest_fitting_text(
            summary,
            lambda value: compose_context(value, "", current_user_message),
            max_context_length,
        )
        context = compose_context(summary, "", current_user_message)

    if len(context) <= max_context_length:
        return summary, current_user_message

    current_user_message = longest_fitting_text(
        current_user_message,
        lambda value: compose_context(summary, "", value),
        max_context_length,
    )
    return summary, current_user_message


def fit_history(rendered_messages, summary, current_user_message, max_context_length):
    selected_newest_first = []

    for rendered in reversed(rendered_messages):
        candidate_newest_first = selected_newest_first + [rendered]
        history_text = "\n\n".join(reversed(candidate_newest_first))
        candidate = compose_context(summary, history_text, current_user_message)

        if len(candidate) <= max_context_length:
            selected_newest_first = candidate_newest_first
            continue

        if selected_newest_first:
            continue

        truncated = longest_fitting_text(
            rendered,
            lambda value: compose_context(summary, value, current_user_message),
            max_context_length,
        )

        if truncated:
            selected_newest_first = [truncated]

    return "\n\n".join(reversed(selected_newest_first))


def build_conversation_context(
    conversation_id,
    user_message,
    max_messages=12,
    *,
    db=None,
    user_id=None,
    max_context_length=MAX_CONTEXT_LENGTH,
):
    owns_session = db is None
    db = db or db_session()
    max_context_length = max(1, int(max_context_length or MAX_CONTEXT_LENGTH))

    try:
        conversation = get_conversation(db, conversation_id, user_id)
        summary = ""

        if conversation is not None:
            summary = str(getattr(conversation, "summary", "") or "").strip()

        messages = get_recent_messages(db, conversation_id, user_id, max_messages)
        rendered_messages = render_messages(messages)
        logger.warning(
            "context_builder loaded history",
            extra={
                "conversation_id": conversation_id,
                "resolved_conversation_id": conversation.id if conversation else "",
                "history_message_count": len(messages),
                "history_last_2": rendered_messages[-2:],
            },
        )
        summary, fitted_user_message = fit_current_message(summary, str(user_message or ""), max_context_length)
        history_text = fit_history(rendered_messages, summary, fitted_user_message, max_context_length)
        context = compose_context(summary, history_text, fitted_user_message)

        if len(context) > max_context_length:
            summary, fitted_user_message = fit_current_message("", str(user_message or ""), max_context_length)
            context = compose_context(summary, "", fitted_user_message)

        if len(context) > max_context_length:
            context = compact_current_message_context(str(user_message or ""), max_context_length)

        logger.warning(
            "context_builder final context",
            extra={
                "conversation_id": conversation_id,
                "context_length": len(context),
                "context_preview": context[:800],
            },
        )
        return context[:max_context_length]
    finally:
        if owns_session:
            db.close()
