/**
 * ==========================================================================
 * NHẬT KÝ THAO TÁC QUẢN TRỊ — AUDIT LOG (#10)
 * ==========================================================================
 * Ghi lại "ai đã làm gì, lúc nào" cho các thao tác quan trọng trên trang quản
 * trị: đăng nhập, thêm/xoá cộng tác viên, xếp lịch, chuyển kỳ, sao lưu, khôi
 * phục dữ liệu, duyệt đổi ca, đổi quyền cán bộ...
 *
 * LƯU TRỮ: localStorage (máy này), tối đa 200 bản ghi gần nhất.
 *   - Chỉ trên máy: không tốn dung lượng Firebase, không cần đổi Rules,
 *     và có thể xuất ra JSON khi cần đối chiếu.
 *   - Đây là nhật ký "cho người dùng tự soi", KHÔNG phải bằng chứng pháp lý:
 *     ai mở DevTools cũng sửa được localStorage. Vì vậy KHÔNG dùng nó để phân
 *     quyền hay chặn thao tác — chỉ để truy vết và phát hiện bất thường.
 *
 * NGUYÊN TẮC AN TOÀN:
 *   1. Không bao giờ ném lỗi: nhật ký hỏng/quá dung lượng không được làm sập
 *      thao tác nghiệp vụ đang chạy.
 *   2. Không ghi mật khẩu, PIN, token hay nội dung file sao lưu — chỉ ghi mô tả
 *      ngắn do mã nguồn soạn sẵn.
 *   3. Mọi nội dung động được escapeHtml khi hiển thị (tên CTV, MSSV, lý do...
 *      đều do người dùng nhập).
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'ts_scheduler_audit_log_v1';
  const MAX_ENTRIES = 200;
  const MAX_DETAIL_LENGTH = 300;

  /**
   * Danh mục thao tác. `group` dùng để lọc nhanh trên giao diện.
   * Thêm thao tác mới: khai báo ở đây rồi gọi AuditLog.log('KEY', 'mô tả').
   */
  const ACTIONS = {
    LOGIN:            { label: 'Đăng nhập quản trị',      icon: '🔓', group: 'auth' },
    LOGIN_FAILED:     { label: 'Đăng nhập thất bại',       icon: '⛔', group: 'auth' },
    LOGOUT:           { label: 'Đăng xuất',                icon: '🚪', group: 'auth' },
    PASSWORD_CHANGE:  { label: 'Đổi mật khẩu / mã PIN',    icon: '🔑', group: 'auth' },
    ACCOUNT_GRANT:    { label: 'Cấp quyền cán bộ',         icon: '🔐', group: 'auth' },
    ACCOUNT_REVOKE:   { label: 'Thu quyền cán bộ',         icon: '🔒', group: 'auth' },

    STUDENT_ADD:      { label: 'Thêm cộng tác viên',       icon: '➕', group: 'member' },
    STUDENT_UPDATE:   { label: 'Sửa cộng tác viên',        icon: '✏️', group: 'member' },
    STUDENT_DELETE:   { label: 'Xoá cộng tác viên',        icon: '🗑️', group: 'member' },
    STUDENT_CLEAR:    { label: 'Xoá ca rảnh của CTV',      icon: '🧹', group: 'member' },
    ROLE_CHANGE:      { label: 'Đổi vai trò hàng loạt',    icon: '🏷️', group: 'member' },

    SCHEDULE_RUN:     { label: 'Chạy xếp lịch tự động',    icon: '⚡', group: 'schedule' },
    SHIFT_ASSIGN:     { label: 'Gán ca thủ công',          icon: '🎯', group: 'schedule' },
    SHIFT_CLEAR:      { label: 'Xoá ca trong bảng lịch',   icon: '🧽', group: 'schedule' },

    SWAP_APPROVE:     { label: 'Duyệt đề xuất đổi ca',     icon: '✅', group: 'swap' },
    SWAP_REJECT:      { label: 'Từ chối đề xuất đổi ca',   icon: '❌', group: 'swap' },

    MONTH_SWITCH:     { label: 'Chuyển kỳ trực tháng',     icon: '📅', group: 'data' },
    MONTH_RESET:      { label: 'Khởi tạo kỳ trực mới',     icon: '🗂️', group: 'data' },
    BACKUP_CREATE:    { label: 'Tạo bản sao lưu',          icon: '💾', group: 'data' },
    BACKUP_DELETE:    { label: 'Xoá bản sao lưu',          icon: '🗑️', group: 'data' },
    BACKUP_RESTORE:   { label: 'Khôi phục dữ liệu',        icon: '♻️', group: 'data' },
    BACKUP_IMPORT:    { label: 'Nhập file sao lưu',        icon: '📂', group: 'data' },
    SETTINGS_UPDATE:  { label: 'Đổi cấu hình hệ thống',    icon: '⚙️', group: 'data' },
    PAYROLL_UPDATE:   { label: 'Sửa bảng chấm công',       icon: '💰', group: 'data' },
    AUDIT_CLEAR:      { label: 'Xoá nhật ký thao tác',     icon: '🧾', group: 'data' }
  };

  const GROUPS = {
    all: 'Tất cả',
    auth: 'Đăng nhập & quyền',
    member: 'Cộng tác viên',
    schedule: 'Xếp lịch',
    swap: 'Đổi ca',
    data: 'Dữ liệu & sao lưu'
  };

  /** Escape HTML — bản nội bộ để module không phụ thuộc thứ tự nạp script. */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function storageAvailable() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch (e) {
      return false;
    }
  }

  /** Đọc toàn bộ nhật ký. Luôn trả về mảng (kể cả khi dữ liệu hỏng). */
  function readAll() {
    if (!storageAvailable()) return [];
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && typeof item === 'object' && item.action && item.ts);
    } catch (e) {
      // Nhật ký hỏng: bỏ qua, không xoá — để người dùng còn cơ hội cứu dữ liệu.
      return [];
    }
  }

  /**
   * Ghi đè danh sách. Nếu hết dung lượng, cắt một nửa rồi thử lại một lần.
   * @returns {boolean} đã ghi được hay chưa
   */
  function writeAll(list) {
    if (!storageAvailable()) return false;
    const safe = Array.isArray(list) ? list.slice(0, MAX_ENTRIES) : [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return true;
    } catch (e) {
      // Hết quota: giữ lại nửa mới nhất và thử lần cuối.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safe.slice(0, Math.floor(safe.length / 2))));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  /** Xác định người thực hiện: ưu tiên tham số, sau đó tới phiên đăng nhập. */
  function resolveActor(explicit) {
    if (explicit && typeof explicit === 'object' && (explicit.name || explicit.id)) {
      return { id: String(explicit.id || ''), name: String(explicit.name || '') };
    }
    if (typeof explicit === 'string' && explicit.trim()) {
      return { id: '', name: explicit.trim() };
    }
    try {
      const user = window.AdminAuth && typeof window.AdminAuth.getCurrentUser === 'function'
        ? window.AdminAuth.getCurrentUser()
        : null;
      if (user) {
        return {
          id: String(user.id || ''),
          name: String(user.fullName || user.username || 'Cán bộ')
        };
      }
    } catch (e) { /* chưa đăng nhập */ }
    return { id: '', name: 'Không xác định' };
  }

  /** Cắt gọn mô tả: 1 dòng, tối đa 300 ký tự. */
  function normalizeDetail(detail) {
    const text = String(detail === null || detail === undefined ? '' : detail)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (text.length <= MAX_DETAIL_LENGTH) return text;
    return `${text.slice(0, MAX_DETAIL_LENGTH - 1)}…`;
  }

  /**
   * Ghi một dòng nhật ký.
   * @param {string} action khoá trong ACTIONS
   * @param {string} detail mô tả ngắn (đã được escape lúc hiển thị)
   * @param {{actor?: object|string}} [options]
   * @returns {object|null} bản ghi vừa tạo, hoặc null nếu không ghi được
   */
  function log(action, detail, options) {
    try {
      const key = String(action || '').trim().toUpperCase();
      if (!key) return null;

      const actor = resolveActor(options && options.actor);
      const entry = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        action: key,
        detail: normalizeDetail(detail),
        actorId: actor.id,
        actorName: actor.name
      };

      const list = readAll();
      list.unshift(entry);
      if (!writeAll(list)) return null;
      return entry;
    } catch (e) {
      // Nhật ký không bao giờ được làm hỏng thao tác nghiệp vụ.
      return null;
    }
  }

  /**
   * Lọc nhật ký.
   * @param {{group?: string, action?: string, query?: string, limit?: number}} [filter]
   */
  function list(filter) {
    const opts = filter || {};
    let items = readAll();

    if (opts.action) {
      const wanted = String(opts.action).toUpperCase();
      items = items.filter(it => it.action === wanted);
    }

    if (opts.group && opts.group !== 'all') {
      items = items.filter(it => {
        const meta = ACTIONS[it.action];
        return meta && meta.group === opts.group;
      });
    }

    const query = String(opts.query || '').trim().toLowerCase();
    if (query) {
      items = items.filter(it => {
        const meta = ACTIONS[it.action] || {};
        const haystack = [
          it.detail, it.actorName, meta.label, it.action
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    const limit = parseInt(opts.limit, 10);
    if (limit > 0) items = items.slice(0, limit);
    return items;
  }

  /** Thống kê nhanh cho phần đầu hộp thoại. */
  function stats() {
    const items = readAll();
    const counts = { total: items.length, byGroup: {} };
    items.forEach(it => {
      const meta = ACTIONS[it.action];
      const group = meta ? meta.group : 'other';
      counts.byGroup[group] = (counts.byGroup[group] || 0) + 1;
    });
    counts.lastTs = items.length > 0 ? items[0].ts : null;
    return counts;
  }

  /** Xoá sạch nhật ký và ghi lại chính thao tác xoá (không thể xoá dấu vết). */
  function clear(actor) {
    const removed = readAll().length;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      return 0;
    }
    if (removed > 0) log('AUDIT_CLEAR', `Đã xoá ${removed} dòng nhật ký cũ`, { actor });
    return removed;
  }

  /** "5 phút trước" — nhãn thời gian thân thiện cho danh sách. */
  function formatRelative(isoString) {
    const time = new Date(isoString).getTime();
    if (!time || isNaN(time)) return '';

    const diffMs = Date.now() - time;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 0) return 'vừa xong';
    if (diffMin < 1) return 'vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} ngày trước`;

    const d = new Date(time);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  /** Thời gian tuyệt đối, dùng cho tooltip. */
  function formatAbsolute(isoString) {
    const time = new Date(isoString).getTime();
    if (!time || isNaN(time)) return '';
    const d = new Date(time);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function describe(action) {
    return ACTIONS[String(action || '').toUpperCase()] || { label: String(action || 'Không rõ'), icon: '•', group: 'other' };
  }

  /** Dựng HTML danh sách nhật ký (đã escape toàn bộ nội dung động). */
  function renderTimeline(entries) {
    const items = Array.isArray(entries) ? entries : [];

    if (items.length === 0) {
      return `
        <div class="audit-empty" id="audit-empty-state">
          <div class="audit-empty-icon">🧾</div>
          <div>Chưa có thao tác nào được ghi lại trên máy này.</div>
          <div class="audit-empty-hint">Nhật ký chỉ lưu trên trình duyệt hiện tại, tối đa 200 dòng gần nhất.</div>
        </div>
      `;
    }

    return `
      <ul class="audit-timeline" id="audit-timeline">
        ${items.map(entry => {
          const meta = describe(entry.action);
          return `
            <li class="audit-entry audit-group-${esc(meta.group)}">
              <span class="audit-entry-icon" aria-hidden="true">${esc(meta.icon)}</span>
              <div class="audit-entry-body">
                <div class="audit-entry-title">${esc(meta.label)}</div>
                ${entry.detail ? `<div class="audit-entry-detail">${esc(entry.detail)}</div>` : ''}
                <div class="audit-entry-meta">
                  <span class="audit-entry-actor">👤 ${esc(entry.actorName || 'Không xác định')}</span>
                  <span class="audit-entry-time" title="${esc(formatAbsolute(entry.ts))}">${esc(formatRelative(entry.ts))}</span>
                </div>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  /** Bộ lọc nhóm cho thẻ <select> (admin.js dựng option từ đây). */
  function groupOptions() {
    return Object.keys(GROUPS).map(key => ({ key, label: GROUPS[key] }));
  }

  /** Xuất JSON để đối chiếu / lưu trữ ngoài. */
  function exportJson() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      total: readAll().length,
      entries: readAll()
    }, null, 2);
  }

  window.AuditLog = {
    STORAGE_KEY,
    MAX_ENTRIES,
    ACTIONS,
    log,
    list,
    stats,
    clear,
    describe,
    renderTimeline,
    formatRelative,
    formatAbsolute,
    groupOptions,
    exportJson,
    // Dùng cho kiểm thử: đọc thẳng mảng thô.
    _readAll: readAll
  };
})();
