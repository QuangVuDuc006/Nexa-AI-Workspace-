from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


class CredentialCipher:
    def __init__(self, secret):
        digest = hashlib.sha256(str(secret or "").encode("utf-8")).digest()
        self.fernet = Fernet(base64.urlsafe_b64encode(digest))

    def encrypt(self, value):
        value = str(value or "")
        return self.fernet.encrypt(value.encode("utf-8")).decode("ascii") if value else ""

    def decrypt(self, value):
        if not value:
            return ""

        try:
            return self.fernet.decrypt(str(value).encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError) as error:
            raise ValueError("Stored provider credentials could not be decrypted.") from error


def mask_api_key(api_key):
    value = str(api_key or "").strip()
    if not value:
        return ""

    prefix = value[:3] if len(value) > 7 else ""
    suffix = value[-4:] if len(value) > 4 else ""
    return f"{prefix}{'*' * 20}{suffix}"
