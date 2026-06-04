from __future__ import annotations

import json

from sqlalchemy import and_, select

from services.ai.config import ProviderConfig
from services.ai.credentials import mask_api_key
from services.ai.models import infer_capabilities
from services.ai.provider_registry import get_provider_definition, normalize_base_url
from services.database import ProviderConnection, new_id, utc_now


def sanitize_models(raw_models, provider_type):
    models = []
    seen = set()

    for raw_model in raw_models or []:
        if isinstance(raw_model, str):
            model_id = raw_model.strip()[:240]
            item = {
                "id": model_id,
                "name": model_id,
                "provider": provider_type,
                "capabilities": list(infer_capabilities(model_id)),
                "contextWindow": None,
                "supportsVision": "vision" in infer_capabilities(model_id),
                "supportsTools": "tools" in infer_capabilities(model_id),
                "supportsStreaming": True,
            }
        elif isinstance(raw_model, dict):
            model_id = str(raw_model.get("id") or "").strip()[:240]
            capabilities = [
                str(capability)[:40]
                for capability in raw_model.get("capabilities", [])
                if isinstance(capability, str)
            ][:20]
            item = {
                "id": model_id,
                "name": str(raw_model.get("name") or model_id)[:240],
                "provider": provider_type,
                "capabilities": capabilities,
                "contextWindow": raw_model.get("contextWindow"),
                "supportsVision": bool(raw_model.get("supportsVision") or "vision" in capabilities),
                "supportsTools": bool(raw_model.get("supportsTools") or "tools" in capabilities),
                "supportsStreaming": raw_model.get("supportsStreaming") is not False,
            }
        else:
            continue

        if not model_id or model_id in seen:
            continue

        seen.add(model_id)
        models.append(item)

        if len(models) >= 500:
            break

    return models


def serialize_connection(connection):
    definition = get_provider_definition(connection.provider_type)
    return {
        "id": connection.id,
        "providerType": connection.provider_type,
        "provider": definition.label if definition else connection.label or connection.provider_type,
        "label": connection.label or (definition.label if definition else connection.provider_type),
        "baseUrl": connection.base_url,
        "selectedModel": connection.selected_model,
        "models": connection.models,
        "connectionStatus": connection.connection_status,
        "isActive": bool(connection.is_active),
        "hasApiKey": bool(connection.encrypted_api_key),
        "maskedApiKey": connection.api_key_hint,
        "requiresApiKey": definition.requires_api_key if definition else True,
    }


def list_connections(db, user_id):
    return list(
        db.scalars(
            select(ProviderConnection)
            .where(ProviderConnection.user_id == user_id)
            .order_by(ProviderConnection.is_active.desc(), ProviderConnection.updated_at.desc())
        ).all()
    )


def get_connection(db, user_id, connection_id):
    return db.scalar(
        select(ProviderConnection).where(
            and_(ProviderConnection.id == connection_id, ProviderConnection.user_id == user_id)
        )
    )


def get_active_connection(db, user_id):
    return db.scalar(
        select(ProviderConnection)
        .where(and_(ProviderConnection.user_id == user_id, ProviderConnection.is_active.is_(True)))
        .order_by(ProviderConnection.updated_at.desc())
    )


def activate_connection(db, user_id, connection):
    connection.is_active = True
    connection.updated_at = utc_now()

    for item in list_connections(db, user_id):
        if item.id != connection.id:
            item.is_active = False
            item.updated_at = utc_now()


def save_connection(
    db,
    user_id,
    cipher,
    *,
    connection_id="",
    provider_type,
    api_key="",
    base_url="",
    selected_model="",
    models=None,
    activate=True,
):
    definition = get_provider_definition(provider_type)
    if not definition:
        raise ValueError("Select a supported provider.")

    api_key = str(api_key or "").strip()
    if len(api_key) > 16_000:
        raise ValueError("API key is too long.")

    connection = get_connection(db, user_id, connection_id) if connection_id else None
    if not connection:
        if len(list_connections(db, user_id)) >= 50:
            raise ValueError("You can save up to 50 provider connections.")
        connection = ProviderConnection(id=new_id("provider"), user_id=user_id, created_at=utc_now())
        db.add(connection)
    elif connection.provider_type and connection.provider_type != definition.id and not api_key:
        raise ValueError("Paste an API key when changing the provider type.")

    if api_key:
        connection.encrypted_api_key = cipher.encrypt(api_key)
        connection.api_key_hint = mask_api_key(api_key)

    if definition.requires_api_key and not connection.encrypted_api_key:
        raise ValueError("API key is required for this provider.")

    normalized_base_url = normalize_base_url(definition, base_url or connection.base_url)
    if not normalized_base_url:
        raise ValueError("Base URL is required for this provider.")

    clean_models = sanitize_models(models or connection.models, definition.id)
    selected_model = str(selected_model or connection.selected_model or "").strip()

    if not selected_model and clean_models:
        selected_model = clean_models[0]["id"]

    if not selected_model:
        raise ValueError("Select or enter a model.")

    connection.provider_type = definition.id
    connection.label = definition.label
    connection.base_url = normalized_base_url
    connection.selected_model = selected_model[:240]
    connection.models_json = json.dumps(clean_models, ensure_ascii=False)
    connection.connection_status = "connected"
    connection.updated_at = utc_now()

    if activate:
        activate_connection(db, user_id, connection)

    return connection


def runtime_config(connection, cipher, timeout_seconds=60):
    definition = get_provider_definition(connection.provider_type)
    if not definition:
        raise ValueError("Saved provider is no longer supported.")

    models = tuple(
        str(model.get("id") or "").strip()
        for model in connection.models
        if isinstance(model, dict) and model.get("id")
    )
    image_models = tuple(
        str(model.get("id") or "").strip()
        for model in connection.models
        if isinstance(model, dict) and model.get("supportsVision")
    )
    return ProviderConfig(
        provider_id=definition.id,
        label=definition.label,
        api_key_env="",
        model_env="",
        api_key_value=cipher.decrypt(connection.encrypted_api_key),
        default_model=connection.selected_model,
        base_url_env="runtime",
        base_url=connection.base_url,
        models=models,
        image_models=image_models,
        requires_api_key=definition.requires_api_key,
        timeout_seconds=timeout_seconds,
    )
