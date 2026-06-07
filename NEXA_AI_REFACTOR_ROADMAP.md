# NEXA AI CHATBOT - REFACTOR & UPGRADE ROADMAP

> Mục tiêu: biến project Nexa AI từ một AI Workspace MVP thành một sản phẩm ổn định hơn, dễ maintain hơn, có giá trị portfolio cao hơn và đủ nền tảng để phát triển tiếp theo hướng SaaS / AI Workspace.

**Nguồn cơ sở:** Dựa trên file `PROJECT_REVIEW_REPORT.md` được review ngày 2026-06-07.

---

## 0. Nguyên tắc triển khai

Không sửa ồ ạt toàn bộ project cùng lúc. Mỗi phase chỉ tập trung vào một nhóm vấn đề chính, sau đó test lại trước khi chuyển sang phase tiếp theo.

### Quy tắc làm việc

1. Mỗi lần chỉ sửa một nhóm chức năng.
2. Trước khi sửa phải tạo branch riêng.
3. Sau mỗi thay đổi lớn phải chạy test/build.
4. Không refactor UI và backend cùng lúc nếu không cần thiết.
5. Không thêm tính năng AI mới khi nền tảng security/backend chưa ổn.
6. Mọi thay đổi lớn phải ghi vào `CHANGELOG.md`.
7. Mỗi phase phải có tiêu chí hoàn thành rõ ràng.

### Lệnh kiểm tra bắt buộc sau mỗi phase

```bash
# Backend
cd chatbot-simple
python -m pytest -q

# Frontend landing
cd ../chatbot-dashboard
npm run build
```

---

# OVERALL PRIORITY

Thứ tự ưu tiên tổng thể:

1. Fix lỗi nghiêm trọng ảnh hưởng deploy/security.
2. Làm sạch project và dependency.
3. Tách backend khỏi `app.py`.
4. Tách frontend khỏi `chat.js`.
5. Thêm conversation context/memory.
6. Thêm RAG cho file upload.
7. Tối ưu performance landing/chat.
8. Hoàn thiện production readiness.
9. Tăng giá trị product/portfolio.

---

# PHASE 1 - SECURITY & INSTALLATION FIX

## Mục tiêu

Sửa các lỗi nghiêm trọng nhất trước: secret, dependency, môi trường chạy, cấu hình production.

## Vì sao cần làm trước?

Nếu dependency hỏng hoặc secret bị leak thì các phase sau dù code đẹp cũng chưa thể deploy an toàn.

## Việc cần làm

### 1.1. Fix `requirements.txt`

**File:**

```text
chatbot-simple/requirements.txt
```

**Vấn đề:**

Dòng đầu bị lỗi/corrupt:

```text
hi55/cx/gpt-5.5Flask==3.0.3
```

**Cần sửa thành:**

```text
Flask==3.0.3
```

**Done khi:**

```bash
pip install -r requirements.txt
```

chạy không lỗi.

---

### 1.2. Xử lý Firebase service account JSON

**File nguy hiểm:**

```text
chatbot-45f57-firebase-adminsdk-fbsvc-dc0dcdd2d1.json
```

**Vấn đề:**

File private key Firebase tồn tại ở local/root project. Dù có `.gitignore`, đây vẫn là secret sprawl.

**Cần làm:**

1. Vào Firebase Console.
2. Revoke/rotate service account key cũ.
3. Xóa file JSON khỏi project local.
4. Chuyển sang dùng biến môi trường.
5. Đảm bảo `.gitignore` có:

```gitignore
*.json
.env
.env.*
!package.json
!package-lock.json
```

**Done khi:**

- Không còn service account JSON trong project.
- App vẫn login được bằng Firebase Admin qua env.
- GitHub không còn cảnh báo secret.

---

### 1.3. Loại bỏ hard-coded Firebase fallback ở production

**File:**

```text
chatbot-simple/services/firebase_admin_auth.py
```

**Vấn đề:**

Code đang fallback sang filename local.

**Cần sửa:**

- Development có thể dùng local credential nếu `FLASK_ENV=development`.
- Production bắt buộc dùng env hoặc secret manager.
- Nếu production thiếu credential thì fail rõ ràng.

**Done khi:**

- Production không còn phụ thuộc file local.
- Error message rõ: thiếu `FIREBASE_CREDENTIALS` hoặc `FIREBASE_CREDENTIALS_JSON`.

---

### 1.4. Chuẩn hóa `.env.example`

**File cần tạo/cập nhật:**

```text
chatbot-simple/.env.example
```

**Nội dung nên có:**

```env
FLASK_ENV=development
SECRET_KEY=change-me
DATABASE_URL=sqlite:///instance/app.db
FIREBASE_PROJECT_ID=
FIREBASE_CREDENTIALS_JSON=
ENCRYPTION_KEY=
UPLOAD_FOLDER=uploads
MAX_UPLOAD_MB=10
```

**Done khi:**

Người khác clone project có thể nhìn `.env.example` và biết cần cấu hình gì.

---

## Test cuối phase

```bash
cd chatbot-simple
pip install -r requirements.txt
python -m pytest -q
```

## Tiêu chí hoàn thành Phase 1

- Requirements install được.
- Không còn secret JSON trong project.
- Firebase credential dùng env.
- `.env.example` rõ ràng.
- Test backend pass.

---

# PHASE 2 - CLEANUP PROJECT STRUCTURE

## Mục tiêu

Xóa file rác, log runtime, artifact cũ, dependency không dùng.

## Việc cần làm

### 2.1. Xóa runtime logs

Có thể xóa:

```text
chatbot-simple/server.out
chatbot-simple/server.err
archive/review-needed/chatbot-simple/server.out
archive/review-needed/chatbot-simple/server.err
archive/review-needed/chatbot-dashboard/*.log
archive/review-needed/chatbot-dashboard/*.out
archive/review-needed/chatbot-dashboard/*.err
```

**Done khi:**

Project không còn log runtime bị commit/lưu trong source tree.

---

### 2.2. Xóa archived static code không dùng

Có thể xóa nếu không còn dùng làm reference:

```text
archive/review-needed/chatbot-simple/static/script.js
archive/review-needed/chatbot-simple/static/style.css
archive/review-needed/stitch-export/code.html
archive/review-needed/stitch-export/screen.png
```

Nếu muốn giữ tham khảo thì chuyển vào:

```text
docs/archive/
```

---

### 2.3. Kiểm tra dependency không dùng trong React landing

**File:**

```text
chatbot-dashboard/package.json
```

Các package bị nghi không dùng:

```text
react-markdown
remark-gfm
remark-math
rehype-katex
```

**Cần làm:**

- Search toàn repo xem có import không.
- Nếu không import thì xóa.

```bash
npm uninstall react-markdown remark-gfm remark-math rehype-katex
```

**Done khi:**

```bash
npm run build
```

vẫn pass.

---

## Test cuối phase

```bash
git status
cd chatbot-simple && python -m pytest -q
cd ../chatbot-dashboard && npm run build
```

## Tiêu chí hoàn thành Phase 2

- File rác/log đã xóa hoặc archive gọn.
- Dependency không dùng đã được kiểm tra.
- Backend test pass.
- Frontend build pass.

---

# PHASE 3 - BACKEND REFACTOR

## Mục tiêu

Tách `app.py` thành các blueprint/service nhỏ hơn để dễ maintain.

## Vấn đề hiện tại

`chatbot-simple/app.py` đang quá lớn, chứa nhiều domain cùng lúc:

- Auth
- Chat
- Provider
- Upload
- Conversation
- Health check
- Helper functions

Điều này làm code khó đọc, khó test, khó mở rộng.

## Cấu trúc đề xuất

```text
chatbot-simple/
├── app.py
├── routes/
│   ├── __init__.py
│   ├── auth_routes.py
│   ├── chat_routes.py
│   ├── conversation_routes.py
│   ├── provider_routes.py
│   ├── upload_routes.py
│   └── health_routes.py
├── services/
│   ├── ai/
│   ├── database.py
│   ├── persistence.py
│   ├── uploads.py
│   ├── security.py
│   └── firebase_admin_auth.py
└── tests/
```

---

## Thứ tự refactor

### 3.1. Tách health routes

Dễ nhất, ít rủi ro nhất.

**Move các route:**

```text
/health
/ready
```

sang:

```text
routes/health_routes.py
```

---

### 3.2. Tách auth routes

**Move các route liên quan:**

```text
/login
/logout
/api/firebase/session
```

sang:

```text
routes/auth_routes.py
```

---

### 3.3. Tách provider routes

**Move các route liên quan:**

```text
/api/providers
/api/providers/test
/api/providers/detect-models
/api/providers/active
```

sang:

```text
routes/provider_routes.py
```

---

### 3.4. Tách conversation routes

**Move các route liên quan:**

```text
/api/conversations
/api/conversations/<id>
/api/conversations/<id>/messages
/api/conversations/import
```

sang:

```text
routes/conversation_routes.py
```

---

### 3.5. Tách upload routes

**Move các route liên quan:**

```text
/api/uploads
/api/uploads/<id>
/api/uploads/<id>/content
```

sang:

```text
routes/upload_routes.py
```

---

### 3.6. Tách chat routes

**Move route quan trọng nhất:**

```text
/api/chat
```

sang:

```text
routes/chat_routes.py
```

Làm cuối cùng vì đây là luồng dễ vỡ nhất.

---

## Nguyên tắc khi refactor backend

Không đổi behavior khi chỉ refactor.

Nghĩa là:

- URL giữ nguyên.
- Response JSON giữ nguyên.
- Status code giữ nguyên.
- Frontend không cần sửa theo.

---

## Test cuối phase

```bash
cd chatbot-simple
python -m pytest -q
```

Nên thêm test cho:

- Login/session
- Provider save/test
- Conversation create/list/delete
- Upload file
- Chat endpoint

## Tiêu chí hoàn thành Phase 3

- `app.py` còn chủ yếu là app factory/register blueprint.
- Mỗi domain có route file riêng.
- Test backend pass.
- UI chat vẫn chạy như cũ.

---

# PHASE 4 - DATABASE MIGRATION

## Mục tiêu

Chuyển từ `Base.metadata.create_all()` sang Alembic migration.

## Vì sao cần?

Khi project dùng SQLite local thì `create_all()` tạm ổn. Nhưng khi deploy PostgreSQL hoặc update schema, cần migration rõ ràng.

## Việc cần làm

### 4.1. Cài Alembic

```bash
cd chatbot-simple
pip install alembic
pip freeze > requirements.txt
alembic init migrations
```

---

### 4.2. Kết nối Alembic với SQLAlchemy metadata

**File:**

```text
migrations/env.py
```

Import metadata từ project:

```python
from services.database import Base
target_metadata = Base.metadata
```

---

### 4.3. Tạo migration đầu tiên

```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

---

### 4.4. Tắt dần `create_all()` ở production

**File:**

```text
chatbot-simple/services/database.py
```

Logic đề xuất:

- Development: có thể `create_all()` nếu chưa có DB.
- Production: bắt buộc migration.

---

## Tiêu chí hoàn thành Phase 4

- Có folder `migrations/`.
- Có migration initial schema.
- Production không phụ thuộc `create_all()`.
- Test pass.

---

# PHASE 5 - FRONTEND CHAT REFACTOR

## Mục tiêu

Tách `chatbot-simple/static/chat.js` thành nhiều module nhỏ.

## Vấn đề hiện tại

`chat.js` đang xử lý quá nhiều thứ:

- State
- API calls
- Conversation rendering
- Message rendering
- Uploads
- Provider settings
- Dialogs
- Streaming
- Markdown/KaTeX
- Event binding

Một file gần 3700 dòng sẽ rất khó sửa tiếp.

## Cấu trúc đề xuất

```text
chatbot-simple/static/js/
├── main.js
├── state.js
├── api.js
├── render/
│   ├── conversations.js
│   ├── messages.js
│   ├── markdown.js
│   └── attachments.js
├── features/
│   ├── streaming.js
│   ├── uploads.js
│   ├── providers.js
│   ├── dialogs.js
│   └── feedback.js
└── utils/
    ├── dom.js
    ├── format.js
    └── constants.js
```

---

## Thứ tự tách file

### 5.1. Tách constants

Tách các hằng số như:

- API endpoints
- File extensions
- MIME types
- UI selectors

sang:

```text
static/js/utils/constants.js
```

---

### 5.2. Tách API client

Tạo:

```text
static/js/api.js
```

Chứa các hàm:

```js
getConversations()
createConversation()
deleteConversation()
sendMessage()
uploadFile()
getProviders()
saveProvider()
testProvider()
```

---

### 5.3. Tách state

Tạo:

```text
static/js/state.js
```

Chứa state chính:

```js
currentConversationId
conversations
messages
activeProvider
attachments
isStreaming
```

---

### 5.4. Tách message renderer

Tạo:

```text
static/js/render/messages.js
```

Chứa:

```js
renderMessage()
renderMessages()
renderAssistantMessage()
renderUserMessage()
```

---

### 5.5. Tách markdown/math renderer

Tạo:

```text
static/js/render/markdown.js
```

Chứa:

```js
renderMarkdown()
renderKatexMath()
sanitizeHtml()
```

---

### 5.6. Tách upload feature

Tạo:

```text
static/js/features/uploads.js
```

Chứa:

```js
handleFileSelect()
uploadAttachment()
renderUploadPreview()
removeAttachment()
```

---

### 5.7. Tách provider feature

Tạo:

```text
static/js/features/providers.js
```

Chứa:

```js
renderProviderPanel()
saveProviderConnection()
testProviderConnection()
detectModels()
activateProvider()
```

---

### 5.8. Tách streaming

Tạo:

```text
static/js/features/streaming.js
```

Chứa:

```js
startStream()
handleStreamChunk()
stopStream()
finalizeStream()
```

---

## Nguyên tắc khi tách frontend

- Không đổi UI trong phase này.
- Không thêm feature mới.
- Chỉ tách code để dễ maintain.
- Sau mỗi lần tách một module, test chat UI bằng tay.

## Checklist test thủ công

- Login được.
- Load conversation được.
- Tạo chat mới được.
- Gửi tin nhắn được.
- Streaming không nhấp nháy.
- Markdown render đúng.
- LaTeX render đúng.
- Upload PDF/DOCX/image được.
- Đổi provider được.
- Stop generation được.
- Rename/delete conversation được.

## Tiêu chí hoàn thành Phase 5

- `chat.js` được thay bằng nhiều module nhỏ.
- Không module nào quá 500 dòng nếu có thể.
- UI hoạt động như trước.
- Build/test pass.

---

# PHASE 6 - CONVERSATION CONTEXT & MEMORY

## Mục tiêu

Làm chatbot nhớ được nội dung cuộc trò chuyện gần đây, thay vì chỉ gửi mỗi message mới nhất.

## Vấn đề hiện tại

Chatbot có lưu lịch sử trong DB nhưng khi gọi model thì không build context đầy đủ.

Kết quả:

```text
User: Giải bài này
Bot: ...
User: giải thích dòng trên
Bot: không hiểu "dòng trên" là gì
```

## Thiết kế đề xuất

### 6.1. Thêm context builder

Tạo file:

```text
chatbot-simple/services/ai/context_builder.py
```

Chức năng:

```python
def build_conversation_context(conversation_id, user_message, max_messages=12):
    """
    Lấy N tin nhắn gần nhất trong conversation,
    format thành context gửi cho model.
    """
```

---

### 6.2. Context format

Ví dụ:

```text
System:
You are Nexa AI, a helpful AI workspace assistant.

Conversation history:
User: ...
Assistant: ...
User: ...
Assistant: ...

Current user message:
...
```

---

### 6.3. Token budget

Ban đầu dùng rule đơn giản:

```text
Max previous messages: 12
Max file extracted text: 20,000 characters
Max total context: 40,000 characters
```

Sau này nâng cấp sang token counter.

---

### 6.4. Thêm summary memory

Khi conversation dài, tạo summary:

```text
conversation_summary
```

Lưu vào DB để dùng lại.

Schema gợi ý:

```text
Conversation
- id
- title
- summary
- created_at
- updated_at
```

---

## Done khi

Bot hiểu được các câu follow-up như:

```text
giải thích lại ý trên
viết tiếp phần đó
tóm tắt đoạn vừa rồi
chuyển câu trả lời trên thành markdown
```

## Tiêu chí hoàn thành Phase 6

- Chat API gửi kèm lịch sử hội thoại gần nhất.
- Có giới hạn context để tránh quá dài.
- Bot trả lời follow-up tốt hơn rõ rệt.
- Không làm tăng latency quá nhiều.

---

# PHASE 7 - USER MEMORY SYSTEM

## Mục tiêu

Thêm bộ nhớ cá nhân hóa theo từng user.

## Khác với conversation context

Conversation context:

> Nhớ nội dung trong cuộc chat hiện tại.

User memory:

> Nhớ thông tin lâu dài của người dùng qua nhiều cuộc chat.

Ví dụ:

```text
User thích trả lời bằng tiếng Việt.
User đang làm project Nexa AI.
User học ICT.
User muốn giải thích dễ hiểu, từng bước.
```

## Cấu trúc DB đề xuất

```text
UserMemory
- id
- user_id
- key
- value
- source
- confidence
- created_at
- updated_at
```

Ví dụ:

```text
key: preferred_language
value: Vietnamese
confidence: 0.95
```

---

## API đề xuất

```text
GET /api/memory
POST /api/memory
DELETE /api/memory/<id>
```

---

## UI đề xuất

Trong settings thêm mục:

```text
Memory
- Những điều Nexa nhớ về bạn
- Cho phép sửa/xóa từng memory
- Tắt/bật memory
```

---

## Nguyên tắc an toàn

- Không tự lưu thông tin nhạy cảm.
- User phải xem/xóa được memory.
- Có setting tắt memory.
- Memory chỉ dùng cho chính user đó.

## Tiêu chí hoàn thành Phase 7

- Có bảng user memory.
- Có API quản lý memory.
- Có UI xem/xóa memory.
- Chat response được cá nhân hóa dựa trên memory.

---

# PHASE 8 - RAG FOR FILE UPLOADS

## Mục tiêu

Biến upload file từ “nhét text vào prompt” thành RAG thật sự.

## RAG v1 Flow

```text
Upload file
↓
Extract text
↓
Chunk text
↓
Create embeddings
↓
Store vector
↓
User asks question
↓
Retrieve relevant chunks
↓
Send chunks + citation to LLM
↓
Answer with source references
```

## Công nghệ gợi ý

Option đơn giản:

```text
PostgreSQL + pgvector
```

Option local/dev:

```text
ChromaDB
```

Option nhanh để demo:

```text
FAISS local
```

Khuyến nghị cho project của m:

```text
PostgreSQL + pgvector
```

vì sau này dễ deploy SaaS hơn.

---

## Schema đề xuất

```text
Document
- id
- user_id
- filename
- mime_type
- created_at

DocumentChunk
- id
- document_id
- chunk_index
- content
- embedding
- page_number
- created_at
```

---

## API đề xuất

```text
POST /api/documents/upload
GET /api/documents
DELETE /api/documents/<id>
POST /api/documents/search
```

---

## Citation format

Bot nên trả lời kiểu:

```text
Theo tài liệu đã upload, ...

Nguồn:
[1] filename.pdf - page 3
[2] report.docx - section 2
```

---

## Tiêu chí hoàn thành Phase 8

- Upload file được chunk.
- Có embedding lưu trong vector store.
- Khi hỏi, hệ thống retrieve chunk liên quan.
- Câu trả lời có citation.
- Không cần nhét toàn bộ file vào prompt.

---

# PHASE 9 - PERFORMANCE OPTIMIZATION

## Mục tiêu

Làm landing page và chat UI nhẹ hơn, mượt hơn trên mobile.

## Việc cần làm

### 9.1. Lazy-load Three.js Antigravity

**File:**

```text
chatbot-dashboard/src/components/ui/Antigravity.jsx
```

**Vấn đề:**

Three.js chunk quá nặng.

**Cách sửa:**

- Chỉ load trên desktop.
- Không load nếu `prefers-reduced-motion`.
- Lazy load sau khi Hero render xong.
- Giảm particle count trên mobile.

---

### 9.2. Tối ưu mobile landing

Checklist:

- Disable animation nặng trên mobile.
- Giảm blur/backdrop-filter.
- Giảm shadow lớn.
- Giảm fixed background.
- Tối ưu image size.

---

### 9.3. Tối ưu chat render

Nếu conversation dài:

- Không render toàn bộ message nếu quá nhiều.
- Có thể virtualize sau.
- Trước mắt giới hạn render recent messages + load more.

---

### 9.4. Tối ưu Markdown/KaTeX

- Chỉ render markdown cho message mới.
- Không re-render toàn bộ chat mỗi chunk streaming.
- Debounce math rendering.

## Tiêu chí hoàn thành Phase 9

- Landing page nhẹ hơn.
- Mobile bớt lag.
- Chat streaming không nhấp nháy.
- Build chunk size giảm.

---

# PHASE 10 - PRODUCT POSITIONING

## Mục tiêu

Làm rõ Nexa khác gì chatbot thông thường.

## Định vị đề xuất

Nexa nên đi theo hướng:

```text
Private BYOK AI Workspace for students, developers, and small teams.
```

Dịch dễ hiểu:

```text
Không gian làm việc AI riêng tư, cho phép người dùng tự kết nối API key, quản lý nhiều model, chat với tài liệu và lưu tri thức cá nhân.
```

---

## USP cần thể hiện trên landing page

1. Bring Your Own Key.
2. Multi-provider AI workspace.
3. Private chat history.
4. File understanding.
5. Personal memory.
6. Knowledge base/RAG.
7. Developer-friendly.
8. Self-hostable.

---

## Landing page cần sửa nội dung

Hero nên trả lời ngay:

```text
Nexa là gì?
Dùng để làm gì?
Khác ChatGPT ở đâu?
Tại sao nên dùng?
```

Ví dụ headline:

```text
Your private AI workspace for every model, file, and idea.
```

Subheadline:

```text
Connect your own API keys, chat with multiple AI providers, upload documents, and build a personal knowledge workspace that stays under your control.
```

---

## Tiêu chí hoàn thành Phase 10

- Landing page nói rõ sản phẩm là gì.
- Người mới vào hiểu trong 5 giây.
- Có section so sánh với ChatGPT/Open WebUI/TypingMind.
- Có use cases thực tế.

---

# PHASE 11 - PRODUCTION READINESS

## Mục tiêu

Chuẩn bị deploy nghiêm túc.

## Việc cần làm

### 11.1. Dockerfile

Tạo:

```text
Dockerfile
.dockerignore
```

---

### 11.2. GitHub Actions CI

Tạo:

```text
.github/workflows/ci.yml
```

CI cần chạy:

```bash
cd chatbot-simple && pip install -r requirements.txt && python -m pytest -q
cd chatbot-dashboard && npm ci && npm run build
```

---

### 11.3. Logging

Thêm structured logging cho:

- Auth errors
- Provider errors
- Upload errors
- Chat errors
- Rate limit

---

### 11.4. Monitoring

Có thể thêm:

```text
Sentry
```

để bắt lỗi production.

---

### 11.5. Storage production

Local uploads nên chuyển sang:

```text
S3 / Cloudflare R2 / Google Cloud Storage
```

---

## Tiêu chí hoàn thành Phase 11

- Có Dockerfile.
- Có GitHub Actions.
- Có migration.
- Có production env checklist.
- Có logging/monitoring cơ bản.
- Có cloud upload storage hoặc ít nhất abstraction để thay storage.

---

# PHASE 12 - PORTFOLIO POLISH

## Mục tiêu

Biến project thành case study mạnh để đưa vào CV/GitHub/portfolio.

## Việc cần làm

### 12.1. Viết README chuyên nghiệp

README cần có:

```text
- Project overview
- Key features
- Architecture diagram
- Tech stack
- Screenshots
- Setup local
- Environment variables
- Security design
- AI architecture
- Roadmap
```

---

### 12.2. Thêm architecture diagram

Dạng text hoặc ảnh:

```text
Frontend Landing
↓
Flask Workspace
↓
Auth / Provider / Chat / Upload Services
↓
Database + Object Storage + Vector Store
↓
AI Providers
```

---

### 12.3. Viết case study

Tạo file:

```text
docs/CASE_STUDY.md
```

Nội dung:

```text
Problem
Solution
Architecture
Hardest technical challenges
Security decisions
AI features
What I learned
Next steps
```

---

### 12.4. Demo video/screenshots

Cần có:

- Landing page screenshot
- Login screenshot
- Chat screenshot
- Provider manager screenshot
- File upload screenshot
- Streaming response screenshot
- Memory/RAG screenshot nếu có

## Tiêu chí hoàn thành Phase 12

- GitHub nhìn chuyên nghiệp.
- README rõ ràng.
- Có demo/case study.
- Project đủ mạnh để đưa vào CV.

---

# EXECUTION CHECKLIST

## Milestone 1 - Safe to Develop

- [ ] Fix `requirements.txt`
- [ ] Remove Firebase JSON secret
- [ ] Remove production credential fallback
- [ ] Add `.env.example`
- [ ] Backend tests pass

## Milestone 2 - Clean Codebase

- [ ] Remove runtime logs
- [ ] Remove/archive old artifacts
- [ ] Remove unused dependencies
- [ ] Frontend build pass

## Milestone 3 - Maintainable Backend

- [ ] Add route blueprints
- [ ] Move health routes
- [ ] Move auth routes
- [ ] Move provider routes
- [ ] Move conversation routes
- [ ] Move upload routes
- [ ] Move chat route
- [ ] Backend tests pass

## Milestone 4 - Database Foundation

- [ ] Install Alembic
- [ ] Add initial migration
- [ ] Disable `create_all()` in production
- [ ] Migration works on clean DB

## Milestone 5 - Maintainable Frontend

- [ ] Split constants
- [ ] Split API client
- [ ] Split state
- [ ] Split message renderer
- [ ] Split markdown/math renderer
- [ ] Split uploads
- [ ] Split providers
- [ ] Split streaming
- [ ] Manual chat QA pass

## Milestone 6 - Real Chat Memory

- [ ] Add context builder
- [ ] Send recent messages to provider
- [ ] Add context limit
- [ ] Add conversation summary
- [ ] Follow-up questions work

## Milestone 7 - Personal Memory

- [ ] Add memory table
- [ ] Add memory API
- [ ] Add memory settings UI
- [ ] Inject user memory into chat context
- [ ] User can delete memory

## Milestone 8 - RAG v1

- [ ] Add document table
- [ ] Add chunk table
- [ ] Add embeddings
- [ ] Add vector search
- [ ] Retrieve chunks during chat
- [ ] Add citations

## Milestone 9 - Performance

- [ ] Lazy-load Three.js
- [ ] Reduce mobile animations
- [ ] Optimize chat rendering
- [ ] Optimize markdown/math rendering
- [ ] Build size reduced

## Milestone 10 - Product Upgrade

- [ ] Rewrite landing content
- [ ] Add clear USP
- [ ] Add use cases
- [ ] Add comparison section
- [ ] Add pricing/future plan placeholder if needed

## Milestone 11 - Production

- [ ] Add Dockerfile
- [ ] Add GitHub Actions
- [ ] Add logging
- [ ] Add Sentry or monitoring
- [ ] Add storage abstraction
- [ ] Add deployment guide

## Milestone 12 - Portfolio

- [ ] Rewrite README
- [ ] Add architecture diagram
- [ ] Add screenshots
- [ ] Add `docs/CASE_STUDY.md`
- [ ] Add roadmap section

---

# RECOMMENDED FIRST 5 CODING TASKS

Nếu bắt đầu ngay từ hôm nay, làm theo thứ tự này:

## Task 1

Fix `chatbot-simple/requirements.txt` và đảm bảo fresh install chạy được.

## Task 2

Xóa Firebase service account JSON khỏi project, rotate key, chuyển sang env.

## Task 3

Tạo `.env.example` + kiểm tra lại `.gitignore`.

## Task 4

Xóa log/runtime artifact và dependency không dùng.

## Task 5

Tách `app.py` phần health/auth route trước để bắt đầu backend refactor an toàn.

---

# PROMPT DÙNG CHO CODEX / CLINE / CLAUDE CODE

Dùng prompt này để bắt đầu sửa từng phần:

```text
You are working on the Nexa AI chatbot project.

Read `NEXA_AI_REFACTOR_ROADMAP.md` first.

Only implement the current task I specify. Do not refactor unrelated files.

Rules:
- Preserve existing behavior unless the task explicitly says otherwise.
- Keep API routes and response formats backward-compatible.
- After changes, run relevant tests/build.
- Explain exactly which files were changed and why.
- If a change is risky, stop and explain before applying it.

Current task:
[PASTE TASK HERE]
```

---

# FINAL TARGET

Sau khi hoàn thành roadmap này, Nexa nên đạt trạng thái:

```text
AI Workspace MVP+
```

Với các điểm mạnh:

- Codebase dễ maintain.
- Backend có cấu trúc rõ.
- Frontend chat không còn monolithic.
- Có memory thật.
- Có RAG thật.
- Có deployment foundation.
- Có security foundation.
- Có portfolio/case study chuyên nghiệp.

Điểm portfolio kỳ vọng sau khi hoàn thành:

```text
8.5/10 - 9/10
```

Đặc biệt phù hợp để apply:

- Full Stack Developer Intern
- Backend Developer Intern
- AI Application Engineer Intern
- AI Product Engineer Intern
