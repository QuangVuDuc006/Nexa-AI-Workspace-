<p align="center">
  <img src="chatbot-dashboard\public\assets\Landing.png" alt="Nexa AI Logo" width="500">
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

Create a `.env` file:

```env
APP_ENV=development

SECRET_KEY=

DATABASE_URL=

FIREBASE_PROJECT_ID=

VITE_FIREBASE_API_KEY=

VITE_FIREBASE_PROJECT_ID=
```

---

## Deployment

### Render (Backend)

```bash
Build Command:
pip install -r requirements.txt

Start Command:
gunicorn app:app
```

### Vercel (Frontend)

```bash
npm run build
```

Deploy only the frontend and point API requests to the Render backend.

---

## Security

* Fernet encrypted API key storage
* Firebase token verification
* CSRF protection
* Origin validation
* Session-based authentication
* SSRF mitigation for custom providers

---

## Current Limitations

* No Alembic migration support
* Local upload storage
* In-memory rate limiting
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
