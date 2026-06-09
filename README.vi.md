<p align="center">
  Ngôn ngữ: <a href="README.md">English</a> | <a href="README.vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <img src="chatbot-dashboard/public/assets/Landing.png" alt="Ảnh xem trước landing page của Nexa AI" width="760">
</p>

<h1 align="center">Nexa AI Workspace</h1>

<p align="center">
  Không gian chatbot AI tự host, hỗ trợ nhiều nhà cung cấp mô hình, lưu API key được mã hóa, chat với tài liệu, bộ nhớ cá nhân và giao diện web chỉn chu.
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10.11-blue">
  <img alt="Flask" src="https://img.shields.io/badge/Flask-3.0.3-black">
  <img alt="React" src="https://img.shields.io/badge/React-18.3-61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6.0-646CFF">
  <img alt="Firebase Auth" src="https://img.shields.io/badge/Firebase-Auth-FFCA28">
  <img alt="Tests" src="https://img.shields.io/badge/tests-pytest-0A9EDC">
</p>

---

## Tổng quan

Nexa AI Workspace là một dự án chatbot AI web với mục tiêu rõ ràng: giữ trải nghiệm chat gọn gàng, trong khi người dùng vẫn có thể tự kết nối các nhà cung cấp mô hình và API key của mình.

Backend là ứng dụng Flask xử lý xác thực, session, kết nối provider, hội thoại, upload, truy xuất tài liệu, memory, quota lưu trữ và rate limit. Frontend gồm landing page React/Vite và workspace chat server-rendered, với JavaScript module hóa cho streaming, Markdown, citation, upload, cấu hình provider và quản lý hội thoại.

Repository hiện có:

| Khu vực | Đã triển khai |
| --- | --- |
| Chat app | Workspace cần đăng nhập, render bằng Flask, có lịch sử hội thoại và streaming |
| Landing app | Landing page React/Vite, được Flask serve từ `chatbot-dashboard/dist` sau khi build |
| Providers | Lưu kết nối provider, mã hóa API key, detect model, activate provider và custom base URL |
| Documents | Upload, chia chunk, tạo embedding, tìm kiếm, trích citation và xóa PDF/DOCX/TXT/Markdown |
| Memory | Hồ sơ cá nhân hóa, manual memory, bắt explicit memory và hook auto memory |
| Security | Firebase session, CSRF, kiểm tra origin, rate limit, giới hạn upload và validate provider URL |

---

## Tính năng chính

### Điều phối nhiều AI provider

- Cấu hình provider theo kiểu bring-your-own-key, API key được mã hóa ở phía server.
- Có định nghĩa provider cho OpenAI, OpenRouter, Anthropic Claude, Google Gemini, Kimi/Moonshot, Groq, DeepSeek, Together AI, Mistral, Cohere, Fireworks AI, Perplexity, xAI Grok, Ollama, LM Studio và endpoint OpenAI-compatible/custom.
- Detect model và test connection khi provider hỗ trợ.
- Chọn provider/model đang hoạt động ngay trong workspace chat.
- Có cấu hình fallback qua environment cho Gemini, OpenAI và OpenRouter.

### Workspace chat

- Trang chat có xác thực, lưu hội thoại và lịch sử tin nhắn.
- Có endpoint chat JSON tiêu chuẩn và endpoint streaming NDJSON.
- Hỗ trợ tạo, đổi tên, xóa, clear, import hội thoại và feedback phản hồi.
- Render Markdown và KaTeX ở frontend.
- Hiển thị citation khi câu trả lời dùng ngữ cảnh từ tài liệu.
- Có theme preference, auto-scroll preference, sidebar mobile và cơ chế "load earlier" cho hội thoại dài.

### Upload, tài liệu và RAG

- Hỗ trợ upload `pdf`, `docx`, `txt`, `md` và các định dạng ảnh phổ biến.
- Trích xuất text từ PDF và DOCX.
- Lưu tài liệu, chia chunk, tạo embedding, retrieval và metadata citation.
- Mặc định dùng local hash embedding; có thể dùng embedding OpenAI-compatible qua environment.
- Có tìm kiếm tài liệu, serve file gốc, báo cáo dung lượng và xóa tài liệu.

### Memory và cá nhân hóa

- Lưu personalization text theo từng tài khoản.
- CRUD manual memory.
- Bắt explicit memory từ tin nhắn chat.
- Có hook automatic memory với giới hạn cấu hình được.
- Conversation summary được dùng trong quá trình dựng context.

### Bảo mật và giới hạn vận hành

- Xác thực Firebase ID token và tạo session phía server.
- Cấu hình public sign-in, yêu cầu email verified, allowlist theo domain hoặc email.
- CSRF protection cho các route thay đổi trạng thái.
- Kiểm tra same-origin cho unsafe request.
- Dùng Flask-Limiter; production yêu cầu Redis cho rate limit.
- Giới hạn upload, giới hạn ảnh, quota lưu trữ theo user, quota hội thoại, quota memory và quota provider connection.
- Validate custom provider base URL, có chặn các endpoint metadata/link-local không an toàn.
- Production yêu cầu PostgreSQL; SQLite dùng cho local development.

---

## Ảnh chụp màn hình

Repository đã có một vài asset có thể dùng trong README:

| Preview | Asset |
| --- | --- |
| Landing preview | `chatbot-dashboard/public/assets/Landing.png` |
| Normal state | `chatbot-dashboard/public/assets/Normal.png` |
| Hover/detail state | `chatbot-dashboard/public/assets/Hover.png` |

Nên bổ sung thêm các screenshot GitHub sau:

- `docs/screenshots/landing.png`
- `docs/screenshots/chat-workspace.png`
- `docs/screenshots/provider-settings.png`
- `docs/screenshots/documents-and-citations.png`

---

## Tech Stack

### Backend

| Công nghệ | Mục đích |
| --- | --- |
| Flask 3 | Web app, API routes, trang chat server-rendered |
| SQLAlchemy 2 | ORM models và persistence |
| Alembic | Database migrations |
| Firebase Admin SDK | Verify Firebase token |
| Flask-Limiter | Rate limit theo user/IP |
| Redis | Backend rate limit cho production |
| Cryptography/Fernet | Mã hóa API key của provider |
| pypdf / python-docx | Trích xuất text từ tài liệu |
| Gunicorn | WSGI server cho production |
| pytest | Test backend và một số hành vi frontend |

### Frontend

| Công nghệ | Mục đích |
| --- | --- |
| React 18 | UI landing/dashboard |
| Vite 6 | Build tooling frontend |
| Tailwind CSS | Styling landing app |
| Framer Motion / Motion | Animation primitives |
| Three.js / React Three Fiber | Hiệu ứng visual ở landing |
| Firebase Web SDK | Luồng xác thực trên browser |
| Vanilla JS modules | Logic workspace chat |
| KaTeX | Render công thức toán trong chat |

### Dữ liệu và lưu trữ

| Storage | Mục đích |
| --- | --- |
| SQLite | Database local development |
| PostgreSQL | Database bắt buộc cho production mode |
| Local filesystem | Lưu file tài liệu/ảnh đã upload |
| Redis | Rate limiting cho production |

---

## Kiến trúc

```text
User
  |
  v
React/Vite landing app
  |
  v
Flask app
  |-- Auth routes: Firebase session, login, register, logout
  |-- Chat routes: JSON chat, streaming chat, RAG context, memory hooks
  |-- Provider routes: model detection, testing, encrypted saved connections
  |-- Conversation routes: history, import, rename, delete, feedback
  |-- Document routes: upload, chunk, embed, search, cite, delete
  |-- Memory routes: personalization and user memory CRUD
  |-- Health routes: /health and /ready
  |
  v
SQLAlchemy models
  |-- users
  |-- conversations / messages / attachments
  |-- provider_connections
  |-- user_personalizations / user_memories
  |-- documents / document_chunks
  |-- audit_logs
  |
  v
AI provider adapters
  |-- Anthropic
  |-- Cohere
  |-- Gemini
  |-- OpenAI-compatible providers
```

---

## Cấu trúc project

```text
.
|-- chatbot-dashboard/          # Landing app React/Vite
|   |-- public/assets/          # Asset preview/logo hiện có
|   |-- src/components/         # Section, layout và UI components của landing
|   |-- src/data/landingData.js # Nội dung landing và copy về provider
|   |-- package.json
|   `-- vite.config.js
|
|-- chatbot-simple/             # Ứng dụng chatbot Flask
|   |-- app.py                  # App factory, đăng ký blueprint, entry runtime
|   |-- routes/                 # Auth, chat, provider, document, memory, health routes
|   |-- services/               # Config, auth, persistence, security, AI, RAG, uploads
|   |-- static/                 # CSS/JS chat, Firebase auth JS, KaTeX vendor assets
|   |-- templates/              # Landing fallback, login/register, workspace chat
|   |-- migrations/             # Alembic migration scripts
|   |-- tests/                  # Test suite pytest
|   |-- .env.example            # Template biến môi trường
|   `-- requirements.txt
|
|-- image/                      # Bản copy asset visual bổ sung
|-- CHANGELOG.md
|-- storage-quota-roadmap.md
|-- README.md
`-- README.vi.md
```

---

## Cài đặt

### 1. Clone repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

### 2. Cấu hình backend

```bash
cd chatbot-simple
python -m venv venv

# Windows PowerShell
.\venv\Scripts\Activate.ps1

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
```

Trên macOS/Linux, dùng `cp .env.example .env` thay cho `copy`.

### 3. Cấu hình landing frontend

```bash
cd ../chatbot-dashboard
npm install
npm run build
```

Khi `chatbot-dashboard/dist/index.html` tồn tại, route landing của Flask sẽ serve bản React đã build. Nếu chưa build, Flask fallback về `chatbot-simple/templates/landing.html`.

---

## Biến môi trường

Bắt đầu từ [`chatbot-simple/.env.example`](chatbot-simple/.env.example). Các biến quan trọng:

| Biến | Bắt buộc | Mục đích |
| --- | --- | --- |
| `APP_ENV` | Có | `development` hoặc `production` |
| `SECRET_KEY` | Production | Secret cho Flask session |
| `DATABASE_URL` | Production | SQLite ở local, PostgreSQL ở production |
| `PROVIDER_CREDENTIAL_KEY` | Production | Fernet secret riêng cho API key provider |
| `VITE_FIREBASE_*` | Production | Firebase web config cho browser auth |
| `FIREBASE_CREDENTIALS_JSON` / `FIREBASE_CREDENTIALS` / `GOOGLE_APPLICATION_CREDENTIALS` | Production | Firebase Admin credentials |
| `AUTH_ALLOW_PUBLIC_SIGNIN` | Khuyến nghị | Cho phép mọi Firebase user đăng nhập hay không |
| `AUTH_ALLOWED_EMAIL_DOMAINS` / `AUTH_ALLOWED_EMAILS` | Production khi tắt public sign-in | Access allowlist |
| `RATE_LIMIT_BACKEND` | Có | `memory` ở local, `redis` ở production |
| `REDIS_URL` | Production | Redis URL cho rate limiting |
| `UPLOAD_STORAGE_DIR` | Tùy chọn | Đường dẫn lưu upload/document local |
| `MAX_UPLOAD_MB` | Tùy chọn | Giới hạn dung lượng mỗi file |
| `MAX_UPLOAD_STORAGE_MB_PER_USER` | Tùy chọn | Quota upload storage theo user |
| `RAG_ENABLED` | Tùy chọn | Bật/tắt document retrieval |
| `EMBEDDING_PROVIDER` | Tùy chọn | Mặc định `local`, hỗ trợ `openai`/OpenAI-compatible |
| `EMBEDDING_API_KEY` | Cần khi dùng remote embedding | Credential cho embedding provider |
| `AI_REQUEST_TIMEOUT` | Tùy chọn | Timeout request tới provider |
| `AI_MAX_OUTPUT_TOKENS` | Tùy chọn | Max output token truyền tới provider |

Các biến fallback provider cũng được hỗ trợ cho Gemini, OpenAI và OpenRouter cấu hình qua environment:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=https://api.openai.com/v1

OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Production mode sẽ validate config lúc startup. Khi chạy production, hãy dùng PostgreSQL, Redis-backed rate limiting, secret không phải default, Firebase Admin credentials và auth access policy rõ ràng nếu không cố ý mở public sign-in.

---

## Chạy local

### Backend và chat app

```bash
cd chatbot-simple
.\venv\Scripts\Activate.ps1
python app.py
```

Flask app chạy tại:

```text
http://127.0.0.1:5000
```

Các route hữu ích:

| Route | Mục đích |
| --- | --- |
| `/` | Landing page |
| `/login` | Trang đăng nhập Firebase |
| `/register` | Trang đăng ký Firebase |
| `/chat` | Workspace chat cần đăng nhập |
| `/health` | Health check cơ bản |
| `/ready` | Kiểm tra database readiness |

### Landing frontend ở development mode

```bash
cd chatbot-dashboard
npm run dev
```

Vite serve landing app riêng khi phát triển frontend. Dùng `npm run build` khi muốn Flask serve bản build.

### Database migrations

Ở local SQLite development, app tự tạo các table còn thiếu khi startup và cũng có migration scripts. Để chạy migration thủ công:

```bash
cd chatbot-simple
alembic upgrade head
```

---

## Testing

Chạy Python test suite từ thư mục Flask app:

```bash
cd chatbot-simple

# Windows PowerShell
$env:PYTHONPATH='.'; pytest

# macOS/Linux
PYTHONPATH=. pytest
```

Test hiện có bao phủ:

- Firebase Admin auth behavior
- Provider routing và provider configuration
- Security controls
- User isolation
- Uploads và streaming behavior
- Conversation summaries và context building
- Memory và personalization behavior
- RAG document handling và citations
- Storage quota MVP behavior
- Frontend markdown/citation rendering behavior

Với React landing app:

```bash
cd chatbot-dashboard
npm run build
```

Hiện chưa có script test frontend riêng trong `chatbot-dashboard/package.json`.

---

## Ghi chú deploy

### Backend

Backend có thể chạy sau WSGI server như Gunicorn:

```bash
cd chatbot-simple
gunicorn app:app
```

Khi deploy production, cấu hình:

- `APP_ENV=production`
- PostgreSQL `DATABASE_URL`
- Redis `REDIS_URL`
- `RATE_LIMIT_BACKEND=redis`
- `SECRET_KEY` không dùng default
- `PROVIDER_CREDENTIAL_KEY` riêng
- Firebase web config và Firebase Admin credentials
- `AUTH_ALLOWED_EMAIL_DOMAINS`, `AUTH_ALLOWED_EMAILS`, hoặc cố ý đặt `AUTH_ALLOW_PUBLIC_SIGNIN=true`

App có `/health` và `/ready` cho platform checks.

### Frontend

Build landing app trước khi deploy:

```bash
cd chatbot-dashboard
npm install
npm run build
```

Flask app serve landing bundle đã build từ `chatbot-dashboard/dist`. Nếu deploy landing app riêng, hãy trỏ các action auth/workspace về Flask backend.

### Storage

File upload hiện được lưu ở local disk qua `UPLOAD_STORAGE_DIR`. Cách này ổn cho local demo và deploy single-instance, nhưng object storage bền vững sẽ phù hợp hơn nếu chạy nhiều instance.

---

## Ghi chú bảo mật và riêng tư

- API key provider của user được mã hóa trước khi lưu và được mask khi trả về browser.
- Browser gửi Firebase ID token về backend; backend tạo session riêng.
- Có thể giới hạn truy cập bằng verified email, allowed domain hoặc allowed email cụ thể.
- CSRF token bắt buộc cho route thay đổi trạng thái khi `CSRF_ENABLED=true`.
- Unsafe request được kiểm tra theo origin hiện tại.
- Production rate limiting yêu cầu Redis để limit không mất khi restart và đồng bộ giữa nhiều worker.
- File tài liệu đã upload được lưu local và chỉ truy cập qua route đã xác thực, scoped theo user.
- RAG mặc định dùng local hash embedding. Nếu bật remote embedding, text tài liệu sẽ được gửi tới embedding provider đã cấu hình.
- Local uploaded-file storage không thay thế cho object storage bền vững trong mô hình production phân tán.

---

## Giới hạn hiện tại

- Repository hiện chưa có file `LICENSE`.
- Landing app có build script nhưng chưa có frontend test script riêng.
- File upload đang dùng local filesystem storage.
- Storage roadmap có nhắc đến trash, archive và storage breakdown chi tiết hơn, nhưng chưa triển khai đầy đủ.
- Chưa có team workspace, shared provider management, billing hoặc org-level controls.

---

## Roadmap

- Thêm screenshot GitHub cho landing page, chat workspace, provider settings và luồng citation tài liệu.
- Thêm file license chính thức.
- Thêm frontend tests cho React landing app và các module chat UI quan trọng.
- Hỗ trợ cloud/object storage cho tài liệu và ảnh upload.
- Mở rộng quản lý tài liệu: trash, restore, archive, sorting và storage breakdown.
- Cải thiện onboarding cho lần đầu cấu hình Firebase và provider.
- Thêm team hoặc organization workspace nếu project phát triển theo hướng đó.
- Thêm ví dụ deploy cho Render, Railway, Fly.io hoặc VPS.

---

## Credits

Được xây dựng bởi **Vu Duc Quang** như một dự án AI chatbot workspace.

Project sử dụng các công cụ mã nguồn mở trong hệ sinh thái Flask, React, Firebase, SQLAlchemy, Alembic, KaTeX và Vite.
