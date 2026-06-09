import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask


load_dotenv()

from routes.auth_routes import create_auth_blueprint
from routes.chat_routes import create_chat_blueprint
from routes.common import RouteDeps, firebase_auth_configured, get_firebase_web_config
from routes.conversation_routes import create_conversation_blueprint
from routes.document_routes import create_document_blueprint
from routes.health_routes import create_health_blueprint
from routes.memory_routes import create_memory_blueprint
from routes.provider_routes import create_provider_blueprint
from routes.upload_routes import create_upload_blueprint
from services.ai.credentials import CredentialCipher
from services.ai.detector import detect_models
from services.ai.provider_router import ProviderRouter
from services.app_config import load_settings
from services.auth import current_user
from services.database import init_database
from services.firebase_admin_auth import verify_firebase_id_token
from services.logging_config import configure_logging
from services.security import get_csrf_token, install_security_hooks


APP_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = APP_ROOT.parent
LANDING_DIST = PROJECT_ROOT / "chatbot-dashboard" / "dist"


def register_blueprints(app, deps):
    app.register_blueprint(create_auth_blueprint(deps))
    app.register_blueprint(create_provider_blueprint(deps))
    app.register_blueprint(create_conversation_blueprint(deps))
    app.register_blueprint(create_document_blueprint(deps))
    app.register_blueprint(create_upload_blueprint(deps))
    app.register_blueprint(create_chat_blueprint(deps))
    app.register_blueprint(create_memory_blueprint(deps))
    app.register_blueprint(create_health_blueprint(deps))


def alias_endpoint(app, alias, source_endpoint, rule, methods=("GET",)):
    app.add_url_rule(
        rule,
        endpoint=alias,
        view_func=app.view_functions[source_endpoint],
        methods=list(methods),
    )


def register_legacy_endpoint_aliases(app):
    alias_endpoint(app, "landing", "auth_routes.landing", "/")
    alias_endpoint(app, "login", "auth_routes.login", "/login")
    alias_endpoint(app, "register", "auth_routes.register", "/register")
    alias_endpoint(app, "logout", "auth_routes.logout", "/logout")
    alias_endpoint(app, "chat_page", "auth_routes.chat_page", "/chat")


def create_app():
    settings = load_settings(APP_ROOT)

    app = Flask(__name__)
    app.config["APP_SETTINGS"] = settings
    app.config["SECRET_KEY"] = settings.secret_key
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SECURE"] = settings.session_cookie_secure
    app.config["SESSION_COOKIE_SAMESITE"] = settings.session_cookie_samesite
    app.config["PERMANENT_SESSION_LIFETIME"] = settings.permanent_session_lifetime
    app.config["MAX_CONTENT_LENGTH"] = settings.max_upload_bytes
    settings.upload_storage_dir.mkdir(parents=True, exist_ok=True)
    configure_logging(app)

    init_database(app, settings.database_url)
    install_security_hooks(app)

    deps = RouteDeps(
        settings=settings,
        ai_router=ProviderRouter(),
        credential_cipher=CredentialCipher(settings.provider_credential_key),
        app_root=APP_ROOT,
        project_root=PROJECT_ROOT,
        landing_dist=LANDING_DIST,
    )

    @app.context_processor
    def inject_auth_context():
        return {
            "current_user": current_user(),
            "firebase_auth_enabled": firebase_auth_configured(),
            "firebase_web_config": get_firebase_web_config(),
            "csrf_token": get_csrf_token(),
            "memory_debug_enabled": settings.memory_debug_enabled,
        }

    register_blueprints(app, deps)
    register_legacy_endpoint_aliases(app)
    return app


app = create_app()


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    port = int(os.getenv("PORT", "5000"))
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=port, debug=debug_mode)
