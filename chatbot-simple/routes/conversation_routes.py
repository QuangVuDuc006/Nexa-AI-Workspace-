from flask import Blueprint, jsonify, request

from services.auth import login_required
from services.database import Message, db_session, utc_now
from services.http import error_response
from services.persistence import (
    clean_client_id,
    clear_conversations_for_user,
    clean_title,
    delete_conversation_for_user,
    delete_message_for_user,
    ensure_conversation,
    get_conversation_for_user,
    list_user_conversations,
    persist_attachments,
    serialize_conversation,
    serialize_message,
    update_feedback,
)
from services.security import csrf_protect, rate_limit

from .common import db_user, sanitize_message_text


def create_conversation_blueprint(deps):
    bp = Blueprint("conversation_routes", __name__)

    @bp.get("/api/conversations")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def conversations_list():
        db = db_session()
        user = db_user(db)
        result = list_user_conversations(
            db,
            user.id,
            limit=request.args.get("limit", 50),
            cursor=request.args.get("cursor"),
        )
        db.commit()
        return jsonify(result)

    @bp.post("/api/conversations")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def conversations_create():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)
        conversation = ensure_conversation(
            db,
            user.id,
            clean_client_id(data.get("id"), "conv"),
            data.get("title") or "New chat",
        )
        db.commit()
        return jsonify({"conversation": serialize_conversation(conversation, include_messages=True)}), 201

    @bp.delete("/api/conversations")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def conversations_clear():
        db = db_session()
        user = db_user(db)
        clear_conversations_for_user(db, user.id)
        conversation = ensure_conversation(db, user.id, title="New chat")
        db.commit()
        return jsonify({"conversation": serialize_conversation(conversation, include_messages=True)})

    @bp.post("/api/conversations/import")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def conversations_import():
        data = request.get_json(silent=True) or {}
        conversations = data.get("conversations") if isinstance(data.get("conversations"), list) else []
        imported = 0
        db = db_session()
        user = db_user(db)

        for raw_conversation in conversations[:100]:
            if not isinstance(raw_conversation, dict):
                continue

            conversation = ensure_conversation(
                db,
                user.id,
                raw_conversation.get("id"),
                raw_conversation.get("title") or "Imported chat",
            )
            existing_ids = {message.id for message in conversation.messages}

            for raw_message in (raw_conversation.get("messages") or [])[:1000]:
                if not isinstance(raw_message, dict) or raw_message.get("id") in existing_ids:
                    continue

                role = "user" if raw_message.get("role") == "user" else "ai"
                message = Message(
                    id=clean_client_id(raw_message.get("id"), "msg"),
                    conversation_id=conversation.id,
                    role=role,
                    text=sanitize_message_text(raw_message.get("text")),
                    provider=str(raw_message.get("provider") or ""),
                    model=str(raw_message.get("model") or ""),
                    feedback=str(raw_message.get("feedback") or ""),
                    is_error=bool(raw_message.get("isError")),
                    is_stopped=bool(raw_message.get("isStopped")),
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                db.add(message)
                persist_attachments(db, message, raw_message.get("attachments") or [], deps.settings, user.id)
                imported += 1

            conversation.updated_at = utc_now()

        db.commit()
        return jsonify({"imported": imported})

    @bp.get("/api/conversations/<conversation_id>")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def conversations_get(conversation_id):
        db = db_session()
        user = db_user(db)
        conversation = get_conversation_for_user(db, user.id, conversation_id)

        if not conversation:
            return error_response(404, "not_found", "Conversation was not found.")

        db.commit()
        return jsonify({"conversation": serialize_conversation(conversation, include_messages=True)})

    @bp.patch("/api/conversations/<conversation_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def conversations_update(conversation_id):
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)
        conversation = get_conversation_for_user(db, user.id, conversation_id)

        if not conversation:
            return error_response(404, "not_found", "Conversation was not found.")

        conversation.title = clean_title(data.get("title"))
        conversation.updated_at = utc_now()
        db.commit()
        return jsonify({"conversation": serialize_conversation(conversation, include_messages=True)})

    @bp.delete("/api/conversations/<conversation_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def conversations_delete(conversation_id):
        db = db_session()
        user = db_user(db)

        try:
            delete_conversation_for_user(db, user.id, conversation_id)
        except ValueError:
            return error_response(404, "not_found", "Conversation was not found.")

        db.flush()
        if not list_user_conversations(db, user.id, limit=1)["conversations"]:
            ensure_conversation(db, user.id, title="New chat")

        db.commit()
        return jsonify({"deleted": True})

    @bp.patch("/api/messages/<message_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def messages_update(message_id):
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            message = update_feedback(db, user.id, message_id, str(data.get("feedback") or ""))
        except ValueError as error:
            return error_response(404, "not_found", str(error))

        db.commit()
        return jsonify({"message": serialize_message(message)})

    @bp.delete("/api/messages/<message_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def messages_delete(message_id):
        db = db_session()
        user = db_user(db)

        try:
            delete_message_for_user(db, user.id, message_id)
        except ValueError:
            return error_response(404, "not_found", "Message was not found.")

        db.commit()
        return jsonify({"deleted": True})

    return bp
