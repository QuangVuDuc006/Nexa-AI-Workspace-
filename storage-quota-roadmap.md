# Nexa AI - Storage Quota Roadmap

## Mục tiêu

Do người dùng tự cung cấp API Key nên hệ thống không cần giới hạn token sử dụng.

Thay vào đó, cần giới hạn tài nguyên lưu trữ nhằm:

* Tránh người dùng chiếm quá nhiều dung lượng hệ thống.
* Kiểm soát chi phí database và RAG.
* Tạo nền tảng cho các gói trả phí trong tương lai.

---

# Gói Free

## Storage

* Tổng dung lượng: 75 MB
* Kích thước tối đa mỗi file: 10 MB

## Giới hạn khác

* Conversations: 100
* Memories: 30
* Provider Connections: 5

Hiện tại không giới hạn số lượng tin nhắn vì người dùng sử dụng API Key riêng.

---

# Cơ chế Quota

## Mức 1: Cảnh báo (80%)

Khi người dùng sử dụng từ 60 MB trở lên:

```text
⚠️ Bạn đã sử dụng 80% dung lượng lưu trữ.

Hãy xóa các file không cần thiết hoặc nâng cấp gói.
```

---

## Mức 2: Chặn Upload (100%)

Khi người dùng đạt 75 MB:

```text
❌ Không thể tải thêm file.

Dung lượng hiện tại:
75 MB / 75 MB

Vui lòng:
- Xóa file cũ
hoặc
- Nâng cấp gói
```

Lưu ý:

* Vẫn được chat bình thường.
* Vẫn được sử dụng API Key cá nhân.
* Vẫn được truy cập các file đã upload.
* Chỉ chặn upload file mới.

---

# Phase 1 - Backend Quota

## Database

Thêm các trường:

```sql
storage_used_bytes BIGINT
storage_limit_bytes BIGINT
plan VARCHAR(50)
```

Mặc định:

```text
storage_limit_bytes = 75 MB
```

## Upload Validation

Trước khi upload:

```python
if storage_used + file_size > storage_limit:
    return 403
```

---

# Phase 2 - Storage Usage UI

Tạo 1 mục riêng để hiển thị " Usage":
- Cái này sẽ tính theo %; tạo 1 thanh hoặc cột để hiển thị %
```text
Storage Usage


████████░░░░░░░░░░
43%
```

---

# Phase 3 - Warning System

Hiển thị banner khi:

```text
storage_used >= 60 MB
```

Thông báo:

```text
⚠️ Bạn đã sử dụng 80% dung lượng lưu trữ.
```

---

# Phase 4 - File Management

Trang Documents:

```text
Tên file
Kích thước
Ngày upload
Lần sử dụng cuối

[Delete]
```

Chức năng:

* Sort by Size
* Sort by Date
* Search Files

---

# Phase 5 - Trash System

Khi người dùng xóa file:

```text
Documents
↓
Trash
↓
7 ngày
↓
Delete Forever
```

Mục tiêu:

* Tránh xóa nhầm dữ liệu.
* Giảm khiếu nại từ người dùng.

---

# Phase 6 - Storage Breakdown

Hiển thị chi tiết:

```text
Storage Breakdown

Files: 48 MB
Embeddings: 23 MB
Memory: 1 MB
Other: 0.5 MB
```

Giúp người dùng hiểu nguyên nhân chiếm dung lượng.

---

# MVP Khuyến Nghị

Để triển khai nhanh:

## Bắt buộc

* Theo dõi storage_used_bytes
* Chặn upload khi vượt 75 MB
* Cảnh báo khi vượt 60 MB

## Có thể làm sau

* Trash
* Storage Breakdown
* Archive Conversations
* Gói trả phí

---

# Kết luận

Phiên bản hiện tại nên áp dụng:

* 75 MB Storage/User
* Warning tại 80% (60 MB)
* Chặn upload tại 100% (75 MB)
* Không tự động xóa file của người dùng
* Chat vẫn hoạt động bình thường khi hết quota

Đây là phương án đơn giản, dễ triển khai và ít gây khó chịu cho người dùng nhất.
