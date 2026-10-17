/**
 * ==========================================================================
 * ROSTER CTV BAN TUYỂN SINH HCM-UTE
 * ==========================================================================
 * KHÔNG còn danh sách CTV mẫu 30 người.
 *
 * Lý do: danh sách thật là 58 CTV (file CSV quản lý bởi Ban Tư Vấn), nhưng
 * trong repo chỉ có 30 bản ghi mẫu. Vì vậy mỗi máy mới — hoặc ai xoá bộ nhớ
 * trình duyệt — sẽ thấy 30/58 danh sách mà KHÔNG có gì báo thiếu. Đó là
 * dữ liệu sai hiển thị âm thầm, nguy hiểm hơn nhiều so với danh sách rỗng.
 *
 * Nay file này export danh sách RỖNG. Việc nạp danh sách thật đi qua duy nhất
 * một đường: quản trị viên import file CSV (Quản trị → Sinh Viên → Nhập CSV).
 * Giao diện hiển thị lời nhắc rõ ràng cho tới khi danh sách được nạp.
 *
 * Danh sách đã nạp được lưu ở localStorage (khoá `ts_scheduler_students`) và
 * đồng bộ Firebase — nên không mất khi import một lần.
 *
 * Các hàm `loadSample30Students` / `getSample30Students` được giữ lại để không
 * phá vỡ nơi đang gọi chúng (student.js, admin.js, test). Chúng KHÔNG nạp dữ
 * liệu mới nữa — chỉ trả về danh sách đang có trong máy.
 */

(() => {
  'use strict';

  /**
   * Danh sách CTV rỗng. Nạp từ CSV, không nhúng sẵn trong mã nguồn.
   * @type {Array<object>}
   */
  const SAMPLE_HCM_UTE_STUDENTS = [];

  /**
   * Hằng số: file này KHÔNG chứa danh sách. Dùng để giao diện hiển thị
   * lời nhắc thay vì bảng rỗng không giải thích.
   */
  const ROSTER_IS_EMPTY = true;

  /** Đọc danh sách CTV đang có trong máy (không tạo dữ liệu mới). */
  function getSample30Students() {
    try {
      const raw = localStorage.getItem('ts_scheduler_students');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * @deprecated Danh sách mẫu đã bị gỡ. Hàm chỉ đọc danh sách đang có,
   * KHÔNG ghi đè dữ liệu đã nạp từ CSV. Dùng đường import CSV trong giao diện.
   */
  function loadSample30Students() {
    const current = getSample30Students();
    return { success: true, count: current.length, loaded: false, reason: 'Roster phải được nạp bằng import CSV' };
  }

  if (typeof window !== 'undefined') {
    // Giữ đủ các tên cũ để nơi đang gọi không vỡ.
    window.SAMPLE_30_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;
    window.SAMPLE_HCM_UTE_STUDENTS = SAMPLE_HCM_UTE_STUDENTS;
    window.ROSTER_IS_EMPTY = ROSTER_IS_EMPTY;
    window.getSample30Students = getSample30Students;
    window.loadSample30Students = loadSample30Students;
    window.SampleDataManager = {
      STUDENTS: SAMPLE_HCM_UTE_STUDENTS,
      loadSample30Students,
      getSample30Students
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SAMPLE_HCM_UTE_STUDENTS,
      SAMPLE_30_STUDENTS: SAMPLE_HCM_UTE_STUDENTS,
      ROSTER_IS_EMPTY,
      getSample30Students,
      loadSample30Students
    };
  }
})();