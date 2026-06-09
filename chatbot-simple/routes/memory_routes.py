from flask import Blueprint, jsonify, request

from services.auth import login_required
from services.database import db_session
from services.http import error_response
from services.memory_service import (
    MemoryValidationError,
    create_memory,
    delete_memory,
    get_or_create_user_profile,
    list_active_memories,
    serialize_memory,
    serialize_profile,
    update_memory,
    update_personalization_text,
)
from services.security import csrf_protect, rate_limit

from .common import db_user


def create_memory_blueprint(deps):
    bp = Blueprint("memory_routes", __name__)

    @bp.get("/api/personalization")
    @login_required
    @rate_limit("memory")
    def personalization_get():
        db = db_session()
        user = db_user(db)
        profile = get_or_create_user_profile(user.id, db=db)
        db.commit()
        return jsonify({"profile": serialize_profile(profile), "personalizationText": profile.personalization_text or ""})

    @bp.put("/api/personalization")
    @login_required
    @csrf_protect
    @rate_limit("memory")
    def personalization_put():
        data = request.get_json(silent=True) or {}
        text = data.get("personalizationText", data.get("personalization_text", ""))
        db = db_session()
        user = db_user(db)
        profile = update_personalization_text(user.id, text, db=db)
        db.commit()
        return jsonify({"profile": serialize_profile(profile), "personalizationText": profile.personalization_text or ""})

    @bp.get("/api/memory")
    @login_required
    @rate_limit("memory")
    def memory_get():
        db = db_session()
        user = db_user(db)
        memories = list_active_memories(user.id, db=db)
        db.commit()
        return jsonify({"memories": [serialize_memory(memory) for memory in memories]})

    @bp.post("/api/memory")
    @login_required
    @csrf_protect
    @rate_limit("memory")
    def memory_post():
        data = request.get_json(silent=True) or {}
        value = data.get("value", data.get("memory", data.get("text", "")))
        db = db_session()
        user = db_user(db)

        try:
            memory = create_memory(
                user.id,
                data.get("key", ""),
                value,
                "manual",
                1.0,
                1,
                db=db,
                max_active=deps.settings.max_memories_per_user,
            )
        except MemoryValidationError as error:
            db.rollback()
            return error_response(422, "invalid_memory", str(error))

        db.commit()
        return jsonify({"memory": serialize_memory(memory)}), 201

    @bp.patch("/api/memory/<memory_id>")
    @login_required
    @csrf_protect
    @rate_limit("memory")
    def memory_patch(memory_id):
        data = request.get_json(silent=True) or {}
        db = db_session()
        user = db_user(db)

        try:
            memory = update_memory(user.id, memory_id, data, db=db, max_active=deps.settings.max_memories_per_user)
        except LookupError:
            db.rollback()
            return error_response(404, "not_found", "Memory was not found.")
        except MemoryValidationError as error:
            db.rollback()
            return error_response(422, "invalid_memory", str(error))

        db.commit()
        return jsonify({"memory": serialize_memory(memory)})

    @bp.delete("/api/memory/<memory_id>")
    @login_required
    @csrf_protect
    @rate_limit("memory")
    def memory_delete(memory_id):
        db = db_session()
        user = db_user(db)

        try:
            delete_memory(user.id, memory_id, db=db)
        except LookupError:
            db.rollback()
            return error_response(404, "not_found", "Memory was not found.")

        db.commit()
        return jsonify({"deleted": True})

    return bp
