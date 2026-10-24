/**
 * ==========================================================================
 * TIỆN ÍCH DÙNG CHUNG CHO CẢ HAI CỔNG (#16 — tách module)
 * ==========================================================================
 * Trước đây `formatVNDateTime` và `getRemainingText` bị chép nguyên xi ở cả
 * js/admin.js và js/student.js. Hai bản sao giống hệt nhau nghĩa là: sửa lỗi
 * định dạng ngày ở cổng sinh viên thì cổng quản trị vẫn sai — và không ai
 * phát hiện. Từ nay chỉ còn MỘT định nghĩa, đặt tại đây.
 *
 * Nạp TRƯỚC js/admin.js và js/student.js (xem admin.html / index.html).
 *
 * VÌ SAO `escapeHtml` KHÔNG được tách ra đây:
 *   Bộ kiểm thử an toàn XSS (tests/auth.test.js, tests/regression_guard.test.js)
 *   đọc thẳng thân hàm `function escapeHtml(str) { ... }` trong TỪNG file để
 *   chắc rằng cả 2 cổng đều escape đủ 5 thực thể. Tách sang module chung sẽ làm
 *   bộ test đó hết khả năng kiểm chứng (nó chỉ còn thấy một hàm gọi lại).
 *   Vì vậy escapeHtml giữ nguyên tại chỗ, và tests/common.test.js canh cho 2 bản
 *   sao luôn giống hệt nhau.
 */

(() => {
  'use strict';

  /**
   * "14:30 ngày 24/10/2026" — dùng cho nhãn thời gian trong bảng và thẻ.
   * @param {string|number|Date} isoStr
   * @returns {string} chuỗi rỗng nếu không có giá trị; trả lại đầu vào nếu không phải ngày hợp lệ
   */
  function formatVNDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
  }

  /**
   * "Còn 2 ngày 3 giờ" / "Còn 5 giờ 20 phút" / "Đã hết hạn".
   * @param {string|number|Date} targetIso
   */
  function getRemainingText(targetIso) {
    const diff = new Date(targetIso).getTime() - Date.now();
    if (!(diff > 0)) return 'Đã hết hạn';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `Còn ${days} ngày ${remHours} giờ`;
    }
    return `Còn ${hours} giờ ${mins} phút`;
  }

  window.CommonUtils = {
    formatVNDateTime,
    getRemainingText
  };
})();
