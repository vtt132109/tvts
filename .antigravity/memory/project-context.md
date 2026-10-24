# Project Context & Architecture Memory

**Dự án:** Hệ Thống Quản Lý Phân Công Lịch Trực Ban Tư Vấn Tuyển Sinh HCM-UTE  
**Phiên bản hiện tại:** 2.5 (Production Ready on GitHub Pages)  
**Địa chỉ repository:** `https://github.com/vtt132109/tvts`  
**Cập nhật lần cuối:** 15/10/2026  

---

## 1. 🏗️ Tech Stack & Nguyên Tắc Kiến Trúc

1. **Client-Side / Static Web App:**
   - Ứng dụng chạy 100% trên trình duyệt người dùng, lưu trữ trạng thái tại `localStorage` và `sessionStorage`.
   - Triển khai tự động (Continuous Deployment) qua **GitHub Actions** ([`.github/workflows/static.yml`](file:///d:/New%20folder%20(236)/.github/workflows/static.yml)) đẩy lên **GitHub Pages**.
   - Không yêu cầu Node.js server runtime hay bundler (Vite/Webpack) khi chạy production.
2. **Kỹ Thuật Đóng Gói Mô-đun (IIFE Scoping):**
   - Mọi file JavaScript nghiệp vụ trong `js/` **bắt buộc bọc trong IIFE**:
     `(() => { 'use strict'; ... })();`
   - Chỉ xuất (export) các API cần thiết ra `window` (ví dụ: `window.SchedulerEngine`, `window.AdminAuth`).
3. **Giao Diện & Hệ Thống Thiết Kế (UI/UX Design System):**
   - HTML5 Semantic cấu trúc rõ ràng.
   - CSS3 thuần với CSS Variables (`--primary`, `--bg-main`, `--card-bg`, `--text-main`, v.v.).
   - Hỗ trợ Dark/Light Theme với đoạn script Zero-Flash ở thẻ `<head>`.
   - Responsive hoàn chỉnh cho điện thoại (<600px): `flex-wrap: wrap`, thanh tab cuộn cảm ứng, và container cuộn ngang riêng biệt cho bảng lịch.
4. **Cơ Chế Kiểm Thử Tự Động (CI Harness):**
   - Bộ điều phối kiểm thử: `node tests/run_all_tests.js`.
   - Suite 1: Thuật toán xếp ca Bipartite Matching & luân phiên 4 tuần (`tests/scheduler.test.js`).
   - Suite 2: Xác thực, phân quyền & bảo mật (`tests/auth.test.js`).

---

## 2. 📁 Cấu Trúc Thư Mục Chuẩn Hóa

```text
tvts/
├── .agents/skills/              # Các kỹ năng Agent (agent-browser, ui-ux-pro-max, v.v.)
├── .antigravity/                # Cấu hình hệ thống Multi-Agent của Antigravity
│   ├── agents/                  # 3 Subagents: backend-agent, frontend-agent, qa-agent
│   ├── memory/                  # Bộ nhớ dùng chung: project-context.md, api-contracts.md
│   ├── workflows/               # Kỹ năng Slash: rollback, code-review, merge-clean, benchmark
│   ├── rules.md                 # Quy tắc điều phối, Pre-execution Git guard, Contract-first
│   └── settings.json            # Scoped auto-approve, Allowlist & Secret shield
├── .github/workflows/           # CI/CD GitHub Pages deployment
├── css/
│   └── style.css                # Toàn bộ stylesheet hợp nhất của ứng dụng
├── data/
│   └── ds-ctv.csv               # Danh sách 58 CTV thật (cục bộ, gitignored vì chứa PII)
├── js/
│   ├── scheduler.js             # Lõi thuật toán xếp ca Bipartite Matching & luân phiên
│   ├── student.js               # Logic Cổng Sinh Viên (đăng ký, xem lịch, đổi ca)
│   └── admin.js                 # Logic Bảng Điều Hành Quản Trị (phân bổ, xuất Excel, sao lưu)
├── tasks/                       # Nhật ký công việc và kế hoạch kiểm thử
├── tests/                       # Toàn bộ mã nguồn kiểm thử tự động
│   ├── run_all_tests.js         # Master CI test runner
│   ├── scheduler.test.js        # Test cases thuật toán xếp ca
│   └── auth.test.js             # Test cases module xác thực admin
├── admin.html                   # Cổng Quản Trị Cán Bộ Tuyển Sinh
├── index.html                   # Cổng Sinh Viên Đăng Ký & Tra Cứu
└── README.md                    # Hướng dẫn dự án
```

---

## 3. 🏷️ Quy Ước Đặt Tên (Naming Conventions)

1. **Khóa Lưu Trữ Trình Duyệt (`STORAGE_KEYS`):**
   - Luôn bắt đầu bằng tiền tố `ts_scheduler_` hoặc `ts_admin_` để tránh xung đột với các ứng dụng khác trên cùng domain:
     - `ts_scheduler_students`: Danh sách sinh viên đăng ký.
     - `ts_scheduler_schedule_result`: Lịch trực 1 tuần.
     - `ts_scheduler_month_result`: Lịch trực 4 tuần cả tháng.
     - `ts_scheduler_reg_config`: Cấu hình mở/đóng cổng và cờ công bố lịch trực.
     - `ts_scheduler_admin_users`: Danh sách tài khoản cán bộ quản trị.
     - `ts_scheduler_swap_requests`: Danh sách yêu cầu đổi ca / nhờ trực hộ.
     - `ts_admin_authenticated`: Token trạng thái đăng nhập (`'true'`) trong `sessionStorage`.
     - `ts_admin_user_data`: Thông tin JSON cán bộ đang đăng nhập trong `sessionStorage`.
2. **Định Danh Ca Trực (Shift IDs):**
   - Định dạng: `T<2-6>_<S|C>`
     - `T2_S`: Sáng Thứ Hai (07:30 - 11:30)
     - `T2_C`: Chiều Thứ Hai (13:00 - 16:30)
     - ... đến `T6_S` và `T6_C`.
   - Tổng cộng: **10 ca hành chính trong tuần**.
3. **Phân Loại Thành Viên:**
   - `'old'`: Người Cũ (đã có kinh nghiệm trực, phụ trách chính).
   - `'new'`: Người Mới (tập sự, phối hợp tư vấn).
   - **Ràng buộc cứng:** Mỗi ca trực bắt buộc ghép đúng `1 oldMember + 1 newMember`.
4. **Git Branching Convention:**
   - Nhánh chính: `main`.
   - Nhánh Agent cách ly: `agent/<ten-tac-vu>-<YYYYMMDD-HHMM>`.
