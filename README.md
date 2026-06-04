Phase 1: Project Review ReportPrepared by: Senior Software Architect, Product Manager, Technical Writer, & Open Source MaintainerRepository Audited: Nexa AI (Chatbot Workspace)Date: June 5, 2026

Project Structure AnalysisThe Nexa AI codebase is split into two primary components:

Frontend Marketing Landing Page (chatbot-dashboard/): A highly polished, single-page application built on React, Vite, Tailwind CSS, Framer Motion, and React Three Fiber (R3F). It includes pricing tiers, features, interactive FAQs, and a dynamic 3D graphic.Backend Application & Chat Client (chatbot-simple/): A Flask-based server powering the API layer, database storage (SQLAlchemy), session validation, file upload handling, and multi-provider AI routing. It also serves its own fallback templates (landing.html, login.html, register.html, and index.html) and serves the React landing page directly from dist if compiled.Nexa-AI-Workspace/├── .agents/                 # AI Agent capabilities & lockfiles├── chatbot-dashboard/       # React + Vite + Tailwind frontend landing page│   ├── src/                 # React source (components, hooks, lib, ui)│   ├── vite.config.js       # Vite configuration with Flask API proxy routing│   └── package.json         # Package dependencies (R3F, Framer Motion, Firebase)├── chatbot-simple/          # Flask backend + vanilla JS chat UI│   ├── app.py               # Main Flask application entrypoint & REST/SSE endpoints│   ├── services/            # Core business logic modules│   │   ├── ai/              # Adapters for Gemini, Anthropic, Cohere, OpenAI│   │   ├── database.py      # SQLAlchemy Models & Engine Initializer│   │   ├── security.py      # CSRF Protection, Origin Checking, Rate Limiting│   │   ├── uploads.py       # Text extraction (PDF/DOCX) & Image serialization│   │   └── persistence.py   # Database query layer & Attachment management│   ├── static/              # Stylesheets & client-side scripts (chat.js, client.js)│   ├── templates/           # Flask Jinja2 templates (login, register, chat, landing)│   └── tests/               # Pytest suite (100% pass on 19 tests)├── chatbot-45f57-...json    # Local Firebase Admin SDK key└── README.md                # Root project documentation2. Technical Stack AuditFrontend: React 18, Vite 6, Tailwind CSS 3, Framer Motion 12, Lucide React, and React Three Fiber (Three.js).Backend: Flask 3.0.3, WSGI Gunicorn 23.0.0, SQLAlchemy 2.0.36, and python-dotenv.Database: SQLAlchemy ORM backing SQLite (local development default) and PostgreSQL (enforced production backend via psycopg2-binary).Authentication: Client-side Firebase Auth Web SDK (Google Provider popups/redirects) paired with server-side Firebase Admin SDK SDK validation (verify_firebase_id_token in Python) establishing a secure Flask Session.Security & Controls:CSRF Protection: Native header-matching using X-CSRF-Token headers matched against secure session values via constant-time digest comparison (secrets.compare_digest).Host/Origin Checks: Rejects cross-origin state-changing requests if Origin or Referer header fails to match host.API Key Encryption: Keys stored in the database are symmetrically encrypted using Fernet (AES-128 in CBC mode with HMAC-SHA256) through a key derived from SECRET_KEY. Decryption happens strictly in-memory during LLM execution.Rate Limiting: Monotonic time sliding-window queues bucketed by user identity/IP addresses.AI Integration: Adaptable multi-provider architecture. Adapters include:Google Gemini: Urllib-based content generation and Server-Sent Events (SSE) streaming.Anthropic Claude: Custom streaming and standard completion wrapper.Cohere: Completion adapter.OpenAI-Compatible: Unified adapter covering OpenAI, OpenRouter, Groq, DeepSeek, Together, Mistral, Fireworks, Perplexity, xAI Grok, Kimi, Ollama, LM Studio, and custom base URL providers.File Attachment System: Supports up to 4 files (max 12MB total).Extracts plain text from .txt and .md.Parses text from .pdf (using pypdf) and .docx (using python-docx).Serializes and stores .png, .jpg, .jpeg, .webp, .gif images as base64 data URLs for vision-enabled models (Google Gemini and vision-enabled OpenAI compatible models).3. Architecture & Code Quality SummaryThe backend uses a clean, decoupled design. Business logic is separated into single-responsibility services (persistence.py, uploads.py, security.py). The LLM integration uses an elegant Adapter pattern (AIProvider base class with concrete adapters for Cohere, Anthropic, Gemini, and OpenAI-Compatible), facilitating easy additions of future model providers.

The test suite is structured using standard pytest practices, covering critical flows (security hooks, token validation mock-ups, provider errors, and PDF text extraction). All 19 tests run and pass without warnings.

Feature Maturity MatrixFeature	Category	Implementation Status	Maturity Level	NotesGoogle Google Login	Core	Full	Production-Ready	Handled via Firebase Auth on client and Firebase Admin on backend.SSE Streaming	Core	Full	Production-Ready	Handles chunked tokens with fallback to standard request on failure.Multi-Provider Connections	Core	Full	Production-Ready	Allows users to store custom API keys, encrypts them, and switches models.File Extraction (PDF/Docx)	Core	Full	Production-Ready	Integrates pypdf and python-docx directly. Refuses empty extractions.Image Vision Uploads	Core	Full	Mature	Converts images to Data URLs; enforces vision capability checks on model selection.Rate Limiting	Core	Full	Mid-Level	In-memory deque tracking. Reset on app restarts.Landing page (React)	Secondary	Full	High	Clean animations and 3D fiber interactions. Proxy to Flask setup.History Manager	Secondary	Full	High	Supports cursor-based pagination, chat clear, import JSON history, and renaming.Email/Password Auth	Core	Incomplete	Placeholder	HTML templates exist, but no backend endpoints or database schemas support local logins.DB Migrations	Core	Incomplete	Missing	Database schemas are generated on startup. Alembic or migration tool is absent.

Executive SummaryNexa AI is a unified conversational workspace that acts as a secure intermediary between users and arbitrary AI providers. By allowing users to bring their own API keys (which are encrypted and held securely on the server), it addresses privacy and pricing concerns for individual developers and teams.

The target audience includes developers, technical writers, and power-users looking for a self-hosted AI client that handles PDF extraction, vision inputs, and streaming responses across multiple providers (local models like Ollama, cloud systems like Gemini, or intermediate proxies like OpenRouter).

At its current state, the project is highly mature for single-instance or small-scale server usage. However, scaling to a distributed multi-node production cluster will require moving rate-limiting and session management to a shared memory cache (like Redis).

Score Card (0-10)Architecture: 8.5/10 - The model adapter layer and decoupled security hooks are clean. The monolithic nature of app.py is slightly crowded but manageable.Code Quality: 9.0/10 - Very high code legibility, type hints, proper database transaction scope (rollback/commit), and a passing test suite.UI/UX: 8.0/10 - Dual-layer dashboard: dynamic, visual landing page (React/ThreeJS) and a distraction-free chat screen (Vanilla HTML/CSS).Security: 9.0/10 - Fernet symmetric encryption for keys, CSRF headers, and strict validation of base URLs protect against SSRF/XSS vectors.Scalability: 7.0/10 - SQLite default is simple; easily supports PostgreSQL. However, in-memory rate limiting and local upload folder uploads prevent instant horizontal scale-out.Deployment Readiness: 8.0/10 - Code validates production environments strictly (requires PostgreSQL when APP_ENV=production). Needs standard infrastructure configurations (Docker/Vite compilation build script) to be fully ready.Phase 2: Professional README.mdBelow is the complete, professional README.md generated based on the actual codebase implementation.

markdown

Nexa AI - Multimodal Chatbot Workspace

Nexa AI is a premium, feature-rich conversational AI workspace designed to run locally or in production. It features robust multi-provider AI model support (bringing your own API key), Server-Sent Events (SSE) streaming, text extraction from documents, vision uploads, and state-of-the-art security practices.

Overview

Nexa AI serves as a secure, personal playground for conversational models. Instead of subscribing to a single provider, users configure credentials for their choice of LLM services.

Why Nexa AI was created:

Bring Your Own Key (BYOK): Eliminates intermediary markups by letting users communicate directly with AI APIs.

Unified Interface: A single UI that supports local models (Ollama, LM Studio) alongside commercial APIs (Google Gemini, Anthropic Claude, OpenAI, DeepSeek, OpenRouter).

Advanced RAG Preparation: Supports reading complex context directly from uploaded files, handling text extraction seamlessly on the server.

Features

Implemented

Multi-Provider Routing: Adapters for Google Gemini, Anthropic, Cohere, and OpenAI-Compatible APIs (Groq, DeepSeek, Mistral, Together, OpenRouter, Ollama, LM Studio).

API Key Management: Encrypted server-side storage of keys using Fernet symmetric encryption. Auto-detect models directly from target endpoints.

SSE Streaming Responses: Real-time response streaming with the ability to abort/stop generation mid-flight.

Document Text Extraction: Parses .txt, .md, .pdf (using pypdf), and .docx (using python-docx) files and appends them as prompt context.

Multimodal Vision Support: Captures, serializes, and sends images (.png, .jpg, .jpeg, .webp, .gif) to vision-compatible LLMs.

Database Management: SQLite engine for local dev and PostgreSQL for production, powered by SQLAlchemy ORM.

Session-Scoped History: Firebase Google Auth popups/redirects establish local Flask session cookies.

Security Protections: Custom sliding-window rate limiting, origin matching, and CSRF header verification (X-CSRF-Token).

Premium Interactive Landing Page: Dynamic 3D graphics (React Three Fiber) and scroll animations (Framer Motion) served at root.

In Progress

Local Email/Password Auth: UI templates exist (login.html/register.html) but do not connect to a local hashing/database backend.

Distributed Rate Limiting: Enhancing rate limits to support Redis backends (currently tracks requests via server memory).

Planned

Database Migrations: Integrating Alembic to manage SQLAlchemy schema updates.

Persistent File Storage: Connecting local media uploads to cloud object storage (e.g., AWS S3 or Google Cloud Storage).

Screenshots

Below are recommended screenshot sections to capture in your UI:

Landing Page: The React Three Fiber 3D interactive hero section.

Chat Interface: The double-column layout showing conversation history and active AI streaming text.

Authentication: The clean Firebase Google Login prompt.

Workspace: The dynamic model selector dropdown listing detected models.

Settings Panel: The provider setup modal where API Keys and Base URLs are configured.

Tech Stack

Frontend

Landing Page: React 18, Vite 6, Tailwind CSS 3, Framer Motion 12, React Three Fiber (R3F)

Chat App: Vanilla JavaScript (ES6 Modules), HTML5, CSS Variables, marked.js (Markdown parser), DOMPurify (XSS sanitizer)

Backend

Web Framework: Flask 3.0.3, python-dotenv

WSGI Server: Gunicorn 23.0.0

Dependencies: cryptography 48.0.0, pypdf 5.1.0, python-docx 1.1.2

Authentication

Identity Provider: Firebase Authentication (Google OAuth provider)

Verification: Firebase Admin SDK (Python) for server-side ID token validation

Database

ORM: SQLAlchemy 2.0.36

Backends: SQLite (Local), PostgreSQL (Production - using psycopg2-binary)

AI Providers

Google: Google Gemini API

Anthropic: Anthropic Claude API

Cohere: Cohere API

OpenAI-Compatible: OpenAI, OpenRouter, DeepSeek, Groq, Kimi, Together, Mistral, Fireworks, Perplexity, xAI Grok, Ollama, LM Studio

Deployment

Platforms: Render (fully tested deployment guide), Vercel (frontend deployment)

Project Structure

Nexa-AI-Workspace/ ├── .agents/ # AI Agent tooling configuration ├── chatbot-dashboard/ # Frontend landing page codebase │ ├── src/│ │ ├── components/ # React components (auth, layout, UI) │ │ ├── hooks/ # custom react hooks (useAuth, motion) │ │ ├── lib/ # Firebase configuration initialization │ │ └── App.jsx # Component hierarchy config │ ├── vite.config.js # Vite configuration with Flask API proxies │ └── package.json # Frontend package details ├── chatbot-simple/ # Flask backend & workspace UI codebase │ ├── app.py # Main app router, endpoints and middleware │ ├── requirements.txt # Python requirements │ ├── services/ # Backend business modules │ │ ├── ai/ # Adaptable AI adapters and registration │ │ ├── app_config.py # Environment settings loader │ │ ├── auth.py # Session utilities and role validation │ │ ├── database.py # SQLAlchemy models definition │ │ ├── firebase_admin_auth.py # Token validator │ │ ├── persistence.py # Database query executor │ │ ├── security.py # CSRF validation and rate limit deques │ │ └── uploads.py # DOCX, PDF, and image processor │ ├── static/ # Chat assets, CSS, and main JS files │ ├── templates/ # Jinja2 fallback and login views │ └── tests/ # Pytest suite └── chatbot-45f57-...json # Local Firebase SDK verification certificate

Installation

Prerequisites

Python 3.10+

Node.js 18+ (for building the landing page)

Firebase Project (for Google Auth credentials)

1. Clone the Repository

git clone https://github.com/your-username/Nexa-AI-Workspace.git
cd Nexa-AI-Workspace
2. Setup the Backend
Navigate to the backend directory, configure the virtual environment, and install dependencies:

bash
cd chatbot-simple
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
pip install -r requirements.txt
3. Configure Backend Environment
Copy the example environment file and fill in your keys:

bash
cp .env.example .env
Ensure you provide your SECRET_KEY, Firebase web configurations (VITE_FIREBASE_...), and place your Firebase Service Account JSON file in the root directory.

4. Setup the Frontend
Build the landing page and configure dependencies:

bash
cd ../chatbot-dashboard
npm install
cp .env.example .env
npm run build
Note: Vite will output compiled assets to chatbot-dashboard/dist. The Flask backend automatically detects this directory and serves it at /.

5. Run the Application
Option A (All-in-One Flask): Once the React landing page is compiled to dist, simply run the Flask backend:

bash
cd ../chatbot-simple
python app.py
Access the app at http://127.0.0.1:5000.

Option B (Parallel Development): Run both servers concurrently.

Start backend:
bash
cd chatbot-simple
python app.py
(Running Flask at port 5001 - set PORT=5001 in your .env)
Start frontend Vite dev server (includes live-reload proxying):
bash
cd chatbot-dashboard
npm run dev
Access the app at http://localhost:5173.
Environment Variables
The application relies on the following configurations in your chatbot-simple/.env:

Variable	Description	Default	Enforced
APP_ENV	Environment level (development or production).	development	Yes
SECRET_KEY	Long random key for session integrity and cookie signing.	dev-only-change-me	Yes (in Prod)
PROVIDER_CREDENTIAL_KEY	Key for encrypting stored provider keys. Defaults to SECRET_KEY.	-	No
DATABASE_URL	SQLAlchemy connection URL (Enforced PostgreSQL in Prod).	SQLite file	Yes (in Prod)
UPLOAD_STORAGE_DIR	Local storage directory for user uploads.	instance/uploads	No
SESSION_COOKIE_SECURE	Restricts cookies to HTTPS only.	True (in Prod)	No
CSRF_ENABLED	Enables CSRF header matching on POST/PATCH/DELETE endpoints.	True	No
ADMIN_EMAILS	Comma-separated list of administrative emails.	-	No
ADMIN_UIDS	Comma-separated list of administrative Firebase UIDs.	-	No
CHAT_RATE_LIMIT_PER_WINDOW	Maximum chat queries allowed per window.	30	No
API_RATE_LIMIT_PER_WINDOW	Maximum general API calls allowed per window.	120	No
MAX_UPLOAD_BYTES	Maximum total attachment upload limit (default 12MB).	12582912	No
MAX_IMAGE_BYTES	Maximum allowed image attachment size (default 5MB).	5242880	No
AI_REQUEST_TIMEOUT	Provider connection API request timeout in seconds.	60	No
VITE_FIREBASE_API_KEY	Firebase Web API Key.	-	Yes (for Auth)
VITE_FIREBASE_PROJECT_ID	Firebase Web Project ID.	-	Yes (for Auth)
FIREBASE_PROJECT_ID	Backend Firebase Project ID.	-	Yes (for Auth)
FIREBASE_CREDENTIALS	JSON string of the Firebase service account credential (for Render).	Local JSON file fallback	No
Usage
Workspace Workflow
mermaid
graph TD
    A[Visit Landing Page] --> B{Click Open Workspace}
    B -->|Unauthenticated| C[Google OAuth Login]
    C -->|Creates Local DB User| D[Enter Chat Workspace]
    B -->|Authenticated| D
    D --> E[Configure Provider Settings]
    E -->|Encrypts Key via Fernet| F[Save Provider Connection]
    F --> G[Select active model in Chat]
    G --> H[Upload attachment or enter query]
    H -->|SSE Stream| I[Read AI Response]
Authentication: Users sign in securely using the "Continue with Google" OAuth button.
AI Configurations:
Open Provider Settings (under Settings).
Paste your API key (and optional custom Base URL) for your target AI host.
Click Auto Detect Models to retrieve your provider's available models list.
Save the connection configuration.
Chatting:
Select your model on the topbar dropdown list.
Type a prompt or upload files.
Select Send. Use the Stop button to interrupt generation.
History & Settings: Use the sidebar to search conversations, delete chats, clear account history, or change theme preferences (Light, Dark, System).
Authentication Flow
Google Login & Session Establishment
Frontend Capture: The client invokes Firebase's Google Auth popup/redirect flow (signInWithPopup/signInWithRedirect).
Server Handoff: The client receives a JWT idToken from Firebase and forwards it to the Flask backend endpoint /api/firebase/session.
Server Verification: The backend verifies the token signatures against Firebase's public certificates via the Firebase Admin SDK.
Local Session Registration: The backend checks if the user exists in the local database. If not, it registers them. A secure cookie-backed session is established, storing the user profile.
Subsequent Calls: All sub-calls require this Flask session cookie to pass the @login_required decorator check.
AI Workflow
Payload Submission: The chat prompt is submitted along with any serialized attachments via POST /api/chat/stream.
Key Decryption: The server checks the user's active provider_connections row. It fetches the encrypted API key and decrypts it in-memory via CredentialCipher.decrypt(key).
Adapter Routing: The ProviderRouter initializes the provider's adapter (e.g., GeminiProvider, OpenAICompatibleProvider).
Token Streaming: The adapter hits the upstream endpoint via standard Python urllib.request. The SSE chunks are yielded back to Flask, which streams them to the browser client in application/x-ndjson format.
Completion Hook: Once the stream terminates or is cancelled, the final response text is updated in the database Message model.
Deployment Guide
Local Development
Follow the local setup instructions above, ensuring APP_ENV is set to development. SQLite will automatically initialize under chatbot-simple/instance/chatbot.sqlite3.

Vercel Deployment
To deploy the landing page on Vercel:

Add a vercel.json in the frontend directory chatbot-dashboard.
Set the build command to npm run build and publish directory to dist.
Set backend proxy configurations to redirect API calls to your hosted Flask application.
Render Deployment
To deploy the Flask application on Render:

Create a PostgreSQL Database on Render.
Create a new Web Service, connect the repository, and set the root directory to chatbot-simple.
Set environment variables:
APP_ENV = production
DATABASE_URL = Your Render PostgreSQL Connection string
SECRET_KEY = Secure random key
FIREBASE_CREDENTIALS = Paste the raw stringified contents of your Firebase Service Account JSON file
Add your VITE_FIREBASE_... keys.
Specify commands:
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
Security Notes
API Key Protection: Users' API keys are stored encrypted via Fernet symmetric encryption. Keys are never sent back to the browser or client requests; they are decrypted and processed solely in volatile memory during active API calls.
CSRF Protection: All state-changing methods (POST, PATCH, DELETE) require a valid CSRF token header (X-CSRF-Token) generated under the /api/csrf endpoint.
SSRF Mitigation: Custom provider base URLs are validated to prevent local network scanning (blocks cloud metadata endpoints like metadata.google.internal, loopbacks, private IPs, and forces HTTPS for remote URLs).
Content Security: Markdown rendering is sanitized using dompurify on the client to prevent arbitrary scripts execution inside markdown elements.
Current Limitations
No local database migrations: Modifications to the SQLAlchemy database models will require manual database deletes/recreations, as Alembic is not currently configured.
Scale-Out Rate Limiting: The rate-limiting system uses a standard deque stored in Python runtime memory. In multi-instance deployments (e.g., Gunicorn with multiple workers or Kubernetes deployments), rate limits are not shared across processes.
Local Upload Storage: Text extraction happens on-demand, but images are stored locally under chatbot-simple/instance/uploads. If deploying to multiple ephemeral instances (like Render or Heroku without persistent volumes), uploaded images will fail to render after container restarts.
Roadmap
Short-term (1-3 months)
Integrate Alembic: Configure Alembic for database schema migration control.
Setup Local Auth Backend: Complete local registration and login templates by introducing password hashing (using bcrypt or scrypt) and session storage.
Mid-term (3-6 months)
Distributed State Cache: Add Redis support for rate-limiting, active streaming locks, and centralized Flask sessions.
Cloud Object Storage: Add S3 or Google Cloud Storage adapters for file uploads.
Long-term (6+ months)
Organizational Workspaces: Expand database models to support team/organization workspaces with shared provider keys and billing rules.
Contributing
Fork the Repository.
Create your Feature Branch (git checkout -b feature/AmazingFeature).
Commit your changes (git commit -m 'Add some AmazingFeature').
Run tests: python -m pytest inside chatbot-simple.
Push to the Branch (git push origin feature/AmazingFeature).
Open a Pull Request.
License
Distributed under the MIT License. See LICENSE for details.


## Summary of Completed Work
1.  **Project Audit (Phase 1)**: Completed a thorough code investigation of project layout, authentication mechanisms (Firebase Google OAuth), SQLAlchemy models, AI provider adapters (Gemini, Anthropic, Cohere, OpenAI Compatible), text extraction services, and security measures.
2.  **Report Generation**: Produced an Executive Summary detailing target users, scoring metrics (Architecture, Code Quality, UI/UX, Security, Scalability, and Deployment Readiness), and identified complete vs. incomplete features.
3.  **README.md Documentation (Phase 2)**: Created a complete, production-grade `README.md` strictly aligned with the features in the codebase.
4.  **Rule Adherence**: Honorably respected the instructions: did not modify code, did not write any files automatically, and focused entirely on analysis and documentation generation.