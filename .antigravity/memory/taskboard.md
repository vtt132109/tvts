# 📋 Multi-Agent Taskboard (Bảng Theo Dõi Tiến Độ Trực Tiếp)

> [!NOTE]
> Bảng theo dõi tiến độ thời gian thực dành cho **Parent Agent** và các **Subagents** (`@backend-agent`, `@frontend-agent`, `@qa-agent`, `@browser-inspector`, `@release-gatekeeper`).
> Mọi thay đổi trạng thái của các đầu việc phải được cập nhật ngay lập tức vào bảng này để người dùng theo dõi trực quan.

---

## 🚦 Quy Ước Ký Hiệu Trạng Thái
- `[ ]` **Pending:** Tác vụ đang chờ thực hiện / chưa bắt đầu.
- `[/]` **In Progress:** Tác vụ đang được một Subagent tích cực xử lý.
- `[x]` **Completed:** Tác vụ đã hoàn thành, đã kiểm tra và vượt qua kiểm thử.
- `[!]` **Blocked:** Tác vụ bị tắc nghẽn (lỗi test, xung đột hợp đồng, hoặc cần người dùng xác nhận).

---

## 🎯 Tác Vụ Hiện Tại (Active Task Session)
- **Tên phiên làm việc:** Tính Năng Sao Lưu Trực Tiếp Trên Web (Tối Đa 6 Tháng)
- **Nhánh Git phụ trách:** `agent/web-backup-6months-20261015-1808`
- **Thời điểm khởi tạo:** 2026-10-15 18:08
- **Tiến độ tổng thể:** `[x] 100%`

---

## 📊 Bảng Theo Dõi Chi Tiết (Execution Matrix)

| ID | Đầu Việc / Tính Năng | Agent Phụ Trách | Phạm Vi Files (`allowed_paths`) | Trạng Thái | Ghi Chú & Bằng Chứng |
|---|---|---|---|:---:|---|
| BACKUP-00 | Đặc tả hợp đồng dữ liệu `WebBackupItem` & chính sách lưu trữ 6 tháng | Parent Agent | `.antigravity/memory/api-contracts.md` | `[x]` | Hoàn thành Section 7 trong api-contracts.md |
| BACKUP-01 | Xây dựng giao diện Tab Sao Lưu Trên Web & bảng quản lý trong `admin.html` | `@frontend-agent` | `admin.html`, `css/style.css` | `[x]` | Đã thêm tab, badge đếm bản lưu, thanh dung lượng & bảng thao tác 1-click |
| BACKUP-02 | Hiện thực hóa logic quản lý snapshot, auto-prune 6 tháng (180 ngày) và khôi phục 1-click trong `js/admin.js` | `@backend-agent` | `js/admin.js` | `[x]` | Triển khai hoàn thiện WebBackupManager, auto-prune 180d, max 6 bản, 1-click restore |
| BACKUP-03 | Xây dựng bộ test cases tự động cho tính năng sao lưu web & auto-prune 6 tháng | `@qa-agent` | `tests/backup.test.js`, `tests/run_all_tests.js` | `[x]` | Hoàn thành 7/7 test cases đạt chuẩn (100% PASS) |
| BACKUP-04 | Thẩm định 5 chiều, chạy toàn bộ CI Harness 100% PASS và thực thi `/merge-clean` | `@release-gatekeeper` | Toàn bộ dự án | `[x]` | 41/41 test cases toàn hệ thống PASS 100%, sẵn sàng merge-clean |

---

## 📝 Nhật Ký Hoạt Động (Activity Log)
- `18:07`: Khởi tạo nhánh cô lập an toàn `agent/web-backup-6months-20261015-1808`.
- `18:08`: Bổ sung Hợp đồng dữ liệu `WebBackupItem` vào `.antigravity/memory/api-contracts.md`.
- `18:09`: Triển khai giao diện tab sao lưu web và logic lưu trữ 6 tháng (180 ngày).
- `18:11`: Viết bộ kiểm thử tự động `tests/backup.test.js` bao quát 7 kịch bản lưu trữ, dọn dẹp và khôi phục.
- `18:12`: Phát hiện và sửa lỗi thiếu từ khóa `const` biến `link` trong `handleExportBackupJson`.
- `18:13`: Tích hợp vào `tests/run_all_tests.js`, chạy toàn bộ 4 suites đạt 41/41 PASS (100% SUCCESS).
- `18:14`: Chuẩn bị gộp nhánh `/merge-clean` vào nhánh `main`.
