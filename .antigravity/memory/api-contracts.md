# API & Data Contracts Memory

File này là hợp đồng dữ liệu chuẩn hóa (Single Source of Truth) giữa các tầng **Backend (`js/scheduler.js`, `data/`)**, **Frontend (`js/student.js`, `js/admin.js`)**, và **QA Test Harness (`tests/`)**. Mọi thay đổi về cấu trúc dữ liệu bắt buộc phải được cập nhật tại đây trước khi thực hiện code song song.

---

## 1. 👥 Mô Hình Sinh Viên Đăng Ký (`Student`)

Lưu trữ trong `localStorage.getItem('ts_scheduler_students')` dưới dạng JSON array:

```typescript
interface Student {
  id: string;               // Mã định danh duy nhất (vd: 's_1728999999_0')
  studentId: string;        // MSSV chính thức (vd: '2102001', '2211005')
  fullName: string;         // Họ và tên đầy đủ
  phone?: string;           // Số điện thoại / Zalo liên lạc
  role: 'old' | 'new';      // 'old': Người cũ (hướng dẫn) | 'new': Người mới (tập sự)
  availableShifts: string[];// Danh sách mã ca rảnh (vd: ['T2_S', 'T3_C', 'T5_S'])
  createdAt: number;        // Timestamp tạo bản ghi (epoch ms)
  updatedAt?: number;       // Timestamp cập nhật gần nhất
}
```

---

## 2. 🕒 Bảng Ca Trực Tuần & Cả Tháng (`ShiftSlot` & `Schedule`)

### A. Từng Ô Ca Trực (`ShiftSlot`):
```typescript
interface ShiftSlot {
  shiftId: string;          // Khóa ca (vd: 'T2_S', 'T5_C')
  dayKey: 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  period: 'S' | 'C';        // 'S': Sáng (07:30-11:30) | 'C': Chiều (13:00-16:30)
  oldMember: Student | null;// 1 thành viên Người Cũ
  newMember: Student | null;// 1 thành viên Người Mới
  status: 'full' | 'partial' | 'empty'; 
  // 'full': Đủ 1 Cũ + 1 Mới | 'partial': Thiếu 1 người | 'empty': Trống
}
```

### B. Bảng Lịch 1 Tuần (`WeekSchedule`):
Lưu trong `localStorage.getItem('ts_scheduler_schedule_result')`:
```typescript
interface WeekSchedule {
  weekNumber: number;       // 1, 2, 3, hoặc 4
  scheduleTable: {
    [shiftId: string]: ShiftSlot; // Gồm 10 ca từ T2_S đến T6_C
  };
  unassignedStudents?: Student[];
  totalFilledShifts: number;
}
```

### C. Bảng Lịch 1 Tháng (`MonthSchedule`):
Lưu trong `localStorage.getItem('ts_scheduler_month_result')`:
```typescript
interface MonthSchedule {
  month: number;            // 1-12
  year: number;             // vd: 2026
  weeks: WeekSchedule[];    // Mảng gồm đúng 4 tuần phân công luân phiên
  totalShifts: number;      // 40 ca
  fairnessStats?: {
    old: { [studentId: string]: number };
    new: { [studentId: string]: number };
  };
}
```

---

## 3. ⏰ Cấu Hình Cổng Đăng Ký & Công Bố Lịch Trực (`RegConfig`)

Lưu trong `localStorage.getItem('ts_scheduler_reg_config')`:

```typescript
interface RegConfig {
  mode: 'always_open' | 'time_window' | 'closed';
  startTime?: string;       // ISO datetime string (vd: '2026-10-15T08:00')
  endTime?: string;         // ISO datetime string
  closedNotice?: string;    // Thông báo tùy chỉnh khi đóng cổng
  publishSchedule: boolean; // TRUE: Cho phép sinh viên xem lịch trực ngay
                            // FALSE: Tạm ẩn lịch trực khi cổng đang mở
}
```

### Quy Tắc Hiển Thị Phía Cổng Sinh Viên (`index.html`):
- **Nếu `mode === 'closed'` HOẶC hết hạn:** Form đăng ký tự động **ẨN ĐI**, chỉ hiển thị Bảng lịch trực tuần và Tra cứu ca trực theo MSSV. Đổi ca giữ nguyên.
- **Nếu `mode === 'always_open'` HOẶC đang trong giờ mở:** Form đăng ký **HIỂN THỊ**. Bảng lịch trực và Tra cứu MSSV **BỊ ẨN** trừ phi `publishSchedule === true`. Đổi ca giữ nguyên.

---

## 4. 🔑 Tài Khoản Cán Bộ & Phiên Đăng Nhập (`AdminUser`)

Lưu danh sách trong `localStorage.getItem('ts_scheduler_admin_users')`:
```typescript
interface AdminUser {
  id: string;               // vd: 'usr_admin', 'usr_diephoi'
  username: string;         // So khớp không phân biệt hoa thường (.toLowerCase())
  password: string;         // Mật khẩu (phân biệt hoa thường)
  fullName: string;         // Họ và tên cán bộ
  role: string;             // 'Trưởng ban điều hành', 'Điều phối viên', v.v.
  pin: string;              // Mã PIN 4-6 số đăng nhập nhanh (vd: '9999', '8888')
}
```

Phiên làm việc trên `sessionStorage`:
- `sessionStorage.getItem('ts_admin_authenticated')`: Phải bằng chuỗi `'true'`.
- `sessionStorage.getItem('ts_admin_user_data')`: Chuỗi JSON của đối tượng `AdminUser` hiện hành.

---

## 5. 🔄 Đề Xuất Đổi Ca & Nhờ Trực Hộ (`SwapRequest`)

Lưu trong `localStorage.getItem('ts_scheduler_swap_requests')`:

```typescript
interface SwapRequest {
  id: string;               // vd: 'swap_1728999999_123'
  studentId: string;        // MSSV người gửi đề xuất
  studentName: string;      // Họ tên người gửi
  studentRole: 'old' | 'new';
  shiftId: string;          // Ca người gửi đang được phân công (vd: 'T2_S')
  weekNum: number;          // Tuần số mấy (1 - 4)
  type: 'swap' | 'cover';   // 'swap': Đổi chéo 2 chiều | 'cover': Nhờ trực hộ 1 chiều
  targetStudentId?: string; // MSSV người nhận đổi/trực hộ
  targetStudentName?: string;
  targetShiftId?: string;   // Ca mục tiêu muốn đổi lấy (khi type === 'swap')
  reason: string;           // Lý do đổi ca
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;        // ISO string
  approvedAt?: string;
  rejectedAt?: string;
}
```

---

## 6. 🌐 Cơ Chế Đồng Bộ Thời Gian Thực (Real-Time Storage Event)

Khi một tab thực hiện thay đổi dữ liệu trong `localStorage`:
```javascript
// Phát tín hiệu đồng bộ giữa các tab trình duyệt
window.dispatchEvent(new Event('storage'));
```
Các tab còn lại lắng nghe sự kiện `storage`:
- Key `ts_scheduler_schedule_result` / `ts_scheduler_month_result`: Tự động gọi `renderCommonSchedule()`.
- Key `ts_scheduler_reg_config`: Tự động gọi `evaluateRegistrationWindow()` và cập nhật ẩn/hiện phân hệ.
- Key `ts_scheduler_web_backups_v1`: Tự động đồng bộ danh sách bản sao lưu trên web.

---

## 7. 🗄️ Mô Hình Sao Lưu Trực Tiếp Trên Web (Tối Đa 6 Tháng) (`WebBackupItem`)

Lưu trữ trong `localStorage.getItem('ts_scheduler_web_backups_v1')` dưới dạng JSON array:

```typescript
interface WebBackupItem {
  id: string;               // Mã định danh bản sao lưu (vd: 'wbk_1729000000_abc')
  name: string;             // Tên hiển thị (vd: 'Sao lưu định kỳ Tháng 10/2026')
  monthKey: string;         // Khóa tháng (vd: '2026-10')
  monthLabel: string;       // Nhãn tháng tiếng Việt (vd: 'Tháng 10/2026')
  createdAt: number;        // Timestamp tạo bản sao lưu (epoch ms)
  expiresAt: number;        // Timestamp hết hạn (createdAt + 180 ngày)
  sizeBytes: number;        // Kích thước chuỗi JSON (bytes)
  stats: {
    studentCount: number;   // Số lượng CTV trong bản lưu
    weekCount: number;      // Số tuần lịch trực
    swapCount: number;      // Số lượng đề xuất đổi ca
    adminCount: number;     // Số tài khoản cán bộ
  };
  payload: {
    students: Student[];
    monthSchedule: MonthSchedule;
    scheduleResult: any;
    regConfig: RegConfig;
    adminUsers: AdminUser[];
    swapRequests: SwapRequest[];
  };
}
```

### Quy tắc lưu trữ & Giới hạn vòng đời (Retention Policy):
- **Thời hạn lưu trữ tối đa:** 6 tháng (~180 ngày).
- **Giới hạn số bản lưu:** Tối đa 6 bản sao lưu gần nhất.
- **Tự động dọn dẹp (Auto-Prune):** Khi khởi tạo hoặc khi lưu bản mới, hệ thống tự động lọc bỏ các bản sao lưu có `createdAt < Date.now() - 180*24*60*60*1000` hoặc vượt quá 6 bản.
