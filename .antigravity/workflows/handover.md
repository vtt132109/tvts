---
name: handover
description: "Đóng gói toàn diện trạng thái công việc hiện tại, các file vừa chỉnh sửa, lỗi còn tồn đọng và danh sách bước tiếp theo vào .antigravity/memory/handover-state.md để bàn giao mượt mà sang phiên trò chuyện mới mà không làm mất ngữ cảnh."
trigger: /handover
---

# Workflow: Bàn Giao Ngữ Cảnh & Đóng Gói Trạng Thái (/handover)

Quy trình tự động hóa giải phóng bộ nhớ khi phiên trò chuyện hiện tại quá dài hoặc tiêu tốn nhiều token. Khi người dùng kích hoạt lệnh `/handover`, Agent sẽ tổng hợp và nén toàn bộ tri thức làm việc vào một file duy nhất để Agent của phiên chat mới có thể tiếp quản ngay lập tức.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng gõ `/handover`, Agent thực hiện tuần tự 4 bước sau:

### Bước 1: Quét Trạng Thái Git Hiện Tại
Kiểm tra nhánh làm việc, commit mới nhất và các thay đổi chưa staged:
```powershell
git status --short
git log -1 --oneline
```

### Bước 2: Đồng Bộ Trạng Thái Taskboard
Đọc file `.antigravity/memory/taskboard.md` để xác định:
- Những đầu việc nào đã `[x]` Completed.
- Những đầu việc nào đang `[/]` In Progress hoặc `[!]` Blocked.

### Bước 3: Đóng Gói Vào `.antigravity/memory/handover-state.md`
Ghi đè hoặc tạo mới file [`.antigravity/memory/handover-state.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/handover-state.md) theo cấu trúc chuẩn hóa:

```markdown
# 📦 Handover State (Bản Bàn Giao Trạng Thái Dự Án)

## 📌 1. Thông Tin Phiên Làm Việc (Session Metadata)
- **Thời điểm bàn giao:** YYYY-MM-DD HH:MM
- **Nhánh Git hiện tại:** `main` (hoặc `agent/*`)
- **Commit mới nhất:** `<hash> <message>`
- **Trạng thái CI:** 12/12 Tests PASS (100%)

## 🛠️ 2. Các Thay Đổi & Tính Năng Vừa Hoàn Thành
- Danh sách các file vừa sửa đổi/thêm mới.
- Tóm tắt logic cốt lõi đã hiện thực.

## ⏳ 3. Các Đầu Việc Đang Dở Dang / Cần Làm Tiếp
- [ ] Task tiếp theo 1
- [ ] Task tiếp theo 2

## ⚠️ 4. Lưu Ý Quan Trọng Cho Agent Kế Tiếp
- Nhắc nhở về IIFE, LocalStorage keys, hoặc Dependency Firewall.
- Lệnh chạy kiểm thử nhanh: `node tests/run_all_tests.js`.
```

### Bước 4: Lưu Checkpoint Git An Toàn
Commit file handover vào git nếu cần:
```powershell
git add .antigravity/memory/handover-state.md
git commit -m "chore(handover): update project handover state for next session"
```

---

## 📢 Thông Báo Bàn Giao Hoàn Tất
Agent thông báo hoàn tất bàn giao cho người dùng kèm câu lệnh đề xuất để kích hoạt Agent ở phiên chat mới:
> *"Em đã đóng gói xong trạng thái dự án vào `.antigravity/memory/handover-state.md`. Ở phiên chat mới, anh chỉ cần nhắn: `Đọc file .antigravity/memory/handover-state.md và tiếp tục công việc nhé` là Agent mới sẽ bắt nhịp ngay lập tức ạ!"*
