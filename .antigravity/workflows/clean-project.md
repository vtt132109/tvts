---
name: clean-project
description: "Tự động quét và dọn dẹp các biến không sử dụng (unused variables), các hàm thừa (dead code), các dòng console.log dùng để debug tạm thời và format lại toàn bộ source code cho sạch sẽ."
trigger: /clean-project
---

# Workflow: Dọn Dẹp Mã Nguồn & Tối Ưu Dự Án (Clean Project)

Quy trình tự động hóa dọn dẹp, tái cấu trúc nhẹ và chuẩn hóa mã nguồn toàn diện cho **Hệ Thống Quản Lý Phân Công Lịch Trực Ban Tuyển Sinh HCM-UTE**. Lệnh `/clean-project` giúp dự án luôn gọn gàng, loại bỏ các tàn dư debug, dead code và giữ chất lượng code ở mức cao nhất.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng kích hoạt lệnh `/clean-project`, Agent thực hiện tuần tự 6 bước sau:

### Bước 1: Rà Soát Cú Pháp & Dead Code
Kiểm tra cú pháp của toàn bộ các tệp JavaScript trọng yếu:
```powershell
node -c js/scheduler.js ; node -c js/student.js ; node -c js/admin.js
```
- Quét các biến khai báo bằng `const`/`let` nhưng không bao giờ được đọc hay gán lại.
- Phát hiện các hàm khai báo nội bộ trong IIFE nhưng không được gọi và không được xuất ra API.

### Bước 2: Dọn Dẹp Nhật Ký Debug Tạm Thời (`console.log`)
- Rà soát các tệp `js/scheduler.js`, `js/student.js`, `js/admin.js`.
- Loại bỏ các dòng `console.log` phục vụ debug tạm thời trong quá trình phát triển (giữ lại các log thông báo trạng thái quan trọng hoặc cảnh báo lỗi `console.warn`/`console.error`).

### Bước 3: Thẩm Tra Tính Toàn Vẹn Cấu Trúc HTML
- Kiểm tra các file `index.html` và `admin.html`:
  - Đảm bảo toàn bộ các thẻ container `<div>` đều có thẻ đóng `</div>` tương ứng (tránh lặp lại lỗi DOM lồng modal trong bài học số 5 của `lessons-learned.md`).
  - Đảm bảo tất cả các Modal đều là thẻ con trực tiếp của thẻ `<body>`.
  - Kiểm tra các thuộc tính Accessibility (`aria-label`, `label` tường minh).

### Bước 4: Chuẩn Hóa Định Dạng Mã Nguồn (Code Formatting)
- Chuẩn hóa khoảng cách thụt dòng (2 spaces).
- Loại bỏ khoảng trắng thừa ở cuối dòng (trailing whitespace).
- Đảm bảo ký tự xuống dòng đồng nhất và kết thúc tệp bằng 1 dòng trống (newline at EOF).

### Bước 5: Chạy Kiểm Thử Hồi Quy Toàn Hệ Thống (Regression Testing)
Sau khi dọn dẹp, bắt buộc chạy lại toàn bộ CI Harness:
```powershell
node tests/run_all_tests.js
```
> [!IMPORTANT]
> Toàn bộ các test suites (72/72 tests) bắt buộc phải đạt **100% PASS**. Nếu có bất kỳ test nào thất bại, Agent phải khôi phục hoặc sửa lỗi ngay lập tức.

### Bước 6: Kiểm Tra Trực Quan F12 Trên Trình Duyệt (Auto-Heal Check)
Theo Giao thức 10, mở trình duyệt kiểm tra Console F12 của `http://localhost:8000/index.html` và `http://localhost:8000/admin.html` để đảm bảo sạch lỗi hoàn toàn.

---

## 📢 Báo Cáo Hoàn Tất

Báo cáo cho người dùng:
- Số dòng `console.log` debug tạm thời đã dọn dẹp.
- Số biến thừa/dead code đã loại bỏ.
- Trạng thái kiểm thử tự động (100% PASS).
- Trạng thái Console F12 (0 Errors).
