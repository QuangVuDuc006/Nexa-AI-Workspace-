from datetime import timedelta

from sqlalchemy import func, select

from conftest import login
from services.ai.context_builder import build_conversation_context
from services.database import Conversation, Message, User, UserMemory, db_session, utc_now
from services.memory_service import (
    create_memory,
    detect_explicit_memory,
    list_active_memories,
    maybe_run_auto_memory,
    update_personalization_text,
)


def add_user(db, user_id):
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


def add_conversation(db, user_id, conversation_id):
    conversation = Conversation(
        id=conversation_id,
        user_id=user_id,
        title="Memory test",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(conversation)
    return conversation


def add_user_message(db, conversation_id, index, text):
    timestamp = utc_now() + timedelta(seconds=index)
    message = Message(
        id=f"msg-{conversation_id}-{index}",
        conversation_id=conversation_id,
        role="user",
        text=text,
        provider="fake",
        model="fake",
        feedback="",
        is_error=False,
        is_stopped=False,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(message)
    return message


def active_memory_values(db, user_id):
    return [memory.value for memory in list_active_memories(user_id, db=db)]


def test_personalization_get_put(client):
    token = login(client, uid="personalization-user")

    empty = client.get("/api/personalization")
    assert empty.status_code == 200
    assert empty.get_json()["personalizationText"] == ""

    updated = client.put(
        "/api/personalization",
        json={"personalizationText": "Trả lời bằng tiếng Việt và giải thích từng bước."},
        headers={"X-CSRF-Token": token},
    )

    assert updated.status_code == 200
    assert updated.get_json()["personalizationText"] == "Trả lời bằng tiếng Việt và giải thích từng bước."

    listed = client.get("/api/personalization")
    assert listed.get_json()["personalizationText"] == "Trả lời bằng tiếng Việt và giải thích từng bước."


def test_user_cannot_access_another_users_personalization(client):
    token_a = login(client, uid="personalization-a", email="a@example.com")
    response = client.put(
        "/api/personalization",
        json={"personalizationText": "Only user A should see this."},
        headers={"X-CSRF-Token": token_a},
    )
    assert response.status_code == 200

    login(client, uid="personalization-b", email="b@example.com")
    other = client.get("/api/personalization")

    assert other.status_code == 200
    assert other.get_json()["personalizationText"] == ""
    assert "Only user A" not in other.get_data(as_text=True)


def test_memory_crud(client):
    token = login(client, uid="memory-crud-user")
    created = client.post(
        "/api/memory",
        json={"value": "Tôi đang làm project Nexa AI."},
        headers={"X-CSRF-Token": token},
    )

    assert created.status_code == 201
    memory = created.get_json()["memory"]
    assert memory["value"] == "Tôi đang làm project Nexa AI."

    listed = client.get("/api/memory")
    assert [item["id"] for item in listed.get_json()["memories"]] == [memory["id"]]

    patched = client.patch(
        f"/api/memory/{memory['id']}",
        json={"value": "Tôi đang làm project Nexa AI bằng Flask."},
        headers={"X-CSRF-Token": token},
    )

    assert patched.status_code == 200
    assert patched.get_json()["memory"]["value"] == "Tôi đang làm project Nexa AI bằng Flask."

    deleted = client.delete(f"/api/memory/{memory['id']}", headers={"X-CSRF-Token": token})
    assert deleted.status_code == 200
    assert client.get("/api/memory").get_json()["memories"] == []


def test_user_cannot_access_another_users_memory(client):
    token_a = login(client, uid="memory-a", email="a@example.com")
    created = client.post(
        "/api/memory",
        json={"value": "User A prefers short answers."},
        headers={"X-CSRF-Token": token_a},
    )
    memory_id = created.get_json()["memory"]["id"]

    token_b = login(client, uid="memory-b", email="b@example.com")

    assert client.patch(
        f"/api/memory/{memory_id}",
        json={"value": "User B edit attempt."},
        headers={"X-CSRF-Token": token_b},
    ).status_code == 404
    assert client.delete(f"/api/memory/{memory_id}", headers={"X-CSRF-Token": token_b}).status_code == 404
    assert client.get("/api/memory").get_json()["memories"] == []


def test_explicit_memory_detection_vietnamese():
    assert detect_explicit_memory("nhớ rằng tôi đang làm project Nexa AI") == "tôi đang làm project Nexa AI"
    assert detect_explicit_memory("ghi nhớ là tôi thích ví dụ code ngắn gọn") == "tôi thích ví dụ code ngắn gọn"


def test_explicit_memory_detection_english():
    assert detect_explicit_memory("please remember I prefer concise code examples") == "I prefer concise code examples"
    assert detect_explicit_memory("remember this: I work mostly with Flask") == "I work mostly with Flask"


def test_auto_memory_only_runs_after_20_user_messages(client):
    login(client)
    db = db_session()
    add_user(db, "auto-after-20")
    add_conversation(db, "auto-after-20", "conv-auto-after-20")

    for index in range(19):
        text = "I need help with Flask routes." if index < 3 else f"General question {index}"
        add_user_message(db, "conv-auto-after-20", index, text)

    db.commit()
    assert maybe_run_auto_memory("auto-after-20", db=db) == []
    assert list_active_memories("auto-after-20", db=db) == []

    add_user_message(db, "conv-auto-after-20", 20, "General question 20")
    db.commit()
    changed = maybe_run_auto_memory("auto-after-20", db=db)

    assert len(changed) == 1
    assert active_memory_values(db, "auto-after-20") == ["User often asks about Flask."]


def test_auto_memory_threshold_requires_at_least_3_occurrences(client):
    login(client)
    db = db_session()
    add_user(db, "auto-threshold")
    add_conversation(db, "auto-threshold", "conv-auto-threshold")

    for index in range(20):
        text = "I work with React components." if index < 2 else f"General question {index}"
        add_user_message(db, "conv-auto-threshold", index, text)

    db.commit()

    assert maybe_run_auto_memory("auto-threshold", db=db) == []
    assert list_active_memories("auto-threshold", db=db) == []


def test_auto_memory_does_not_save_one_off_message(client):
    login(client)
    db = db_session()
    add_user(db, "auto-one-off")
    add_conversation(db, "auto-one-off", "conv-auto-one-off")

    for index in range(20):
        text = "Tell me about Nexa AI." if index == 0 else f"General question {index}"
        add_user_message(db, "conv-auto-one-off", index, text)

    db.commit()

    assert maybe_run_auto_memory("auto-one-off", db=db) == []
    assert list_active_memories("auto-one-off", db=db) == []


def test_auto_memory_avoids_sensitive_or_secret_messages(client):
    login(client)
    db = db_session()
    add_user(db, "auto-sensitive")
    add_conversation(db, "auto-sensitive", "conv-auto-sensitive")

    for index in range(20):
        text = "I need Flask help with my password reset token." if index < 4 else f"General question {index}"
        add_user_message(db, "conv-auto-sensitive", index, text)

    db.commit()

    assert maybe_run_auto_memory("auto-sensitive", db=db) == []
    assert list_active_memories("auto-sensitive", db=db) == []


def test_memory_limit_is_enforced_at_30_active_memories(client):
    login(client)
    db = db_session()
    add_user(db, "memory-limit")
    db.commit()

    for index in range(31):
        create_memory(
            "memory-limit",
            "",
            f"Memory number {index:02d} with useful preference detail",
            "manual",
            index / 100,
            1,
            db=db,
        )

    db.commit()
    active = list_active_memories("memory-limit", db=db)
    archived_count = db.scalar(
        select(func.count(UserMemory.id)).where(
            UserMemory.user_id == "memory-limit",
            UserMemory.status == "archived",
        )
    )

    assert len(active) == 30
    assert archived_count == 1
    assert "Memory number 30 with useful preference detail" in [memory.value for memory in active]


def test_context_builder_injects_personalization_and_active_memories(client):
    login(client)
    db = db_session()
    add_user(db, "context-memory")
    add_conversation(db, "context-memory", "conv-context-memory")
    update_personalization_text("context-memory", "Luôn trả lời bằng tiếng Việt.", db=db)
    create_memory("context-memory", "", "User prefers concise code examples.", "manual", 1.0, 1, db=db)
    create_memory("context-memory", "", "Archived memory should not appear.", "manual", 0.2, 1, db=db, status="archived")
    create_memory("context-memory", "", "Deleted memory should not appear.", "manual", 0.2, 1, db=db, status="deleted")
    add_user_message(db, "conv-context-memory", 1, "Explain Flask.")
    db.commit()

    context = build_conversation_context(
        "conv-context-memory",
        "Continue.",
        db=db,
        user_id="context-memory",
    )

    assert "User personalization:\nLuôn trả lời bằng tiếng Việt." in context
    assert "User memories:\n- User prefers concise code examples." in context
    assert "Archived memory should not appear" not in context
    assert "Deleted memory should not appear" not in context
    assert context.index("System:") < context.index("User personalization:")
    assert context.index("User personalization:") < context.index("User memories:")
    assert context.index("User memories:") < context.index("Conversation history:")
    assert context.index("Conversation history:") < context.index("Current user message:")
