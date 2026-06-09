<p align="center">
  <img src="chatbot-dashboard\public\assets\Landing.png" alt="Nexa AI Logo" width="750">
</p>

<p align="center">
  A Secure Multi-Provider AI Workspace
</p>

<p align="center">
  Connect and switch between leading AI models from one simple interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Flask-3.0-red">
  <img src="https://img.shields.io/badge/React-18-blue">
  <img src="https://img.shields.io/badge/Firebase-Auth-orange">
  <img src="https://img.shields.io/badge/PostgreSQL-Supported-blue">
</p>

## Overview

Nexa AI is a self-hosted conversational AI workspace that allows users to connect and manage multiple AI providers through a unified interface.

Supported providers include:

* Google Gemini
* Anthropic Claude
* OpenAI
* OpenRouter
* DeepSeek
* Groq
* Ollama
* LM Studio
* Custom OpenAI-compatible APIs

---

## Key Features

### AI Providers

* Bring Your Own API Key (BYOK)
* Multi-provider model routing
* Automatic model detection
* Custom base URL support

### Chat Experience

* Real-time SSE streaming
* Conversation history
* Chat renaming
* Theme switching
* JSON import/export

### File Processing

* PDF extraction
* DOCX extraction
* TXT / Markdown support
* Image uploads for multimodal models

### Security

* Firebase Authentication
* Google OAuth Login
* CSRF protection
* Origin validation
* Encrypted API key storage

---

## Screenshots

### Landing Page

```text
Add screenshot here:
docs/screenshots/landing.png
```

### Workspace

```text
Add screenshot here:
docs/screenshots/workspace.png
```

### Provider Settings

```text
Add screenshot here:
docs/screenshots/settings.png
```

---

## Tech Stack

### Frontend

| Technology        | Purpose        |
| ----------------- | -------------- |
| React 18          | User Interface |
| Vite              | Build Tool     |
| Tailwind CSS      | Styling        |
| Framer Motion     | Animations     |
| React Three Fiber | 3D Graphics    |

### Backend

| Technology         | Purpose           |
| ------------------ | ----------------- |
| Flask              | API Server        |
| SQLAlchemy         | ORM               |
| Gunicorn           | Production Server |
| Firebase Admin SDK | Authentication    |
| Cryptography       | Key Encryption    |

### Database

| Technology | Purpose             |
| ---------- | ------------------- |
| SQLite     | Local Development   |
| PostgreSQL | Production Database |

---

## Architecture

```text
┌───────────────┐
│     User      │
└───────┬───────┘
        │
        ▼
┌───────────────────┐
│ React Frontend    │
│ Landing + Chat UI │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Flask Backend     │
│ REST API + SSE    │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Authentication    │
│ Firebase OAuth    │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Provider Router   │
└───────┬───────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Gemini │ Claude │ OpenAI │ Ollama  │
└─────────────────────────────────────┘
```

---

## Project Structure

```text
Nexa-AI-Workspace
│
├── chatbot-dashboard
│   ├── src
│   ├── public
│   ├── components
│   └── package.json
│
├── chatbot-simple
│   ├── services
│   ├── static
│   ├── templates
│   ├── tests
│   └── app.py
│
└── README.md
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/Nexa-AI-Workspace.git

cd Nexa-AI-Workspace
```

### Backend Setup

```bash
cd chatbot-simple

python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
```

### Frontend Setup

```bash
cd chatbot-dashboard

npm install

npm run build
```

---

## Environment Variables

Create a `.env` file in `chatbot-simple/`. For production, keep secrets in your host's secret manager and do not commit them.

```env
APP_ENV=development
FLASK_DEBUG=false

SECRET_KEY=change-me
DATABASE_URL=sqlite:///instance/chatbot.sqlite3

# Dedicated encryption secret for saved provider API keys.
# Changing it later requires a key-rotation/re-encryption migration.
PROVIDER_CREDENTIAL_KEY=change-me-provider-credential-key

SESSION_LIFETIME_MINUTES=1440
UPLOAD_STORAGE_DIR=instance/uploads
MAX_UPLOAD_MB=10
MAX_DOCUMENTS_PER_USER=0
MAX_UPLOAD_STORAGE_MB_PER_USER=75
MAX_CONVERSATIONS_PER_USER=100
MAX_MEMORIES_PER_USER=30
MAX_PROVIDER_CONNECTIONS_PER_USER=5

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CREDENTIALS_JSON=

AUTH_ALLOW_PUBLIC_SIGNIN=false
AUTH_REQUIRE_EMAIL_VERIFIED=true
AUTH_ALLOWED_EMAIL_DOMAINS=
AUTH_ALLOWED_EMAILS=

# Local/dev only. Use RATE_LIMIT_BACKEND=redis in production.
RATE_LIMIT_BACKEND=memory
REDIS_URL=
RATE_LIMIT_FAIL_OPEN=false
RATE_LIMIT_AUTH=10 per minute
RATE_LIMIT_API=120 per minute
RATE_LIMIT_CHAT=30 per minute
RATE_LIMIT_STREAM=30 per minute
RATE_LIMIT_UPLOAD=10 per hour
RATE_LIMIT_PROVIDER_TEST=20 per hour
RATE_LIMIT_MEMORY=60 per minute
RATE_LIMIT_DOCUMENTS=60 per minute
```

Production startup requires `APP_ENV=production`, a non-default `SECRET_KEY`, PostgreSQL `DATABASE_URL`, a dedicated `PROVIDER_CREDENTIAL_KEY`, Firebase web config, Firebase Admin credentials, `RATE_LIMIT_BACKEND=redis`, and `REDIS_URL`. If `AUTH_ALLOW_PUBLIC_SIGNIN=false`, configure `AUTH_ALLOWED_EMAIL_DOMAINS` or `AUTH_ALLOWED_EMAILS` so the app does not accept arbitrary Firebase users.

Redis-backed rate limiting is required in production because in-memory rate limits reset on app restart and do not coordinate across multiple Gunicorn workers or app instances. `RATE_LIMIT_FAIL_OPEN=false` is the default, so startup fails if Redis cannot be reached; set it to `true` only if you intentionally prefer allowing traffic while Redis is unavailable.

Local upload storage uses generated storage keys on disk while preserving original filenames only as display metadata. Free users are limited to 75 MB of local storage, 10 MB per uploaded file, 100 conversations, 30 active memories, and 5 provider connections by default. Nexa warns at 80% storage use and blocks only new uploads at 100%; chat and existing files continue to work. `MAX_DOCUMENTS_PER_USER=0` disables document-count limiting so storage quota is the primary control. Local disk storage is still intended for portfolio/demo deployments, not durable multi-instance production storage.

---

## Deployment

### Render (Backend)

```bash
Build Command:
pip install -r requirements.txt

Start Command:
gunicorn app:app
```

Add a managed Redis instance and set:

```env
APP_ENV=production
RATE_LIMIT_BACKEND=redis
REDIS_URL=redis://...
RATE_LIMIT_FAIL_OPEN=false
```

On Railway, add the Redis plugin and use its provided `REDIS_URL`. On a VPS, install Redis or point to a managed Redis provider, bind it privately where possible, require authentication, and use the authenticated URL in `REDIS_URL`.

### Vercel (Frontend)

```bash
npm run build
```

Deploy only the frontend and point API requests to the Render backend.

---

## Security

* Fernet encrypted API key storage
* Firebase token verification
* Configurable Firebase email/domain allowlist
* Optional verified-email requirement
* CSRF protection
* Origin validation
* Session-based authentication
* Redis-backed rate limiting for production
* SSRF mitigation for custom providers

---

## Current Limitations

* No Alembic migration support
* Local upload storage
* Local/dev memory rate limiting is not production-safe
* Email/password authentication not completed

---

## Roadmap

### Short Term

* Alembic database migrations
* Native email/password login
* Improved onboarding flow

### Mid Term

* Redis-based sessions
* Distributed rate limiting
* Cloud file storage integration

### Long Term

* Team workspaces
* Shared provider management
* Organization billing
* Enterprise deployment support

---

## Contributing

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/amazing-feature
```

3. Commit your changes

```bash
git commit -m "Add amazing feature"
```

4. Push to your branch

```bash
git push origin feature/amazing-feature
```

5. Open a Pull Request

---

## License

Distributed under the MIT License.

See `LICENSE` for more information.
