from __future__ import annotations

import logging
import threading

from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from services.ai.context_builder import render_messages, truncate_text
from services.database import Conversation, Message, db_session, utc_now


RECENT_MESSAGES_TO_KEEP = 12
SUMMARY_MIN_MESSAGE_COUNT = 24
SUMMARY_UPDATE_INTERVAL = 8
MAX_SUMMARY_INPUT_CHARS = 20_000
MAX_SUMMARY_FILE_CONTENT_CHARS = 6_000
MAX_SUMMARY_CHARS = 8_000

logger = logging.getLogger(__name__)
_active_summary_lock = threading.Lock()
_active_summary_conversations = set()


def should_summarize_counts(message_count, summary_message_count):
    message_count = max(0, int(message_count or 0))
    summary_message_count = max(0, int(summary_message_count or 0))
    summary_target_count = max(0, message_count - RECENT_MESSAGES_TO_KEEP)

    return (
        message_count > SUMMARY_MIN_MESSAGE_COUNT
        and summary_target_count > 0
        and summary_target_count - summary_message_count >= SUMMARY_UPDATE_INTERVAL
    )


def get_conversation_for_summary(db, user_id, conversation_id):
    return db.scalar(
        select(Conversation).where(
            and_(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
    )


def get_ordered_messages(db, conversation_id):
    stmt = (
        select(Message)
        .options(selectinload(Message.attachments))
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    return list(db.scalars(stmt).all())


def build_summary_prompt(existing_summary, rendered_messages):
    message_text = truncate_text("\n\n".join(rendered_messages), MAX_SUMMARY_INPUT_CHARS)
    existing_summary = str(existing_summary or "").strip() or "[No existing summary.]"

    return "\n\n".join([
        "Update the rolling conversation summary for future chat turns.",
        (
            "Keep durable context only: user goals, important facts, decisions, constraints, "
            "files or named entities, unresolved tasks, and references needed to understand "
            "future follow-ups. Preserve exact names, IDs, code terms, and user preferences. "
            "Do not include irrelevant small talk. Keep it concise."
        ),
        "Existing summary:",
        existing_summary,
        "New messages to fold into the summary:",
        message_text or "[No new messages.]",
        "Return only the updated summary.",
    ])


def summarize_conversation_now(db, user_id, conversation_id, router, provider_id=None, model=None):
    try:
        conversation = get_conversation_for_summary(db, user_id, conversation_id)

        if not conversation:
            return {"status": "missing"}

        messages = get_ordered_messages(db, conversation.id)
        message_count = len(messages)
        summary_message_count = min(max(0, int(conversation.summary_message_count or 0)), message_count)
        summary_target_count = max(0, message_count - RECENT_MESSAGES_TO_KEEP)

        if not should_summarize_counts(message_count, summary_message_count):
            return {
                "status": "skipped",
                "message_count": message_count,
                "summary_message_count": summary_message_count,
            }

        candidate_messages = messages[summary_message_count:summary_target_count]

        if not candidate_messages:
            return {
                "status": "skipped",
                "message_count": message_count,
                "summary_message_count": summary_message_count,
            }

        rendered_messages = render_messages(candidate_messages, max_file_content=MAX_SUMMARY_FILE_CONTENT_CHARS)
        prompt = build_summary_prompt(conversation.summary, rendered_messages)
        response = router.generate(provider_id, prompt, model, [])
        updated_summary = truncate_text(getattr(response, "reply", response), MAX_SUMMARY_CHARS).strip()

        if not updated_summary:
            return {"status": "empty"}

        conversation.summary = updated_summary
        conversation.summary_message_count = summary_target_count
        conversation.summary_updated_at = utc_now()
        db.commit()
        return {
            "status": "updated",
            "message_count": message_count,
            "summary_message_count": summary_target_count,
            "summary_length": len(updated_summary),
        }
    except Exception as error:
        db.rollback()
        logger.warning(
            "conversation summary update failed",
            extra={"conversation_id": conversation_id, "user_id": user_id, "error": str(error)},
            exc_info=True,
        )
        return {"status": "failed", "error": str(error)}


def schedule_conversation_summary(
    user_id,
    conversation_id,
    router,
    provider_id=None,
    model=None,
    *,
    message_count=0,
    summary_message_count=0,
):
    if not should_summarize_counts(message_count, summary_message_count):
        return False

    key = (str(user_id or ""), str(conversation_id or ""))

    with _active_summary_lock:
        if key in _active_summary_conversations:
            return False
        _active_summary_conversations.add(key)

    def worker():
        db = db_session()
        try:
            result = summarize_conversation_now(db, user_id, conversation_id, router, provider_id, model)
            logger.info(
                "conversation summary update finished",
                extra={"conversation_id": conversation_id, "user_id": user_id, **result},
            )
        finally:
            db.close()
            with _active_summary_lock:
                _active_summary_conversations.discard(key)

    thread = threading.Thread(target=worker, name=f"summary-{conversation_id}", daemon=True)
    thread.start()
    return True
