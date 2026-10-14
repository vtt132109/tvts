# Hệ Thống Quản Lý & Xếp Lịch Trực Ban Tuyển Sinh

Ứng dụng web chuyên nghiệp dành cho Văn phòng Tư Vấn Tuyển Sinh, được thiết kế phân quyền rõ rệt thành **2 trang riêng biệt**:
1. 👤 **Trang Người Dùng / Cổng Sinh Viên (`index.html`):** Chỉ dùng để điền thông tin cá nhân (Họ tên, MSSV, SĐT, phân loại Mới/Cũ), chọn ca rảnh và tra cứu/xem lịch trực chung. Không thể can thiệp xếp lịch hay sửa/xóa người khác.
2. 🛡️ **Trang Quản Trị / Bảng Điều Hành (`admin.html`):** Dành riêng cho Ban điều phối để quản lý danh sách sinh viên, chạy thuật toán tự động xếp ca, hoán đổi người trực thủ công, nạp demo 30 sinh viên, xuất Excel và in ấn.

---

## 🚀 Đột Phá Mới: Demo 30 Sinh Viên & Luân Phiên 2 Tuần (100% Đều Có Ca)

- **Bài toán thực tế:** 1 tuần gồm 10 ca hành chính (Thứ 2 đến Thứ 6, Sáng & Chiều). Mỗi ca bắt buộc đúng **2 bạn (1 Người Cũ + 1 Người Mới)** $\rightarrow$ Mỗi tuần chỉ có tối đa 20 lượt trực (10 Người Cũ + 10 Người Mới).
- **Khi có 30 sinh viên đăng ký (12 Người Cũ + 18 Người Mới):**
  - **Thuật toán Bipartite Matching + Augmenting Swaps Luân Phiên:**
    - **Tuần 1:** Phân bổ tối ưu 20 bạn vào 10 ca trực (1 Cũ + 1 Mới). 10 bạn còn lại được đưa vào danh sách *"Dự Bị & Ưu Tiên Tuyệt Đối"*.
    - **Tuần 2:** Hệ thống tự động ưu tiên ghép 100% các bạn chưa được trực ở Tuần 1 vào các ca trực của Tuần 2, kết hợp với các bạn quay vòng tiếp theo.
  - **KẾT QUẢ ĐẠT ĐƯỢC:** **100% CẢ 30/30 BẠN ĐỀU CÓ LỊCH TRỰC**!
  - Cả sinh viên và Admin đều có thể bấm chọn xem lịch **Tuần 1** hoặc **Tuần 2** chỉ bằng 1 cú click!

---

## 🛠️ Báo Cáo Code Review & Khắc Phục Lỗi Nút Bấm (`/code-review-and-quality`)

- **Nguyên nhân gốc rễ (Root Cause):** 
  Khi chuyển đổi script từ dạng ES Modules sang script thông thường để hỗ trợ mở file trực tiếp (`file:///`), việc khai báo `const SHIFTS` ở phạm vi toàn cục trong `scheduler.js` đã xung đột định danh (`SyntaxError: Identifier 'SHIFTS' has already been declared`) với lệnh gán destructuring trong `student.js`. Lỗi cú pháp này xảy ra ngay tại dòng đầu tiên khiến toàn bộ script dừng lại và không thể gắn sự kiện cho các nút bấm.
- **Biện pháp xử lý triệt để:**
  1. Đóng gói toàn bộ các file `js/scheduler.js`, `js/sample30.js`, `js/student.js`, `js/admin.js` trong **IIFE (Immediately Invoked Function Expression)** để cô lập hoàn toàn phạm vi biến, ngăn chặn 100% xung đột toàn cục.
  2. Bổ sung thêm nút bấm submit to rõ ngay dưới bảng chọn ca rảnh (`btn-submit-reg-2`) và gắn sự kiện kép (cả sự kiện `submit` form và `click` nút trực tiếp) để người dùng bấm ở bất kỳ đâu cũng được phản hồi tức thì kèm thông báo Toast.

---

## 🌟 Hướng Dẫn Sử Dụng Nhanh

### Cách 1: Mở Trực Tiếp Trên Máy Tính
- Nhấp đúp vào **`index.html`** để vào Cổng Sinh Viên.
- Nhấp đúp vào **`admin.html`** để vào Bảng Quản Trị.
*(Đã loại bỏ hoàn toàn hạn chế CORS, mở trực tiếp bằng bất kỳ trình duyệt nào)*

### Cách 2: Mở Qua Local Server Đang Chạy
- **Cổng Sinh Viên:** `http://localhost:8000/index.html`
- **Trang Quản Trị:** `http://localhost:8000/admin.html`

### Cách Thử Nghiệm Nhanh Demo 30 Người:
1. Mở trang Quản Trị `admin.html`.
2. Bấm nút màu xanh lá **"👥 Nạp Demo 30 Người"**.
3. Hệ thống sẽ ngay lập tức nạp 30 bạn sinh viên (12 cũ + 18 mới) và tự động xếp lịch luân phiên 2 tuần.
4. Bấm chuyển qua lại giữa nút **[Tuần 1]** và **[Tuần 2]** để xem lịch trực của cả 30 bạn!
5. Sang trang Cổng Sinh Viên `index.html`, nhập thử một MSSV (ví dụ: `2102001` hoặc `2302001`) để tra cứu lịch trực cá nhân!

---

## ⚡ Tính Năng Mới Cập Nhật

### 1. Nhận Diện Trùng MSSV & Tự Động Nạp Lịch Trực Đã Chọn
- Khi sinh viên gõ hoặc dán MSSV vào ô thông tin:
  - Hệ thống kiểm tra tức thì trong cơ sở dữ liệu.
  - **Nếu đã đăng ký trước đó:** 
    - Xuất hiện thẻ cảnh báo màu xanh dương nổi bật: *"Mã số sinh viên này đã có trên hệ thống! Bạn đã hoàn tất đăng ký trước đó rồi nên không cần điền thêm nữa."*
    - Tự động điền lại Họ tên, Số điện thoại và Phân loại (Người cũ / Người mới).
    - Tự động tích chọn lại toàn bộ các ca rảnh đã chọn trên ma trận, kèm huy hiệu nổi bật **`✓ Đã lưu`**.
    - Nút gửi đổi thành **`🔄 Cập Nhật Ca Trực & Thông Tin`** để sinh viên dễ dàng đổi ca nếu muốn.
    - Cung cấp nút **`✕ Đăng ký MSSV khác`** để làm mới form khi cần đăng ký cho bạn khác.

### 2. Cấu Hình Thời Gian Mở Cổng Đăng Ký Từ Trang Admin
- Ban điều phối có thể chủ động cài đặt trên `admin.html`:
  - **🟢 Mở tự do:** Cho phép sinh viên đăng ký hoặc sửa đổi ca bất cứ lúc nào.
  - **⏱️ Mở theo khoảng thời gian:** Thiết lập Ngày & Giờ Bắt đầu và Hạn chót Đóng cổng (`datetime-local`) kèm các nút chọn nhanh (+3 ngày, +5 ngày, +7 ngày, Mở từ bây giờ).
  - **🔴 Đóng cổng ngay lập tức:** Khóa ngay đăng ký mới để chốt danh sách và điều phối lịch.
- **Phía Cổng Sinh Viên (`index.html`):**
  - Hiển thị banner trạng thái thời gian thực kèm đồng hồ đếm ngược thời gian còn lại.
  - **Khi cổng đóng:** Toàn bộ bảng chọn ca rảnh sẽ bị khóa (`disabled/locked`), nút gửi bị vô hiệu hóa. Tuy nhiên sinh viên **vẫn có thể nhập MSSV để xem lại thông tin và các ca mình đã chọn trước đó** một cách an toàn!

### 3. Bảo Mật & Phân Quyền Truy Cập Trang Quản Trị (Auth Guard)
- **Ẩn nút truy cập lộ liễu trên Cổng Sinh Viên:**
  - Nút Admin to rõ trên header `index.html` đã được gỡ bỏ hoàn toàn, thay bằng huy hiệu `Cổng Dành Cho Sinh Viên`.
  - Cán bộ quản lý có thể truy cập qua liên kết kín đáo ở chân trang (`app-footer`), hoặc dùng phím tắt bí mật: **`Ctrl + Shift + A`** (hoặc `Cmd + Shift + A` trên Mac).
- **Màn hình xác thực bảo mật (`admin.html`):**
  - Khi chưa đăng nhập, **toàn bộ dữ liệu sinh viên, thời khóa biểu và cấu hình đều bị ẩn 100%**.
  - Hỗ trợ 2 phương thức xác thực:
    - 🔑 **Tài khoản & Mật khẩu:** Dành cho cán bộ điều hành.
    - ⚡ **Mã PIN Nhanh:** Dành cho việc mở nhanh trong ca trực.
  - **Tài khoản mặc định được cấp quyền:**
    - Trưởng ban: `admin` / Mật khẩu: `123` (hoặc Mã PIN: `9999`)
    - Điều phối viên: `diephoi` / Mật khẩu: `123` (hoặc Mã PIN: `8888`)
- **Quản lý danh sách người được cấp quyền:**
  - Ngay trong trang Admin, bấm nút **`🔑 Cấp Quyền & Đổi MK`** để:
    - Xem danh sách cán bộ đang có quyền truy cập.
    - Thêm cán bộ mới vào hệ thống (cấp tài khoản, mật khẩu, mã PIN).
    - Đổi mật khẩu của chính mình.
    - Thu hồi quyền truy cập (xóa tài khoản cán bộ).
- **Đăng xuất an toàn:**
  - Có nút **`🚪 Đăng Xuất`** trên thanh header của Admin, xóa sạch phiên đăng nhập (`sessionStorage`) ngay khi kết thúc ca làm việc.

### 4. Xuất Bảng Tính & Sao Chép 1-Click Chuẩn Mẫu Google Sheets HCM-UTE 2026
- **Khớp 100% định dạng bảng tính Google Sheets của Ban Tuyển Sinh:**
  - Dòng 1: Gộp A1:I1 in hoa: `CỘNG TÁC VIÊN ĐĂNG KÝ TRỰC PHÒNG VÀ THAM GIA HOẠT ĐỘNG TƯ VẤN TUYỂN SINH`.
  - Dòng 2: Tiêu đề gồm 9 cột với màu nền chuẩn:
    - `STT`, `NGÀY`, `THỜI GIAN`, `NỘI DUNG`: Màu xanh bạc hà mint `#c2dfd3`.
    - `TRỰC VĂN PHÒNG TVTS CA SÁNG (7H30-11H30)`, `TRỰC VĂN PHÒNG TVTS CA CHIỀU (13H-16H30)`: Màu vàng tươi `#ffff00`.
    - `TƯ VẤN SỰ KIỆN`, `DẪN TOUR`, `GHI CHÚ`: Nền trắng viền đen.
  - Từng ô ca trực: Liệt kê sinh viên theo định dạng `Họ tên - MSSV` xuống dòng đẹp đẽ trong cùng 1 ô (Alt + Enter).
  - Đã lược bỏ cột Rep page theo đúng yêu cầu, giữ bảng gọn gàng và tập trung vào lịch trực văn phòng.
- **Tính năng "📋 Sao Chép Bảng (Ctrl+V vào Google Sheets)":**
  - Ghi đồng thời dữ liệu Rich HTML và TSV chuẩn RFC 4180 vào Clipboard.
  - Người dùng chỉ cần bấm 1 click, sau đó mở Google Sheets hoặc Excel bấm **`Ctrl + V`** là toàn bộ bảng, màu sắc, font chữ và xuống dòng trong từng ô được giữ nguyên vẹn 100%!
- **Tải file Excel (.xls) & CSV:**
  - File `.xls` tạo bằng Office XML tương thích hoàn hảo cả Microsoft Excel và Google Drive.
- **Nạp nhanh danh sách 16 CTV HCM-UTE mẫu:**
  - Nút **`🏛️ Nạp 16 CTV HCM-UTE`** nạp đúng danh sách các bạn CTV thực tế trong ảnh (Kim Phượng, Ngọc Đặng, Hoàng Tùng, Thanh Hoài, Trung Hiếu, Bảo Khánh, Tiến Thịnh, Xuân Hoài, Wei Tài, Minh Hằng, Tiến Tài, v.v.).

