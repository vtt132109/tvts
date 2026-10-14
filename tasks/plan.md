# Implementation Plan: Tuyển Sinh Duty Scheduler (Hệ Thống Đăng Ký & Xếp Lịch Trực Ban Tuyển Sinh)

## Overview
Hệ thống web hiện đại dành cho Văn phòng Tư vấn Tuyển sinh, phục vụ 2 mục đích chính:
1. **Cổng sinh viên (Student Portal):** Cho phép cộng tác viên nhập Họ tên, Mã số sinh viên (MSSV), phân loại (Người cũ đã có kinh nghiệm vs Người mới tập sự) và đăng ký các ca rảnh trong tuần từ Thứ 2 đến Thứ 6 (mỗi ngày 2 ca: Sáng 8h00–11h30, Chiều 13h30–17h00).
2. **Bảng điều khiển quản trị & Thuật toán xếp lịch thông minh (Admin Scheduler & Dashboard):** Tự động phân bổ lịch trực cho 10 ca trong tuần sao cho:
   - Mỗi ca có đúng **2 bạn**: **1 người cũ** + **1 người mới**.
   - **Tối ưu hóa độ công bằng (Fairness):** Đảm bảo ai đăng ký cũng được xếp lịch trực ít nhất 1 ca, phân bổ đều số ca trực giữa các thành viên.
   - Hỗ trợ xem trực quan lịch tuần, điều chỉnh thủ công (drag/drop/select), cảnh báo thiếu người và xuất dữ liệu (Excel/PDF/In).

---

## Architecture & Technology Decisions

### 1. Công nghệ (Frontend Architecture)
- **Core:** HTML5 Semantics, Vanilla JavaScript (ES6+ Modules), CSS3 hiện đại (CSS Variables, Flexbox/Grid, Glassmorphism, animations mượt mà).
- **Trải nghiệm người dùng (UX/UI):**
  - Giao diện Premium Dark/Light Mode thanh lịch, bảng màu Indigo/Emerald/Amber hài hòa, font chữ hiện đại (Inter / Be Vietnam Pro).
  - Bảng chọn ma trận ca rảnh tương tác 1 chạm (Click to toggle ca Sáng/Chiều cho T2-T6).
  - Phân tách rõ ràng giữa 2 vai trò: Huy hiệu Người Cũ (badge tím/xanh ngọc) và Người Mới (badge cam/vàng) để dễ nhận biết.
- **Lưu trữ dữ liệu (Persistence):** LocalStorage API lưu danh sách đăng ký và kết quả xếp lịch theo thời gian thực, có nút Reset và nút "Nạp dữ liệu mẫu" (Sample Data) để kiểm thử thuật toán ngay lập tức.

### 2. Mô hình dữ liệu (Data Structure)
```javascript
// Ca trực
const SHIFTS = [
  { id: 'T2_S', day: 'Thứ 2', period: 'Sáng', time: '08:00 - 11:30' },
  { id: 'T2_C', day: 'Thứ 2', period: 'Chiều', time: '13:30 - 17:00' },
  { id: 'T3_S', day: 'Thứ 3', period: 'Sáng', time: '08:00 - 11:30' },
  { id: 'T3_C', day: 'Thứ 3', period: 'Chiều', time: '13:30 - 17:00' },
  { id: 'T4_S', day: 'Thứ 4', period: 'Sáng', time: '08:00 - 11:30' },
  { id: 'T4_C', day: 'Thứ 4', period: 'Chiều', time: '13:30 - 17:00' },
  { id: 'T5_S', day: 'Thứ 5', period: 'Sáng', time: '08:00 - 11:30' },
  { id: 'T5_C', day: 'Thứ 5', period: 'Chiều', time: '13:30 - 17:00' },
  { id: 'T6_S', day: 'Thứ 6', period: 'Sáng', time: '08:00 - 11:30' },
  { id: 'T6_C', day: 'Thứ 6', period: 'Chiều', time: '13:30 - 17:00' }
];

// Sinh viên
interface Student {
  id: string;              // UUID hoặc MSSV
  fullName: string;        // Họ và tên
  studentId: string;       // MSSV
  phone?: string;          // SĐT liên hệ
  role: 'old' | 'new';     // 'old': Người cũ, 'new': Người mới
  availableShifts: string[]; // Mảng các shift id rảnh (vd: ['T2_S', 'T3_C'])
  createdAt: number;
}

// Lịch trực đã xếp
interface ScheduleResult {
  shiftId: string;
  oldMember: Student | null;
  newMember: Student | null;
  status: 'full' | 'partial' | 'empty';
}
```

### 3. Thuật toán Xếp Lịch Tự Động (Matching & Fairness Algorithm)
Vì mỗi ca yêu cầu độc lập **1 Người Cũ** và **1 Người Mới**, bài toán được tách thành 2 bài toán con độc lập nhưng cùng bản chất:
1. **Phân bổ Người Cũ vào 10 ca.**
2. **Phân bổ Người Mới vào 10 ca.**

**Các bước thuật toán:**
1. **Kiểm tra biên (Edge Cases):**
   - Đếm số lượng $N_{old}$ và $N_{new}$.
   - Tính chỉ tiêu số ca lý tưởng cho mỗi bạn: $Target = \lceil 10 / N \rceil$.
2. **Sắp xếp độ ưu tiên (Heuristics - MRV & Fairness):**
   - **Ưu tiên ca khó trước (Most Constrained Slot):** Ca nào có ít người đăng ký rảnh nhất thì xếp trước để tránh bị bỏ trống.
   - **Ưu tiên người ít ca trước (Least Assigned First):** Trong số những người rảnh ca đó, chọn người hiện đang có ít ca được phân bổ nhất. Nếu bằng nhau, chọn người có tổng số ca đăng ký rảnh ít hơn (ít lựa chọn hơn) để giữ slot linh hoạt cho người khác.
   - **Đảm bảo ai cũng có ít nhất 1 ca:** Duyệt đảm bảo mọi thành viên đều được gán ca đầu tiên trước khi bất kỳ ai được gán ca thứ 2.
   - **Ràng buộc phụ:** Không xếp 1 người trùng 2 ca sáng/chiều trong cùng 1 ngày nếu còn người khác thay thế.
3. **Tối ưu hóa hoán đổi (Local Search & Swapping):**
   - Nếu còn ca trống do xung đột cục bộ, thực hiện chuỗi hoán đổi (Augmenting Path) để giải phóng slot cho người bị kẹt.
4. **Báo cáo kết quả & Giải trình:**
   - Đưa ra bảng thống kê: Ai trực mấy ca, ca nào thiếu người kèm lý do (ví dụ: Không có người cũ nào rảnh sáng T3).

---

## Task List

### Phase 1: Kiến trúc Cơ sở & Hệ Thống Đăng Ký (Registration Portal)
- [ ] **Task 1:** Thiết lập cấu trúc dự án & Design System hiện đại (`index.html`, `style.css`, CSS variables, responsive layout, glassmorphic UI).
- [ ] **Task 2:** Xây dựng Form Đăng ký sinh viên (Họ tên, MSSV, Phân loại Người cũ / Người mới, Ma trận chọn ca rảnh T2-T6 trực quan).
- [ ] **Task 3:** Quản lý danh sách sinh viên & Lưu trữ LocalStorage (Thêm, Sửa, Xóa sinh viên, xem ca đã đăng ký, Nạp dữ liệu mẫu - Seed Sample Data).

### Checkpoint 1: Cổng đăng ký hoàn chỉnh
- [ ] Sinh viên nhập được thông tin và chọn ca rảnh mượt mà.
- [ ] Dữ liệu lưu vào LocalStorage và hiển thị danh sách rõ ràng, phân loại Người cũ / Người mới.

### Phase 2: Thuật toán Tự Động Xếp Lịch & Bảng Điều Khiển Lịch Trực (Auto-Scheduler)
- [ ] **Task 4:** Hiện thực hóa thuật toán xếp ca công bằng (`scheduler.js`) đáp ứng chuẩn 1 Cũ + 1 Mới mỗi ca, tối ưu độ phủ ca và cân bằng số ca cho mỗi người.
- [ ] **Task 5:** Xây dựng Bảng Thời Khóa Biểu Tuần (Weekly Duty Board) hiển thị kết quả 10 ca với 2 vị trí (Người cũ & Người mới), có trạng thái Đủ / Thiếu.
- [ ] **Task 6:** Tính năng Tinh chỉnh thủ công (Cho phép quản trị viên đổi người, gán người vào ca theo danh sách người rảnh) và Bảng Thống kê Công Bằng (Thống kê số ca/người).

### Checkpoint 2: Thuật toán & Bảng trực hoàn chỉnh
- [ ] Bấm nút "Tự động xếp lịch" phân bổ chuẩn xác 1 cũ + 1 mới cho 10 ca.
- [ ] Bảng thống kê hiển thị ai trực ca nào, chênh lệch số ca tối thiểu.
- [ ] Tùy chỉnh thủ công hoạt động mượt mà.

### Phase 3: Hoàn thiện, Xuất Báo Cáo & Tối Ưu UX
- [ ] **Task 7:** Tính năng Xuất lịch trực (In / Xuất file CSV / Excel, chế độ xem thân thiện với máy in).
- [ ] **Task 8:** Kiểm thử toàn diện các kịch bản biên (Thiếu người cũ, thiếu người mới, trùng lịch, nhiều sinh viên) và hướng dẫn sử dụng.

### Checkpoint 3: Bàn giao hoàn tất
- [ ] Toàn bộ luồng hoạt động ổn định, không lỗi console, giao diện chuyên nghiệp và thân thiện với người dùng.

---

## Risks and Mitigations
| Rủi ro (Risk) | Mức độ | Biện pháp giải quyết (Mitigation) |
|---|---|---|
| Số lượng người cũ hoặc người mới ít hơn 10 (ví dụ chỉ có 3 người cũ) | Cao | Thuật toán cho phép người cũ trực nhiều ca (chia đều, vd mỗi bạn 3-4 ca) để phủ kín 10 ca trong tuần. |
| Một ca cụ thể không có ai rảnh (0 người đăng ký) | Trung bình | Đánh dấu ca này ở trạng thái Cảnh Báo (Thiếu người), đề xuất danh sách người rảnh ở ca lân cận để admin dễ dàng trao đổi. |
| Số lượng đăng ký quá đông (ví dụ 25 bạn mới, chỉ có 10 ca) | Trung bình | Thuật toán ưu tiên 10 bạn có ít ca nhất, đồng thời đưa ra danh sách dự bị (Waitlist) cho tuần tiếp theo. |

---

## Open Questions & Configuration Options
- Có giới hạn 1 bạn trực tối đa bao nhiêu ca trong 1 tuần không? (Mặc định: Thuật toán tự động chia đều cân bằng nhất có thể).
- Nếu 1 ngày có cả ca sáng và ca chiều, có được xếp cùng 1 bạn trực cả ngày không? (Mặc định: Ưu tiên xếp các bạn khác nhau, chỉ xếp cùng ngày nếu không còn ai khác rảnh).
