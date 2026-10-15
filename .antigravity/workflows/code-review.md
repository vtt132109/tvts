---
name: code-review
description: "Rà soát toàn diện diff code trên nhánh agent/* trước khi merge vào nhánh chính: kiểm tra lỗi cú pháp, lỗ hổng bảo mật (XSS, Plaintext), rò rỉ bộ nhớ, độ phức tạp thuật toán và chạy bộ kiểm thử tự động 100% PASS."
trigger: /code-review
---

# Workflow: Code Review & Quality Gate Trước Khi Merge

Quy trình thẩm định chất lượng và bảo mật tự động 5 chiều trước khi cho phép gộp code từ nhánh `agent/*` vào nhánh chính (`main`).

---

## 🔍 5 Tiêu Chuẩn Thẩm Định Bắt Buộc (Audit Dimensions)

Khi người dùng kích hoạt lệnh `/code-review`, Agent tự động thực hiện quy trình sau:

### 1. Phân Tích Khác Biệt Mã Nguồn (Diff Inspection)
Chạy lệnh kiểm tra toàn bộ các dòng code được thêm mới hoặc sửa đổi:
```powershell
git diff main...HEAD
```
- Đảm bảo không sửa nhầm file ngoài phạm vi yêu cầu.
- Đảm bảo tuân thủ cấu trúc phân tách trách nhiệm giữa `backend-agent` và `frontend-agent`.

### 2. Kiểm Tra Cú Pháp & Đóng Gói Phạm Vi (Syntax & Scope Isolation)
- Kiểm tra toàn bộ script trong `js/` có được bọc trong hàm IIFE `(() => { 'use strict'; ... })();` không.
- Kiểm tra tính đúng đắn của cú pháp JavaScript bằng Node.js:
  ```powershell
  node -c js/scheduler.js
  node -c js/student.js
  node -c js/admin.js
  ```

### 3. Rà Soát Lỗ Hổng Bảo Mật (Security Vulnerability Audit)
- **Stored/Reflected XSS:** 100% các biến chuỗi động từ người dùng (`fullName`, `studentId`, `phone`, `reason`) chèn vào DOM qua `innerHTML` bắt buộc phải bọc qua hàm `escapeHtml()`.
- **Thông tin xác thực:** Không lưu mật khẩu hoặc mã PIN dạng plaintext; không để lộ thông tin cán bộ ra màn hình công khai.
- **Formula Injection:** Không để các trường CSV/Excel bắt đầu bằng `=`, `+`, `-`, `@` mà không được vô hiệu hóa.

### 4. Rà Soát Hiệu Năng & Bộ Nhớ (Performance & Memory Audit)
- Không dùng vòng lặp lồng $O(N \times M)$ hoặc tra cứu tuyến tính $O(N)$ trong đệ quy; bắt buộc chuẩn hóa qua `Map` $O(1)$.
- Bảng dữ liệu lớn và preview CSV phải có giới hạn (Windowing/Pagination), không render ồ ạt hàng ngàn dòng cùng lúc gây đơ luồng chính.
- Ô tìm kiếm và sự kiện gõ phím phải có `debounce` (200ms - 250ms).

### 5. Chạy Kiểm Thử Tự Động (Automated Regression Test Gate)
Chạy bộ CI Harness toàn diện của dự án:
```powershell
node tests/run_all_tests.js
```
- **Điều kiện Gate:** Bắt buộc **12/12 Tests PASS (100% Success)**.
- Nếu có bất kỳ test case nào FAIL, từ chối merge ngay lập tức và chỉ rõ nguyên nhân.

---

## 🚦 Quyết Định & Hướng Dẫn Sau Review
- **Nếu ĐẠT (PASS):** Xuất bản báo cáo tóm tắt "Sẵn sàng merge" kèm hướng dẫn gộp nhánh:
  ```powershell
  git checkout main
  git merge <ten-nhanh-agent>
  git push origin main
  ```
- **Nếu KHÔNG ĐẠT (FAIL):** Chỉ rõ các dòng code cần khắc phục hoặc hướng dẫn dùng lệnh `/rollback` để phục hồi trạng thái an toàn.
