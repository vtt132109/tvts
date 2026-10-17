/**
 * ==========================================================================
 * BỘ DỮ LIỆU KIỂM THỬ (CHỈ DÙNG TRONG TEST)
 * ==========================================================================
 * KHÔNG được nạp vào trang web. Không chứa dữ liệu CTV thật.
 *
 * Trước đây test dùng luôn danh sách 30 CTV mẫu nhúng trong js/sample30.js
 * làm dữ liệu đầu vào. Khi gỡ danh sách mẫu khỏi sản phẩm (danh sách thật là
 * 58 người, nạp từ CSV), các test đó mất dữ liệu và FAIL — dù thuật toán xếp
 * ca hoàn toàn không đổi.
 *
 * Bài học: test không nên phụ thuộc dữ liệu sản phẩm. Dữ liệu kiểm thử phải
 * nằm trong tests/, tự chứa, và mô tả rõ hình dạng đầu vào/đầu ra mong muốn.
 *
 * Hình dạng: 30 hồ sơ (12 Chính Thức + 18 Tập Sự) — đủ số lượng để kiểm
 * ràng buộc 1 Cũ + 1 Mới mỗi ca, luân phiên 4 tuần, và các trường hợp biên.
 */

/** Danh sách CTV dùng cho kiểm thử: 12 Chính Thức + 18 Tập Sự. */
function buildTestStudents() {
  const OLD = [
    ['Nguyễn Văn An', '2102001'], ['Trần Thị Bích', '2102002'],
    ['Lê Hoàng Cường', '2102003'], ['Phạm Minh Đức', '2102004'],
    ['Vũ Thị Hồng', '2102005'], ['Đặng Quốc Huy', '2102006'],
    ['Bùi Thu Trang', '2102007'], ['Hoàng Văn Kiên', '2102008'],
    ['Đỗ Thị Lan', '2102009'], ['Ngô Văn Mạnh', '2102010'],
    ['Dương Thị Nga', '2102011'], ['Lý Văn Phúc', '2102012']
  ];
  const NEW = [
    ['Hoàng Lan Anh', '2302001'], ['Ngô Gia Bảo', '2302002'],
    ['Bùi Khánh Linh', '2302003'], ['Đỗ Tuấn Kiệt', '2302004'],
    ['Lý Thu Trang', '2302005'], ['Dương Minh Trí', '2302006'],
    ['Mai Phương Thảo', '2302007'], ['Trịnh Bảo Ngọc', '2302008'],
    ['Phan Gia Hân', '2302009'], ['Vũ Đình Tuấn', '2302010'],
    ['Nguyễn Hà Vy', '2302011'], ['Đặng Minh Quân', '2302012'],
    ['Trần Yến Nhi', '2302013'], ['Lê Hoàng Thư', '2302014'],
    ['Phạm Anh Tuấn', '2302015'], ['Hoàng Mai Phương', '2302016'],
    ['Đỗ Gia Bảo', '2302017'], ['Nguyễn Hoài An', '2302018']
  ];
  const allShifts = ['T2_S', 'T2_C', 'T3_S', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T5_C', 'T6_S', 'T6_C'];
  const out = [];
  OLD.forEach(([fullName, studentId], i) => {
    out.push({ id: `test_old_${i + 1}`, fullName, studentId, role: 'old', availableShifts: [...allShifts] });
  });
  NEW.forEach(([fullName, studentId], i) => {
    out.push({ id: `test_new_${i + 1}`, fullName, studentId, role: 'new', availableShifts: [...allShifts] });
  });
  return out;
}

const TEST_STUDENTS = buildTestStudents();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEST_STUDENTS, buildTestStudents };
}

if (typeof window !== 'undefined') {
  window.TEST_STUDENTS = TEST_STUDENTS;
  window.buildTestStudents = buildTestStudents;
}