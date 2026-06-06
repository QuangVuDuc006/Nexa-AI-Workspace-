import os
import sys

from flask import Blueprint, jsonify, redirect, render_template, request, send_file, send_from_directory, session, url_for

from services.auth import current_user, is_admin_identity, login_required, normalize_email
from services.database import db_session
from services.firebase_admin_auth import FirebaseVerificationError, verify_firebase_id_token
from services.http import error_response
from services.persistence import upsert_user
from services.security import client_ip, csrf_protect, get_csrf_token, rate_limit

from .common import FIREBASE_WEB_CONFIG_KEYS, firebase_auth_configured, get_firebase_web_config


def verify_firebase_id_token_for_app(*args, **kwargs):
    return getattr(sys.modules.get("app"), "verify_firebase_id_token", verify_firebase_id_token)(*args, **kwargs)


def create_auth_blueprint(deps):
    bp = Blueprint("auth_routes", __name__)

    @bp.get("/")
    def landing():
        if (deps.landing_dist / "index.html").exists():
            return send_from_directory(deps.landing_dist, "index.html")

        return render_template("landing.html")

    @bp.get("/assets/<path:filename>")
    def landing_assets(filename):
        return send_from_directory(deps.landing_dist / "assets", filename)

    @bp.get("/favicon.ico")
    def favicon():
        return send_file(deps.app_root / "static" / "assets" / "Hover.png", mimetype="image/png")

    @bp.get("/login")
    def login():
        if current_user():
            return redirect(request.args.get("next") or url_for("chat_page"))

        return render_template("login.html", error=request.args.get("error"))

    @bp.get("/register")
    def register():
        if current_user():
            return redirect(url_for("chat_page"))

        return render_template("register.html", error=request.args.get("error"))

    @bp.get("/logout")
    def logout():
        return redirect(url_for("landing"))

    @bp.post("/logout")
    @csrf_protect
    def logout_post():
        session.clear()
        return redirect(url_for("landing"))

    @bp.get("/api/csrf")
    def csrf_token():
        return jsonify({"csrfToken": get_csrf_token()})

    @bp.get("/api/firebase/config")
    def firebase_config():
        config = get_firebase_web_config()
        missing = [
            env_name
            for env_name in FIREBASE_WEB_CONFIG_KEYS.values()
            if not os.getenv(env_name)
        ]
        return jsonify({"configured": len(missing) == 0, "config": config, "missing": missing})

    @bp.post("/api/firebase/session")
    @csrf_protect
    @rate_limit("api_rate_limit_per_window")
    def firebase_session():
        from flask import current_app

        data = request.get_json(silent=True) or {}
        token = str(data.get("idToken") or "").strip()

        try:
            payload = verify_firebase_id_token_for_app(token)
        except FirebaseVerificationError as error:
            message = str(error)
            current_app.logger.warning(
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
            "is_admin": is_admin_identity(uid, email, deps.settings),
        }
        db = db_session()
        upsert_user(db, user)
        db.commit()
        session.clear()
        session["user"] = user
        get_csrf_token()
        return jsonify({"authenticated": True, "user": user, "csrfToken": session["csrf_token"]})

    @bp.post("/api/firebase/logout")
    @csrf_protect
    def firebase_logout():
        session.clear()
        return jsonify({"authenticated": False})

    @bp.get("/chat")
    @login_required
    def chat_page():
        return render_template("index.html")

    @bp.get("/api/session")
    @login_required
    def session_info():
        user = current_user()
        return jsonify({"authenticated": True, "user": user, "csrfToken": get_csrf_token()})

    return bp
