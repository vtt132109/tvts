# Antigravity Multi-Agent Orchestration & Safety Rules

Hệ thống quy chuẩn điều phối và an toàn dành riêng cho **Parent Agent (Agent Chính)** và các **Subagents** hoạt động trong dự án Hệ Thống Quản Lý Phân Công Lịch Trực Ban Tuyển Sinh HCM-UTE.

---

## 🚀 GIAO THỨC 1: AUTO-DELEGATION & PARALLEL SPAWN (ĐIỀU PHỐI TỰ ĐỘNG & CHẠY SONG SONG)

> [!IMPORTANT]
> Parent Agent **KHÔNG TỰ Ý ÔM ĐỒM** viết toàn bộ code cho các tác vụ phức tạp hoặc đa phân hệ. Phải tuân thủ nghiêm ngặt cơ chế phân rã công việc và ủy quyền tự động:

1. **Nhận Diện Ý Định Ngữ Nghĩa (Semantic Trigger):**
   - Khi nhận yêu cầu từ người dùng, Parent Agent tự động đối chiếu nội dung với trường `description` của 3 Subagents trong `.antigravity/agents/`:
     - **`backend-agent`**: Logic thuật toán xếp ca, cấu trúc dữ liệu, xử lý file JSON/CSV/Excel, schema trong `data/`.
     - **`frontend-agent`**: Giao diện HTML5, CSS3, Responsive, Dark/Light Mode, components UI, ẩn/hiện phân hệ đăng ký & lịch trực.
     - **`qa-agent`**: Viết test cases, chạy kiểm thử tự động `node tests/run_all_tests.js`, kiểm tra hồi quy và ghi nhận nhật ký chất lượng.
   - **Tuyệt đối không yêu cầu người dùng phải gõ cú pháp `@tên-agent`**. Parent Agent chủ động tự kích hoạt dựa trên ngữ cảnh.

2. **Khởi Chạy Song Song (Concurrent Spawn):**
   - Khi yêu cầu chạm vào từ 2 mảng nghiệp vụ trở lên (ví dụ: vừa thêm tính năng UI, vừa cập nhật thuật toán, vừa cần test), Parent Agent phải khởi chạy đồng thời các Subagent qua một lượt gọi `invoke_subagent` duy nhất với danh sách `Subagents: [...]`.
   - Mỗi Subagent vận hành độc lập trong phạm vi `allowed_paths` của mình để triệt tiêu hoàn toàn rủi ro xung đột ghi file (Race Condition).

3. **Tổng Hợp & Hợp Nhất Đồng Bộ (Synthesizer & Verification Gate):**
   - Sau khi các Subagents hoàn thành và phản hồi kết quả, Parent Agent có trách nhiệm kiểm tra chéo:
     - Giao diện có khớp với dữ liệu backend vừa cập nhật không?
     - Toàn bộ các bộ test tự động (`node tests/run_all_tests.js`) có đạt 100% PASS không?
   - Sau khi xác nhận tính toàn vẹn và đồng bộ, Parent Agent mới lập báo cáo tổng hợp cuối cùng gửi người dùng.

---

## 🛡️ GIAO THỨC 2: PRE-EXECUTION GIT SAFETY GUARD (BẢO HIỂM GIT TỰ ĐỘNG)

> [!CAUTION]
> Để bảo vệ 100% mã nguồn và tiến độ công việc của người dùng, trước khi gọi các Subagent hoặc sửa đổi từ **2 files trở lên**, Parent Agent **BẮT BUỘC** phải thực hiện tuần tự 4 bước bảo hiểm sau:

### Bước 1: Kiểm Tra Trạng Thái Working Tree
Chạy lệnh kiểm tra xem người dùng có thay đổi dở dang chưa commit không:
```powershell
git status --porcelain
```

### Bước 2: Tự Động Lưu Checkpoint Người Dùng (Nếu Có Thay Đổi Dở Dang)
Nếu đầu ra của `git status --porcelain` có chứa file chưa commit hoặc untracked, tự động lưu lại một checkpoint an toàn:
```powershell
git add .
git commit -m "chore(checkpoint): save user state before agent task"
```

### Bước 3: Tự Động Phân Nhánh Làm Việc Riêng Biệt (`agent/*`)
Tạo và chuyển sang nhánh riêng biệt theo đúng quy ước đặt tên:
```powershell
# Định dạng: agent/<ten-tac-vu-ngan-gon>-<YYYYMMDD-HHMM>
# Ví dụ:
git checkout -b agent/hide-schedule-20261015-1145
```

### Bước 4: Thi Hành Code Trong Nhánh Cách Ly & Bàn Giao
- Toàn bộ công việc sửa đổi code của các Subagents và Parent Agent **CHỈ ĐƯỢC PHÉP THỰC THI TRÊN NHÁNH `agent/*` NÀY**.
- Nhánh gốc (thường là `main` hoặc nhánh ban đầu của người dùng) được giữ nguyên vẹn an toàn tuyệt đối.
- **Yêu cầu kết thúc bắt buộc:** Ở cuối mỗi câu trả lời sau khi hoàn thành nhiệm vụ, Parent Agent phải in rõ:
  1. Tên nhánh gốc ban đầu (ví dụ: `main`).
  2. Tên nhánh agent vừa làm việc (ví dụ: `agent/ten-tac-vu-...`).
  3. Lệnh hướng dẫn gộp nhánh vào nhánh chính:
     ```powershell
     git checkout main
     git merge agent/<ten-tac-vu>
     ```
  4. Lệnh hướng dẫn hủy bỏ thay đổi (Rollback nhanh):
     ```powershell
     git checkout main
     git branch -D agent/<ten-tac-vu>
     # hoặc gõ lệnh /rollback
     ```
