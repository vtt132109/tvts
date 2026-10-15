# 🧠 Lessons Learned (Nhật Ký Tự Học Hỏi Từ Lỗi Sai)

> [!IMPORTANT]
> Đây là kho tri thức tích lũy kinh nghiệm thực chiến từ các lỗi sai, sự cố build/test hoặc đóng góp từ người dùng.
> **Quy tắc bắt buộc:** Mọi Agent trước khi sinh code phải tra cứu nhật ký này để đảm bảo không mắc lại bất kỳ lỗi nào trong quá khứ.

---

## 📌 Danh Sách Kinh Nghiệm Đã Đúc Kết (Incident Post-Mortems)

### 1. Xung Đột Định Danh Biến Toàn Cục Khi Mở Trực Tiếp Bằng Trình Duyệt (`file:///`)
- **Ngày phát hiện:** 2026-10-15
- **Hiện tượng:** Mở `index.html` hoặc `admin.html` trực tiếp bằng trình duyệt bị đơ, không bấm được các nút submit hoặc chuyển tuần. Console báo lỗi: `Uncaught SyntaxError: Identifier 'SHIFTS' has already been declared`.
- **Nguyên nhân gốc rễ (Root Cause):**
  Khi loại bỏ module bundler để hỗ trợ chạy offline qua giao thức `file:///`, các biến khai báo bằng `const` ở cấp cao nhất trong `js/scheduler.js` và `js/student.js` bị đưa vào cùng một Scope toàn cục (`window`), dẫn đến xung đột cú pháp chết đứng toàn bộ luồng JavaScript.
- **Cách phòng tránh & Khắc phục:**
  - **100% các file JavaScript trong `js/` bắt buộc phải được bọc trong hàm IIFE:**
    ```javascript
    (() => {
      'use strict';
      // Toàn bộ logic nội bộ ở đây
      window.ModuleName = { ... }; // Chỉ export các API cần thiết ra ngoài
    })();
    ```
  - Tuyệt đối không khai báo biến `const`/`let`/`var` tự do ở phạm vi toàn cục.

---

### 2. Sử Dụng Cú Pháp Nối Lệnh Bash `&&` Trong Môi Trường PowerShell Trên Windows
- **Ngày phát hiện:** 2026-10-15
- **Hiện tượng:** Terminal báo lỗi cú pháp `The token '&&' is not a valid statement separator in this version` khi chạy chuỗi lệnh tự động.
- **Nguyên nhân gốc rễ (Root Cause):**
  Trên hệ điều hành Windows sử dụng PowerShell phiên bản cũ hoặc mặc định, toán tử `&&` không được hỗ trợ như trong Bash Linux/macOS.
- **Cách phòng tránh & Khắc phục:**
  - Sử dụng dấu chấm phẩy `;` để phân tách câu lệnh, hoặc chạy từng lệnh đơn lẻ.
  - Ví dụ thay vì: `git add . && git commit -m "..."`, hãy chạy:
    ```powershell
    git add . ; git commit -m "..."
    ```

---

### 3. Xung Đột Ghi Đè File Khi Các Subagents Chạy Song Song (Race Condition)
- **Ngày phát hiện:** 2026-10-15
- **Hiện tượng:** Hai Subagents cùng sửa một file (ví dụ `js/admin.js`) dẫn đến code bị ghi đè, mất thay đổi của nhau.
- **Nguyên nhân gốc rễ (Root Cause):**
  Chưa phân chia ranh giới thư mục và quyền ghi tệp tin (`allowed_paths`) nghiêm ngặt trước khi khởi chạy song song.
- **Cách phòng tránh & Khắc phục:**
  - Áp dụng nguyên tắc ranh giới bất khả xâm phạm:
    - `@backend-agent`: Chỉ ghi vào `js/scheduler.js`, `js/sample30.js`, `data/`.
    - `@frontend-agent`: Chỉ ghi vào `index.html`, `admin.html`, `css/`, `js/student.js`, `js/admin.js`.
    - `@qa-agent`: Chỉ ghi vào `tests/`, `tasks/`, `scripts/`.
  - Mọi dữ liệu dùng chung phải thông qua hợp đồng dữ liệu tại `.antigravity/memory/api-contracts.md`.

---

### 4. Lỗ Hổng Stored/Reflected XSS Khi Chèn Dữ Liệu Sinh Viên Vào Giao Diện
- **Ngày phát hiện:** 2026-10-15
- **Hiện tượng:** Kẻ xấu có thể nhập chuỗi `<img src=x onerror=alert(1)>` vào ô Họ tên hoặc Lý do đổi ca trực để tấn công trình duyệt Admin.
- **Nguyên nhân gốc rễ (Root Cause):**
  Sử dụng trực tiếp `innerHTML = \`<td>\${student.fullName}</td>\`` mà không làm sạch dữ liệu đầu vào.
- **Cách phòng tránh & Khắc phục:**
  - Mọi trường dữ liệu chuỗi từ người dùng khi chèn vào `innerHTML` BẮT BUỘC phải đi qua hàm `escapeHtml()`:
    ```javascript
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    ```

---

### 5. Lỗi Thiếu Thẻ Đóng `</div>` Làm Lồng Modal Con Vào Modal Cha Bị Ẩn (`display: none`)
- **Ngày phát hiện:** 2026-10-15
- **Hiện tượng:** Nút bấm gọi Modal ở ngoài trang web (ví dụ nút Thêm Sự Kiện / Tour `#btn-hero-add-event`) khi click không thấy modal xuất hiện trên màn hình, dù code JS vẫn chạy và gán `style.display = 'flex'`.
- **Nguyên nhân gốc rễ (Root Cause):**
  Trong file HTML, thẻ container của một modal khác (như `#modal-backup-center`) bị thiếu 1 thẻ đóng `</div>`. Trình duyệt tự động gom các modal khai báo bên dưới thành thẻ con của modal trên. Do modal cha có `display: none` nên toàn bộ các modal con dù có kích hoạt `display: flex` cũng đều bị ẩn hoàn toàn khỏi viewport.
- **Cách phòng tránh & Khắc phục:**
  - Luôn đảm bảo tất cả các Modal trong HTML phải là thẻ con trực tiếp (`direct children`) của thẻ `<body>`, tách bạch hoàn toàn với nhau.
  - Sử dụng công cụ kiểm tra tính toàn vẹn cú pháp HTML hoặc Chrome DevTools Inspect DOM Tree để kiểm tra phân cấp DOM sau mỗi lần chỉnh sửa modal.
  - Khi thiết kế tính năng, tách biệt rõ ràng khu vực cấu hình hệ thống (như Sao lưu/Khôi phục) khỏi các công cụ tác nghiệp hàng ngày (như Quản lý Sự kiện & Chấm công).

---

## 📝 Mẫu Thêm Bài Học Mới (Template Khi Ghi Nhận Sự Cố)
```markdown
### <Số thứ tự>. <Tên Sự Cố Ngắn Gọn>
- **Ngày phát hiện:** YYYY-MM-DD
- **Hiện tượng:** <Mô tả chi tiết lỗi phát sinh / thông báo lỗi>
- **Nguyên nhân gốc rễ (Root Cause):** <Phân tích tại sao lỗi xảy ra ở mức hệ thống / cú pháp>
- **Cách phòng tránh & Khắc phục:** <Giải pháp cụ thể, đoạn code mẫu và quy chuẩn bắt buộc>
```
