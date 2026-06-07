from datetime import timedelta
from types import SimpleNamespace

from conftest import login
from services.ai.context_builder import build_conversation_context
from services.ai.conversation_summary import summarize_conversation_now
from services.database import Conversation, Message, User, db_session, utc_now


def add_user(db, user_id="summary-user"):
    user = User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=user_id,
        photo_url="",
        auth_provider="firebase",
        is_admin=False,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(user)
    return user


def add_conversation(db, user_id="summary-user", conversation_id="conv-summary"):
    conversation = Conversation(
        id=conversation_id,
        user_id=user_id,
        title="Summary test",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(conversation)
    return conversation


def add_message(db, conversation_id, index, role=None, text=None):
    timestamp = utc_now() + timedelta(seconds=index)
    message = Message(
        id=f"msg-summary-{index}",
        conversation_id=conversation_id,
        role=role or ("user" if index % 2 == 0 else "ai"),
        text=text or f"summary-history-message-{index:02d}",
        provider="fake",
        model="fake-model",
        feedback="",
        is_error=False,
        is_stopped=False,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(message)
    return message


def seed_long_conversation(db, user_id="summary-user", conversation_id="conv-summary", message_count=25):
    add_user(db, user_id)
    conversation = add_conversation(db, user_id, conversation_id)

    for index in range(message_count):
        add_message(db, conversation_id, index)

    db.commit()
    return conversation


def test_conversation_summary_updates_old_messages_and_context(client):
    login(client)
    db = db_session()
    conversation = seed_long_conversation(db)
    prompts = []

    class FakeRouter:
        def generate(self, provider_id, message, model=None, attachments=None):
            prompts.append(message)
            return SimpleNamespace(reply="User discussed the early summary-history-message items and wants continuity.")

    result = summarize_conversation_now(db, "summary-user", conversation.id, FakeRouter(), "fake", "fake-model")
    db.refresh(conversation)

    assert result["status"] == "updated"
    assert conversation.summary_message_count == 13
    assert "wants continuity" in conversation.summary
    assert prompts
    assert "summary-history-message-00" in prompts[0]
    assert "summary-history-message-12" in prompts[0]
    assert "summary-history-message-13" not in prompts[0]

    context = build_conversation_context(
        conversation.id,
        "Continue from the old plan.",
        db=db,
        user_id="summary-user",
    )

    assert "Conversation summary:" in context
    assert "wants continuity" in context
    assert "Current user message:\nContinue from the old plan." in context


def test_conversation_summary_failure_is_non_blocking(client):
    login(client)
    db = db_session()
    conversation = seed_long_conversation(db, conversation_id="conv-summary-fail")

    class BrokenRouter:
        def generate(self, provider_id, message, model=None, attachments=None):
            raise RuntimeError("summary provider failed")

    result = summarize_conversation_now(db, "summary-user", conversation.id, BrokenRouter(), "fake", "fake-model")
    db.refresh(conversation)

    assert result["status"] == "failed"
    assert conversation.summary == ""
    assert conversation.summary_message_count == 0
