import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, redirect, render_template, request, send_file, send_from_directory, session, stream_with_context, url_for
from sqlalchemy import text


load_dotenv()

from services.ai.errors import AIProviderError, UpstreamAPIError
from services.ai.connections import (
    activate_connection,
    get_active_connection,
    get_connection,
    list_connections,
    runtime_config,
    save_connection,
    serialize_connection,
)
from services.ai.credentials import CredentialCipher
from services.ai.detector import detect_models
from services.ai.models import normalize_models
from services.ai.provider_registry import provider_catalog
from services.ai.provider_router import ProviderRouter
from services.app_config import load_settings
from services.auth import current_user, is_admin_identity, login_required, normalize_email
from services.database import Message, db_session, init_database, utc_now
from services.firebase_admin_auth import FirebaseVerificationError, verify_firebase_id_token
from services.http import error_response
from services.logging_config import configure_logging
from services.persistence import (
    clear_conversations_for_user,
    clean_client_id,
    clean_title,
    delete_conversation_for_user,
    delete_message_for_user,
    ensure_conversation,
    ensure_message,
    get_attachment_for_user,
    get_conversation_for_user,
    list_user_conversations,
    normalize_attachments_for_provider,
    persist_attachments,
    audit_log,
    serialize_conversation,
    serialize_message,
    update_assistant_message,
    update_feedback,
    upsert_user,
)
from services.security import client_ip, csrf_protect, get_csrf_token, install_security_hooks, rate_limit
from services.uploads import UploadError, process_uploaded_file


MAX_ATTACHMENTS = 4
FIREBASE_WEB_CONFIG_KEYS = {
    "apiKey": "VITE_FIREBASE_API_KEY",
    "authDomain": "VITE_FIREBASE_AUTH_DOMAIN",
    "projectId": "VITE_FIREBASE_PROJECT_ID",
    "storageBucket": "VITE_FIREBASE_STORAGE_BUCKET",
    "messagingSenderId": "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "appId": "VITE_FIREBASE_APP_ID",
}

APP_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = APP_ROOT.parent
LANDING_DIST = PROJECT_ROOT / "chatbot-dashboard" / "dist"


def get_firebase_web_config():
    return {key: os.getenv(env_name, "") for key, env_name in FIREBASE_WEB_CONFIG_KEYS.items()}


def firebase_auth_configured():
    return all(get_firebase_web_config().values())


def provider_error_response(error):
    return jsonify(error.to_dict()), error.status_code


def json_stream_event(payload):
    return f"{json.dumps(payload, ensure_ascii=False)}\n"


def sanitize_message_text(value):
    text_value = str(value or "").replace("\x00", "").strip()

    if len(text_value) > 40_000:
        text_value = text_value[:40_000]

    return text_value


def create_app():
    settings = load_settings(APP_ROOT)

    app = Flask(__name__)
    app.config["APP_SETTINGS"] = settings
    app.config["SECRET_KEY"] = settings.secret_key
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SECURE"] = settings.session_cookie_secure
    app.config["SESSION_COOKIE_SAMESITE"] = settings.session_cookie_samesite
    app.config["MAX_CONTENT_LENGTH"] = settings.max_upload_bytes
    settings.upload_storage_dir.mkdir(parents=True, exist_ok=True)
    configure_logging(app)

    init_database(app, settings.database_url)
    install_security_hooks(app)
    ai_router = ProviderRouter()
    credential_cipher = CredentialCipher(settings.provider_credential_key)

    def db_user(db):
        user = current_user()

        if not user:
            return None

        return upsert_user(db, user)

    def fallback_provider():
        provider = ai_router.get_provider()
        configured = provider.is_configured()
        models = normalize_models(provider.available_models(), provider.provider_id) if configured else []
        return {
            "id": f"environment:{provider.provider_id}",
            "providerType": provider.provider_id,
            "provider": provider.label,
            "label": provider.label,
            "baseUrl": "",
            "selectedModel": provider.default_model if configured else "",
            "models": [model.to_dict() for model in models],
            "connectionStatus": "environment" if configured else "not_configured",
            "isActive": True,
            "hasApiKey": configured,
            "maskedApiKey": "",
            "requiresApiKey": True,
            "isEnvironment": True,
        }

    def provider_settings_response(db, user_id):
        connections = list_connections(db, user_id)
        active = next((connection for connection in connections if connection.is_active), None)
        active_provider = serialize_connection(active) if active else fallback_provider()
        return {
            "providers": [serialize_connection(connection) for connection in connections],
            "activeProvider": active_provider,
            "activeProviderId": active.id if active else "",
            "supportedProviders": provider_catalog(),
        }

    def provider_request_values(db, user_id, data):
        connection_id = str(data.get("connectionId") or data.get("connection_id") or "").strip()
        connection = get_connection(db, user_id, connection_id) if connection_id else None
        api_key = str(data.get("apiKey") or data.get("api_key") or "").strip()

        if not api_key and connection:
            api_key = credential_cipher.decrypt(connection.encrypted_api_key)

        if len(api_key) > 16_000:
            raise ValueError("API key is too long.")

        return {
            "connection": connection,
            "provider_type": str(
                data.get("providerType")
                or data.get("provider_type")
                or (connection.provider_type if connection else "auto")
            ).strip().lower(),
            "api_key": api_key,
            "base_url": str(
                data.get("baseUrl")
                or data.get("base_url")
                or (connection.base_url if connection else "")
            ).strip(),
        }

    def selected_chat_router(db, user_id):
        connection = get_active_connection(db, user_id)

        if not connection:
            return ai_router, None, None

        config = runtime_config(connection, credential_cipher, settings.ai_request_timeout)
        return ProviderRouter(config), connection.provider_type, connection.selected_model

    def connection_status_for_error(error):
        return {
            "invalid_api_key": "Invalid API Key",
            "api_timeout": "Timeout",
            "invalid_provider": "Provider Not Supported",
            "missing_provider_config": "Missing Base URL",
            "upstream_api_error": "Network Error",
            "api_rate_limit": "Rate Limited",
            "invalid_model": "Unsupported Model",
        }.get(error.code, "Provider Offline")

    def parse_chat_payload(db, user_id):
        data = request.get_json(silent=True) or {}
        user_message = sanitize_message_text(data.get("message", ""))
        raw_attachments = data.get("attachments", [])

        if not isinstance(raw_attachments, list):
            raise ValueError("Attachments must be a list.")

        if len(raw_attachments) > MAX_ATTACHMENTS:
            raise ValueError(f"You can attach up to {MAX_ATTACHMENTS} files.")

        attachments = normalize_attachments_for_provider(db, user_id, raw_attachments, settings)

        if not user_message and not attachments:
            raise ValueError("Message is required.")

        if not user_message:
            user_message = "Please analyze the attached file."

        return {
            "message": user_message,
            "attachments": attachments,
            "conversation_id": clean_client_id(data.get("conversationId") or data.get("conversation_id"), "conv"),
            "conversation_title": clean_title(data.get("conversationTitle") or data.get("conversation_title") or user_message[:80]),
            "user_message_id": clean_client_id(data.get("userMessageId") or data.get("user_message_id"), "msg"),
            "assistant_message_id": clean_client_id(data.get("assistantMessageId") or data.get("assistant_message_id"), "msg"),
        }

    def prepare_persisted_chat(payload, db, user_id):
        conversation = ensure_conversation(
            db,
            user_id,
            payload["conversation_id"],
            payload["conversation_title"],
        )
        was_empty = len(conversation.messages) == 0
        user_message = ensure_message(
            db,
            conversation,
            payload["user_message_id"],
            "user",
            payload["message"],
            payload["provider"] or "",
            payload["model"] or "",
            payload["attachments"],
            settings,
        )
        assistant_message = ensure_message(
            db,
            conversation,
            payload["assistant_message_id"],
            "ai",
            "",
            payload["provider"] or "",
            payload["model"] or "",
        )

        if was_empty or conversation.title == "New chat":
            conversation.title = clean_title(payload["conversation_title"])

        conversation.updated_at = utc_now()
        return conversation, user_message, assistant_message

    @app.context_processor
    def inject_auth_context():
        return {
            "current_user": current_user(),
            "firebase_auth_enabled": firebase_auth_configured(),
            "csrf_token": get_csrf_token(),
        }

    @app.get("/")
    def landing():
        if (LANDING_DIST / "index.html").exists():
            return send_from_directory(LANDING_DIST, "index.html")

        return render_template("landing.html")

    @app.get("/assets/<path:filename>")
    def landing_assets(filename):
        return send_from_directory(LANDING_DIST / "assets", filename)

    @app.get("/favicon.ico")
    def favicon():
        return send_file(APP_ROOT / "static" / "assets" / "Hover.png", mimetype="image/png")

    @app.get("/login")
    def login():
        if current_user():
            return redirect(request.args.get("next") or url_for("chat_page"))

        return render_template("login.html", error=request.args.get("error"))

    @app.get("/register")
    def register():
        if current_user():
            return redirect(url_for("chat_page"))

        return render_template("register.html", error=request.args.get("error"))

    @app.get("/logout")
    def logout():
        return redirect(url_for("landing"))

    @app.post("/logout")
    @csrf_protect
    def logout_post():
        session.clear()
        return redirect(url_for("landing"))

    @app.get("/api/csrf")
    def csrf_token():
        return jsonify({"csrfToken": get_csrf_token()})

    @app.get("/api/firebase/config")
    def firebase_config():
        config = get_firebase_web_config()
        missing = [
            env_name
            for env_name in FIREBASE_WEB_CONFIG_KEYS.values()
            if not os.getenv(env_name)
        ]
        return jsonify({"configured": len(missing) == 0, "config": config, "missing": missing})

    @app.post("/api/firebase/session")
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def firebase_session():
        data = request.get_json(silent=True) or {}
        token = str(data.get("idToken") or "").strip()

        try:
            payload = verify_firebase_id_token(token)
        except FirebaseVerificationError as error:
            message = str(error)
            app.logger.warning(
                "Firebase authentication failed",
                extra={"ip": client_ip(), "error": message},
            )
            return error_response(401, "invalid_firebase_token", message, details=message)

        uid = str(payload.get("uid") or payload.get("user_id") or payload.get("sub") or "").strip()
        email = normalize_email(payload.get("email"))
        display_name = str(payload.get("name") or email.split("@")[0] or "Firebase user").strip()
        photo_url = str(payload.get("picture") or "").strip()

        if not uid:
            return error_response(401, "invalid_firebase_token", "Verified Firebase token did not include a user id.")

        user = {
            "id": uid,
            "email": email,
            "display_name": display_name,
            "photo_url": photo_url,
            "auth_provider": "firebase",
            "is_admin": is_admin_identity(uid, email, settings),
        }
        db = db_session()
        upsert_user(db, user)
        db.commit()
        session.clear()
        session["user"] = user
        get_csrf_token()
        return jsonify({"authenticated": True, "user": user, "csrfToken": session["csrf_token"]})

    @app.post("/api/firebase/logout")
    @csrf_protect
    def firebase_logout():
        session.clear()
        return jsonify({"authenticated": False})

    @app.get("/chat")
    @login_required
    def chat_page():
        return render_template("index.html")

    @app.get("/api/session")
    @login_required
    def session_info():
        user = current_user()
        return jsonify({"authenticated": True, "user": user, "csrfToken": get_csrf_token()})

    @app.get("/api/conversations")
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

    @app.post("/api/conversations")
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

    @app.delete("/api/conversations")
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

    @app.post("/api/conversations/import")
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
                persist_attachments(db, message, raw_message.get("attachments") or [], settings, user.id)
                imported += 1

            conversation.updated_at = utc_now()

        db.commit()
        return jsonify({"imported": imported})

    @app.get("/api/conversations/<conversation_id>")
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

    @app.patch("/api/conversations/<conversation_id>")
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

    @app.delete("/api/conversations/<conversation_id>")
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

    @app.patch("/api/messages/<message_id>")
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

    @app.delete("/api/messages/<message_id>")
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

    @app.post("/api/uploads")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def upload_file():
        if "file" not in request.files:
            return error_response(400, "missing_file", "Upload a file.")

        try:
            attachment = process_uploaded_file(request.files["file"], settings)
        except UploadError as error:
            app.logger.warning("Upload failed", extra={"code": error.code, "ip": client_ip()})
            return error_response(error.status_code, error.code, str(error))

        return jsonify({"attachment": attachment})

    @app.get("/api/attachments/<attachment_id>/content")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def attachment_content(attachment_id):
        db = db_session()
        user = db_user(db)
        attachment = get_attachment_for_user(db, user.id, attachment_id)

        if not attachment or attachment.kind != "image":
            return error_response(404, "not_found", "Attachment was not found.")

        path = Path(attachment.storage_path)

        if not path.exists():
            return error_response(404, "not_found", "Attachment content is unavailable.")

        return send_file(path, mimetype=attachment.mime_type, max_age=300)

    @app.get("/api/providers")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def providers_list():
        db = db_session()
        user = db_user(db)
        payload = provider_settings_response(db, user.id)
        db.commit()
        return jsonify(payload)

    @app.get("/api/models")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def models_list():
        db = db_session()
        user = db_user(db)
        payload = provider_settings_response(db, user.id)
        active = payload["activeProvider"]
        db.commit()
        return jsonify({
            "provider": active.get("provider"),
            "providerType": active.get("providerType"),
            "models": active.get("models", []),
            "defaultModel": active.get("selectedModel", ""),
            "active": active.get("selectedModel", ""),
        })

    @app.post("/api/providers/detect-models")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_detect_models():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            values = provider_request_values(db, user.id, data)
            result = detect_models(
                values["provider_type"],
                values["api_key"],
                values["base_url"],
                settings.ai_request_timeout,
            )
            audit_log(
                db,
                user.id,
                "provider_models_detected",
                "provider",
                result.provider_id,
                client_ip(),
                {"model_count": len(result.models), "connection_status": result.connection_status},
            )
            db.commit()
            return jsonify(result.to_dict())
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_request", str(error))
        except AIProviderError as error:
            db.rollback()
            return jsonify({
                "success": False,
                "status": connection_status_for_error(error),
                **error.to_dict(),
            }), error.status_code

    @app.post("/api/providers/test")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_test():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            values = provider_request_values(db, user.id, data)
            result = detect_models(
                values["provider_type"],
                values["api_key"],
                values["base_url"],
                settings.ai_request_timeout,
            )
            if result.connection_status == "manual":
                db.rollback()
                return jsonify({
                    "success": False,
                    "status": "Provider Not Supported",
                    "error": "Could not verify this provider. Enter a valid Base URL and try again.",
                    "code": "provider_not_verified",
                }), 422

            db.commit()
            return jsonify({
                "success": True,
                "status": "Connected",
                "provider": result.provider_label,
                "providerType": result.provider_id,
                "modelCount": len(result.models),
            })
        except ValueError as error:
            db.rollback()
            return jsonify({"success": False, "status": "Missing Base URL", "error": str(error)}), 422
        except AIProviderError as error:
            db.rollback()
            return jsonify({
                "success": False,
                "status": connection_status_for_error(error),
                "error": error.message,
                "code": error.code,
            }), error.status_code

    @app.post("/api/providers")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_save():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            connection = save_connection(
                db,
                user.id,
                credential_cipher,
                connection_id=str(data.get("connectionId") or ""),
                provider_type=str(data.get("providerType") or data.get("provider") or "").strip().lower(),
                api_key=str(data.get("apiKey") or "").strip(),
                base_url=str(data.get("baseUrl") or "").strip(),
                selected_model=str(data.get("selectedModel") or data.get("model") or "").strip(),
                models=data.get("models") if isinstance(data.get("models"), list) else [],
                activate=data.get("activate") is not False,
            )
            audit_log(
                db,
                user.id,
                "provider_connection_saved",
                "provider_connection",
                connection.id,
                client_ip(),
                {
                    "provider_type": connection.provider_type,
                    "model": connection.selected_model,
                    "api_key_changed": bool(data.get("apiKey")),
                },
            )
            db.commit()
            payload = provider_settings_response(db, user.id)
            payload["savedProvider"] = serialize_connection(connection)
            return jsonify(payload), 201
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_provider_settings", str(error))

    @app.patch("/api/providers/<connection_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_update(connection_id):
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)
        connection = get_connection(db, user.id, connection_id)

        if not connection:
            return error_response(404, "not_found", "Provider connection was not found.")

        selected_model = str(data.get("selectedModel") or data.get("model") or "").strip()
        if not selected_model:
            return error_response(422, "invalid_model", "Select or enter a model.")

        connection.selected_model = selected_model[:240]
        connection.updated_at = utc_now()

        if data.get("activate") is not False:
            activate_connection(db, user.id, connection)

        audit_log(
            db,
            user.id,
            "provider_model_selected",
            "provider_connection",
            connection.id,
            client_ip(),
            {"provider_type": connection.provider_type, "model": connection.selected_model},
        )
        db.commit()
        return jsonify(provider_settings_response(db, user.id))

    @app.post("/api/providers/<connection_id>/activate")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_activate(connection_id):
        db = db_session()
        user = db_user(db)
        connection = get_connection(db, user.id, connection_id)

        if not connection:
            return error_response(404, "not_found", "Provider connection was not found.")

        activate_connection(db, user.id, connection)
        audit_log(
            db,
            user.id,
            "provider_connection_activated",
            "provider_connection",
            connection.id,
            client_ip(),
            {"provider_type": connection.provider_type, "model": connection.selected_model},
        )
        db.commit()
        return jsonify(provider_settings_response(db, user.id))

    @app.delete("/api/providers/<connection_id>")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_delete(connection_id):
        db = db_session()
        user = db_user(db)
        connection = get_connection(db, user.id, connection_id)

        if not connection:
            return error_response(404, "not_found", "Provider connection was not found.")

        was_active = connection.is_active
        db.delete(connection)
        db.flush()

        if was_active:
            remaining = list_connections(db, user.id)
            if remaining:
                activate_connection(db, user.id, remaining[0])

        audit_log(
            db,
            user.id,
            "provider_connection_deleted",
            "provider_connection",
            connection_id,
            client_ip(),
        )
        db.commit()
        return jsonify(provider_settings_response(db, user.id))

    @app.post("/chat")
    @app.post("/api/chat")
    @login_required
    @csrf_protect
    @rate_limit("chat_rate_limit_per_window")
    def chat():
        db = db_session()
        user = db_user(db)

        try:
            payload = parse_chat_payload(db, user.id)
            chat_router, provider_id, model = selected_chat_router(db, user.id)
            stream = chat_router.prepare_stream(
                provider_id,
                payload["message"],
                model,
                payload["attachments"],
            )
            payload["provider"] = stream.provider
            payload["model"] = stream.model
            conversation, user_message, assistant_message = prepare_persisted_chat(payload, db, user.id)
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
            app.logger.exception("AI provider request failed")
            wrapped = UpstreamAPIError("AI provider request failed.", details=str(error))
            return provider_error_response(wrapped)

    @app.post("/chat/stream")
    @app.post("/api/chat/stream")
    @login_required
    @csrf_protect
    @rate_limit("chat_rate_limit_per_window")
    def chat_stream():
        db = db_session()
        user = db_user(db)

        try:
            payload = parse_chat_payload(db, user.id)
            chat_router, provider_id, model = selected_chat_router(db, user.id)
            stream = chat_router.prepare_stream(
                provider_id,
                payload["message"],
                model,
                payload["attachments"],
            )
            payload["provider"] = stream.provider
            payload["model"] = stream.model
            conversation, user_message, assistant_message = prepare_persisted_chat(payload, db, user.id)
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
                app.logger.warning("AI provider streaming failed", extra={"code": error.code, "provider": error.provider})
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
                app.logger.exception("AI provider streaming request failed")
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

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "environment": settings.environment})

    @app.get("/ready")
    def ready():
        try:
            db = db_session()
            db.execute(text("SELECT 1"))
            return jsonify({"status": "ready"})
        except Exception as error:
            app.logger.exception("Readiness check failed")
            return error_response(500, "not_ready", "Application is not ready.", details=str(error))

    return app


app = create_app()


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    port = int(os.getenv("PORT", "5000"))
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=port, debug=debug_mode)
