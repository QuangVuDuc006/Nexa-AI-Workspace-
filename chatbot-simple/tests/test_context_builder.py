from datetime import timedelta
from types import SimpleNamespace

from conftest import login
from services.ai.context_builder import (
    MAX_CONTEXT_LENGTH,
    build_conversation_context,
)
from services.database import Attachment, Conversation, Message, User, db_session, utc_now


def add_user(db, user_id="context-user"):
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


def add_conversation(db, user_id="context-user", conversation_id="conv-context"):
    conversation = Conversation(
        id=conversation_id,
        user_id=user_id,
        title="Context test",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(conversation)
    return conversation


def add_message(db, conversation_id, index, role, text):
    timestamp = utc_now() + timedelta(seconds=index)
    message = Message(
        id=f"msg-context-{index}",
        conversation_id=conversation_id,
        role=role,
        text=text,
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


def test_context_for_new_conversation_has_empty_history(client):
    login(client)
    context = build_conversation_context("conv-new", "Start a new explanation.")

    assert "Conversation history:\n[No previous messages.]" in context
    assert "Current user message:\nStart a new explanation." in context
    assert len(context) <= MAX_CONTEXT_LENGTH


def test_context_for_existing_conversation_preserves_roles_and_order(client):
    login(client)
    db = db_session()
    add_user(db)
    add_conversation(db)
    add_message(db, "conv-context", 1, "user", "Explain this algorithm.")
    add_message(db, "conv-context", 2, "ai", "Step 1 parses the input.")
    db.commit()

    context = build_conversation_context(
        "conv-context",
        "Explain the previous step in more detail.",
        db=db,
        user_id="context-user",
    )

    user_index = context.index("User: Explain this algorithm.")
    assistant_index = context.index("Assistant: Step 1 parses the input.")
    current_index = context.index("Current user message:\nExplain the previous step in more detail.")

    assert user_index < assistant_index < current_index


def test_context_instructs_reference_resolution_for_vietnamese_followups(client):
    login(client)
    context = build_conversation_context("conv-new", "làm tiếp")

    assert "Resolve references in the current user message" in context
    assert "'nó'" in context
    assert "'cái đó'" in context
    assert "'ý trên'" in context
    assert "'bước trước'" in context
    assert "'làm tiếp'" in context


def test_context_truncates_long_conversation_to_newest_messages(client):
    login(client)
    db = db_session()
    add_user(db)
    add_conversation(db)

    for index in range(15):
        add_message(db, "conv-context", index, "user" if index % 2 == 0 else "ai", f"history-message-{index:02d}")

    db.commit()
    context = build_conversation_context("conv-context", "Continue.", db=db, user_id="context-user")

    assert "history-message-00" not in context
    assert "history-message-01" not in context
    assert "history-message-02" not in context
    assert "history-message-03" in context
    assert "history-message-14" in context


def test_context_always_includes_current_message_with_small_limit(client):
    login(client)
    context = build_conversation_context(
        "conv-new",
        "CURRENT-NEVER-OMIT " + ("x" * 1000),
        max_context_length=220,
    )

    assert len(context) <= 220
    assert "CURRENT-NEVER-OMIT" in context
    assert "Current user message:" in context


def test_context_includes_recent_file_content_with_limit(client):
    login(client)
    db = db_session()
    add_user(db)
    add_conversation(db)
    message = add_message(db, "conv-context", 1, "user", "Use this file.")
    db.flush()
    db.add(
        Attachment(
            id="att-context",
            message_id=message.id,
            kind="text",
            name="notes.txt",
            mime_type="text/plain",
            size=25_000,
            content_text="A" * 25_000,
            storage_path="",
            created_at=utc_now(),
        )
    )
    db.commit()

    context = build_conversation_context("conv-context", "Summarize it.", db=db, user_id="context-user")

    assert "[Attachment: notes.txt (text/plain)]" in context
    assert context.count("A") <= 20_000
    assert "Current user message:\nSummarize it." in context


def test_pythagoras_followup_context_reaches_normal_chat_provider(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            return SimpleNamespace(
                provider="fake",
                model="fake-model",
                chunks=iter(["Đây là một bài toán liên quan."]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="pythagoras-user")
        db = db_session()
        add_user(db, user_id="pythagoras-user")
        add_conversation(db, user_id="pythagoras-user", conversation_id="conv-pythagoras")
        add_message(db, "conv-pythagoras", 1, "user", "giải thích định lý Pythagoras")
        add_message(
            db,
            "conv-pythagoras",
            2,
            "ai",
            "Định lý Pythagoras nói rằng trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông.",
        )
        db.commit()

        raw_followup = "cho 1 bài toán liên quan đến nó"
        response = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-pythagoras",
                "conversationTitle": "Pythagoras",
                "userMessageId": "msg-pythagoras-user-2",
                "assistantMessageId": "msg-pythagoras-ai-2",
                "message": raw_followup,
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        assert routed_messages
        provider_input = routed_messages[0]
        assert provider_input != raw_followup
        assert "Conversation history:" in provider_input
        assert "Assistant: Định lý Pythagoras nói rằng" in provider_input
        assert f"Current user message:\n{raw_followup}" in provider_input


def test_second_request_with_same_conversation_includes_first_assistant_response(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            reply = "First assistant answer about the topic." if len(routed_messages) == 1 else "Second answer using memory."
            return SimpleNamespace(
                provider="fake",
                model="fake-model",
                chunks=iter([reply]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="sequential-user")
        first = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-sequential",
                "conversationTitle": "Sequential",
                "userMessageId": "msg-sequential-user-1",
                "assistantMessageId": "msg-sequential-ai-1",
                "message": "Explain this topic.",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/chat",
            json={
                "conversationId": "conv-sequential",
                "conversationTitle": "Sequential",
                "userMessageId": "msg-sequential-user-2",
                "assistantMessageId": "msg-sequential-ai-2",
                "message": "give an example related to it",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert second.status_code == 200
        assert "Assistant: First assistant answer about the topic." in routed_messages[1]
        assert "Current user message:\ngive an example related to it" in routed_messages[1]


def test_quick_sort_generic_followup_context_includes_history(client):
    login(client)
    db = db_session()
    add_user(db, user_id="quick-sort-user")
    add_conversation(db, user_id="quick-sort-user", conversation_id="conv-quick-sort")
    add_message(db, "conv-quick-sort", 1, "user", "Explain Quick Sort.")
    add_message(
        db,
        "conv-quick-sort",
        2,
        "ai",
        "Quick Sort partitions an array around a pivot, then recursively sorts the left and right partitions.",
    )
    db.commit()

    context = build_conversation_context(
        "conv-quick-sort",
        "so sánh nó với Merge Sort",
        db=db,
        user_id="quick-sort-user",
    )

    assert "Assistant: Quick Sort partitions an array around a pivot" in context
    assert "Current user message:\nso sánh nó với Merge Sort" in context
    assert context.index("Assistant: Quick Sort") < context.index("Current user message:")


def test_streaming_chat_sends_follow_up_context(app_module, monkeypatch):
    routed_messages = []

    class FakeRouter:
        def __init__(self, *args, **kwargs):
            pass

        def prepare_stream(self, provider_id, message, model=None, attachments=None):
            routed_messages.append(message)
            reply = "Step 1 parses the input." if len(routed_messages) == 1 else "Continuing from step 1."
            return SimpleNamespace(
                provider="fake",
                model="fake-model",
                chunks=iter([reply]),
            )

    monkeypatch.setattr(app_module, "ProviderRouter", FakeRouter)
    app = app_module.create_app()
    app.config.update(TESTING=True)

    with app.test_client() as client:
        token = login(client, uid="follow-up-user")

        first = client.post(
            "/api/chat/stream",
            json={
                "conversationId": "conv-follow-up",
                "conversationTitle": "Follow up",
                "userMessageId": "msg-follow-up-user-1",
                "assistantMessageId": "msg-follow-up-ai-1",
                "message": "Explain this algorithm.",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )
        assert first.status_code == 200
        assert b"Step 1 parses the input." in first.data

        second = client.post(
            "/api/chat/stream",
            json={
                "conversationId": "conv-follow-up",
                "conversationTitle": "Follow up",
                "userMessageId": "msg-follow-up-user-2",
                "assistantMessageId": "msg-follow-up-ai-2",
                "message": "Explain the previous step in more detail.",
                "attachments": [],
            },
            headers={"X-CSRF-Token": token},
        )

        assert second.status_code == 200
        follow_up_context = routed_messages[-1]
        assert "User: Explain this algorithm." in follow_up_context
        assert "Assistant: Step 1 parses the input." in follow_up_context
        assert "Current user message:\nExplain the previous step in more detail." in follow_up_context
