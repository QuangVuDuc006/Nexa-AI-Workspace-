from flask import jsonify


def error_response(status_code, code, message, **extra):
    payload = {
        "error": message,
        "code": code,
    }
    payload.update({key: value for key, value in extra.items() if value not in (None, "")})
    return jsonify(payload), status_code
