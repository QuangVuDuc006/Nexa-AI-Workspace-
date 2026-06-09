from __future__ import annotations

import logging
import unicodedata

from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from services.database import Conversation, Message, db_session
from services.memory_service import get_memory_context


SYSTEM_PROMPT = (
    "You are Nexa AI, a helpful AI workspace assistant.\n"
    "Default to useful depth: explain concepts clearly, include definitions, key ideas, examples, implications, "
    "and connections between related ideas when they help the user understand. Be direct, but not sparse. "
    "Avoid one-sentence or overly short answers unless the user asks for brevity or asks a simple factual question. "
    "For simple factual requests, a concise direct answer is acceptable.\n"
    "Before writing the final answer, internally organize it around the main idea, supporting details, examples, "
    "and a conclusion. Do not expose this outline unless it improves the answer.\n"
    "Answer using uploaded document context when relevant. Retrieved sources are labeled like [[source:1]]. "
    "Use only the provided source labels for citations. "
    "Cite claims from uploaded documents inline using citation markers like [[cite:1]] immediately after the sentence "
    "that uses that source. Do not create a final Sources section. Do not invent citation ids. "
    "Do not write plain bracket citations like [1] or [2]. "
    "Only use citation ids that appear in Retrieved document context. If the retrieved context is insufficient, "
    "say the uploaded documents do not contain enough information.\n"
    "Resolve references in the current user message such as 'nó', 'cái đó', "
    "'ý trên', 'bước trước', or 'làm tiếp' using the conversation history."
)
MINIMAL_SYSTEM_PROMPT = "You are Nexa AI."
RAG_ANSWER_INSTRUCTIONS = (
    "Retrieved-document answer rules:\n"
    "- Use retrieved chunks as evidence, but explain the topic beyond simply copying chunks.\n"
    "- Group related chunks into coherent sections instead of listing isolated snippets.\n"
    "- Highlight the important points from uploaded files and connect them to the user's question.\n"
    "- Cite claims from uploaded documents inline using markers like [[cite:1]] immediately after the sentence "
    "that uses that source.\n"
    "- Use only citation ids that appear in Retrieved document context. Do not invent citation ids.\n"
    "- Do not write plain bracket citations like [1] or [2].\n"
    "- Do not create a final Sources section; the interface renders sources from inline citations.\n"
    "- If retrieved context is insufficient, say the uploaded documents do not contain enough information.\n"
    "- Do not invent content not supported by the file. You may add general explanation only when it is clearly "
    "framed as background and does not contradict the file.\n"
    "- If retrieved context contains multiple uploaded files, answer with a separate clearly named section for each file.\n"
    "- If Retrieved document context includes document diagnostics, explicitly name the affected file and the extraction/chunking issue.\n"
    "- Do not only list file snippets or answer with generic filler.\n"
    "- If the user asks for important content from a file, provide a structured, learning-oriented explanation.\n"
    "- Unless the user asks for short output, each major point should have at least 2-4 sentences."
)
DETAILED_STUDY_INSTRUCTIONS = (
    "Answer mode: detailed_study_mode\n"
    "The user is asking for study-oriented explanation. Use a structured educational answer with:\n"
    "- Overview\n"
    "- Key concepts\n"
    "- Why each concept matters\n"
    "- Example or intuition\n"
    "- Common mistakes, exam notes, demo notes, or practical-use points when relevant\n"
    "- Short final takeaway\n"
    "Prefer thorough, step-by-step explanation. If the material appears academic, call out likely exam or demo points."
)
STUDY_MODE_PATTERNS = (
    "noi dung quan trong",
    "giai thich",
    "phan tich",
    "hoc phan nay",
    "tom tat de on thi",
    "on thi",
    "explain",
    "important points",
    "important content",
    "summarize this file",
    "summary of this file",
    "study this",
)
MAX_FILE_CONTENT_CHARS = 20_000
MAX_CONTEXT_LENGTH = 40_000
TRUNCATION_SUFFIX = "\n[Truncated for context length.]"
ROLE_LABELS = {
    "user": "User",
    "ai": "Assistant",
    "assistant": "Assistant",
}
logger = logging.getLogger(__name__)


def normalize_intent_text(value):
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(text.split())


def detect_answer_mode(user_message):
    normalized = normalize_intent_text(user_message)

    if any(pattern in normalized for pattern in STUDY_MODE_PATTERNS):
        return "detailed_study_mode"

    return "normal"


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
        if getattr(attachment, "document_id", ""):
            continue

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


def render_memory_values(memories):
    values = []

    for memory in memories or []:
        value = getattr(memory, "value", memory)
        value = str(value or "").strip()

        if value:
            values.append(value)

    return values


def compose_context(
    summary,
    history_text,
    current_user_message,
    personalization_text="",
    memories=None,
    rag_context_text="",
    answer_mode="normal",
):
    sections = [
        f"System:\n{SYSTEM_PROMPT}",
    ]

    if answer_mode == "detailed_study_mode":
        sections.append(DETAILED_STUDY_INSTRUCTIONS)

    personalization_text = str(personalization_text or "").strip()
    if personalization_text:
        sections.append(f"User personalization:\n{personalization_text}")

    memory_values = render_memory_values(memories)
    if memory_values:
        sections.append("User memories:\n" + "\n".join(f"- {value}" for value in memory_values))

    if summary:
        sections.append(f"Conversation summary:\n{summary}")

    sections.append("Conversation history:\n" + (history_text or "[No previous messages.]"))
    rag_context_text = str(rag_context_text or "").strip()

    if rag_context_text:
        sections.append(RAG_ANSWER_INSTRUCTIONS)
        sections.append(f"Retrieved document context:\n{rag_context_text}")

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


def fit_current_message(
    summary,
    current_user_message,
    max_context_length,
    personalization_text="",
    memories=None,
    rag_context_text="",
    answer_mode="normal",
):
    context = compose_context(summary, "", current_user_message, personalization_text, memories, rag_context_text, answer_mode)

    if len(context) <= max_context_length:
        return summary, current_user_message

    if summary:
        summary = longest_fitting_text(
            summary,
            lambda value: compose_context(value, "", current_user_message, personalization_text, memories, rag_context_text, answer_mode),
            max_context_length,
        )
        context = compose_context(summary, "", current_user_message, personalization_text, memories, rag_context_text, answer_mode)

    if len(context) <= max_context_length:
        return summary, current_user_message

    current_user_message = longest_fitting_text(
        current_user_message,
        lambda value: compose_context(summary, "", value, personalization_text, memories, rag_context_text, answer_mode),
        max_context_length,
    )
    return summary, current_user_message


def fit_history(
    rendered_messages,
    summary,
    current_user_message,
    max_context_length,
    personalization_text="",
    memories=None,
    rag_context_text="",
    answer_mode="normal",
):
    selected_newest_first = []

    for rendered in reversed(rendered_messages):
        candidate_newest_first = selected_newest_first + [rendered]
        history_text = "\n\n".join(reversed(candidate_newest_first))
        candidate = compose_context(
            summary,
            history_text,
            current_user_message,
            personalization_text,
            memories,
            rag_context_text,
            answer_mode,
        )

        if len(candidate) <= max_context_length:
            selected_newest_first = candidate_newest_first
            continue

        if selected_newest_first:
            continue

        truncated = longest_fitting_text(
            rendered,
            lambda value: compose_context(
                summary,
                value,
                current_user_message,
                personalization_text,
                memories,
                rag_context_text,
                answer_mode,
            ),
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
    rag_context_text="",
):
    owns_session = db is None
    db = db or db_session()
    max_context_length = max(1, int(max_context_length or MAX_CONTEXT_LENGTH))
    answer_mode = detect_answer_mode(user_message)

    try:
        conversation = get_conversation(db, conversation_id, user_id)
        summary = ""

        if conversation is not None:
            summary = str(getattr(conversation, "summary", "") or "").strip()

        memory_context = get_memory_context(user_id, db=db) if user_id else {"personalization_text": "", "memories": []}
        personalization_text = memory_context["personalization_text"]
        memories = memory_context["memories"]
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
        summary, fitted_user_message = fit_current_message(
            summary,
            str(user_message or ""),
            max_context_length,
            personalization_text,
            memories,
            rag_context_text,
            answer_mode,
        )
        history_text = fit_history(
            rendered_messages,
            summary,
            fitted_user_message,
            max_context_length,
            personalization_text,
            memories,
            rag_context_text,
            answer_mode,
        )
        context = compose_context(
            summary,
            history_text,
            fitted_user_message,
            personalization_text,
            memories,
            rag_context_text,
            answer_mode,
        )

        if len(context) > max_context_length:
            summary, fitted_user_message = fit_current_message(
                "",
                str(user_message or ""),
                max_context_length,
                personalization_text,
                memories,
                rag_context_text,
                answer_mode,
            )
            context = compose_context(summary, "", fitted_user_message, personalization_text, memories, rag_context_text, answer_mode)

        if len(context) > max_context_length:
            if rag_context_text:
                fitted_rag_context_text = longest_fitting_text(
                    rag_context_text,
                    lambda value: compose_context(
                        "",
                        "",
                        str(user_message or ""),
                        personalization_text,
                        memories,
                        value,
                        answer_mode,
                    ),
                    max_context_length,
                )
                context = compose_context(
                    "",
                    "",
                    str(user_message or ""),
                    personalization_text,
                    memories,
                    fitted_rag_context_text,
                    answer_mode,
                )

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
