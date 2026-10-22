# 📦 Handover State (Bản Bàn Giao Trạng Thái Dự Án)

> [!NOTE]
> File này chứa toàn bộ trạng thái công việc hiện tại của dự án để Agent ở phiên trò chuyện kế tiếp có thể đọc và tiếp tục công việc ngay lập tức mà không cần hỏi lại người dùng hay mất công đào bới ngữ cảnh cũ.

---

## 📌 1. Thông Tin Phiên Làm Việc (Session Metadata)
- **Thời điểm đóng gói:** 2026-10-22 17:30
- **Nhánh Git hiện tại:** `main` (index đã đồng bộ với `origin/main` = `91966a9`)
- **Trạng thái working tree:** CÓ thay đổi chưa commit (xem mục 2). Chưa push.
- **Trạng thái kiểm thử tự động:** `256/256 PASS (100%)`
- **Tech Stack:** Vanilla JavaScript (ES6+ IIFE), HTML5, CSS3, Web Storage API (`localStorage`, `sessionStorage`), Node.js CI test runner.

---

## 🛠️ 2. Các Hạng Mục Vừa Hoàn Thành (What Was Done — 2026-10-22)
1. **Sự cố bảo mật đang mở (ưu tiên số 1):** xem `SECURITY.md`.
   - Firebase RTDB `vtt123-76e07-default-rtdb` đang **cho đọc công khai**, chứa mật khẩu/PIN plaintext của 4 cán bộ + 58 CTV.
   - Repo công khai từng chứa `data/admin_accounts.json` (tài khoản thật) và `data/default_students.json` (30 số tài khoản ngân hàng).
   - **Việc còn lại phải làm bằng tay:** siết Firebase Rules, đổi toàn bộ mật khẩu/PIN, xoá node `adminUsers` trên Cloud.
2. **Đã sửa trong code (chưa commit):**
   - Escape `cfg.closedNotice` trước khi gán `innerHTML` (stored XSS ở cổng sinh viên).
   - PIN trong bảng "Cấp Quyền & Đổi MK" che mặc định, có nút hiện/ẩn.
   - Bỏ `password`/`pin` khỏi `sessionStorage` (một cửa duy nhất `persistCurrentUser()`).
   - Bỏ `bankName`/`bankAccount` khỏi `data/default_students.json` (không mã nào dùng).
   - **Không còn đồng bộ mật khẩu/PIN lên Cloud:** payload chỉ còn hồ sơ (id/username/fullName/role); `applyPayload` không ghi đè credential và không tạo tài khoản từ Cloud.
   - **Chống dò mật khẩu/PIN:** khoá 60 giây sau 5 lần sai đúng định dạng. **Phiên tự hết hạn sau 12 giờ.**
   - Dark mode: thêm token `--bg-subtle` cho `.card-header` / `.btn-chip` và bỏ nền `#ffffff` hardcode.
   - Mobile: input 16px (chặn iOS auto-zoom), touch target 44px cho nút đóng modal.
   - **Lịch trực dạng agenda trên điện thoại** (≤768px): mỗi ngày một thẻ, 2 ca Sáng/Chiều kèm tên + MSSV thay cho bảng 11 cột rộng ~1000px.
   - Sửa placeholder sai chính tả "tên miếng sinh viên".
3. **Hạ tầng chất lượng:**
   - Sửa test `6.10` từng **luôn pass** (thiếu `require('child_process')` + catch nuốt lỗi).
   - Thêm `.github/workflows/ci.yml`, `package.json` (`npm test`, `npm run check`).
   - README cập nhật đúng số test (249) và cấu trúc thư mục; xoá `js/sample30.js` (dead code).

---

## ⏳ 3. Trạng Thái Taskboard Hiện Tại
- `node tests/run_all_tests.js` → **256/256 PASS**.
- `node scripts/clean_code.js` → exit 0.
- Working tree sạch về mặt nội dung so với `origin/main` trước khi sửa; các sửa đổi ở mục 2 **chưa commit** để chủ dự án review.

---

## ⚠️ 4. Lưu Ý Bắt Buộc Cho Agent Kế Tiếp
1. **Nguyên tắc IIFE:** Toàn bộ code JavaScript viết mới trong thư mục `js/` bắt buộc phải được bọc trong hàm IIFE `(() => { 'use strict'; ... })();`.
2. **Contract-First:** Không tự ý đổi tên trường trong `localStorage` mà không đối chiếu với `.antigravity/memory/api-contracts.md`.
3. **Chạy Test:** Trước khi bàn giao bất kỳ thay đổi nào, luôn chạy `node tests/run_all_tests.js` (phải đạt 256/256 PASS) — hoặc `npm test`.
4. **Bảo mật:** Đọc `SECURITY.md` trước khi thêm bất kỳ trường dữ liệu nào vào `data/*.json` hoặc payload Cloud. Không commit PII/credential.
5. **Không tự ý `npm install`:** dự án không dùng dependency nào; `package.json` chỉ chứa script.
