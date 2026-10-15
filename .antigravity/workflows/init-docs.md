---
name: init-docs
description: "Tự động quét toàn bộ mã nguồn, cấu trúc thư mục và tài liệu API để tạo hoặc cập nhật lại file README.md chuẩn tài liệu kỹ thuật cao cấp (Architecture, Tech Stack, Features, Installation, Directory Tree, Multi-Agent System)."
trigger: /init-docs
---

# Workflow: Khởi Tạo & Cập Nhật Tài Liệu Kỹ Thuật (/init-docs)

Quy trình tự động hóa quét toàn bộ cấu trúc dự án và tạo mới/cập nhật lại file `README.md` chuẩn mực, đồng bộ hóa giữa hiện trạng mã nguồn thực tế và tài liệu kỹ thuật hướng dẫn người dùng.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng kích hoạt lệnh `/init-docs`, Agent thực hiện tuần tự 4 bước:

### Bước 1: Quét Toàn Bộ Cấu Trúc Mã Nguồn & Thư Mục
Quét toàn diện các file và thư mục thực tế trong workspace:
```powershell
Get-ChildItem -Recurse -Depth 3 | Where-Object { $_.FullName -notmatch '\\\.git\\' }
```

### Bước 2: Bóc Tách API & Tính Năng Từ Mã Nguồn
- **Trang Cổng Sinh Viên (`index.html`, `js/student.js`):**
  - Đăng ký ca rảnh, kiểm tra trùng MSSV, khóa form khi cổng đóng.
  - Tra cứu lịch trực cá nhân theo MSSV và đổi ca trực.
- **Trang Quản Trị (`admin.html`, `js/admin.js`):**
  - Xác thực bảo mật 2 lớp (`window.AdminAuth`): Username/Password & Quick PIN.
  - Cấu hình mở/đóng cổng đăng ký thời gian thực (`RegConfig`).
  - Xếp ca tự động luân phiên 4 tuần (`window.Scheduler`).
  - Xuất bảng tính Excel XML và sao chép 1-click vào Google Sheets chuẩn mẫu HCM-UTE.
- **Bộ Kiểm Thử Tự Động (`tests/run_all_tests.js`):**
  - 12 bài test tự động cho Scheduler và Auth Guard.
- **Hệ Thống Multi-Agent (`.antigravity/`):**
  - Subagents: `@backend-agent`, `@frontend-agent`, `@qa-agent`.
  - Bộ nhớ: `project-context.md`, `api-contracts.md`, `taskboard.md`, `lessons-learned.md`, `handover-state.md`.
  - Danh mục Workflows: `/rollback`, `/code-review`, `/merge-clean`, `/benchmark`, `/handover`, `/init-docs`.

### Bước 3: Soạn Thảo & Cập Nhật `README.md`
Tự động định dạng lại `README.md` với các mục bắt buộc:
1. **Tiêu đề & Giới thiệu tổng quan dự án.**
2. **Sơ đồ kiến trúc hệ thống (Mermaid Architecture Diagram).**
3. **Cây cấu trúc thư mục chi tiết (Directory Tree).**
4. **Hướng dẫn cài đặt & triển khai (Offline `file:///`, Local Web Server, GitHub Pages).**
5. **Đặc tả chức năng chi tiết (Cổng Sinh Viên & Bảng Quản Trị).**
6. **Hệ thống Multi-Agent Tự Trị Antigravity & Bảng tra cứu lệnh `/`.**
7. **Quy trình chạy kiểm thử tự động (CI Test Runner).**

### Bước 4: Kiểm Tra Định Dạng & Lưu Git
```powershell
git add README.md
git commit -m "docs: regenerate project README with comprehensive architecture and multi-agent guide"
```

---

## 📢 Thông Báo Hoàn Tất
Agent thông báo file `README.md` đã được đồng bộ hoàn hảo với toàn bộ hiện trạng kỹ thuật của dự án.
