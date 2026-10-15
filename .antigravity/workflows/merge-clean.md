---
name: merge-clean
description: "Tự động chạy kiểm thử lần cuối (100% PASS), commit toàn bộ thay đổi, chuyển về nhánh gốc của người dùng, thực hiện git merge --no-ff nhánh agent/* vào nhánh chính, và tự động xóa nhánh tạm agent/* để giữ kho mã nguồn luôn sạch sẽ."
trigger: /merge-clean
---

# Workflow: Merge & Clean Nhánh Agent An Toàn

Quy trình tự động hóa khép kín đối xứng hoàn hảo với `/rollback`. Khi các tính năng hoặc bản sửa lỗi trên nhánh `agent/*` đã được người dùng kiểm duyệt hoàn tất và đạt chất lượng, lệnh `/merge-clean` sẽ tích hợp toàn bộ thay đổi vào nhánh chính và dọn dẹp sạch sẽ môi trường Git.

---

## ⚡ Các Bước Thực Thi Tự Động (Execution Steps)

Khi người dùng kích hoạt lệnh `/merge-clean`, Agent thực hiện tuần tự và dứt khoát 5 bước sau:

### Bước 1: Kiểm Thử Hồi Quy Lần Cuối (Pre-Merge Regression Test)
Trước khi merge, bắt buộc chạy lại toàn bộ test suite để đảm bảo không phát sinh lỗi tiềm ẩn:
```powershell
node tests/run_all_tests.js
```
> [!IMPORTANT]
> Toàn bộ 12/12 bài test bắt buộc phải **PASS (100% Success)**. Nếu có bất kỳ lỗi nào, Agent **DỪNG NGAY LẬP TỨC** và không thực hiện merge.

### Bước 2: Đóng Gói Toàn Bộ Thay Đổi Trên Nhánh Agent
Kiểm tra xem còn file nào chưa commit trên nhánh `agent/*` hiện tại hay không:
```powershell
git status --porcelain
```
Nếu còn thay đổi, tự động tạo commit hoàn thiện:
```powershell
git add .
git commit -m "feat(agent): finalize implementation and verify tests before merge"
```

### Bước 3: Xác Định Tên Nhánh & Chuyển Về Nhánh Gốc
Lấy tên nhánh agent hiện tại (ví dụ: `agent/update-schedule-20261015-1400`) và chuyển về nhánh chính (`main`):
```powershell
# Lưu tên nhánh agent hiện tại
$agentBranch = (git branch --show-current).Trim()

# Chuyển về nhánh chính
git checkout main
```

### Bước 4: Hợp Nhất Nhánh Với Cờ `--no-ff` (Non-Fast-Forward Merge)
Thực hiện merge bảo toàn toàn bộ lịch sử commit và nhánh nghiệp vụ:
```powershell
git merge --no-ff $agentBranch -m "merge(agent): integrate $agentBranch into main [skip ci]"
```

### Bước 5: Tự Động Xóa Nhánh Tạm `agent/*`
Sau khi merge thành công, tiến hành xóa nhánh tạm để giữ danh sách git branch luôn tinh gọn:
```powershell
git branch -d $agentBranch
```

---

## 📢 Báo Cáo Hoàn Tất
Sau khi thực thi xong, Agent xuất thông báo tổng kết:
- Tên nhánh agent đã được gộp và xóa thành công.
- Hash commit merge mới nhất trên nhánh chính (`git log -1 --oneline`).
- Kết quả kiểm thử CI Harness (12/12 PASS).
- Hướng dẫn người dùng đẩy code lên remote repository nếu cần:
  ```powershell
  git push origin main
  ```
