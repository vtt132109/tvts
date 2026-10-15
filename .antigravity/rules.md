# Antigravity Advanced Autonomous Multi-Agent Rules

Hệ thống quy chuẩn điều phối tự trị cao cấp (Advanced Autonomous Architecture) và bảo đảm an toàn dành riêng cho **Parent Agent (Agent Chính)** và các **Subagents** hoạt động trong dự án Hệ Thống Quản Lý Phân Công Lịch Trực Ban Tuyển Sinh HCM-UTE.

---

## 🧠 GIAO THỨC 1: BỘ NHỚ DÙNG CHUNG (SHARED MEMORY PROTOCOL)

> [!IMPORTANT]
> Nhằm tiết kiệm token ngữ cảnh, bảo toàn tri thức dự án và ngăn ngừa hiện tượng hallucination (ảo giác kiến trúc):

1. **Đọc Bộ Nhớ Bắt Buộc Trước Khi Thực Thi (Pre-Execution Memory Read):**
   - Trước khi bắt tay vào phân tích hoặc chỉnh sửa bất kỳ dòng code nào, **tất cả mọi Agent** (Parent Agent và các Subagents) **BẮT BUỘC PHẢI ĐỌC** 2 file tri thức trong `.antigravity/memory/`:
     - [`.antigravity/memory/project-context.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/project-context.md): Nắm vững kiến trúc Client-side, quy ước đóng gói IIFE, cấu trúc thư mục, quy ước `STORAGE_KEYS` và Shift IDs.
     - [`.antigravity/memory/api-contracts.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/api-contracts.md): Nắm vững định dạng dữ liệu giao tiếp (`Student`, `ShiftSlot`, `WeekSchedule`, `MonthSchedule`, `RegConfig`, `SwapRequest`).
2. **Cập Nhật Ngược Lại Tri Thức Sau Khi Hoàn Thành (Post-Execution Memory Sync):**
   - Khi triển khai xong một tính năng mới, thêm bảng dữ liệu mới, hoặc sửa đổi format lưu trữ, Agent phụ trách **BẮT BUỘC PHẢI CẬP NHẬT LẠI** nội dung thay đổi vào 2 file trên trước khi báo cáo hoàn thành cho người dùng.

---

## 📋 GIAO THỨC 2: BẢNG TIẾN ĐỘ TRỰC TIẾP (LIVE TASKBOARD TRACKING)

> [!NOTE]
> Để người dùng luôn nắm bắt được trạng thái công việc mà không cần hỏi:

1. **Khởi Tạo Danh Sách Đầu Việc:**
   - Khi tiếp nhận tác vụ phức tạp có từ 2 bước trở lên hoặc khi phân công cho nhiều Subagents chạy song song, Parent Agent **BẮT BUỘC PHẢI KHỞI TẠO HOẶC CẬP NHẬT** bảng đầu việc vào [`.antigravity/memory/taskboard.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/taskboard.md).
2. **Quy Trình Cập Nhật Trạng Thái Của Subagents:**
   - Khi một Subagent bắt đầu nhận việc: chuyển trạng thái từ `Pending [ ]` sang `In Progress [/]`.
   - Khi Subagent hoàn thành việc và test đã pass: chuyển trạng thái sang `Completed [x]`.
   - Nếu gặp sự cố, xung đột schema hoặc vướng lỗi: chuyển sang `Blocked [!]` và ghi rõ lý do.

---

## 🎓 GIAO THỨC 3: NHẬT KÝ TỰ HỌC HỎI TỪ LỖI SAI (LESSONS LEARNED)

> [!TIP]
> Tích lũy tri thức để hệ thống thông minh hơn sau mỗi sự cố:

1. **Kích Hoạt Tự Học (Auto-Reflection Trigger):**
   - Khi một lệnh build/test bị thất bại phải sửa lại code.
   - Hoặc khi người dùng chỉ ra lỗi logic/thiếu sót trong khung chat.
2. **Quy Chuẩn Đúc Kết:**
   - Agent **BẮT BUỘC** phải tự đúc kết bài học theo đúng công thức:  
     `Nguyên nhân gốc rễ (Root Cause) -> Cách phòng tránh & Chuẩn hóa`
   - Ghi nối tiếp (append) vào [`.antigravity/memory/lessons-learned.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/lessons-learned.md) trước khi kết thúc phiên xử lý lỗi.
   - Mọi Agent tương lai trước khi viết code phải tham khảo các bài học này để không lặp lại lỗi cũ.

---

## 📜 GIAO THỨC 4: CONTRACT-FIRST (CHỐNG LỆCH DỮ LIỆU KHI CHẠY SONG SONG)

> [!CAUTION]
> Khi một tác vụ yêu cầu cả `@backend-agent` (xử lý dữ liệu/thuật toán) và `@frontend-agent` (xây dựng giao diện/DOM) chạy song song, việc lệch cấu trúc dữ liệu sẽ phá vỡ hệ thống:

1. **Quy Trình Contract-First Bắt Buộc:**
   - **Bước 1 (Parent Agent tạo hợp đồng):** Parent Agent **BẮT BUỘC PHẢI ĐẶT BÚT** định nghĩa chi tiết cấu trúc dữ liệu (Data Schema / TypeScript Interface / Payload định dạng) và ghi vào [`.antigravity/memory/api-contracts.md`](file:///d:/New%20folder%20(236)/.antigravity/memory/api-contracts.md) **TRƯỚC**.
   - **Bước 2 (Khởi chạy song song):** Sau khi Hợp đồng dữ liệu đã được ghi nhận, Parent Agent mới đồng thời kích hoạt `backend-agent` và `frontend-agent`.
   - **Bước 3 (Bám sát hợp đồng):** Cả hai subagent chỉ được phép code bám sát 100% theo schema đã thỏa thuận trong `api-contracts.md`, nghiêm cấm tự ý đổi tên trường dữ liệu hoặc kiểu dữ liệu.

---

## 🚀 GIAO THỨC 5: AUTO-DELEGATION & PARALLEL SPAWN (ỦY QUYỀN TỰ ĐỘNG)

1. **Nhận Diện Ý Định Ngữ Nghĩa (Semantic Trigger):**
   - Khi nhận yêu cầu từ người dùng, Parent Agent tự động đối chiếu nội dung với trường `description` của 3 Subagents trong `.antigravity/agents/`:
     - **`backend-agent`**: Logic thuật toán xếp ca Bipartite Matching, luân phiên 4 tuần, cấu trúc JSON/CSV/Excel, schema trong `data/`.
     - **`frontend-agent`**: Giao diện HTML5, CSS3, Responsive, Dark/Light Mode, components UI, ẩn/hiện phân hệ đăng ký & lịch trực.
     - **`qa-agent`**: Viết test cases, chạy kiểm thử tự động `node tests/run_all_tests.js`, kiểm tra hồi quy và ghi nhận nhật ký chất lượng.
   - **Tuyệt đối không bắt người dùng phải gõ cú pháp `@tên-agent`**. Parent Agent chủ động tự kích hoạt dựa trên ngữ cảnh.
2. **Khởi Chạy Song Song Không Xung Đột (Race-Free Concurrency):**
   - Khi yêu cầu chạm vào từ 2 mảng nghiệp vụ trở lên, Parent Agent gọi `invoke_subagent` một lần duy nhất chứa mảng các Subagent.
   - Mỗi Subagent chỉ thao tác trong `allowed_paths` của mình:
     - `backend-agent`: `js/scheduler.js`, `js/sample30.js`, `data/`
     - `frontend-agent`: `index.html`, `admin.html`, `css/`, `js/student.js`, `js/admin.js`
     - `qa-agent`: `tests/`, `tasks/`, `scripts/`
3. **Tổng Hợp & Hợp Nhất Đồng Bộ (Verification Gate):**
   - Sau khi các Subagents hoàn thành, Parent Agent kiểm tra chéo tính tương thích và bảo đảm **100% tests PASS** trước khi bàn giao.

---

## 🛡️ GIAO THỨC 6: PRE-EXECUTION GIT SAFETY GUARD (BẢO HIỂM GIT TỰ ĐỘNG)

> [!IMPORTANT]
> Trước khi gọi các Subagent hoặc sửa đổi từ **2 files trở lên**, Parent Agent **BẮT BUỘC** phải bảo hiểm theo 4 bước:

1. **Kiểm tra trạng thái:** `git status --porcelain`.
2. **Lưu Checkpoint an toàn:** Nếu có code dở dang, chạy:  
   `git add . ; git commit -m "chore(checkpoint): save user state before agent task"`.
3. **Tách nhánh cách ly:**  
   `git checkout -b agent/<ten-tac-vu-ngan-gon>-<YYYYMMDD-HHMM>`.
4. **Thực thi trong nhánh cách ly:** Mọi Subagent chỉ làm việc trên nhánh `agent/*`. Khi hoàn tất, in rõ hướng dẫn gộp nhánh (`/merge-clean`) hoặc hủy bỏ (`/rollback`).

---

## ⚡ GIAO THỨC 7: CIRCUIT BREAKER (CẦU CHÌ CHỐNG LẶP VÔ TẬN - MAX RETRY = 3)

> [!WARNING]
> Để bảo vệ hạn ngạch API (Quota) và ngăn chặn tình trạng Agent bị "kẹt vòng lặp tự sửa lỗi" (Infinite Retry Loop):

1. **Ngưỡng Kích Hoạt Cầu Chì (Max Consecutive Failures = 3):**
   - Nếu bất kỳ Agent nào thực thi lệnh build / test (`node tests/run_all_tests.js`) / linter mà **thất bại 3 lần liên tiếp** trên cùng một lỗi hoặc cùng một nguyên nhân:
   - **BẮT BUỘC DỪNG NGAY LẬP TỨC (HALT EXECUTION)**.
2. **Hành Động Khi Ngắt Cầu Chì:**
   - **TUYỆT ĐỐI KHÔNG TỰ Ý CHẠY THỬ LẦN THỨ 4**.
   - Agent phải lập tức dừng tool calls, chuyển sang xuất văn bản báo cáo cho người dùng:
     1. Mô tả chính xác lỗi phát sinh và log lỗi cụ thể.
     2. Phân tích Nguyên nhân gốc rễ (Root Cause Analysis).
     3. Đề xuất 2-3 phương án giải quyết để người dùng lựa chọn.

---

## 🔒 GIAO THỨC 8: SECRET SHIELD (BẢO VỆ TẬP TIN NHẠY CẢM)

> [!CAUTION]
> Nghiêm cấm mọi hành vi rò rỉ bí mật, khóa mật mã và lịch sử Git nội bộ:

1. **Danh Sách Tệp & Thư Mục Cấm Tuyệt Đối (`denied_paths`):**
   - Mọi file môi trường bí mật: `.env`, `.env.local`, `.env.*`.
   - Mọi chứng chỉ và khóa riêng tư: `*.pem`, `*.key`, `*.pfx`, `*.crt`.
   - Thư mục dữ liệu phiên bản nội bộ: `.git/`.
2. **Chế Tài Thực Thi:**
   - **CẤM ĐỌC (`view_file`, `read_file`):** Tuyệt đối không đọc nội dung các file trên.
   - **CẤM IN RA MÀN HÌNH:** Không hiển thị giá trị secret, private key trong bất kỳ log hay tin nhắn chat nào.
   - **CẤM CHỈNH SỬA / XÓA:** Không cho phép bất kỳ tool chỉnh sửa hay lệnh terminal nào sửa đổi hoặc xóa các tệp này.

---

## 🧱 GIAO THỨC 9: DEPENDENCY FIREWALL (TƯỜNG LỬA KIỂM SOÁT THƯ VIỆN)

> [!WARNING]
> Ngăn chặn việc tự ý cài đặt package ngoài luồng gây phình to mã nguồn hoặc rủi ro bảo mật chuỗi cung ứng (Supply-chain attack):

1. **Cấm Tự Ý Cài Đặt Package:**
   - Mọi lệnh cài đặt gói phụ thuộc: `npm install *`, `npm i *`, `yarn add *`, `pnpm add *`, `pip install *` **BẮT BUỘC PHẢI HỎI Ý KIẾN NGƯỜI DÙNG** trong khung chat.
   - Tuyệt đối không được tự động chạy ngầm trong background hay tự ý thêm dependencies vào `package.json`.
2. **Ưu Tiên Tối Đa Thư Viện Sẵn Có:**
   - Subagents **BẮT BUỘC PHẢI TẬN DỤNG** các công nghệ và thư viện đã tích hợp sẵn trong dự án:
     - JavaScript ES6+ thuần (Vanilla JS), bọc IIFE cô lập.
     - Web Storage API (`localStorage`, `sessionStorage`).
     - DOM APIs chuẩn trình duyệt, CSS3 Variables.
     - Node.js built-ins (`fs`, `path`, `assert`) cho test harness.
