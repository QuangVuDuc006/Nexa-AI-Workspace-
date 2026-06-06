from flask import Blueprint, jsonify
from sqlalchemy import text

from services.database import db_session
from services.http import error_response


def create_health_blueprint(_deps):
    bp = Blueprint("health_routes", __name__)

    @bp.get("/health")
    def health():
        from flask import current_app

        settings = current_app.config["APP_SETTINGS"]
        return jsonify({"status": "ok", "environment": settings.environment})

    @bp.get("/ready")
    def ready():
        from flask import current_app

        try:
            db = db_session()
            db.execute(text("SELECT 1"))
            return jsonify({"status": "ready"})
        except Exception as error:
            current_app.logger.exception("Readiness check failed")
            return error_response(500, "not_ready", "Application is not ready.", details=str(error))

    return bp
