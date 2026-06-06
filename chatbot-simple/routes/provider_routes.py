import sys

from flask import Blueprint, jsonify, request

from services.ai.connections import activate_connection, get_connection, list_connections, save_connection, serialize_connection
from services.ai.detector import detect_models
from services.ai.errors import AIProviderError
from services.auth import login_required
from services.database import db_session, utc_now
from services.http import error_response
from services.persistence import audit_log
from services.security import client_ip, csrf_protect, rate_limit

from .common import (
    connection_status_for_error,
    db_user,
    provider_request_values,
    provider_settings_response,
)


def detect_models_for_app(*args, **kwargs):
    return getattr(sys.modules.get("app"), "detect_models", detect_models)(*args, **kwargs)


def create_provider_blueprint(deps):
    bp = Blueprint("provider_routes", __name__)

    @bp.get("/api/providers")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def providers_list():
        db = db_session()
        user = db_user(db)
        payload = provider_settings_response(deps, db, user.id)
        db.commit()
        return jsonify(payload)

    @bp.get("/api/models")
    @login_required
    @rate_limit("api_rate_limit_per_window")
    def models_list():
        db = db_session()
        user = db_user(db)
        payload = provider_settings_response(deps, db, user.id)
        active = payload["activeProvider"]
        db.commit()
        return jsonify({
            "provider": active.get("provider"),
            "providerType": active.get("providerType"),
            "models": active.get("models", []),
            "defaultModel": active.get("selectedModel", ""),
            "active": active.get("selectedModel", ""),
        })

    @bp.post("/api/providers/detect-models")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_detect_models():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            values = provider_request_values(deps, db, user.id, data)
            result = detect_models_for_app(
                values["provider_type"],
                values["api_key"],
                values["base_url"],
                deps.settings.ai_request_timeout,
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

    @bp.post("/api/providers/test")
    @login_required
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def providers_test():
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            values = provider_request_values(deps, db, user.id, data)
            result = detect_models_for_app(
                values["provider_type"],
                values["api_key"],
                values["base_url"],
                deps.settings.ai_request_timeout,
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

    @bp.post("/api/providers")
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
                deps.credential_cipher,
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
            payload = provider_settings_response(deps, db, user.id)
            payload["savedProvider"] = serialize_connection(connection)
            return jsonify(payload), 201
        except ValueError as error:
            db.rollback()
            return error_response(422, "invalid_provider_settings", str(error))

    @bp.patch("/api/providers/<connection_id>")
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
        return jsonify(provider_settings_response(deps, db, user.id))

    @bp.post("/api/providers/<connection_id>/activate")
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
        return jsonify(provider_settings_response(deps, db, user.id))

    @bp.delete("/api/providers/<connection_id>")
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
        return jsonify(provider_settings_response(deps, db, user.id))

    return bp
