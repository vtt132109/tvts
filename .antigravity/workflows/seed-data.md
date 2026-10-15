---
name: seed-data
description: "Tự động sinh dữ liệu mẫu (Mock Data) sát với thực tế (30 CTV, lịch luân phiên 4 tuần, sự kiện đi tour, đề xuất đổi ca) và nạp vào ứng dụng/giao diện để người dùng có thể test ngay trên localhost mà không cần tự nhập tay từng dòng."
trigger: /seed-data
---

# Workflow: Nạp Dữ Liệu Giả Lập Mẫu Chuẩn (Seed Mock Data)

Quy trình tự động hóa nạp bộ dữ liệu giả lập sát với thực tế vận hành của **Ban Tuyển Sinh HCM-UTE**. Lệnh `/seed-data` giúp kiểm thử toàn diện mọi tính năng (xếp ca tự động, luân phiên 4 tuần, tính bảng công tháng, quản lý sự kiện, đổi ca trực) trên môi trường cục bộ (`http://localhost:8000`) chỉ với một thao tác duy nhất.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng kích hoạt lệnh `/seed-data`, Agent thực hiện tuần tự 5 bước:

### Bước 1: Khởi Tạo Mẫu Dữ Liệu Chuẩn Thực Tế
Agent nạp dữ liệu từ kho mẫu [js/sample30.js](file:///d:/New%20folder%20(236)/js/sample30.js) và bộ cấu hình chuẩn:
1. **30 Sinh viên CTV:**
   - 12 Người Cũ (`role: 'old'`) có kinh nghiệm trực ban.
   - 18 Người Mới (`role: 'new'`) tập sự tuyển sinh.
   - Phân bổ ca rảnh thực tế từ Thứ 2 đến Thứ 6 (Sáng & Chiều).
2. **Cấu Hình Cổng Đăng Ký (`ts_reg_config`):**
   - Trạng thái: Cổng Mở (`isRegOpen: true`), Chế độ: `always_open`, Đã công bố lịch: `publishSchedule: true`.
3. **Lịch Phân Công 4 Tuần (`ts_scheduler_month_schedule`):**
   - Tự động chạy thuật toán `solveMultiWeekSchedule` để xếp đủ 4 tuần luân phiên, bảo đảm mỗi ca trực có đúng 1 Người Cũ và 1 Người Mới.
4. **Sự Kiện Đi Tour / Ngoại Kiểm Mẫu (`ts_scheduler_events_v1`):**
   - Sự kiện 1: "Tư Vấn Hướng Nghiệp THPT Gia Định" (Buổi Sáng, 1 công).
   - Sự kiện 2: "Ngày Hội Mở Trường Open Day UTE 2026" (Cả Ngày, 2 công).
   - Sự kiện 3: "Hội Thảo Tuyển Sinh Quốc Tế" (Buổi Chiều, 1 công).
5. **Đề Xuất Đổi Ca Trực Mẫu (`ts_scheduler_swap_requests`):**
   - 1 đề xuất Chờ duyệt (`status: 'pending'`).
   - 1 đề xuất Đã duyệt (`status: 'approved'`).

### Bước 2: Nạp Vào Hệ Thống Trực Tuyến & Lưu Trữ Cục Bộ
Chạy script tự động nạp dữ liệu vào Storage:
```powershell
node scripts/seed_mock_data.js
```
Hoặc nạp trực tiếp qua Chrome DevTools MCP bằng cách thực thi trong console trình duyệt:
```javascript
window.SampleDataEngine && window.SampleDataEngine.loadAllSampleData();
```

### Bước 3: Xác Thực Tính Toàn Vẹn Của Dữ Liệu
Kiểm tra lại toàn bộ các khóa lưu trữ chuẩn (`STORAGE_KEYS`):
- `ts_scheduler_students` (30 sinh viên)
- `ts_scheduler_month_schedule` (4 tuần đầy đủ ca)
- `ts_reg_config` (Cổng mở & công bố)
- `ts_scheduler_events_v1` (Danh sách sự kiện có gán sinh viên)

### Bước 4: Tự Động Kiểm Thử Trực Quan Trên Trình Duyệt
Agent truy cập `http://localhost:8000/admin.html` và `http://localhost:8000/index.html` để xác nhận:
- Bảng lịch trực 4 tuần hiển thị đầy đủ tên CTV.
- Bảng chấm công tháng hiển thị tổng công chính xác (công VP + công sự kiện).
- Không có lỗi nào trên Console F12.

---

## 📢 Báo Cáo Hoàn Tất

Sau khi hoàn tất, Agent in bảng tóm tắt:
- Số lượng CTV đã nạp: 30 (12 Cũ + 18 Mới).
- Số tuần lịch trực đã giải: 4 tuần.
- Số sự kiện ngoại kiểm: 3 sự kiện.
- Link kiểm tra trực tiếp: [Cổng Sinh Viên](http://localhost:8000/index.html) | [Trang Quản Trị](http://localhost:8000/admin.html).
