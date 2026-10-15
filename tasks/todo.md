# Task List: Hệ Thống Đăng Ký & Xếp Lịch Trực Văn Phòng Tư Vấn Tuyển Sinh

## Phase 1: Nền tảng Giao diện & Đăng ký Sinh viên

### Task 1: Thiết lập cấu trúc dự án & Design System hiện đại
- **Description:** Tạo khung sườn ứng dụng web (`index.html`, `css/style.css`, `js/app.js`), thiết lập layout 2 cột/2 tab (Đăng ký sinh viên & Bảng điều khiển quản lý lịch), áp dụng CSS hiện đại với bảng màu hài hòa, hiệu ứng bo góc và typography đẹp.
- **Acceptance criteria:**
  - [x] Có đầy đủ file cấu trúc chuẩn web (`index.html`, `css/style.css`, `js/app.js`, `js/scheduler.js`).
  - [x] Giao diện responsive trên cả desktop lẫn điện thoại.
  - [x] Hiển thị thanh tiêu đề chuyên nghiệp mang phong cách Ban Tư vấn Tuyển sinh.
- **Verification:**
  - [x] Mở trang web không có lỗi tài nguyên hay console error.
  - [x] Bố cục hiển thị rõ ràng các phân vùng chức năng.
- **Dependencies:** None
- **Files likely touched:** `index.html`, `css/style.css`, `js/app.js`
- **Estimated scope:** Medium (3 files)

### Task 2: Form Đăng ký Thông tin & Ma trận Ca Rảnh
- **Description:** Xây dựng form nhập liệu gồm: Họ tên, Mã số sinh viên (MSSV), Chọn vai trò (Người cũ - Đã có kinh nghiệm / Người mới - Tập sự), và Bảng ma trận 10 ca rảnh (T2 đến T6, Sáng và Chiều) cho phép click để chọn/hủy ca nhanh chóng.
- **Acceptance criteria:**
  - [x] Validate dữ liệu: Họ tên không để trống, MSSV đúng định dạng, bắt buộc chọn ít nhất 1 ca rảnh.
  - [x] Ma trận ca trực hiển thị rõ ràng ngày (T2->T6), buổi (Sáng: 8h00-11h30, Chiều: 13h30-17h00) kèm nút chọn nhanh (Chọn tất cả ca sáng, chọn tất cả ca chiều, chọn cả tuần).
  - [x] Thao tác tương tác trực quan, có hiệu ứng chuyển trạng thái màu sắc khi ca được chọn.
- **Verification:**
  - [x] Nhập thử thông tin sinh viên và chọn các ca rảnh, bấm Lưu form kích hoạt sự kiện thành công.
- **Dependencies:** Task 1
- **Files likely touched:** `index.html`, `css/style.css`, `js/app.js`
- **Estimated scope:** Medium (2-3 files)

### Task 3: Quản lý Danh sách Sinh viên & Nạp Dữ liệu Mẫu (Local Storage)
- **Description:** Lưu danh sách sinh viên đã đăng ký vào LocalStorage. Hiển thị bảng danh sách các bạn đã đăng ký với bộ lọc (Tất cả / Người cũ / Người mới), nút xóa, sửa ca rảnh, và nút "Nạp dữ liệu mẫu" (khoảng 10-15 sinh viên với lịch rảnh đa dạng) để test nhanh.
- **Acceptance criteria:**
  - [x] Dữ liệu đăng ký được lưu trữ bền vững qua LocalStorage (F5 không mất dữ liệu).
  - [x] Bảng danh sách sinh viên thể hiện số ca mỗi bạn đăng ký rảnh, vai trò (Người cũ / Người mới).
  - [x] Có nút nạp dữ liệu mẫu (Sample data) tiện lợi kèm nút xóa toàn bộ (Reset).
- **Verification:**
  - [x] Thêm sinh viên mới -> xuất hiện trong bảng danh sách.
  - [x] Bấm nạp dữ liệu mẫu -> lập tức có danh sách đầy đủ cả người cũ và người mới.
- **Dependencies:** Task 2
- **Files likely touched:** `js/app.js`, `index.html`, `css/style.css`
- **Estimated scope:** Small (2 files)

---

## Checkpoint 1: Hoàn thiện Cổng Đăng Ký & Quản lý Dữ liệu
- [x] Mọi sinh viên có thể đăng ký ca rảnh dễ dàng trên máy tính hoặc điện thoại.
- [x] Dữ liệu hiển thị trực quan và lưu trữ ổn định.
- [x] Đã có sẵn dữ liệu mẫu sẵn sàng để đưa vào thuật toán xếp lịch.

---

## Phase 2: Thuật toán Tự Động Xếp Lịch & Thời Khóa Biểu Tuần

### Task 4: Xây dựng Thuật toán Xếp Lịch Thông Minh (Scheduler Engine)
- **Description:** Lập trình module `js/scheduler.js` giải bài toán xếp lịch: Mỗi ca cần đúng 1 Người Cũ + 1 Người Mới, đảm bảo công bằng (tất cả mọi người đều có lịch trực, số ca chênh lệch giữa các bạn ít nhất), ưu tiên ca ít người rảnh trước, tránh trực trùng ca hoặc 2 ca liên tiếp trong ngày nếu có thể.
- **Acceptance criteria:**
  - [x] Thuật toán phân bổ đúng quy tắc: Mỗi ca gồm 2 bạn (1 người cũ + 1 người mới).
  - [x] Đảm bảo tính công bằng (Fairness): Mọi bạn đã đăng ký đều được xếp ít nhất 1 ca (nếu tổng số bạn <= 10), độ lệch số ca của các bạn là nhỏ nhất.
  - [x] Chỉ xếp người vào ca mà người đó đã tích chọn là RẢNH.
  - [x] Trả về kết quả phân bổ chi tiết cho 10 ca + thống kê tình trạng (Ca nào đủ, ca nào thiếu người cũ/mới do không ai rảnh).
- **Verification:**
  - [x] Chạy test với bộ dữ liệu mẫu, kiểm tra 10 ca đều thỏa mãn điều kiện 1 cũ + 1 mới.
  - [x] Kiểm tra số ca trực của các bạn được chia đều.
- **Dependencies:** Task 3
- **Files likely touched:** `js/scheduler.js`
- **Estimated scope:** Medium (1-2 files)

### Task 5: Bảng Hiển thị Thời Khóa Biểu Lịch Trực Tuần (Weekly Duty Board)
- **Description:** Hiển thị trực quan bảng 10 ca từ Thứ 2 đến Thứ 6. Mỗi ca hiển thị 2 thẻ nhân sự: Thẻ Người Cũ (màu tím/xanh ngọc) và Thẻ Người Mới (màu cam/vàng), có hiển thị MSSV, tên và trạng thái (Đầy đủ / Thiếu người).
- **Acceptance criteria:**
  - [x] Bảng dạng lưới thời khóa biểu đẹp mắt (Thứ 2 đến Thứ 6 x Sáng/Chiều).
  - [x] Các thẻ nhân sự rõ ràng, phân biệt rạch ròi người cũ và người mới bằng màu sắc và badge.
  - [x] Có nút "Tự động xếp lịch" với hiệu ứng animation khi chạy thuật toán.
  - [x] Cảnh báo trực quan nếu có ca chưa thể lấp đầy do thiếu người rảnh.
- **Verification:**
  - [x] Bấm nút xếp lịch, thời khóa biểu tự động cập nhật kết quả chính xác trong tích tắc.
- **Dependencies:** Task 4
- **Files likely touched:** `index.html`, `css/style.css`, `js/app.js`
- **Estimated scope:** Medium (2-3 files)

### Task 6: Tùy chỉnh Thủ công & Thống kê Độ Công Bằng (Manual Edit & Fairness Stats)
- **Description:** Cho phép Admin can thiệp thủ công: Click vào vị trí trực của 1 ca để đổi sang bạn khác (chỉ gợi ý những bạn đang rảnh ca đó). Hiển thị bảng thống kê: Danh sách từng sinh viên kèm tổng số ca được phân công trực trong tuần.
- **Acceptance criteria:**
  - [x] Admin có thể bấm đổi người trực trong từng ca nhanh chóng.
  - [x] Bảng thống kê công bằng hiển thị biểu đồ/thanh tiến trình số ca của từng bạn (ví dụ: Bạn A: 2 ca, Bạn B: 2 ca...).
  - [x] Cảnh báo nếu admin cố tình chọn người bận vào ca.
- **Verification:**
  - [x] Thử đổi nhân sự thủ công trong 1 ca, hệ thống cập nhật tức thì và đồng bộ sang bảng thống kê.
- **Dependencies:** Task 5
- **Files likely touched:** `js/app.js`, `index.html`, `css/style.css`
- **Estimated scope:** Medium (2-3 files)

---

## Checkpoint 2: Hoàn thiện Thuật toán & Giao diện Xếp Lịch
- [x] Thuật toán xếp lịch tự động hoạt động chính xác 100% theo yêu cầu 1 mới + 1 cũ.
- [x] Bảng trực hiển thị đầy đủ, dễ nhìn, hỗ trợ chỉnh sửa thủ công và thống kê chi tiết.

---

## Phase 3: Hoàn thiện, Xuất File & Kiểm Thử Toàn Diện

### Task 7: Xuất Lịch Trực (In / PDF / CSV Excel)
- **Description:** Tích hợp tính năng xuất lịch trực ra file CSV/Excel để gửi thông báo cho nhóm, và chế độ Xem trước khi in (Print View) tối ưu để dán bảng thông báo tại văn phòng tuyển sinh.
- **Acceptance criteria:**
  - [x] Nút "Xuất Excel/CSV" tải về file lịch trực chuẩn UTF-8 có dấu tiếng Việt đầy đủ.
  - [x] Nút "In lịch trực" định dạng trang in gọn gàng, vừa vặn trên 1 trang A4.
- **Verification:**
  - [x] Xuất file CSV mở trên Excel hiển thị đúng cột Thứ, Buổi, Giờ, Người cũ, Người mới.
- **Dependencies:** Task 6
- **Files likely touched:** `js/app.js`, `css/style.css`
- **Estimated scope:** Small (2 files)

### Task 8: Kiểm thử Edge Cases & Bàn giao Dự án
- **Description:** Kiểm thử hệ thống với các trường hợp đặc biệt: Ít người cũ hơn số ca, ít người mới hơn số ca, tất cả cùng rảnh 1 ca, không ai rảnh 1 ca nào đó. Tinh chỉnh giao diện và viết hướng dẫn chạy.
- **Acceptance criteria:**
  - [x] Hệ thống xử lý mượt mà mọi tình huống thiếu hoặc thừa người mà không gây crash hoặc loop vô tận.
  - [x] File README hoặc hướng dẫn ngắn gọn cho người dùng cách mở và sử dụng.
- **Verification:**
  - [x] Chạy thử nghiệm thành công toàn bộ các kịch bản thực tế.
- **Dependencies:** Task 7
- **Files likely touched:** `README.md`, `js/scheduler.js`, `js/app.js`
- **Estimated scope:** Small (2-3 files)

---

---

## Phase 4: Nâng cấp Trải nghiệm Đăng ký & Kiểm soát Cổng Đăng ký (Yêu cầu Mới)

### Task 9: Nhận diện Trùng MSSV & Tự động Hiển thị Ca Rảnh Đã Đăng Ký
- **Description:** 
  - Khi sinh viên nhập MSSV vào ô thông tin cá nhân, hệ thống tự động tìm kiếm trong cơ sở dữ liệu.
  - Nếu đã tồn tại MSSV:
    - Hiển thị thông báo rõ ràng: "Bạn đã đăng ký rồi nên không cần điền thêm nữa!".
    - Tự động điền lại Họ tên, Số điện thoại, Phân loại (Người cũ / Người mới).
    - Tự động đánh dấu (checked) và làm nổi bật các ca trực mà sinh viên này đã chọn trước đó trên ma trận.
    - Chuyển nút Đăng ký sang "Cập nhật đăng ký" nếu sinh viên muốn thay đổi ca rảnh.
    - Cung cấp nút xóa làm mới nếu muốn đăng ký cho MSSV khác.
- **Acceptance criteria:**
  - [x] Nhập MSSV đã có -> lập tức nhận diện và hiện thông báo đã đăng ký.
  - [x] Điền sẵn thông tin cá nhân và tích chọn lại toàn bộ các ca rảnh đã đăng ký trước đó.
  - [x] Đổi nút gửi sang chế độ cập nhật, lưu đè dữ liệu mới nếu có chỉnh sửa.

### Task 10: Cấu hình Khung Thời Gian Mở Cổng Đăng Ký từ Trang Admin
- **Description:**
  - Trang Admin có bảng điều khiển cấu hình thời gian mở/đóng cổng đăng ký (Tự do / Theo khoảng thời gian / Khóa ngay).
  - Có bộ chọn Ngày & Giờ bắt đầu (`datetime-local`), Ngày & Giờ kết thúc, thông báo tùy chỉnh và các nút chọn nhanh (+3 ngày, +7 ngày).
  - Hiển thị trạng thái cổng (Đang mở / Đang đóng / Đếm ngược thời gian còn lại).
- **Acceptance criteria:**
  - [x] Admin có thể cài đặt giờ mở và giờ đóng hoặc bật tắt thủ công.
  - [x] Lưu cấu hình vào LocalStorage và đồng bộ thời gian thực sang Cổng Sinh Viên qua sự kiện `storage`.

### Task 11: Khóa/Mở Form Chọn Ca Trực Phía Cổng Sinh Viên theo Thời Gian Cấu Hình
- **Description:**
  - Cổng Sinh viên kiểm tra thời gian hiện tại so với cấu hình của Admin:
    - Nếu cổng đang mở: Cho phép chọn ca và đăng ký/cập nhật bình thường, hiển thị thời hạn còn lại.
    - Nếu cổng đang đóng: Hiển thị banner thông báo đóng cổng, khóa ma trận chọn ca (không cho click đổi ca), vô hiệu hóa nút gửi đăng ký.
    - Sinh viên vẫn có thể nhập MSSV để xem lại thông tin và các ca mình đã đăng ký trước đó (chế độ xem lại an toàn).
- **Acceptance criteria:**
  - [x] Hiển thị thông báo trạng thái cổng mở/đóng rõ ràng, trực quan.
  - [x] Khóa chọn ca khi hết hạn hoặc admin đóng cổng, vẫn cho phép tra cứu xem lại ca đã chọn bằng MSSV.

---

## Phase 5: Phân Quyền & Bảo Mật Trang Quản Trị (Bảo vệ Dữ liệu Tuyển sinh)

### Task 12: Ẩn Nút Admin Công Khai Trên Cổng Sinh Viên & Lối Vào Kín Đáo
- **Description:**
  - Xóa nút truy cập Admin công khai trên thanh header của `index.html`.
  - Thêm chân trang chuyên nghiệp với liên kết đăng nhập dành riêng cho cán bộ tuyển sinh.
  - Hỗ trợ phím tắt bí mật `Ctrl + Shift + A` hoặc nhấp 3 lần vào logo để truy cập trang quản trị.
- **Acceptance criteria:**
  - [x] Không còn hiển thị nút Admin lộ liễu trên giao diện sinh viên.
  - [x] Có lối vào tinh tế, thẩm mỹ ở footer và phím tắt tiện lợi cho điều phối viên.

### Task 13: Màn Hình Xác Thực Đăng Nhập & Khóa Toàn Bộ Trang Admin
- **Description:**
  - Mặc định ẩn hoàn toàn bảng điều khiển Admin (`admin.html`) khi chưa xác thực (`#admin-dashboard-container` có `style="display: none;"`).
  - Màn hình đăng nhập (Auth Screen) hiện đại: Hỗ trợ 2 phương thức:
    1. Tên đăng nhập + Mật khẩu (`admin` / `123`, `diephoi` / `123`).
    2. Mã PIN nhanh 4 số (`9999` hoặc `8888`).
  - Tự động ẩn thông báo lỗi khi bắt đầu gõ lại (`input` event listener).
  - Lưu phiên đăng nhập an toàn trong `sessionStorage` (`ts_admin_authenticated`, `ts_admin_user_data`), hỗ trợ nút Đăng xuất (Logout) xóa sạch phiên lập tức.
  - Cung cấp lối vào trực tiếp "🔒 Đăng Nhập Cán Bộ" trên header và footer của `index.html`.
- **Acceptance criteria:**
  - [x] Chưa đăng nhập không thể xem thông tin sinh viên hay điều chỉnh lịch trực.
  - [x] Đăng nhập đúng mật khẩu/PIN mới mở khóa toàn bộ bảng điều khiển.
  - [x] Có nút Đăng xuất kèm thông tin người đang đăng nhập trên header (`#admin-user-profile`).
  - [x] Tự động ẩn lỗi khi người dùng gõ lại thông tin.
  - [x] Đạt chuẩn 7/7 tests xác thực trong `tests/auth.test.js`.
- **Status:** ✅ Đã hoàn thành & Kiểm thử 100%

### Task 14: Quản Lý Danh Sách Người Được Cấp Quyền Truy Cập
- **Description:**
  - Modal quản lý tài khoản cán bộ trong trang Admin (`#user-mgmt-modal`).
  - Xem danh sách người được cấp quyền, thêm tài khoản cán bộ mới, đổi mật khẩu và thu hồi quyền (xóa tài khoản).
  - Chuẩn hóa mô hình dữ liệu tài khoản quản trị trong `data/admin_accounts.json`.
- **Acceptance criteria:**
  - [x] Admin có thể thêm cán bộ mới được phép vào hệ thống.
  - [x] Cho phép đổi mật khẩu tài khoản hiện tại.
  - [x] Dữ liệu tài khoản lưu trữ đồng bộ trong `localStorage` (`ts_scheduler_admin_users`).
- **Status:** ✅ Đã hoàn thành & Kiểm thử 100%

---

## Phase 6: Xuất Bảng Tính Chuẩn Mẫu Google Sheets / Excel HCM-UTE & 1-Click Copy

### Task 15: Xuất Bảng Tính & Sao Chép 1-Click Chuẩn Mẫu Google Sheets HCM-UTE
- **Description:**
  - Xây dựng modal xuất bảng tính và trình xem trước mô phỏng giao diện Google Sheets của HCM-UTE:
    - Hàng 1: Tiêu đề gộp A1:I1 in hoa: "CỘNG TÁC VIÊN ĐĂNG KÝ TRỰC PHÒNG VÀ THAM GIA HOẠT ĐỘNG TƯ VẤN TUYỂN SINH".
    - Hàng 2: STT, NGÀY, THỜI GIAN, NỘI DUNG (màu xanh bạc hà mint #c2dfd3); TRỰC VĂN PHÒNG TVTS CA SÁNG (7H30-11H30), TRỰC VĂN PHÒNG TVTS CA CHIỀU (13H-16H30) (màu vàng tươi #ffff00); TƯ VẤN SỰ KIỆN, DẪN TOUR, GHI CHÚ (màu trắng).
    - Từng ô ca trực: Liệt kê sinh viên theo định dạng "Họ tên - MSSV" xuống dòng riêng biệt trong cùng 1 ô (Alt + Enter).
    - Đã lược bỏ cột Rep page buổi tối theo yêu cầu, giữ bảng chuẩn 9 cột tập trung vào trực văn phòng.
  - Tích hợp tính năng "📋 SAO CHÉP BẢNG" (Clipboard write đồng thời text/html và text/plain RFC 4180): Khi người dùng dán (Ctrl+V) vào Google Sheets hoặc Excel, từng ô, màu sắc, font chữ và xuống dòng được giữ nguyên 100%, không bị tràn dòng hay nhảy cột.
  - Tải file Excel (.xls) chuẩn Office XML và file CSV UTF-8 có BOM tiếng Việt.
  - Nạp sẵn bộ dữ liệu 16 CTV HCM-UTE từ ảnh thực tế của người dùng ("🏛️ Nạp 16 CTV HCM-UTE").
- **Acceptance criteria:**
  - [x] Giao diện bảng tính khớp 9 cột chuẩn, màu nền, định dạng text như ảnh mẫu của trường HCM-UTE.
  - [x] Đã xóa bỏ hoàn toàn cột Rep page buổi tối.
  - [x] 1-Click Sao chép bảng dán vào Google Sheets ăn ngay từng ô.
  - [x] Xuất file .xls mở được trên Microsoft Excel và tải lên Google Sheets hoàn hảo.
  - [x] Tùy chỉnh linh hoạt ngày bắt đầu, phạm vi xuất (14 ngày liên tục, 10 ngày hành chính, 5 ngày tuần 1/tuần 2).

---

## Phase 7: Kế Hoạch Nâng Cấp Tương Lai (Backlog / Việc Sẽ Làm)

> [!NOTE]
> Các tính năng dưới đây là danh sách việc sẽ làm (được tổng hợp từ các mục đề xuất #2, #3, #4, #6 và các tiện ích mở rộng). Hiện được ghi nhận vào kế hoạch backlog để triển khai theo từng giai đoạn tiếp theo, chưa thực thi trong phiên này.

### Task 16 (Mục #2): Chế Độ Xem Toàn Cảnh Ma Trận 1 Tháng (Full-Month Master Grid View)
- **Description:** 
  - Bổ sung nút chuyển đổi chế độ xem: `Xem Từng Tuần (Tabs)` ↔ `Toàn Cảnh Cả Tháng (Master View)`.
  - Trong chế độ Toàn cảnh, hiển thị trực quan cả 4 tuần (Tuần 1, Tuần 2, Tuần 3, Tuần 4) trải dài hoặc cuộn ngang mượt mà, giúp Ban điều hành có cái nhìn bao quát 40 ca trực trong tháng mà không cần click chuyển qua lại giữa các tab tuần.
  - Hỗ trợ đổi nhân sự trực tiếp ở bất kỳ tuần nào ngay trên giao diện toàn cảnh.
- **Acceptance criteria:**
  - [x] Nút chuyển đổi View Mode trên thanh công cụ thời khóa biểu Admin.
  - [x] Render 4 bảng tuần liên tiếp nhau với đầy đủ thẻ nhân sự và trạng thái từng ca.
  - [x] Đồng bộ chỉnh sửa: Khi đổi nhân sự ở tuần bất kỳ trong chế độ xem cả tháng, dữ liệu tự động lưu vào `monthSchedule`.
- **Status:** ✅ Đã hoàn thành

### Task 17 (Mục #3): Hero Toolbar Nổi & Bảng Chỉ Số Nhanh (Sticky Hero Toolbar & Live Stats)
- **Description:**
  - Khi người dùng cuộn chuột xuống bảng thời khóa biểu hoặc danh sách sinh viên, một thanh công cụ nổi (Sticky Hero Bar) xuất hiện ở cạnh trên màn hình.
  - Tích hợp các badge chỉ số thời gian thực: `Tổng sinh viên`, `Số ca đã lấp đầy (X/40 ca)`, `Cảnh báo ca trống / thiếu người`.
  - Các nút thao tác nhanh 1-Click: `Xếp Lịch Nhanh`, `Xuất Excel HCM-UTE`, `Sao Chép Bảng`, `Lên đầu trang`.
- **Acceptance criteria:**
  - [x] Thanh Sticky Bar xuất hiện mượt mà khi cuộn qua khỏi viewport của header.
  - [x] Hiển thị chính xác tiến độ lấp đầy ca trực của toàn bộ 4 tuần.
  - [x] Bấm các nút thao tác nhanh trên Sticky Bar hoạt động mượt mà.
- **Status:** ✅ Đã hoàn thành

### Task 18 (Mục #4): Nhập Danh Sách Sinh Viên Từ File Excel / CSV (Batch Import CTV)
- **Description:**
  - Cho phép cán bộ nạp nhanh toàn bộ danh sách CTV từ file Google Form / Excel khảo sát đầu kỳ thay vì nhập tay từng bạn.
  - Cung cấp file mẫu CSV/Excel chuẩn (`Họ tên`, `MSSV`, `SĐT`, `Vai trò: Người cũ/mới`, `Ca rảnh: T2_S, T2_C...`).
  - Hộp thoại kéo-thả file (`.csv`, `.txt`) với trình phân tích dữ liệu trực tiếp, hiển thị bảng xem trước (Preview) danh sách sinh viên hợp lệ và các lỗi (MSSV trùng, định dạng ca sai) trước khi nhấn "Xác Nhận Nạp".
- **Acceptance criteria:**
  - [x] Nút "Tải file mẫu CSV" và nút "📥 Nhập từ Excel/CSV" tại tab Quản lý sinh viên.
  - [x] Phân tích chính xác dữ liệu từ file và nạp vào danh sách sinh viên của hệ thống.
  - [x] Cảnh báo trùng MSSV và hỏi người dùng ghi đè hay bỏ qua.
- **Status:** ✅ Đã hoàn thành

### Task 19 (Mục #6): Chế Độ Giao Diện Sáng / Tối (Dark / Light Theme Switcher)
- **Description:**
  - Tích hợp nút gạt chuyển đổi giao diện Sáng / Tối (`☀️ Sáng` / `🌙 Tối`) trên thanh tiêu đề của cả Cổng Sinh Viên (`index.html`) và Cổng Quản Trị (`admin.html`).
  - Tối ưu bảng màu Dark Mode: Màu nền Slate Navy sang trọng (`#0f172a`, `#1e293b`), chữ tương phản cao, thẻ nhân sự rực rỡ dịu mắt cho các ca trực đêm và làm việc kéo dài.
  - Lưu trạng thái theme đã chọn vào `localStorage` (`ts_scheduler_theme: 'dark' | 'light'`) và tự động nhận diện `prefers-color-scheme` của hệ điều hành.
- **Acceptance criteria:**
  - [x] Nút đổi theme mượt mà không bị giật trang.
  - [x] Mọi bảng tính, modal, ma trận ca trực đều hiển thị rõ ràng, chuẩn tương phản WCAG khi ở chế độ Dark Mode.
  - [x] F5 trang hoặc chuyển qua lại giữa các tab vẫn giữ nguyên theme đã chọn.
- **Status:** ✅ Đã hoàn thành

---

## Phase 8: Nâng Cấp Trải Nghiệm & Quản Trị Tuyển Sinh (Kế Hoạch Triển Khai)

### Task 24: Rà Soát & Nâng Cấp Tương Phản Chữ Dark Mode Toàn Diện
- **Description:**
  - Tinh chỉnh toàn diện bảng màu chữ và độ tương phản trong chế độ Tối (`[data-theme="dark"]`) theo chuẩn WCAG AA/AAA.
  - Khắc phục các vị trí chữ chìm, khó đọc:
    - Nâng cấp `--text-muted` từ `#94a3b8` lên `#cbd5e1` cho các nhãn phụ, ngày tháng, giờ trực, gợi ý input.
    - Sửa màu chữ vai trò trên thẻ ca trực: Đổi Người cũ (`.role-old .member-role-tag`) từ tím tối `#4338ca` sang tím sáng dạ quang `#a5b4fc` / `#c7d2fe`; Người mới (`.role-new .member-role-tag`) từ xanh tối `#047857` sang xanh ngọc sáng `#6ee7b7` / `#a7f3d0`.
    - Trạng thái ca trực (`.shift-status-pill`): Đủ 2 bạn (`#a7f3d0` trên nền ngọc đậm), Thiếu người (`#fde68a` trên nền hổ phách đậm), Trống (`#fca5a5` trên nền đỏ rượu).
    - Thẻ ca chưa lấp đầy (`.empty-member`): Viền nét đứt vàng chanh sáng kèm chữ `#fde047` rõ nét.
    - Thanh công thức Excel (`.excel-sheet-fx-bar .fx-formula`), tab bảng tính (`.excel-sheet-tab`), hộp code tài khoản demo (`.auth-demo-accounts code`).
    - Placeholder form input (`::placeholder`) chuyển sang màu xám bạc rõ ràng `#94a3b8`.
- **Acceptance criteria:**
  - [x] 100% văn bản, nhãn phụ, thẻ ca trực, bảng tính và modal trong Dark Mode đọc rõ ràng, sắc nét, không bị chìm nền.
  - [x] Không làm ảnh hưởng đến thẩm mỹ và độ tương phản ở chế độ Sáng (Light Mode).
- **Files touched:** `css/style.css`
- **Status:** ✅ Đã hoàn thành

### Task 25: Thẻ Lịch Trực Cá Nhân Điện Tử (Cổng Sinh Viên)
- **Description:**
  - Xây dựng Thẻ Lịch Trực CTV điện tử chuyên nghiệp khi sinh viên tra cứu MSSV trên `index.html`.
  - **Quy tắc đặc thù (theo yêu cầu của Tris):** Tuyệt đối KHÔNG có mục dặn dò trang phục / đồng phục.
  - Nội dung thẻ bao gồm:
    - Banner thương hiệu: Ban Tư Vấn Tuyển Sinh HCM-UTE, Mã thẻ CTV, Họ tên, MSSV, Phân loại vai trò, Số điện thoại.
    - Thống kê tháng: Tổng số ca được phân công trực trong 4 tuần.
    - Danh sách ca chi tiết: Tuần, Thứ, Buổi (Sáng/Chiều), Khung giờ, và Bạn cùng trực (Tên + MSSV + SĐT để phối hợp).
    - Thao tác tiện ích:
      - `🖨️ In Thẻ Cá Nhân`: Định dạng trang in thẻ CTV mini chuẩn A5/A6 hoặc lưu PDF.
      - `📋 Sao Chép Lịch`: Copy text tóm tắt lịch trực để dán vào Zalo/ghi chú.
      - `🔄 Đề Xuất Đổi Ca`: Nút chuyển nhanh sang gửi yêu cầu đổi ca nếu bị kẹt lịch.
- **Acceptance criteria:**
  - [x] Tra cứu MSSV hiển thị thẻ điện tử trực quan, sang trọng.
  - [x] Không chứa bất kỳ nội dung dặn dò trang phục nào.
  - [x] Sao chép lịch và in thẻ hoạt động trơn tru.
- **Files touched:** `index.html`, `js/student.js`, `css/style.css`
- **Status:** ✅ Đã hoàn thành

### Task 26: Cổng Đề Xuất Đổi Ca / Nhờ Trực Hộ & Phê Duyệt 1-Click
- **Description:**
  - **Phía Sinh Viên (`index.html`):**
    - Cho phép sinh viên gửi yêu cầu khi bận đột xuất: `Hoán đổi ca với bạn khác` hoặc `Nhờ bạn khác trực hộ`.
    - Chọn ca cần đổi, chọn bạn CTV muốn đổi cùng (gợi ý bạn đang rảnh ca đó), nhập lý do.
    - Lưu vào `localStorage['ts_swap_requests']` và theo dõi trạng thái (`⏳ Chờ duyệt`, `✅ Đã duyệt`, `❌ Từ chối`).
  - **Phía Admin (`admin.html`):**
    - Badge thông báo số yêu cầu chờ duyệt trên thanh Hero Toolbar và Header (`🔄 Đổi ca (X)`).
    - Modal Quản Lý Đổi Ca: Xem danh sách yêu cầu kèm nút `✓ Phê Duyệt` (tự động hoán đổi trong `state.monthSchedule` của tuần tương ứng và đồng bộ toàn tháng) và nút `✕ Từ Chối`.
- **Acceptance criteria:**
  - [x] Sinh viên gửi đề xuất đổi ca thành công kèm thông báo trạng thái.
  - [x] Admin thấy badge số lượng đề xuất thời gian thực.
  - [x] Bấm Duyệt 1-click tự động cập nhật lịch trên bảng phân công cả tháng không cần can thiệp thủ công.
- **Files touched:** `index.html`, `js/student.js`, `admin.html`, `js/admin.js`, `css/style.css`
- **Status:** ✅ Đã hoàn thành

### Task 27: Trung Tâm Sao Lưu & Khôi Phục Dữ Liệu (.json) + Khởi Tạo Tháng Mới
- **Description:**
  - Tích hợp cụm công cụ Quản lý Dữ liệu trong `admin.html`:
    - `💾 Tải Bản Sao Lưu (.json)`: Đóng gói toàn bộ cơ sở dữ liệu (`students`, `monthSchedule`, `regConfig`, `adminUsers`, `swapRequests`) tải về máy người dùng.
    - `📂 Phục Hồi Dữ Liệu (.json)`: Tải lên file backup, kiểm tra tính hợp lệ và khôi phục toàn vẹn hệ thống trong 1 giây.
    - `🗂️ Khởi Tạo Kỳ Trực Tháng Mới`: Giữ nguyên danh sách sinh viên đăng ký, làm sạch lịch 4 tuần để bắt đầu kỳ tuyển sinh mới.
- **Acceptance criteria:**
  - [x] Xuất file JSON đầy đủ dữ liệu cấu hình và lịch phân công.
  - [x] Nhập file JSON khôi phục chính xác 100% dữ liệu mà không gây lỗi script.
  - [x] Có xác nhận an toàn trước khi khôi phục hoặc làm mới kỳ trực.
- **Files touched:** `admin.html`, `js/admin.js`, `css/style.css`
- **Status:** ✅ Đã hoàn thành

### Task 28: Mở Rộng & Tối Ưu Hóa Bộ Kiểm Thử Tự Động (QA CI Test Harness)
- **Description:**
  - Rà soát toàn diện các bộ kiểm thử tự động trong `tests/`, mở rộng độ phủ cho các tính năng mới và trường hợp biên (edge cases).
  - Bổ sung test cases kiểm tra xử lý biên của Scheduler khi số lượng người cũ = 0 hoặc người mới = 0 (hệ thống không bị crash).
  - Bổ sung test cases kiểm tra bảo mật mã PIN và hàm `escapeHtml()` loại bỏ các ký tự độc hại `<script>`, `"`, `'`, `&`.
  - Xây dựng suite kiểm thử mới `tests/portal.test.js` kiểm tra tính năng đóng/mở cổng, cờ `publishSchedule` và tra cứu MSSV khi lịch mở vs đóng.
  - Nâng cấp `tests/run_all_tests.js` điều phối chạy tuần tự và in bảng tổng hợp toàn hệ thống.
- **Acceptance criteria:**
  - [x] Đầy đủ 3 bộ kiểm thử: `scheduler.test.js` (8 tests), `auth.test.js` (15 tests), `portal.test.js` (11 tests).
  - [x] Hàm `escapeHtml()` được kiểm tra toàn diện với payload XSS thực tế và các giá trị biên.
  - [x] Lõi xếp ca không bị crash khi nhóm người cũ = 0 hoặc người mới = 0.
  - [x] Chạy `node tests/run_all_tests.js` đạt chuẩn 100% PASS (34/34 tests).
- **Files touched:** `tests/scheduler.test.js`, `tests/auth.test.js`, `tests/portal.test.js`, `tests/run_all_tests.js`, `tasks/todo.md`
- **Status:** ✅ Đã hoàn thành (34/34 Tests PASS - 100%)






