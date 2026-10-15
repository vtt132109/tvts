---
name: rollback
description: "Tự động hủy bỏ các thay đổi lỗi của Agent, dọn dẹp working tree, chuyển về nhánh ổn định ban đầu của người dùng và xóa nhánh agent/* bị lỗi."
trigger: /rollback
---

# Workflow: Rollback & Phục Hồi Nhánh Ổn Định

Quy trình tự động phục hồi môi trường làm việc khi các thay đổi của Agent gặp sự cố, sinh bug hoặc không đạt yêu cầu của người dùng.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng kích hoạt lệnh `/rollback`, Agent thực hiện tuần tự và dứt khoát 3 bước sau:

### Bước 1: Hủy bỏ toàn bộ thay đổi chưa commit và file rác
Dọn sạch mọi file bị sửa đổi và các file untracked phát sinh trong quá trình chạy lỗi:
```powershell
git reset --hard HEAD
git clean -fd
```

### Bước 2: Xác định và chuyển về nhánh gốc an toàn
Kiểm tra tên nhánh hiện tại. Nếu đang ở trên nhánh dạng `agent/*`:
```powershell
# Chuyển về nhánh trước đó hoặc nhánh main/master
git checkout -
# hoặc:
# git checkout main
```

### Bước 3: Xóa bỏ nhánh agent/* bị lỗi
Sau khi đã đứng trên nhánh gốc an toàn, tiến hành xóa dứt điểm nhánh agent bị lỗi để giữ git branch list luôn gọn gàng:
```powershell
git branch -D agent/<ten-nhanh-vua-huy>
```

---

## 📢 Báo Cáo Hoàn Tất
Sau khi thực thi xong, Agent in thông báo xác nhận:
- Trạng thái working tree hiện tại (`git status -s`).
- Tên nhánh an toàn hiện tại đang đứng (ví dụ: `main`).
- Xác nhận toàn bộ code của người dùng đã được phục hồi nguyên vẹn như trước khi Agent can thiệp.
