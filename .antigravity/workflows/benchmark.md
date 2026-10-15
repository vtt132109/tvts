---
name: benchmark
description: "Tự động phân tích các hàm xử lý nặng trong dự án, đo lường độ phức tạp thuật toán Big-O (Time & Space Complexity), phát hiện các điểm nghẽn (bottlenecks, DOM thrashing, I/O serialization) và đề xuất phương án code tối ưu."
trigger: /benchmark
---

# Workflow: Phân Tích Hiệu Năng & Đo Lường Big-O Benchmark

Quy trình tự động rà soát, đo lường và định lượng hiệu năng tính toán, tiêu hao bộ nhớ cũng như phát hiện các điểm nghẽn tiềm ẩn trong hệ thống Quản lý Phân công Lịch trực.

---

## 🔬 1. Trọng Tâm Phân Tích Độ Phức Tạp Big-O (Complexity Matrix)

Khi người dùng kích hoạt lệnh `/benchmark`, Agent tiến hành bóc tách mã nguồn tại các module trọng điểm:

### A. Thuật toán Xếp Ca Lịch Trực (`js/scheduler.js`)
- **Hàm trọng điểm:** `generateSchedule(students, shifts, config)`.
- **Phân tích Time Complexity:**
  - *Hiện tại:* $O(W \times S \times N)$ với $W$ là số tuần (4), $S$ là số ca trực mỗi tuần (~10), $N$ là tổng số sinh viên đăng ký. Trong mỗi ca, việc duyệt mảng kiểm tra điều kiện khả dụng (availability check) và số ca đã nhận yêu cầu nhiều phép duyệt lặp.
  - *Mục tiêu tối ưu:* $O(W \times S \times \log N)$ bằng cách sử dụng hàng đợi ưu tiên (Priority Queue / Max-Heap) dựa trên trọng số công bằng hoặc Hash Map $O(1)$ để tra cứu trạng thái ca trực của sinh viên.
- **Phân tích Space Complexity:** $O(W \times S + N)$ cho mảng lưu trữ cấu trúc lịch trực và bảng băm đếm ca.

### B. Module Đọc & Phân Tích CSV/Excel (`js/admin.js`)
- **Hàm trọng điểm:** `parseStudentCSV(rawText)`, `parseShiftCSV(rawText)`.
- **Phân tích Time Complexity:** $O(L \times C)$ với $L$ là số dòng (Lines) và $C$ là số cột (Columns).
- **Điểm nghẽn tiềm ẩn:** Xử lý chuỗi lớn bằng Regex lồng nhau hoặc `split('\n')` không kiểm soát dung lượng bộ nhớ.
- **Giải pháp:** Xử lý theo Stream (Streaming line-by-line) khi file vượt quá 5.000 dòng.

### C. Module Tra Cứu Sinh Viên & Hoán Đổi Ca (`js/student.js`)
- **Hàm trọng điểm:** `findStudentById(studentId)`, `filterAvailableSwapShifts(studentId)`.
- **Phân tích Time Complexity:**
  - *Hiện tại:* $O(N)$ khi dùng `Array.prototype.find()`.
  - *Tối ưu:* $O(1)$ bằng cách xây dựng `studentMap = new Map()` lưu trữ theo khóa `studentId` ngay khi tải dữ liệu vào bộ nhớ.

---

## ⚡ 2. Quy Trình Rà Soát Điểm Nghẽn (Bottlenecks Detection)

Agent rà soát 3 loại điểm nghẽn phổ biến trong ứng dụng Client-side:

### 1. LocalStorage I/O Serialization Overhead
- **Vấn đề:** Lạm dụng `JSON.parse(localStorage.getItem(...))` và `JSON.stringify()` lặp đi lặp lại trong các hàm con hoặc trong vòng lặp rendering.
- **Kiểm tra:** Đảm bảo dữ liệu chỉ được parse 1 lần khi khởi tạo ứng dụng và lưu trữ trong State RAM; chỉ `stringify` khi có sự kiện ghi (Write Event).

### 2. DOM Thrashing & Render Bottlenecks
- **Vấn đề:** Thao tác chèn trực tiếp từng phần tử vào DOM (`element.appendChild()`) hoặc gán `innerHTML` liên tục trong vòng lặp rendering lịch trực/danh sách sinh viên.
- **Kiểm tra:** Bắt buộc sử dụng `DocumentFragment` hoặc gom cụm chuỗi HTML duy nhất 1 lần trước khi đưa vào DOM (`container.innerHTML = htmlBuffer`).

### 3. Tìm Kiếm Không Có Debounce
- **Vấn đề:** Sự kiện `input` trên thanh tìm kiếm MSSV kích hoạt vẽ lại toàn bộ bảng trên từng phím gõ.
- **Kiểm tra:** Đảm bảo đã có hàm `debounce(fn, 250)` để giảm tải việc tính toán vô ích.

---

## 🚀 3. Kịch Bản Đo Kiểm Tự Động (Automated Benchmark Runner)

Để đo lường thực tế thời gian thực thi (Execution Time) với mẫu $N = 30$, $N = 300$, $N = 3000$ sinh viên, chạy script đo kiểm:

```powershell
node -e "
const { generateSchedule } = require('./js/scheduler.js');
const { sampleStudents } = require('./js/sample30.js');

// Benchmark 1: Tập dữ liệu 30 sinh viên
console.time('Scheduler_N30');
generateSchedule(sampleStudents, 4);
console.timeEnd('Scheduler_N30');

// Benchmark 2: Tập dữ liệu mở rộng 300 sinh viên
const sample300 = Array.from({ length: 10 }, () => sampleStudents).flat().map((s, idx) => ({ ...s, id: s.id + '_' + idx }));
console.time('Scheduler_N300');
generateSchedule(sample300, 4);
console.timeEnd('Scheduler_N300');
"
```

---

## 📊 4. Định Dạng Báo Cáo Xuất Bản Của Lệnh `/benchmark`

Sau khi hoàn tất, Agent in báo cáo chuẩn hóa theo bảng sau:

| Vị Trí / Hàm | Độ Phức Tạp Hiện Tại | Thời Gian Chạy (N=30 / N=300) | Điểm Nghẽn Phát Hiện | Đề Xuất Tối Ưu Hóa |
|---|---|---|---|---|
| `js/scheduler.js:generateSchedule` | $O(W \times S \times N)$ | ~1.2ms / ~14.5ms | Tra cứu mảng tuyến tính $O(N)$ trong loop ca | Chuyển sang `Map` index và Priority Queue |
| `js/admin.js:renderScheduleTable` | $O(W \times S \times K)$ | ~4.8ms / ~38.0ms | Tạo DOM rời rạc gây Reflow layout | Dùng `DocumentFragment` gom cụm |
| `js/student.js:searchStudentShifts` | $O(N)$ | ~0.3ms / ~2.1ms | Parse LocalStorage mỗi lần gõ phím | Cache State RAM + Debounce 250ms |
