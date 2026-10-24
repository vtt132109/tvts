---
name: seed-data
description: "Nạp danh sách CTV thật từ file CSV cục bộ (data/ds-ctv.csv — 58 người) vào ứng dụng để kiểm thử trên localhost mà không cần nhập tay từng dòng."
trigger: /seed-data
---

# Workflow: Nạp Danh Sách CTV Từ CSV

Quy trình nạp danh sách CTV thật của Ban Tuyển Sinh HCM-UTE vào **Hệ Thống Quản Lý Phân Công Lịch Trực**. Dữ liệu mẫu JSON cũ (`default_students.json`, `mock_seed_data.json`) và `js/sample30.js` đã được xoá; nguồn chuẩn hiện tại là file CSV cục bộ, không commit vì chứa PII.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

### Bước 1: Kiểm Tra File CSV Nguồn
- File chuẩn: `data/ds-ctv.csv` (58 dòng dữ liệu: 28 CTV cũ + 30 CTV mới).
- Cột: `STT`, `Họ và tên`, `MSSV`, `Email`, và cột thứ 5 ghi vai trò (`CTV cũ` / `CTV mới`).
- File gốc đầy đủ hơn (Khoa, Ngành, SĐT, Ngân hàng) nằm ở thư mục gốc repo; **không được commit** (đã bị `.gitignore` chặn `*.csv`).

### Bước 2: Nạp Qua Giao Diện Quản Trị
1. Mở `admin.html` → đăng nhập.
2. Vào tab **Quản lý sinh viên** → **📥 Nhập CSV** → chọn file CSV.
3. Kiểm tra bảng xem trước (MSSV, họ tên, vai trò, ca rảnh) rồi xác nhận nhập.
4. Nếu đang dùng Cloud: bấm **Đẩy Lên Cloud** sau khi nhập để đồng bộ.

Không còn script seed JSON. Hàm xử lý là `parseStudentsCsv` trong `js/admin.js`, lưu vào `localStorage` với khóa `ts_scheduler_students`.

### Bước 3: Xác Thực Tính Toàn Vẹn Dữ Liệu
Kiểm tra tối thiểu trong localStorage:
- `ts_scheduler_students`: đủ 58 hồ sơ, không trùng MSSV, không thiếu họ tên.
- Vai trò: 28 `old` + 30 `new`.
- Không có MSSV lạ ngoài danh sách CSV.

### Bước 4: Kiểm Tra Trực Quan Trên Trình Duyệt
Mở `http://localhost:8000/admin.html` và `http://localhost:8000/index.html` để xác nhận:
- Bảng quản lý CTV hiển thị đủ 58 người.
- Cổng sinh viên tra cứu được MSSV có trong CSV và chặn MSSV lạ.
- Không có lỗi trên Console F12.

---

## 📢 Báo Cáo Hoàn Tất

- Số CTV đã nạp: 58 (28 Cũ + 30 Mới).
- Nguồn: `data/ds-ctv.csv` (cục bộ, đã kiểm tra không commit).
- Link kiểm tra: [Cổng Sinh Viên](http://localhost:8000/index.html) | [Trang Quản Trị](http://localhost:8000/admin.html).
