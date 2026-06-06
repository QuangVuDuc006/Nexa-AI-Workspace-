from flask import Blueprint, Response, jsonify, stream_with_context

from services.ai.errors import AIProviderError, UpstreamAPIError
from services.auth import login_required
from services.database import db_session
from services.http import error_response
from services.persistence import serialize_conversation, serialize_message, update_assistant_message
from services.security import csrf_protect, rate_limit

from .common import (
    db_user,
    json_stream_event,
    parse_chat_payload,
    prepare_persisted_chat,
    provider_error_response,
    selected_chat_router,
)


def create_chat_blueprint(deps):
    bp = Blueprint("chat_routes", __name__)

    @bp.post("/chat")
    @bp.post("/api/chat")
    @login_required
    @csrf_protect
    @rate_limit("chat_rate_limit_per_window")
    def chat():
        from flask import current_app

        db = db_session()
        user = db_user(db)

        try:
            payload = parse_chat_payload(deps, db, user.id)
            chat_router, provider_id, model = selected_chat_router(deps, db, user.id)
            stream = chat_router.prepare_stream(
                provider_id,
                payload["message"],
                model,
                payload["attachments"],
            )
            payload["provider"] = stream.provider
            payload["model"] = stream.model
            conversation, user_message, assistant_message = prepare_persisted_chat(deps, payload, db, user.id)
            db.commit()
            reply_parts = []

            for chunk in stream.chunks:
                if chunk:
                    reply_parts.append(chunk)

            reply = "".join(reply_parts)
            assistant = update_assistant_message(
                db,
                user.id,
                assistant_message.id,
                reply,
                stream.provider,
                stream.model,
            )
            db.commit()
            return jsonify({
                "reply": reply,
                "provider": stream.provider,
                "model": stream.model,
                "conversation": serialize_conversation(conversation, include_messages=True),
                "user_message": serialize_message(user_message),
                "assistant_message": serialize_message(assistant),
            })
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_request", str(error))
        except PermissionError:
            db.rollback()
            return error_response(403, "forbidden", "You cannot access this conversation.")
        except AIProviderError as error:
            db.rollback()
            return provider_error_response(error)
        except Exception as error:
            db.rollback()
            current_app.logger.exception("AI provider request failed")
            wrapped = UpstreamAPIError("AI provider request failed.", details=str(error))
            return provider_error_response(wrapped)

    @bp.post("/chat/stream")
    @bp.post("/api/chat/stream")
    @login_required
    @csrf_protect
    @rate_limit("chat_rate_limit_per_window")
    def chat_stream():
        db = db_session()
        user = db_user(db)

        try:
            payload = parse_chat_payload(deps, db, user.id)
            chat_router, provider_id, model = selected_chat_router(deps, db, user.id)
            stream = chat_router.prepare_stream(
                provider_id,
                payload["message"],
                model,
                payload["attachments"],
            )
            payload["provider"] = stream.provider
            payload["model"] = stream.model
            conversation, user_message, assistant_message = prepare_persisted_chat(deps, payload, db, user.id)
            db.commit()
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_request", str(error))
        except PermissionError:
            db.rollback()
            return error_response(403, "forbidden", "You cannot access this conversation.")
        except AIProviderError as error:
            db.rollback()
            return provider_error_response(error)

        def generate():
            from flask import current_app

            reply_parts = []

            try:
                yield json_stream_event({
                    "type": "meta",
                    "provider": stream.provider,
                    "model": stream.model,
                    "conversationId": conversation.id,
                    "userMessageId": user_message.id,
                    "assistantMessageId": assistant_message.id,
                    "conversation": serialize_conversation(conversation, include_messages=True),
                })

                for text_chunk in stream.chunks:
                    if text_chunk:
                        reply_parts.append(text_chunk)
                        yield json_stream_event({"type": "token", "text": text_chunk})

                persisted_db = db_session()
                update_assistant_message(
                    persisted_db,
                    user.id,
                    assistant_message.id,
                    "".join(reply_parts),
                    stream.provider,
                    stream.model,
                )
                persisted_db.commit()
                yield json_stream_event({
                    "type": "done",
                    "provider": stream.provider,
                    "model": stream.model,
                    "assistantMessageId": assistant_message.id,
                })
            except GeneratorExit:
                persisted_db = db_session()
                update_assistant_message(
                    persisted_db,
                    user.id,
                    assistant_message.id,
                    "".join(reply_parts) or "Generation stopped.",
                    stream.provider,
                    stream.model,
                    is_stopped=True,
                )
                persisted_db.commit()
                raise
            except AIProviderError as error:
                current_app.logger.warning("AI provider streaming failed", extra={"code": error.code, "provider": error.provider})
                persisted_db = db_session()
                update_assistant_message(
                    persisted_db,
                    user.id,
                    assistant_message.id,
                    error.message,
                    stream.provider,
                    stream.model,
                    is_error=True,
                )
                persisted_db.commit()
                yield json_stream_event({"type": "error", **error.to_dict()})
            except Exception as error:
                current_app.logger.exception("AI provider streaming request failed")
                wrapped = UpstreamAPIError("AI provider request failed.", details=str(error))
                persisted_db = db_session()
                update_assistant_message(
                    persisted_db,
                    user.id,
                    assistant_message.id,
                    wrapped.message,
                    stream.provider,
                    stream.model,
                    is_error=True,
                )
                persisted_db.commit()
                yield json_stream_event({"type": "error", **wrapped.to_dict()})

        return Response(stream_with_context(generate()), mimetype="application/x-ndjson")

    return bp
