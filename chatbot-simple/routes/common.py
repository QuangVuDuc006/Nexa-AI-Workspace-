from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from flask import jsonify, request

from services.ai.connections import (
    get_active_connection,
    get_connection,
    list_connections,
    runtime_config,
    serialize_connection,
)
from services.ai.errors import AIProviderError
from services.ai.models import normalize_models
from services.ai.provider_registry import provider_catalog
from services.auth import current_user
from services.persistence import (
    clean_client_id,
    clean_title,
    ensure_conversation,
    ensure_message,
    normalize_attachments_for_provider,
    upsert_user,
)


MAX_ATTACHMENTS = 4
FIREBASE_WEB_CONFIG_KEYS = {
    "apiKey": "VITE_FIREBASE_API_KEY",
    "authDomain": "VITE_FIREBASE_AUTH_DOMAIN",
    "projectId": "VITE_FIREBASE_PROJECT_ID",
    "storageBucket": "VITE_FIREBASE_STORAGE_BUCKET",
    "messagingSenderId": "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "appId": "VITE_FIREBASE_APP_ID",
}


@dataclass(frozen=True)
class RouteDeps:
    settings: object
    ai_router: object
    credential_cipher: object
    app_root: Path
    project_root: Path
    landing_dist: Path


def get_firebase_web_config():
    return {key: os.getenv(env_name, "") for key, env_name in FIREBASE_WEB_CONFIG_KEYS.items()}


def firebase_auth_configured():
    return all(get_firebase_web_config().values())


def provider_error_response(error: AIProviderError):
    return jsonify(error.to_dict()), error.status_code


def json_stream_event(payload):
    return f"{json.dumps(payload, ensure_ascii=False)}\n"


def sanitize_message_text(value):
    text_value = str(value or "").replace("\x00", "").strip()

    if len(text_value) > 40_000:
        text_value = text_value[:40_000]

    return text_value


def db_user(db):
    user = current_user()

    if not user:
        return None

    return upsert_user(db, user)


def fallback_provider(deps: RouteDeps):
    provider = deps.ai_router.get_provider()
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


def provider_settings_response(deps: RouteDeps, db, user_id):
    connections = list_connections(db, user_id)
    active = next((connection for connection in connections if connection.is_active), None)
    active_provider = serialize_connection(active) if active else fallback_provider(deps)
    return {
        "providers": [serialize_connection(connection) for connection in connections],
        "activeProvider": active_provider,
        "activeProviderId": active.id if active else "",
        "supportedProviders": provider_catalog(),
    }


def provider_request_values(deps: RouteDeps, db, user_id, data):
    connection_id = str(data.get("connectionId") or data.get("connection_id") or "").strip()
    connection = get_connection(db, user_id, connection_id) if connection_id else None
    api_key = str(data.get("apiKey") or data.get("api_key") or "").strip()

    if not api_key and connection:
        api_key = deps.credential_cipher.decrypt(connection.encrypted_api_key)

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


def selected_chat_router(deps: RouteDeps, db, user_id):
    from services.ai.provider_router import ProviderRouter as DefaultProviderRouter

    provider_router_class = getattr(sys.modules.get("app"), "ProviderRouter", DefaultProviderRouter)

    connection = get_active_connection(db, user_id)

    if not connection:
        return deps.ai_router, None, None

    config = runtime_config(connection, deps.credential_cipher, deps.settings.ai_request_timeout)
    return provider_router_class(config), connection.provider_type, connection.selected_model


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


def parse_chat_payload(deps: RouteDeps, db, user_id):
    data = request.get_json(silent=True) or {}
    user_message = sanitize_message_text(data.get("message", ""))
    raw_attachments = data.get("attachments", [])

    if not isinstance(raw_attachments, list):
        raise ValueError("Attachments must be a list.")

    if len(raw_attachments) > MAX_ATTACHMENTS:
        raise ValueError(f"You can attach up to {MAX_ATTACHMENTS} files.")

    attachments = normalize_attachments_for_provider(db, user_id, raw_attachments, deps.settings)

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


def prepare_persisted_chat(deps: RouteDeps, payload, db, user_id):
    from services.database import utc_now

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
        deps.settings,
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
