# Kế Hoạch Triển Khai: Thiết Kế Lại Admin Chuyên Nghiệp, Thao Tác Chọn Nhiều CTV, Đổi Tên "Tập Sự / Chính Thức", Giấu Vai Trò Ở Sinh Viên & Tinh Giản Toàn Bộ

## 1. Tổng Quan (Overview)
Các yêu cầu nâng cấp toàn diện từ người dùng (Tris):
1. **Thiết kế lại Bảng Quản Trị (Admin) cân đối, thanh lịch, chuyên nghiệp (Loại bỏ cảm giác "AI"):**
   - Loại bỏ khối hero tím gradient sặc sỡ và 2 hàng nút bấm lộn xộn, bất đối xứng (như ảnh Tris chụp).
   - Tái cấu trúc thành giao diện Dashboard Enterprise/SaaS chuẩn mực: Bố cục Header + Action Bar phân cấp rõ ràng, màu sắc đồng nhất, nút bấm tinh tế.
2. **Thêm tính năng Chọn Nhiều Người (Bulk Multi-Select) trong Admin:**
   - Tích chọn nhiều sinh viên (hoặc Chọn tất cả).
   - Thanh thao tác hàng loạt: Chuyển đồng loạt thành **Chính Thức** hoặc **Tập Sự**, Xóa ca hàng loạt, Xóa sinh viên hàng loạt.
3. **Chuẩn hóa danh xưng vai trò & Bảo mật thông tin vai trò:**
   - Đổi "Người mới" $\rightarrow$ **"Tập sự"**.
   - Bỏ chữ "Người cũ" $\rightarrow$ Đổi thành **"Chính thức"**.
   - **CHỈ bên Admin thấy được ai là Chính Thức, ai là Tập Sự.**
   - **Bên Cổng Sinh Viên (`index.html`):** Khi nhập MSSV hoặc xem lịch trực tuyệt đối **KHÔNG hiển thị bất kỳ nhãn nào về Chính Thức hay Tập Sự**, đảm bảo tính bình đẳng, bảo mật và văn minh cho CTV.
4. **Bắt buộc nhập MSSV mới được chọn ca (MSSV-First Selection Flow).**
5. **Cho xem ca trực tháng trước luôn (Previous Month Schedule View).**
6. **Cho phép đăng ký tối đa / tối thiểu là 0 ca (0 ca hoàn toàn hợp lệ ở cả Sinh Viên và Admin).**
7. **Thêm nút Xóa ca ở cả Sinh Viên và Admin.**
8. **Kiểm tra chuyên sâu cho điện thoại di động (Mobile Phone Check & QA).**

---

## 2. Quyết Định Kiến Trúc & Thiết Kế (Architecture & UI/UX Decisions)

### Quyết định 1: Tái thiết kế Hero & Toolbar Admin (Loại bỏ phong cách "AI")
- **Hiện trạng:** Hero tím gradient đậm `#1e1b4b` -> `#4338ca` với nút cầu vồng `btn-magic`, nút xanh lá, nút trắng viền tím, nút viền đỏ dàn trải hỗn loạn không cân xứng.
- **Thiết kế mới (Enterprise Minimalist):**
  - **Khung chứa (Container):** Nền thẻ card trắng ngà sang trọng (Dark mode: Navy mịn), viền subtle border `1px solid var(--border-color)`.
  - **Phần thông tin (Left):** Tiêu đề "Điều Phối & Phân Bổ Lịch Trực" + Huy hiệu số ca đã phân bổ + Công tắc công bố lịch trực.
  - **Phần thao tác (Right):**
    - **Nút hành động chính:** `[⚡ Tự Động Phân Bổ Lịch]` (Primary Blue/Indigo sắc nét, thanh lịch).
    - **Nhóm công cụ xuất bản (Export & Report):** Gom thành các nút pill đồng nhất: `[📊 Xuất Excel UTE]`, `[📋 Bảng Chấm Công]`, `[📋 Sao Chép (Ctrl+V)]`.
    - **Nhóm hành động nâng cao:** Menu dropdown hoặc nút phụ gọn gàng `[🗑️ Xóa Lịch]`, `[👥 Xóa Tất Cả SV]`.

### Quyết định 2: Tính năng Chọn Nhiều CTV (Bulk Multi-Select)
- Cột checkbox đầu tiên trong Bảng Quản Lý Sinh Viên:
  - Header: `<input type="checkbox" id="cb-student-select-all">`
  - Từng dòng: `<input type="checkbox" class="cb-student-row" data-id="${s.id}">`
- Khi có ít nhất 1 CTV được chọn $\rightarrow$ Thanh công cụ nổi (Sticky Floating Bar):
  - *"Đã chọn X sinh viên:"*
  - **`[🎓 Chuyển Thành Chính Thức]`**
  - **`[🌱 Chuyển Thành Tập Sự]`**
  - **`[🧹 Xóa Ca Của Các Bạn Đã Chọn]`**
  - **`[🗑️ Xóa Khỏi Hệ Thống]`**
- Thao tác chuyển hàng loạt cập nhật tức thì dữ liệu, chạy lại xếp ca và đồng bộ Cloud.

### Quyết định 3: Danh xưng "Chính Thức" & "Tập Sự" — Chỉ hiển thị bên Admin
- Dữ liệu ngầm: `role: 'old'` $\rightarrow$ Hiển thị là **Chính Thức** (🎓), `role: 'new'` $\rightarrow$ Hiển thị là **Tập Sự** (🌱).
- **Cổng Sinh Viên:**
  - Xóa bỏ mọi badge, nhãn hay chữ liên quan đến vai trò.
  - Khi nhập MSSV chỉ hiển thị: `Mã số sinh viên: 2102001` (và Tên nếu có), không có role.
  - Trên bảng phân ca công bố: Chỉ hiển thị tên 2 bạn trực ca (ví dụ: An & Bình), không có nhãn "Người cũ" hay "Người mới/Tập sự".
- **Bên Admin:** Hiển thị rõ ràng trong bảng nhân sự và ma trận xếp ca để phục vụ điều phối.

### Quyết định 4: Bắt Buộc Nhập MSSV Mới Mở Khóa Chọn Ca
- Form sinh viên khóa màng mờ nếu chưa gõ MSSV.
- Gõ MSSV xong $\rightarrow$ Mở khóa chọn ca rảnh, tự động điền lại ca cũ nếu đã từng đăng ký.

### Quyết định 5: Xem Ca Trực Tháng Trước & Đăng Ký 0 Ca
- Bổ sung bộ chuyển đổi Tháng Này (Tháng 10) vs Tháng Trước (Tháng 09).
- Cho phép lưu 0 ca thành công mỹ mãn không báo lỗi.

---

## 3. Danh Sách Nhiệm Vụ Thực Thi (Task List)

### Phase 1: Tinh Chỉnh Giao Diện Admin & Thao Tác Chọn Nhiều (`admin.html`, `js/admin.js`, `css/style.css`)
- [ ] **Task 1: Thiết kế lại Schedule Hero & Toolbar Admin chuyên nghiệp**
  - Thay thế khối hero tím gradient bằng giao diện Dashboard Enterprise thanh lịch, phân cấp thị giác rõ ràng, màu sắc đồng nhất.
  - *Tệp:* `admin.html`, `css/style.css`
- [ ] **Task 2: Thêm tính năng Chọn nhiều sinh viên & Thanh Thao tác hàng loạt (Bulk Actions)**
  - Thêm checkbox chọn tất cả và checkbox từng dòng trong bảng CTV.
  - Thanh Bulk Action Bar: Chuyển sang Chính Thức, Chuyển sang Tập Sự, Xóa ca hàng loạt.
  - *Tệp:* `admin.html`, `js/admin.js`, `css/style.css`
- [ ] **Task 3: Cập nhật thuật ngữ "Chính Thức" & "Tập Sự" và Thêm nút Xóa ca ở Admin**
  - Đổi toàn bộ nhãn hiển thị trong Admin sang "Chính Thức" và "Tập Sự".
  - Thêm nút `🧹 Xóa ca` trực tiếp ở từng dòng CTV và trong modal sửa CTV. Bỏ chặn lưu khi 0 ca rảnh.
  - *Tệp:* `admin.html`, `js/admin.js`

### Phase 2: Tinh Giản Cổng Sinh Viên & Ẩn Hoàn Toàn Vai Trò (`index.html`, `js/student.js`)
- [ ] **Task 4: Xóa bỏ Họ tên, SĐT, Phân loại vai trò trên Cổng Sinh Viên**
  - Bỏ các trường input không cần thiết, chỉ giữ lại duy nhất MSSV.
  - Tuyệt đối ẩn kín thông tin vai trò (không hiển thị Chính Thức hay Tập Sự ở cổng sinh viên).
  - *Tệp:* `index.html`, `js/student.js`
- [ ] **Task 5: Triển khai luồng MSSV-First (Nhập MSSV mới được chọn ca)**
  - Khóa chọn ca khi chưa có MSSV, mở khóa khi gõ MSSV, tự động nạp lại ca cũ nếu có.
  - *Tệp:* `index.html`, `js/student.js`
- [ ] **Task 6: Thêm chức năng Xem Lịch Trực Tháng Trước & Cho Phép Đăng Ký 0 Ca**
  - Thêm bộ chuyển đổi xem tháng trước (Tháng 09/2026).
  - Cho phép lưu 0 ca rảnh thành công, thêm nút Xóa ca tuần này và Hủy toàn bộ ca tháng.
  - *Tệp:* `index.html`, `js/student.js`

### Phase 3: Tối Ưu Thẩm Mỹ & Kiểm Tra Điện Thoại Di Động
- [ ] **Task 7: Hoàn thiện CSS Responsive & Trải nghiệm ngón cái trên Mobile**
  - Bàn phím số tự bật cho MSSV (`inputmode="numeric"`).
  - Sticky Bottom Bar cho các nút hành động trên mobile.
  - Touch targets $\ge 48\text{px}$, 0 lỗi tràn ngang.
  - *Tệp:* `css/style.css`
- [ ] **Task 8: Kiểm thử chuyên sâu trên Mobile qua Chrome DevTools & Chụp ảnh nghiệm thu**
  - Giả lập mobile viewport (iPhone 14 / Android).
  - Chụp ảnh màn hình nghiệm thu giao diện Cổng Sinh Viên và Bảng Quản Trị mới.
  - *Tệp:* Chrome DevTools
- [ ] **Task 9: Kiểm thử tự động toàn hệ thống & Đẩy lên GitHub**
  - Chạy `tests/run_all_tests.js` và `scripts/clean_code.js` xác nhận 141/141 tests PASS 100%.
  - Commit và push lên GitHub `origin main`.
  - *Tệp:* tests, git
