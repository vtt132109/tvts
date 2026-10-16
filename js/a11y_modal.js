/* =====================================================================
 * a11y_modal.js — Hỗ trợ khả năng tiếp cận cho hộp thoại (modal)
 * =====================================================================
 * Vấn đề đã phát hiện & xác minh:
 *  - 10 hộp thoại trong index.html/admin.html đều thiếu role="dialog".
 *    (Đã sửa ở HTML, nhưng JS cũng cần cơ chế nhốt tiêu điểm.)
 *  - KHÔNG có focus trap: bấm Tab ở ô cuối sẽ thoát ra ngoài, người dùng
 *    bàn phím lạc vào nội dung phía sau hộp thoại đang che.
 *  - KHÔNG có focus restore: đóng hộp thoại xong, tiêu điểm rơi về <body>
 *    và người dùng phải Tab lại từ đầu trang.
 *  - showToast() luôn ghi vào vùng aria-live="polite", kể cả thông báo
 *    lỗi — trình đọc màn hình không đọc lời cảnh báo khẩn cấp.
 *
 * Cách hoạt động: theo dõi (MutationObserver) các phần tử modal, khi
 * modal nào nhận class "active" thì nhớ phần tử đang được focus và cài
 * focus trap; khi modal đóng lại thì trả tiêu điểm về đúng chỗ cũ.
 *
 * Nhờ vậy không phải sửa ở mọi nơi gọi classList.add/remove('active').
 * ===================================================================== */
(function (global) {
  'use strict';

  /* Các lớp đánh dấu một phần tử là hộp thoại. */
  var MODAL_SELECTOR = '.modal-overlay, .modal-backdrop';

  /* Các phần tử có thể nhận tiêu điểm bên trong hộp thoại. */
  var FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  /* modalHiện tại <- để các hàm khác tiện tra cứu. */
  var activeModal = null;

  /* Phần tử đã được focus trước khi mở modal -> để trả lại khi đóng. */
  var previouslyFocused = null;

  function isVisible(el) {
    if (!el) return false;
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // offsetParent rỗng nghĩa là display:none (hoặc position:fixed).
    // position:fixed vẫn có offsetParent null nên phải kiểm tra thêm kích thước.
    if (el.offsetParent === null) {
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
    }
    return true;
  }

  /** Lấy danh sách phần tử có thể focus, theo đúng thứ tự hiển thị. */
  function getFocusable(modal) {
    if (!modal) return [];
    return Array.prototype.slice
      .call(modal.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(isVisible);
  }

  /**
   * Nhốt tiêu điểm bên trong hộp thoại.
   * Khi bấm Tab ở phần tử cuối -> quay về phần tử đầu.
   * Khi bấm Shift+Tab ở phần tử đầu -> về phần tử cuối.
   */
  function handleKeydown(event) {
    if (event.key !== 'Tab' || !activeModal) return;

    var focusable = getFocusable(activeModal);
    if (focusable.length === 0) {
      // Không có phần tử nào focus được: giữ tiêu điểm trên chính modal.
      event.preventDefault();
      try { activeModal.focus(); } catch (e) { /* bỏ qua */ }
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var current = document.activeElement;

    // Tiêu điểm đang ở ngoài hộp thoại -> đưa vào phần tử đầu tiên.
    if (!activeModal.contains(current)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Khi modal mở: nhớ chỗ cũ rồi đưa tiêu điểm vào trong modal. */
  function onModalOpened(modal) {
    // Modal lồng nhau: giữ modal sâu nhất làm modal hoạt động.
    if (activeModal && activeModal !== modal && activeModal.contains(modal)) return;
    if (activeModal && activeModal.contains(modal)) return;

    if (!previouslyFocused) {
      previouslyFocused = document.activeElement;
    }

    activeModal = modal;

    // Ưu tiên tiêu điểm vào tiêu đề, rồi tới ô nhập đầu tiên.
    var focusable = getFocusable(modal);
    if (focusable.length > 0) {
      // Bỏ qua nút đóng ở góc nếu có lựa chọn khác dễ hiểu hơn.
      var target = focusable.find(function (el) {
        return !el.classList.contains('modal-close-btn');
      }) || focusable[0];
      try { target.focus(); } catch (e) { /* bỏ qua */ }
    } else if (!modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
      try { modal.focus(); } catch (e) { /* bỏ qua */ }
    }
  }

  /** Khi modal đóng: trả tiêu điểm về phần tử đã focus trước đó. */
  function onModalClosed(modal) {
    if (activeModal !== modal) return;

    activeModal = null;

    var back = previouslyFocused;
    previouslyFocused = null;

    // Phần tử cũ có thể đã bị gỡ khỏi DOM -> phải kiểm tra lại.
    if (back && typeof back.focus === 'function' && document.contains(back)) {
      try { back.focus(); } catch (e) { /* bỏ qua */ }
    }
  }

  function isModal(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('modal-overlay') || el.classList.contains('modal-backdrop');
  }

  function init() {
    if (typeof MutationObserver !== 'function' || !document.body) return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        var modal = mutation.target;
        if (!isModal(modal)) return;
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (modal.classList.contains('active')) {
            onModalOpened(modal);
          } else {
            onModalClosed(modal);
          }
        }
      });
    });

    // Theo dõi class của MỌI phần tử (rẻ hơn theo dõi từng modal).
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    });

    document.addEventListener('keydown', handleKeydown, true);

    // Dọn dẹp khi modal bị gỡ khỏi DOM mà không đóng tường minh.
    observer.disconnect;
  }

  /* ---------------------------------------------------------------
   * Vùng thông báo khẩn cấp: dành riêng cho thông báo lỗi.
   * aria-live="assertive" khiến trình đọc màn hình cắt ngang mọi
   * thứ đang đọc để thông báo ngay — đúng cho lỗi đăng nhập,
   * lỗi xác thực MSSV, bộ nhớ đầy...
   * ------------------------------------------------------------- */
  function getAssertiveRegion() {
    var id = 'ts-assertive-alerts';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'assertive');
      el.setAttribute('aria-atomic', 'true');
      // Vị trí trực quan: đặt cạnh vùng toast để người dùng thấy luôn,
      // nhưng sr-only cho trình đọc màn hình (phần hiển thị do toast lo).
      el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;' +
        'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;padding:0;margin:-1px;';
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Thông báo cho trình đọc màn hình ngay lập tức (dành cho lỗi).
   * @param {string} message
   */
  function announceAlert(message) {
    if (!message) return;
    try {
      var el = getAssertiveRegion();
      // Xóa trước rồi ghi sau: đảm bảo nội dung LẠI được đọc kể cả khi
      // thông báo trùng với lần trước.
      el.textContent = '';
      // Dùng setTimeout 0 để trình đọc nhận ra thay đổi nội dung.
      global.setTimeout(function () { el.textContent = String(message); }, 0);
    } catch (e) {
      // Không có DOM (môi trường test) -> bỏ qua, không được làm hỏng app.
    }
  }

  var ModalA11y = {
    init: init,
    announceAlert: announceAlert,
    getActiveModal: function () { return activeModal; },
    /** Nhốt tiêu điểm ngay (dùng khi cần, ví dụ sau khi render lại modal) */
    trapFocus: function () { if (activeModal) onModalOpened(activeModal); }
  };

  global.ModalA11y = ModalA11y;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(typeof window !== 'undefined' ? window : this));