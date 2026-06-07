from __future__ import annotations

import hashlib
import re
import unicodedata
from contextlib import contextmanager

from sqlalchemy import and_, func, select

from services.database import Conversation, Message, UserMemory, UserPersonalization, db_session, utc_now
from services.persistence import timestamp_ms


ALLOWED_MEMORY_SOURCES = {"manual", "explicit", "auto_frequency"}
ALLOWED_MEMORY_STATUSES = {"active", "archived", "deleted"}
MAX_PERSONALIZATION_CHARS = 4_000
MAX_MEMORY_CHARS = 1_000


class MemoryValidationError(ValueError):
    pass


@contextmanager
def session_scope(db=None):
    owns_session = db is None
    session = db or db_session()

    try:
        yield session
        if owns_session:
            session.commit()
    except Exception:
        if owns_session:
            session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def clean_text(value, max_chars):
    text = str(value or "").replace("\x00", " ")
    text = re.sub(r"[\t\r\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars]


def clean_personalization_text(value):
    return clean_text(value, MAX_PERSONALIZATION_CHARS)


def clean_memory_value(value):
    text = clean_text(value, MAX_MEMORY_CHARS)
    text = text.strip(" \t\r\n:：-–—\"'“”`")
    return text


def word_count(value):
    return len(re.findall(r"[\wÀ-ỹ]+", str(value or ""), flags=re.UNICODE))


SECRET_RE = re.compile(
    r"("
    r"\bpassword\b|\bpasswd\b|\bapi[_\s-]*key\b|\bsecret\b|\btoken\b|\bbearer\b|"
    r"\bprivate[_\s-]*key\b|\baccess[_\s-]*key\b|\brefresh[_\s-]*token\b|"
    r"\bcredentials?\b|mật\s*khẩu|mat\s*khau|khóa\s*api|khoa\s*api|"
    r"bí\s*mật|bi\s*mat|mã\s*token|ma\s*token|thông\s*tin\s*đăng\s*nhập"
    r")",
    re.IGNORECASE | re.UNICODE,
)
SECRET_VALUE_RE = re.compile(
    r"("
    r"sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|"
    r"ghp_[0-9A-Za-z_]{20,}|github_pat_[0-9A-Za-z_]{20,}|AKIA[0-9A-Z]{16}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9_./+=-]{40,}"
    r")",
    re.IGNORECASE,
)


def looks_like_secret(value):
    text = str(value or "")
    return bool(SECRET_RE.search(text) or SECRET_VALUE_RE.search(text))


def is_memory_content_acceptable(value):
    text = clean_memory_value(value)

    if not text:
        return False

    if len(text) < 8 or word_count(text) < 2:
        return False

    if looks_like_secret(text):
        return False

    return True


def normalize_slug(value):
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_text).strip("_")
    return slug or "memory"


def generated_memory_key(source, value):
    digest = hashlib.sha1(str(value or "").encode("utf-8")).hexdigest()[:10]
    slug = normalize_slug(value)[:48]
    return f"{source}:{slug}:{digest}"[:120]


def clean_memory_key(key, source, value):
    key = str(key or "").replace("\x00", "").strip()

    if key:
        key = re.sub(r"\s+", "_", key.lower())
        key = re.sub(r"[^a-z0-9:_-]+", "", key)
        return key[:120] or generated_memory_key(source, value)

    return generated_memory_key(source, value)


def serialize_profile(profile):
    return {
        "userId": profile.user_id,
        "user_id": profile.user_id,
        "personalizationText": profile.personalization_text or "",
        "personalization_text": profile.personalization_text or "",
        "createdAt": timestamp_ms(profile.created_at),
        "updatedAt": timestamp_ms(profile.updated_at),
    }


def serialize_memory(memory):
    return {
        "id": memory.id,
        "userId": memory.user_id,
        "user_id": memory.user_id,
        "key": memory.key,
        "value": memory.value,
        "source": memory.source,
        "status": memory.status,
        "confidence": float(memory.confidence or 0),
        "frequencyCount": int(memory.frequency_count or 0),
        "frequency_count": int(memory.frequency_count or 0),
        "lastSeenAt": timestamp_ms(memory.last_seen_at),
        "last_seen_at": memory.last_seen_at.isoformat() if memory.last_seen_at else "",
        "createdAt": timestamp_ms(memory.created_at),
        "updatedAt": timestamp_ms(memory.updated_at),
    }


def get_or_create_user_profile(user_id, *, db=None):
    user_id = str(user_id or "").strip()

    if not user_id:
        raise MemoryValidationError("User id is required.")

    with session_scope(db) as session:
        profile = session.get(UserPersonalization, user_id)

        if profile:
            return profile

        now = utc_now()
        profile = UserPersonalization(
            user_id=user_id,
            personalization_text="",
            created_at=now,
            updated_at=now,
        )
        session.add(profile)
        session.flush()
        return profile


def get_personalization_text(user_id, *, db=None):
    profile = get_or_create_user_profile(user_id, db=db)
    return profile.personalization_text or ""


def update_personalization_text(user_id, personalization_text, *, db=None):
    with session_scope(db) as session:
        profile = get_or_create_user_profile(user_id, db=session)
        profile.personalization_text = clean_personalization_text(personalization_text)
        profile.updated_at = utc_now()
        session.flush()
        return profile


def active_memory_query(user_id):
    return (
        select(UserMemory)
        .where(and_(UserMemory.user_id == user_id, UserMemory.status == "active"))
        .order_by(UserMemory.updated_at.desc(), UserMemory.created_at.desc(), UserMemory.id.desc())
    )


def list_active_memories(user_id, *, db=None):
    user_id = str(user_id or "").strip()

    with session_scope(db) as session:
        return list(session.scalars(active_memory_query(user_id)).all())


def get_memory_for_user(session, user_id, memory_id):
    memory_id = str(memory_id or "").strip()

    if not memory_id:
        return None

    return session.scalar(
        select(UserMemory).where(and_(UserMemory.id == memory_id, UserMemory.user_id == user_id))
    )


def clamp_confidence(value):
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        confidence = 1.0

    return max(0.0, min(1.0, confidence))


def create_memory(
    user_id,
    key,
    value,
    source="manual",
    confidence=1.0,
    frequency_count=1,
    *,
    db=None,
    status="active",
    last_seen_at=None,
):
    user_id = str(user_id or "").strip()
    source = str(source or "manual").strip()
    status = str(status or "active").strip()
    value = clean_memory_value(value)

    if source not in ALLOWED_MEMORY_SOURCES:
        raise MemoryValidationError("Invalid memory source.")

    if status not in ALLOWED_MEMORY_STATUSES:
        raise MemoryValidationError("Invalid memory status.")

    if status == "active" and not is_memory_content_acceptable(value):
        raise MemoryValidationError("Memory is empty, too vague, or contains sensitive credentials.")

    now = utc_now()
    memory_key = clean_memory_key(key, source, value)

    with session_scope(db) as session:
        memory = UserMemory(
            user_id=user_id,
            key=memory_key,
            value=value,
            source=source,
            status=status,
            confidence=clamp_confidence(confidence),
            frequency_count=max(1, int(frequency_count or 1)),
            last_seen_at=last_seen_at or now,
            created_at=now,
            updated_at=now,
        )
        session.add(memory)
        session.flush()

        if status == "active":
            enforce_memory_limit(user_id, db=session, protect_id=memory.id)

        session.flush()
        return memory


def update_memory(user_id, memory_id, payload, *, db=None):
    user_id = str(user_id or "").strip()
    payload = payload if isinstance(payload, dict) else {}

    with session_scope(db) as session:
        memory = get_memory_for_user(session, user_id, memory_id)

        if not memory:
            raise LookupError("Memory was not found.")

        if "value" in payload:
            value = clean_memory_value(payload.get("value"))

            if not is_memory_content_acceptable(value):
                raise MemoryValidationError("Memory is empty, too vague, or contains sensitive credentials.")

            memory.value = value

        if "key" in payload:
            memory.key = clean_memory_key(payload.get("key"), memory.source, memory.value)

        if "status" in payload:
            status = str(payload.get("status") or "").strip()

            if status not in ALLOWED_MEMORY_STATUSES:
                raise MemoryValidationError("Invalid memory status.")

            memory.status = status

        memory.updated_at = utc_now()

        if memory.status == "active":
            enforce_memory_limit(user_id, db=session, protect_id=memory.id)

        session.flush()
        return memory


def delete_memory(user_id, memory_id, *, db=None):
    user_id = str(user_id or "").strip()

    with session_scope(db) as session:
        memory = get_memory_for_user(session, user_id, memory_id)

        if not memory:
            raise LookupError("Memory was not found.")

        memory.status = "deleted"
        memory.updated_at = utc_now()
        session.flush()
        return memory


EXPLICIT_MEMORY_PATTERNS = [
    r"(?:^|\b)(?:hãy\s+)?nhớ\s+rằng\s+(.+)",
    r"(?:^|\b)ghi\s+nhớ\s+(?:rằng|là)\s+(.+)",
    r"(?:^|\b)lưu\s+lại\s+là\s+(.+)",
    r"(?:^|\b)lưu\s+ý\s+rằng\s+(.+)",
    r"(?:^|\b)từ\s+giờ\s+hãy\s+nhớ\s+(.+)",
    r"(?:^|\b)sau\s+này\s+nhớ\s+(.+)",
    r"(?:^|\b)remember\s+this\s*:\s*(.+)",
    r"(?:^|\b)remember\s+that\s+(.+)",
    r"(?:^|\b)please\s+remember\s+(.+)",
    r"(?:^|\b)remember\s+this\s+(.+)",
    r"(?:^|\b)save\s+(?:this|that)\s+(.+)",
    r"(?:^|\b)note\s+that\s+(.+)",
    r"(?:^|\b)keep\s+in\s+mind\s+that\s+(.+)",
]


def detect_explicit_memory(user_message):
    text = str(user_message or "").strip()

    if not text:
        return None

    for pattern in EXPLICIT_MEMORY_PATTERNS:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.UNICODE | re.DOTALL)

        if not match:
            continue

        value = clean_memory_value(match.group(1))

        if is_memory_content_acceptable(value):
            return value

        return None

    return None


TEMPORARY_RE = re.compile(
    r"\b(today|tomorrow|yesterday|this\s+week|next\s+week|deadline|due\s+date|"
    r"hôm\s+nay|ngày\s+mai|hôm\s+qua|tuần\s+này|tuần\s+sau|hạn\s+chót)\b",
    re.IGNORECASE | re.UNICODE,
)
SENSITIVE_AUTO_RE = re.compile(
    r"\b("
    r"health|medical|diagnosis|medicine|doctor|depression|anxiety|therapy|"
    r"politic|political|election|vote|party|religion|religious|church|mosque|temple|"
    r"address|street|bank|credit\s*card|account\s*number|ssn|tax\s*id|"
    r"sức\s*khỏe|bệnh|thuốc|bác\s*sĩ|chẩn\s*đoán|trầm\s*cảm|lo\s*âu|"
    r"chính\s*trị|bầu\s*cử|tôn\s*giáo|địa\s*chỉ|ngân\s*hàng|thẻ\s*tín\s*dụng|"
    r"số\s*tài\s*khoản"
    r")\b",
    re.IGNORECASE | re.UNICODE,
)
VIETNAMESE_DIACRITIC_RE = re.compile(r"[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]", re.IGNORECASE)


AUTO_MEMORY_PATTERNS = [
    {
        "key": "topic:flask",
        "value": "User often asks about Flask.",
        "patterns": [r"\bflask\b"],
    },
    {
        "key": "topic:react",
        "value": "User often works with React.",
        "patterns": [r"\breact(?:\.js|js)?\b"],
    },
    {
        "key": "topic:nexa_ai",
        "value": "User often asks about Nexa AI.",
        "patterns": [r"\bnexa(?:\s+ai)?\b"],
    },
    {
        "key": "preference:step_by_step",
        "value": "User frequently asks for step-by-step explanations.",
        "patterns": [r"step[-\s]*by[-\s]*step", r"từng\s+bước", r"tung\s+buoc"],
    },
    {
        "key": "preference:vietnamese",
        "value": "User usually prefers Vietnamese responses.",
        "patterns": [r"tiếng\s+việt", r"tieng\s+viet", r"\bvietnamese\b"],
        "detector": lambda text: bool(VIETNAMESE_DIACRITIC_RE.search(text)),
    },
    {
        "key": "preference:code_focused",
        "value": "User frequently asks for code-focused answers.",
        "patterns": [r"\bcode\b", r"source\s+code", r"mã\s+nguồn", r"viết\s+code", r"lap\s+trinh", r"lập\s+trình"],
    },
]


def auto_source_message_allowed(text):
    text = str(text or "")

    if not text.strip():
        return False

    if looks_like_secret(text):
        return False

    if TEMPORARY_RE.search(text) or SENSITIVE_AUTO_RE.search(text):
        return False

    return True


def auto_pattern_matches(pattern_info, text):
    for pattern in pattern_info.get("patterns", []):
        if re.search(pattern, text, flags=re.IGNORECASE | re.UNICODE):
            return True

    detector = pattern_info.get("detector")
    return bool(detector and detector(text))


def user_message_count(user_id, *, db=None):
    with session_scope(db) as session:
        return int(session.scalar(
            select(func.count(Message.id))
            .join(Conversation)
            .where(and_(Conversation.user_id == user_id, Message.role == "user"))
        ) or 0)


def user_message_rows(user_id, *, db=None):
    with session_scope(db) as session:
        return list(session.execute(
            select(Message.text, Message.created_at)
            .join(Conversation)
            .where(and_(Conversation.user_id == user_id, Message.role == "user"))
            .order_by(Message.created_at.asc(), Message.id.asc())
        ).all())


def auto_memory_confidence(frequency_count):
    return min(0.95, 0.55 + (max(0, int(frequency_count or 0)) * 0.08))


def upsert_auto_memory(session, user_id, pattern_info, frequency_count, last_seen_at):
    now = utc_now()
    memory = session.scalar(
        select(UserMemory)
        .where(and_(UserMemory.user_id == user_id, UserMemory.key == pattern_info["key"], UserMemory.status != "deleted"))
        .order_by(UserMemory.updated_at.desc(), UserMemory.id.desc())
    )

    if not memory:
        memory = UserMemory(
            user_id=user_id,
            key=pattern_info["key"],
            value=pattern_info["value"],
            source="auto_frequency",
            status="active",
            confidence=auto_memory_confidence(frequency_count),
            frequency_count=frequency_count,
            last_seen_at=last_seen_at or now,
            created_at=now,
            updated_at=now,
        )
        session.add(memory)
        session.flush()
        return memory

    memory.value = pattern_info["value"]
    memory.source = "auto_frequency"
    memory.status = "active"
    memory.confidence = auto_memory_confidence(frequency_count)
    memory.frequency_count = frequency_count
    memory.last_seen_at = last_seen_at or now
    memory.updated_at = now
    session.flush()
    return memory


def maybe_run_auto_memory(user_id, *, db=None):
    user_id = str(user_id or "").strip()

    if not user_id:
        return []

    with session_scope(db) as session:
        total_messages = user_message_count(user_id, db=session)

        if total_messages == 0 or total_messages % 20 != 0:
            return []

        pattern_counts = {
            item["key"]: {"pattern": item, "count": 0, "last_seen_at": None}
            for item in AUTO_MEMORY_PATTERNS
        }

        for row in user_message_rows(user_id, db=session):
            text = row.text or ""

            if not auto_source_message_allowed(text):
                continue

            for pattern_info in AUTO_MEMORY_PATTERNS:
                if auto_pattern_matches(pattern_info, text):
                    state = pattern_counts[pattern_info["key"]]
                    state["count"] += 1
                    state["last_seen_at"] = row.created_at

        changed = []

        for state in pattern_counts.values():
            if state["count"] < 3:
                continue

            changed.append(
                upsert_auto_memory(
                    session,
                    user_id,
                    state["pattern"],
                    state["count"],
                    state["last_seen_at"],
                )
            )

        if changed:
            enforce_memory_limit(user_id, db=session)

        session.flush()
        return changed


def get_memory_context(user_id, *, db=None):
    user_id = str(user_id or "").strip()

    if not user_id:
        return {"personalization_text": "", "memories": []}

    with session_scope(db) as session:
        personalization_text = get_personalization_text(user_id, db=session)
        memories = list_active_memories(user_id, db=session)
        return {
            "personalization_text": personalization_text,
            "memories": memories,
        }


def enforce_memory_limit(user_id, max_active=30, *, db=None, protect_id=None):
    user_id = str(user_id or "").strip()
    max_active = max(0, int(max_active or 30))

    with session_scope(db) as session:
        memories = list(session.scalars(
            select(UserMemory)
            .where(and_(UserMemory.user_id == user_id, UserMemory.status == "active"))
            .order_by(
                UserMemory.confidence.asc(),
                UserMemory.updated_at.asc(),
                UserMemory.last_seen_at.asc(),
                UserMemory.id.asc(),
            )
        ).all())

        overflow = len(memories) - max_active

        if overflow <= 0:
            return []

        archived = []

        for memory in memories:
            if overflow <= 0:
                break

            if protect_id and memory.id == protect_id:
                continue

            memory.status = "archived"
            memory.updated_at = utc_now()
            archived.append(memory)
            overflow -= 1

        session.flush()
        return archived
