# Danh Sách Nhiệm Vụ (Task List) - Thiết Kế Lại Admin, Bulk Actions, Tập Sự/Chính Thức, Ẩn Vai Trò SV & Mobile

## Phase 1: Tinh Chỉnh Giao Diện Admin & Thao Tác Chọn Nhiều (`admin.html`, `js/admin.js`, `css/style.css`)
- [x] **Task 1:** Thiết kế lại khối Schedule Hero & Toolbar Admin: Bỏ dải màu gradient tím/hồng lòe loẹt, sắp xếp các nút bấm theo nhóm hành động có phân cấp thị giác rõ ràng (Enterprise UI).
  - *Acceptance:* Không còn nút bấm hỗn loạn màu mè; bố cục cân đối, sang trọng.
  - *Verification:* Kiểm tra hiển thị trong `admin.html`.
- [x] **Task 2:** Thêm tính năng Chọn nhiều sinh viên & Thanh Thao tác hàng loạt (Bulk Actions): Thêm checkbox chọn tất cả và checkbox từng dòng trong bảng CTV; thêm thanh thao tác chuyển đồng loạt sang Chính Thức / Tập Sự / Xóa ca.
  - *Acceptance:* Chọn 5-10 bạn rồi bấm đổi vai trò đồng loạt thành công tức thì.
  - *Verification:* `node -c js/admin.js` hợp lệ.
- [x] **Task 3:** Cập nhật thuật ngữ "Chính Thức" & "Tập Sự" trong Admin, thêm nút "🧹 Xóa ca" ở từng dòng CTV và modal sửa, bỏ chặn khi lưu 0 ca.
  - *Acceptance:* Trong Admin hiển thị badge "Chính Thức" và "Tập Sự"; xóa ca CTV về 0 ca hoạt động mượt mà.
  - *Verification:* `node -c js/admin.js` hợp lệ.

## Checkpoint 1: Sau Phase 1
- [x] Giao diện Admin chuyên nghiệp, cân đối, không còn cảm giác "AI".
- [x] Thao tác chọn nhiều người đổi vai trò hoạt động mượt mà.

## Phase 2: Tinh Giản Cổng Sinh Viên & Ẩn Hoàn Toàn Vai Trò (`index.html`, `js/student.js`)
- [x] **Task 4:** Xóa bỏ Họ tên, SĐT, Phân loại vai trò trên Cổng Sinh Viên; TUYỆT ĐỐI ẩn kín thông tin vai trò (không hiển thị Chính Thức hay Tập Sự ở cổng sinh viên).
  - *Acceptance:* Cổng sinh viên chỉ có ô nhập MSSV; lịch trực công bố không có nhãn phân loại vai trò.
  - *Verification:* `node scripts/clean_code.js` xác nhận cân bằng thẻ.
- [x] **Task 5:** Triển khai luồng MSSV-First: Bắt buộc nhập MSSV mới mở khóa chọn ca rảnh; tự động nạp lại ca cũ nếu đã từng đăng ký.
  - *Acceptance:* Chưa có MSSV -> khóa chọn ca; có MSSV -> mở khóa tức thì.
  - *Verification:* `node -c js/student.js` hợp lệ.
- [x] **Task 6:** Thêm chức năng Xem Lịch Trực Tháng Trước & Cho Phép Đăng Ký 0 Ca ở Cổng Sinh Viên.
  - *Acceptance:* Cho phép lưu 0 ca thành công; có tab chuyển sang xem lịch Tháng 09/2026.
  - *Verification:* `node -c js/student.js` hợp lệ.

## Checkpoint 2: Sau Phase 2
- [x] Cổng sinh viên tinh giản, chỉ cần MSSV, bảo mật vai trò 100%.
- [x] Xem lịch tháng trước và xóa/lưu 0 ca hoạt động hoàn hảo.

## Phase 3: Tối Ưu Thẩm Mỹ & Kiểm Tra Điện Thoại Di Động
- [x] **Task 7:** Tối ưu CSS Responsive: Bàn phím số tự bật cho MSSV (`inputmode="numeric"`), sticky bottom bar trên mobile, touch targets $\ge 48\text{px}$, 0 lỗi tràn ngang.
  - *Acceptance:* Hiển thị hoàn hảo trên điện thoại.
  - *Verification:* Kiểm tra qua Chrome DevTools.
- [x] **Task 8:** Kiểm thử chuyên sâu trên Mobile qua Chrome DevTools & Chụp ảnh nghiệm thu.
  - *Acceptance:* Xác nhận không có lỗi trên các độ phân giải di động phổ biến.
  - *Verification:* Chrome DevTools Emulate Viewport (iPhone 14 / Android).
- [x] **Task 9:** Chạy toàn bộ bộ kiểm thử tự động, CI Harness và đẩy lên GitHub `main`.
  - *Acceptance:* 141/141 test cases PASS 100%, commit và push lên GitHub `origin main`.
  - *Verification:* `node tests/run_all_tests.js` exit code 0 và `git push origin main`.
