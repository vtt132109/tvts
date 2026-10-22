/**
 * ==========================================================================
 * ADMIN PORTAL LOGIC (Bảng Điều Hành Quản Trị & Xếp Lịch)
 * ==========================================================================
 * Đóng gói trong IIFE để tránh xung đột biến toàn cục.
 * Danh sách CTV nạp từ file CSV của Ban Tư Vấn — không nhúng sẵn trong mã.
 * Hỗ trợ luân phiên ca theo tuần (Tuần 1 & Tuần 2).
 */

(() => {
  'use strict';

  const { SHIFTS, SHIFT_MAP, runAutoSchedule, runTwoWeekSchedule, runMonthSchedule } = window.SchedulerEngine || {};

  const STORAGE_KEYS = {
    STUDENTS: 'ts_scheduler_students',
    SCHEDULE: 'ts_scheduler_schedule_result',
    TWO_WEEK_SCHEDULE: 'ts_scheduler_two_week_result',
    MONTH_SCHEDULE: 'ts_scheduler_month_result',
    REG_CONFIG: 'ts_scheduler_reg_config',
    ADMIN_USERS: 'ts_scheduler_admin_users',
    AUTH_TOKEN: 'ts_admin_authenticated',
    CURRENT_USER: 'ts_admin_user_data',
    SWAP_REQUESTS: 'ts_scheduler_swap_requests',
    WEB_BACKUPS: 'ts_scheduler_web_backups_v1',
    EVENTS: 'ts_scheduler_events_v1',
    ALL_MONTHS: 'ts_scheduler_all_months_v1',
    ACTIVE_MONTH: 'ts_scheduler_active_month_v1',
    // Các ô đã được quản trị viên chỉnh tay (đổi nhân sự, duyệt đổi ca).
    // Trước đây runFullSchedule() dựng lại lịch từ đầu ở mọi thao tác
    // (đổi vai trò hàng loạt, nhập danh sách, thêm/xoá SV) nên mọi chỉnh
    // sửa tay biến mất không một dòng cảnh báo.
    MANUAL_SLOTS: 'ts_scheduler_manual_slots',
    // Tháng mà `monthlyAvailableShifts` đang thuộc về, định dạng 'YYYY-MM'.
    // Quy tắc nghiệp vụ: mỗi tháng sinh viên đăng ký ca rảnh LẠI TỪ ĐẦU.
    // Khoá này cho biết ca rảnh hiện có là của tháng nào. Khi tháng đang mở
    // khác với khoá này, toàn bộ ca rảnh cũ bị xoá — đúng như mong muốn.
    //
    // Nhờ so KHÓA chứ không so vị trí, quay lại xem tháng cũ KHÔNG làm mất
    // đăng ký: lịch tháng cũ được khôi phục từ kho lịch (ALL_MONTHS) và không
    // đụng vào ca rảnh.
    AVAILABILITY_MONTH: 'ts_scheduler_availability_month_v1'
  };

  // Danh sách tài khoản cán bộ mặc định.
  // ⚠️ BẢO MẬT: Thông tin này nằm trong mã nguồn công khai. Sau lần đăng nhập
  // đầu tiên, hệ thống BẮT BUỘC hiển thị cảnh báo yêu cầu đổi mật khẩu & PIN.
  // Tài khoản thật KHÔNG được commit vào kho công khai.
  const DEFAULT_ADMIN_USERS = [
    {
      id: 'usr_admin',
      username: 'admin',
      password: '0000',
      pin: '9999',
      fullName: 'Trưởng Ban Tuyển Sinh',
      role: 'Trưởng ban điều hành',
      mustChangePassword: true,
      createdAt: Date.now() - 500000
    },
    {
      id: 'usr_diephoi',
      username: 'diephoi',
      password: '0000',
      pin: '8888',
      fullName: 'Cán Bộ Điều Phối Tuyển Sinh',
      role: 'Điều phối viên tuyển sinh',
      mustChangePassword: true,
      createdAt: Date.now() - 300000
    }
  ];

  // Đã gỡ WEAK_DEFAULT_PASSWORDS cùng cảnh báo bảo mật — xem warnIfWeakCredentials.

  const state = {
    students: [],
    currentSchedule: null,
    twoWeekSchedule: null,
    monthSchedule: null,
    viewWeek: 1, // 1, 2, 3, hoặc 4
    viewMode: 'single', // 'single' (từng tuần) hoặc 'master' (toàn cảnh 4 tuần)
    currentMonth: 10,
    currentYear: 2026,
    importedCandidates: [],
    activeTab: 'tab-schedule-mgmt',
    roleFilter: 'all',
    searchQuery: '',
    reassignModalData: null,
    regConfig: {
      mode: 'always_open',
      startTime: '',
      endTime: '',
      closedNotice: ''
    },
    adminUsers: [],
    currentUser: null,
    isAuthenticated: false,
    events: []
  };

  // Cờ chống bind trùng sự kiện & timer đếm ngược (xem unlockAdminDashboard)
  let dashboardEventsBound = false;
  let regLiveStatusTimer = null;

  /**
   * Escape một ô theo chuẩn RFC 4180 + chống CSV injection.
   *
   * CSV INJECTION: nếu ô bắt đầu bằng =, +, -, @, TAB hoặc CR, Excel/Google
   * Sheets sẽ hiểu là CÔNG THỨC và thực thi khi người dùng mở file.
   * Tên sinh viên do người dùng nhập ở Cổng Sinh Viên nên hoàn toàn có thể chứa
   * payload như vậy (vd tên =HYPERLINK("http://x","bấm")). Tiền tố ' trung hòa.
   *
   * @param {*} value - Giá trị cần ghi ra CSV
   * @returns {string} Ô đã escape, LUÔN bọc trong dấu nháy kép
   */
  function escapeCsvCell(value) {
    let s = (value === null || value === undefined) ? '' : String(value);
    // Vô hiệu hoá ký tự điều khiển gây lệch cột/dòng
    s = s.replace(/[\r\n\t]+/g, ' ').trim();
    // Chống công thức
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    // Nhân đôi dấu nháy kép theo RFC 4180
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* -------------------------------------------------------------------------
   * BĂM MẬT KHẨU / PIN (không lưu plaintext, kể cả trên Cloud)
   * -------------------------------------------------------------------------
   * Vì sao tự viết SHA-256 thay vì WebCrypto:
   *  - `crypto.subtle` chỉ có trên secure context; mở thẳng file:// bằng
   *    Chrome/Firefox vẫn phải chạy được (yêu cầu "zero configuration").
   *  - WebCrypto là async, sẽ buộc toàn bộ luồng đăng nhập (và 18 test auth)
   *    chuyển sang Promise — đổi rộng không cần thiết.
   * Thuật toán đã đối chiếu với `crypto.createHash('sha256')` của Node trên
   * 4 vector (rỗng, ASCII, câu dài, tiếng Việt có dấu).
   * ---------------------------------------------------------------------- */
  const CREDENTIAL_KDF_ROUNDS = 3000;

  function rotr32(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  /** SHA-256 (FIPS 180-4) -> chuỗi hex 64 ký tự. */
  function sha256Hex(input) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    // UTF-8
    const bytes = [];
    const str = String(input);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0,
      (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    const w = new Array(64);
    for (let off = 0; off < bytes.length; off += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16)
          | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => ('00000000' + x.toString(16)).slice(-8)).join('');
  }

  function generateSalt() {
    const bytes = new Uint8Array(16);
    try {
      const c = (typeof window !== 'undefined' && window.crypto) ? window.crypto : null;
      if (!c || !c.getRandomValues) throw new Error('Không có crypto.getRandomValues');
      c.getRandomValues(bytes);
    } catch (e) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(b => ('0' + b.toString(16)).slice(-2)).join('');
  }

  /** Băm có muối + lặp (chống rainbow table & làm chậm brute-force). */
  function hashSecret(secret, salt) {
    const s = String(salt);
    let acc = sha256Hex(s + ':' + String(secret));
    for (let i = 0; i < CREDENTIAL_KDF_ROUNDS; i++) acc = sha256Hex(acc + s);
    return acc;
  }

  /** Gán bí mật cho tài khoản dưới dạng hash; xoá plaintext nếu có. */
  function setUserSecret(user, field, value) {
    if (!user) return;
    if (value === undefined || value === null || String(value) === '') {
      delete user[field];
      delete user[field + 'Hash'];
      delete user[field + 'Salt'];
      return;
    }
    const salt = generateSalt();
    user[field + 'Salt'] = salt;
    user[field + 'Hash'] = hashSecret(value, salt);
    delete user[field];
  }

  /** So khớp bí mật: ưu tiên hash, tương thích ngược với plaintext cũ. */
  function verifyUserSecret(user, field, value) {
    if (!user || value === undefined || value === null) return false;
    const hash = user[field + 'Hash'];
    const salt = user[field + 'Salt'];
    if (hash && salt) return hashSecret(value, salt) === hash;
    return user[field] !== undefined && String(user[field]) === String(value);
  }

  /** Tài khoản cũ còn plaintext -> nâng cấp thành hash ngay sau lần đăng nhập đầu. */
  function upgradeLegacyCredentials(user) {
    if (!user) return false;
    let changed = false;
    ['password', 'pin'].forEach(field => {
      if (user[field] !== undefined && user[field] !== null && String(user[field]) !== '' && !user[field + 'Hash']) {
        setUserSecret(user, field, user[field]);
        changed = true;
      }
    });
    if (changed) saveAdminUsers();
    return changed;
  }

  function findUserByPassword(username, password) {
    const target = String(username || '').trim().toLowerCase();
    if (!target) return null;
    const candidate = state.adminUsers.find(
      u => u && u.username && String(u.username).toLowerCase() === target
    );
    return candidate && verifyUserSecret(candidate, 'password', password) ? candidate : null;
  }

  function findUserByPin(pin) {
    const value = String(pin === null || pin === undefined ? '' : pin).trim();
    if (!value) return null;
    return state.adminUsers.find(u => {
      if (!u) return false;
      if (u.pinHash) return verifyUserSecret(u, 'pin', value);
      return u.pin !== undefined && String(u.pin).trim() === value;
    }) || null;
  }

  // API nội bộ phục vụ kiểm thử & chẩn đoán (không dùng cho UI).
  if (typeof window !== 'undefined') {
    window.AdminCredential = {
      sha256Hex,
      hashSecret,
      verifyUserSecret,
      setUserSecret,
      generateSalt,
      rounds: CREDENTIAL_KDF_ROUNDS
    };
  }

  let elements = {};

  function cacheDOMElements() {
    elements = {
      // Auth Screen Elements
      authScreen: document.getElementById('admin-auth-screen'),
      dashboardContainer: document.getElementById('admin-dashboard-container'),
      tabAuthPwd: document.getElementById('tab-auth-pwd'),
      tabAuthPin: document.getElementById('tab-auth-pin'),
      formAuthCredentials: document.getElementById('form-auth-credentials'),
      formAuthPin: document.getElementById('form-auth-pin'),
      inputAuthUsername: document.getElementById('auth-input-username'),
      inputAuthPassword: document.getElementById('auth-input-password'),
      inputAuthPin: document.getElementById('auth-input-pin'),
      authErrorBox: document.getElementById('auth-error-box'),
      authErrorMsg: document.getElementById('auth-error-msg'),
      btnAdminLogout: document.getElementById('btn-admin-logout'),
      adminUserName: document.getElementById('admin-user-name'),
      adminUserAvatar: document.getElementById('admin-user-avatar'),

      // User Management Modal Elements
      userMgmtModal: document.getElementById('user-mgmt-modal'),
      btnOpenUserMgmt: document.getElementById('btn-open-user-mgmt'),
      btnCloseUserMgmtModal: document.getElementById('btn-close-user-mgmt-modal'),
      tabBtnUserList: document.getElementById('tab-btn-user-list'),
      tabBtnAddUser: document.getElementById('tab-btn-add-user'),
      tabBtnChangePwd: document.getElementById('tab-btn-change-pwd'),
      panelUserList: document.getElementById('panel-user-list'),
      userMgmtTableBody: document.getElementById('user-mgmt-table-body'),
      formAddAdminUser: document.getElementById('form-add-admin-user'),
      formChangeCurrentPwd: document.getElementById('form-change-current-pwd'),

      tabButtons: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('.tab-content'),

      totalStudentsCount: document.getElementById('count-total-students'),
      oldStudentsCount: document.getElementById('count-old-students'),
      newStudentsCount: document.getElementById('count-new-students'),
      filledShiftsCount: document.getElementById('count-filled-shifts'),
      badgeAdminStudentCount: document.getElementById('badge-admin-student-count'),

      btnAutoSchedule: document.getElementById('btn-admin-auto-schedule'),
      btnLoadUtePreset: document.getElementById('btn-load-ute-preset'),
      btnExportCsv: document.getElementById('btn-export-csv'),
      btnPrintSchedule: document.getElementById('btn-print-schedule'),
      btnWeek1: document.getElementById('btn-admin-week-1'),
      btnWeek2: document.getElementById('btn-admin-week-2'),
      timetableGrid: document.getElementById('admin-timetable-grid'),
      scheduleWarningsBox: document.getElementById('schedule-warnings-box'),
      standbyBox: document.getElementById('admin-standby-box'),
      fairnessListOld: document.getElementById('fairness-list-old'),
      fairnessListNew: document.getElementById('fairness-list-new'),

      // Month Navigator Elements (Task Month Switcher & Auto-Backup)
      btnPrevMonth: document.getElementById('btn-admin-prev-month'),
      btnNextMonth: document.getElementById('btn-admin-next-month'),
      currentMonthTitle: document.getElementById('admin-current-month-title'),
      monthStatusBadge: document.getElementById('admin-month-status-badge'),
      selectQuickMonth: document.getElementById('admin-select-quick-month'),
      timetableMonthSubtitle: document.getElementById('admin-timetable-month-subtitle'),

      // Registration Config Panel Elements
      regConfigForm: document.getElementById('admin-reg-config-form'),
      adminRegModeRadios: document.querySelectorAll('input[name="adminRegMode"]'),
      adminRegStart: document.getElementById('admin-reg-start'),
      adminRegEnd: document.getElementById('admin-reg-end'),
      adminRegClosedMsg: document.getElementById('admin-reg-closed-msg'),
      adminRegLiveStatus: document.getElementById('admin-reg-live-status'),
      btnSaveRegConfig: document.getElementById('btn-save-reg-config'),
      btnPresetNow: document.getElementById('btn-preset-now'),
      btnPreset3days: document.getElementById('btn-preset-3days'),
      btnPreset5days: document.getElementById('btn-preset-5days'),
      btnPreset7days: document.getElementById('btn-preset-7days'),
      configSaveHint: document.getElementById('config-save-hint'),
      cardModeOpen: document.getElementById('card-mode-open'),
      cardModeTime: document.getElementById('card-mode-time'),
      cardModeClosed: document.getElementById('card-mode-closed'),
      timeWindowContainer: document.getElementById('time-window-inputs-container'),
      inputPublishSchedule: document.getElementById('admin-reg-publish-schedule'),
      publishStatusTag: document.getElementById('admin-publish-status-tag'),
      publishLabel: document.getElementById('admin-reg-publish-label'),
      btnTogglePublishSchedule: document.getElementById('btn-toggle-publish-schedule'),
      btnPublishScheduleIcon: document.getElementById('btn-publish-schedule-icon'),
      btnPublishScheduleText: document.getElementById('btn-publish-schedule-text'),

      studentTableBody: document.getElementById('admin-student-table-body'),
      tableStudents: document.getElementById('table-students'),
      cbStudentSelectAll: document.getElementById('cb-student-select-all'),
      bulkStudentActions: document.getElementById('bulk-student-actions'),
      bulkSelectedCount: document.getElementById('bulk-selected-count'),
      btnBulkRoleOld: document.getElementById('btn-bulk-role-old'),
      btnBulkRoleNew: document.getElementById('btn-bulk-role-new'),
      btnBulkClearShifts: document.getElementById('btn-bulk-clear-shifts'),
      btnBulkDeleteStudents: document.getElementById('btn-bulk-delete-students'),
      filterButtons: document.querySelectorAll('.filter-btn'),
      inputSearch: document.getElementById('input-search-student'),
      btnOpenAddStudent: document.getElementById('btn-open-add-student'),
      btnResetData: document.getElementById('btn-reset-data'),

      reassignModal: document.getElementById('reassign-modal'),
      modalCloseBtn: document.getElementById('btn-close-modal'),
      modalCancelBtn: document.getElementById('btn-cancel-modal'),
      modalSaveBtn: document.getElementById('btn-save-modal'),
      modalSlotTitle: document.getElementById('modal-slot-title'),
      modalRoleBadge: document.getElementById('modal-role-badge'),
      modalCandidateSelect: document.getElementById('modal-candidate-select'),

      studentModal: document.getElementById('student-form-modal'),
      studentModalTitle: document.getElementById('student-modal-title'),
      btnCloseStudentModal: document.getElementById('btn-close-student-modal'),
      btnCancelStudentModal: document.getElementById('btn-cancel-student-modal'),
      adminStudentForm: document.getElementById('admin-student-form'),
      editStudentIdInput: document.getElementById('admin-edit-student-id'),
      inputAdminFullName: document.getElementById('admin-input-fullname'),
      inputAdminStudentId: document.getElementById('admin-input-studentid'),
      inputAdminPhone: document.getElementById('admin-input-phone'),
      adminSlotCbs: document.querySelectorAll('.admin-slot-cb'),
      btnAdminQuickAll: document.getElementById('btn-admin-quick-all'),
      btnAdminQuickClear: document.getElementById('btn-admin-quick-clear'),
      btnAdminModalClearShifts: document.getElementById('btn-admin-modal-clear-shifts'),

      // Hero Action Buttons
      btnClearSchedule: document.getElementById('btn-clear-schedule'),
      btnClearStudents: document.getElementById('btn-clear-students'),

      // Excel & Google Sheets Export Elements (Mẫu HCM-UTE)
      btnOpenExcelModal: document.getElementById('btn-open-excel-modal'),
      btnQuickCopySheet: document.getElementById('btn-quick-copy-sheet'),
      excelModal: document.getElementById('excel-export-modal'),
      btnCloseExcelModal: document.getElementById('btn-close-excel-modal'),
      exportStartDate: document.getElementById('export-start-date'),
      exportRangeSelect: document.getElementById('export-range-select'),
      btnModalCopyClipboard: document.getElementById('btn-modal-copy-clipboard'),
      btnModalDownloadXls: document.getElementById('btn-modal-download-xls'),
      btnModalDownloadCsv: document.getElementById('btn-modal-download-csv'),
      btnModalPrintSheet: document.getElementById('btn-modal-print-sheet'),
      excelPreviewTableContainer: document.getElementById('excel-preview-table-container'),
      excelCopyStatusHint: document.getElementById('excel-copy-status-hint'),

      // Sticky Hero Bar Elements (Task 17)
      stickyHeroBar: document.getElementById('admin-sticky-hero-bar'),
      stickyStatStudents: document.getElementById('sticky-stat-students'),
      stickyStatFilled: document.getElementById('sticky-stat-filled'),
      stickyStatEmpty: document.getElementById('sticky-stat-empty'),
      stickyPillEmpty: document.getElementById('sticky-pill-empty'),
      btnStickyAutoSchedule: document.getElementById('btn-sticky-auto-schedule'),
      btnStickyQuickCopy: document.getElementById('btn-sticky-quick-copy'),
      btnStickyOpenExcel: document.getElementById('btn-sticky-open-excel'),

      // View Mode Elements (Task 16: Master Month Grid)
      btnViewSingleWeek: document.getElementById('btn-view-single-week'),
      btnViewMasterMonth: document.getElementById('btn-view-master-month'),
      adminSingleWeekControls: document.getElementById('admin-single-week-controls'),
      adminSingleWeekWrapper: document.getElementById('admin-single-week-wrapper'),
      adminMasterMonthWrapper: document.getElementById('admin-master-month-wrapper'),
      adminMasterMonthContainer: document.getElementById('admin-master-month-container'),
      btnMasterScrollLeft: document.getElementById('btn-master-scroll-left'),
      btnMasterScrollRight: document.getElementById('btn-master-scroll-right'),
      btnLayoutHorizontal: document.getElementById('btn-layout-horizontal'),
      btnLayoutVertical: document.getElementById('btn-layout-vertical'),

      // Import Excel / CSV Modal Elements (Task 18)
      importModal: document.getElementById('import-excel-modal'),
      btnOpenImportModal: document.getElementById('btn-open-import-modal'),
      btnCloseImportModal: document.getElementById('btn-close-import-modal'),
      btnCancelImport: document.getElementById('btn-cancel-import'),
      btnConfirmImport: document.getElementById('btn-confirm-import'),
      btnDownloadImportTemplate: document.getElementById('btn-download-import-template'),
      importFileDropzone: document.getElementById('import-file-dropzone'),
      inputImportFile: document.getElementById('input-import-file'),
      importPreviewSection: document.getElementById('import-preview-section'),
      importPreviewTbody: document.getElementById('import-preview-tbody'),
      importPreviewCountLabel: document.getElementById('import-preview-count-label'),
      importFileNameLabel: document.getElementById('import-file-name-label'),

      // Theme toggle elements
      btnThemeLight: document.getElementById('btn-theme-light'),
      btnThemeDark: document.getElementById('btn-theme-dark'),

      // Shift Swap Management Elements (Task 26)
      btnOpenSwapMgmt: document.getElementById('btn-open-swap-mgmt'),
      btnStickySwapMgmt: document.getElementById('btn-sticky-swap-mgmt'),
      badgeSwapCount: document.getElementById('badge-swap-count'),
      badgeStickySwapCount: document.getElementById('badge-sticky-swap-count'),
      modalManageSwaps: document.getElementById('modal-manage-swaps'),
      btnCloseSwapMgmtModal: document.getElementById('btn-close-swap-mgmt-modal'),
      btnCloseSwapMgmtFooter: document.getElementById('btn-close-swap-mgmt-footer'),
      btnRefreshSwaps: document.getElementById('btn-refresh-swaps'),
      swapMgmtCountLabel: document.getElementById('swap-mgmt-count-label'),
      tbodyManageSwaps: document.getElementById('tbody-manage-swaps'),

      // Backup & Restore Center Elements (Task 27)
      btnOpenBackupCenter: document.getElementById('btn-open-backup-center'),
      btnStickyBackupCenter: document.getElementById('btn-sticky-backup-center'),
      modalBackupCenter: document.getElementById('modal-backup-center'),
      btnCloseBackupModal: document.getElementById('btn-close-backup-modal'),
      btnCloseBackupFooter: document.getElementById('btn-close-backup-footer'),
      backupTabBtns: document.querySelectorAll('.backup-tab-btn'),
      backupTabContents: document.querySelectorAll('.backup-tab-content'),
      backupStatStudents: document.getElementById('backup-stat-students'),
      backupStatWeeks: document.getElementById('backup-stat-weeks'),
      backupStatSwaps: document.getElementById('backup-stat-swaps'),
      backupStatAdmins: document.getElementById('backup-stat-admins'),
      btnDownloadBackupJson: document.getElementById('btn-download-backup-json'),
      backupFileDropzone: document.getElementById('backup-file-dropzone'),
      inputBackupFile: document.getElementById('input-backup-file'),
      backupPreviewBox: document.getElementById('backup-preview-box'),
      backupPreviewDetails: document.getElementById('backup-preview-details'),
      btnCancelRestorePreview: document.getElementById('btn-cancel-restore-preview'),
      btnConfirmRestore: document.getElementById('btn-confirm-restore'),
      btnStartNewMonth: document.getElementById('btn-start-new-month'),

      // Web Backups (Max 6 Months) Elements
      btnCreateWebBackup: document.getElementById('btn-create-web-backup'),
      webBackupTableBody: document.getElementById('web-backup-table-body'),
      webBackupCountBadge: document.getElementById('web-backup-count-badge'),
      webBackupStorageInfo: document.getElementById('web-backup-storage-info'),

      toastContainer: document.getElementById('toast-container')
    };
  }

  function initAdminPortal() {
    cacheDOMElements();
    initThemeToggle();
    loadAdminUsers();
    bindAuthEvents();
    bindUserMgmtEvents();
    // LƯU Ý: bindSwapMgmtEvents / bindBackupCenterEvents / bindCloudSyncEvents
    // cố ý KHÔNG gọi ở đây — chúng đã nằm trong unlockAdminDashboard() và
    // chỉ chạy 1 lần. Gọi ở cả hai nơi sẽ khiến mỗi nút có 2 listener:
    // 1 cú bấm -> 2 bản sao lưu, 2 confirm, 2 file tải xuống.

    // Kiểm tra phiên đăng nhập quản trị trong sessionStorage.
    // Phiên quá 12 giờ bị huỷ: máy dùng chung ở văn phòng không nên giữ quyền
    // admin qua nhiều ngày chỉ vì tab chưa đóng.
    let isAuth = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) === 'true';
    if (isAuth && isSessionExpired()) {
      clearAdminSession();
      isAuth = false;
    }
    if (isAuth) {
      state.isAuthenticated = true;
      try {
        const storedUser = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (storedUser) state.currentUser = JSON.parse(storedUser);
      } catch (err) {
        state.currentUser = state.adminUsers[0] || null;
      }
      unlockAdminDashboard();
    } else {
      lockAdminDashboard();
    }

    // Lắng nghe sự kiện đồng bộ giữa các tab
    window.addEventListener('storage', (e) => {
      if (!state.isAuthenticated) return;
      if (e.key === STORAGE_KEYS.STUDENTS) {
        loadData();
        renderAll();
        showToast('Có sinh viên vừa đăng ký từ Cổng Sinh Viên!', 'info');
      } else if (e.key === STORAGE_KEYS.REG_CONFIG) {
        loadRegConfig();
        renderRegConfigUI();
      } else if (e.key === STORAGE_KEYS.ADMIN_USERS) {
        loadAdminUsers();
        renderUserMgmtTable();
      } else if (e.key === STORAGE_KEYS.SWAP_REQUESTS) {
        updateSwapCountBadges();
        renderSwapRequestsTable();
        showToast('Có đề xuất đổi ca mới từ sinh viên!', 'info');
      } else if (e.key === STORAGE_KEYS.EVENTS) {
        if (typeof EventManager !== 'undefined') {
          state.events = EventManager.getEvents();
        }
      }
    });

    // Cloud Sync kéo dữ liệu về: phải có handler riêng vì sự kiện 'storage'
    // do JS tự phát không mang .key, nên các nhánh e.key === ... ở trên không chạy được.
    window.addEventListener('ts:data-changed', (e) => {
      if (!state.isAuthenticated) return;
      const keys = (e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
      const touched = (k) => !keys.length || keys.includes(k);

      if (touched(STORAGE_KEYS.STUDENTS) || touched(STORAGE_KEYS.MONTH_SCHEDULE)
        || touched(STORAGE_KEYS.ALL_MONTHS) || touched(STORAGE_KEYS.ACTIVE_MONTH)
        || touched(STORAGE_KEYS.SCHEDULE) || touched(STORAGE_KEYS.TWO_WEEK_SCHEDULE)) {
        loadData();
        renderAll();
        if (typeof window.renderEventsTable === 'function') window.renderEventsTable();
      }
      if (touched(STORAGE_KEYS.REG_CONFIG)) {
        loadRegConfig();
        renderRegConfigUI();
      }
      if (touched(STORAGE_KEYS.ADMIN_USERS)) {
        loadAdminUsers();
        renderUserMgmtTable();
      }
      if (touched(STORAGE_KEYS.SWAP_REQUESTS)) {
        updateSwapCountBadges();
        renderSwapRequestsTable();
      }
      if (touched(STORAGE_KEYS.EVENTS) && typeof EventManager !== 'undefined') {
        state.events = EventManager.getEvents();
        if (typeof window.renderEventsTable === 'function') window.renderEventsTable();
      }
    });

    // Cảnh báo đầy dung lượng lưu trữ
    window.addEventListener('ts:storage-full', (e) => {
      const msg = (e.detail && e.detail.message) || 'Bộ nhớ trình duyệt đã đầy!';
      showToast('⚠️ ' + msg, 'error', 8000);
    });
  }

  function unlockAdminDashboard() {
    if (elements.authScreen) elements.authScreen.style.display = 'none';
    if (elements.dashboardContainer) elements.dashboardContainer.style.display = 'block';

    updateAdminUserHeader();

    loadData();
    loadRegConfig();

    // CHỈ bind event MỘT LẦN cho toàn vòng đời trang.
    // Trước đây unlockAdminDashboard() chạy cả khi khởi tạo lẫn mỗi lần
    // đăng nhập, khiến cùng một nút có nhiều listener: bấm 1 lần tạo 2 bản
    // sao lưu, gọi 2 confirm(), tải 2 file, và tốn 2/6 ô lưu trữ.
    if (!dashboardEventsBound) {
      dashboardEventsBound = true;
      bindEvents();
      bindRegConfigEvents();
      bindStickyHeroEvents();
      bindViewModeEvents();
      bindImportEvents();
      bindSwapMgmtEvents();
      bindBackupCenterEvents();
      bindCloudSyncEvents();

      // Cập nhật trạng thái đếm ngược trực tiếp mỗi 30 giây (1 timer duy nhất)
      regLiveStatusTimer = setInterval(updateRegLiveStatus, 30000);
    }

    renderAll();
    renderRegConfigUI();
    updateSwapCountBadges();
  }

  function lockAdminDashboard() {
    if (elements.authScreen) elements.authScreen.style.display = 'flex';
    if (elements.dashboardContainer) elements.dashboardContainer.style.display = 'none';
  }

  function updateAdminUserHeader() {
    const user = state.currentUser || { fullName: 'Trưởng Ban', role: 'Quản trị viên' };
    if (elements.adminUserName) {
      elements.adminUserName.textContent = user.fullName || user.username;
      elements.adminUserName.title = `${user.fullName} (${user.role})`;
    }
    if (elements.adminUserAvatar) {
      const initial = (user.fullName || user.username || 'A').charAt(0).toUpperCase();
      elements.adminUserAvatar.textContent = initial;
    }
  }

  function loadAdminUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_USERS);
      if (raw) {
        const list = JSON.parse(raw);
        state.adminUsers = Array.isArray(list) ? list : [];
      } else if (!Array.isArray(state.adminUsers) || state.adminUsers.length === 0) {
        state.adminUsers = [...DEFAULT_ADMIN_USERS];
        saveAdminUsers();
      }

      // KHÔNG tự thêm tài khoản mặc định vào danh sách đã có, rồi đẩy lên Cloud.
      //
      // Lỗi này đã xảy ra thật: tài khoản thật (đã đổi mật khẩu) bị thêm bản mặc
      // định trong mã nguồn vào cùng danh sách, rồi saveAdminUsers() đẩy ngược
      // lên Firebase — ghi đè cấu hình tài khoản thật trên Cloud.
      //
      // Máy này thiếu tài khoản nào thì quản trị viên tự thêm trong màn
      // "Cấp Quyền & Đổi MK" — không tự ý nhét tài khoản mặc định vào.
    } catch (err) {
      state.adminUsers = [...DEFAULT_ADMIN_USERS];
    }
  }

  function saveAdminUsers() {
    localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(state.adminUsers));
    if (window.CloudSyncManager && typeof window.CloudSyncManager.triggerAutoPush === 'function') {
      window.CloudSyncManager.triggerAutoPush();
    }
  }

  // ---------------------------------------------------------------------------
  // CHỐNG DÒ MẬT KHẨU / PIN
  // ---------------------------------------------------------------------------
  // PIN chỉ 4 chữ số = 10.000 tổ hợp. Không giới hạn số lần thử thì một người
  // đứng cạnh máy cũng dò ra trong vài phút. Sau 5 lần sai (định dạng hợp lệ)
  // liên tiếp, khoá đăng nhập 60 giây.
  //
  // Chỉ đếm các lần nhập ĐÚNG ĐỊNH DẠNG: gõ rỗng / chữ cái là lỗi nhập liệu,
  // không phải hành vi dò, nên không khoá (và cũng không làm phiền người dùng).
  const LOGIN_GUARD = {
    KEY: 'ts_admin_login_guard',
    MAX_ATTEMPTS: 5,
    LOCK_MS: 60 * 1000,
    SESSION_MAX_MS: 12 * 60 * 60 * 1000,
    SESSION_STARTED_KEY: 'ts_admin_session_started'
  };

  function readLoginGuard() {
    try {
      return JSON.parse(localStorage.getItem(LOGIN_GUARD.KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeLoginGuard(guard) {
    try {
      localStorage.setItem(LOGIN_GUARD.KEY, JSON.stringify(guard));
    } catch (e) {
      // Storage bị chặn: bỏ qua, không chặn đăng nhập của người dùng thật.
    }
  }

  /** Số mili-giây còn bị khoá (0 = không khoá). */
  function getLoginLockRemaining() {
    const guard = readLoginGuard();
    const until = Number(guard.lockedUntil) || 0;
    return until > Date.now() ? until - Date.now() : 0;
  }

  function registerLoginFailure() {
    const guard = readLoginGuard();
    const fails = (Number(guard.fails) || 0) + 1;
    if (fails >= LOGIN_GUARD.MAX_ATTEMPTS) {
      writeLoginGuard({ fails: 0, lockedUntil: Date.now() + LOGIN_GUARD.LOCK_MS });
    } else {
      writeLoginGuard({ fails });
    }
  }

  function resetLoginFailures() {
    writeLoginGuard({ fails: 0 });
  }

  /** Phiên đăng nhập đã quá hạn chưa (mặc định 12 giờ). */
  function isSessionExpired() {
    try {
      const started = Number(sessionStorage.getItem(LOGIN_GUARD.SESSION_STARTED_KEY)) || 0;
      // Phiên tạo trước khi có tính năng này (không có mốc) -> không ép đăng xuất.
      if (!started) return false;
      return Date.now() - started > LOGIN_GUARD.SESSION_MAX_MS;
    } catch (e) {
      return false;
    }
  }

  /** Xoá sạch dấu vết phiên đăng nhập (token, hồ sơ, mốc thời gian). */
  function clearAdminSession() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      sessionStorage.removeItem(LOGIN_GUARD.SESSION_STARTED_KEY);
    } catch (e) {
      // Storage bị chặn: không có gì để xoá.
    }
  }

  /** true nếu đã bị khoá; đồng thời hiển thị thông báo chờ. */
  function rejectIfLoginLocked() {    const remain = getLoginLockRemaining();
    if (!remain) return false;
    showAuthError(
      `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(remain / 1000)} giây.`
    );
    return true;
  }

  /** PIN hợp lệ về định dạng (4–8 chữ số) — dùng để quyết định có tính là 1 lần thử. */
  function looksLikePin(value) {
    return typeof value === 'string' && /^\d{4,8}$/.test(value.trim());
  }

  /** Mật khẩu hợp lệ về định dạng — không đếm lần bấm nhầm ô trống. */
  function looksLikePassword(value) {
    return typeof value === 'string' && value.trim().length >= 3;
  }

  function bindAuthEvents() {
    // Chuyển tab Đăng nhập: Mật khẩu vs Mã PIN
    elements.tabAuthPwd?.addEventListener('click', () => {
      elements.tabAuthPwd.classList.add('active');
      elements.tabAuthPin?.classList.remove('active');
      if (elements.formAuthCredentials) elements.formAuthCredentials.style.display = 'block';
      if (elements.formAuthPin) elements.formAuthPin.style.display = 'none';
      hideAuthError();
    });

    elements.tabAuthPin?.addEventListener('click', () => {
      elements.tabAuthPin.classList.add('active');
      elements.tabAuthPwd?.classList.remove('active');
      if (elements.formAuthPin) elements.formAuthPin.style.display = 'block';
      if (elements.formAuthCredentials) elements.formAuthCredentials.style.display = 'none';
      hideAuthError();
    });

    // Xử lý đăng nhập Form 1: Username & Password
    elements.formAuthCredentials?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = elements.inputAuthUsername ? elements.inputAuthUsername.value.trim().toLowerCase() : '';
      const password = elements.inputAuthPassword ? elements.inputAuthPassword.value : '';

      if (rejectIfLoginLocked()) return;

      let matched = findUserByPassword(username, password);
      
      // Nếu chưa khớp trong memory local (ví dụ vừa mở tab ẩn danh và cloud pull chưa về kịp):
      if (!matched && window.CloudSyncManager && typeof window.CloudSyncManager.pullFromCloud === 'function') {
        try {
          const res = await window.CloudSyncManager.pullFromCloud();
          if (res.success) {
            loadAdminUsers();
            matched = findUserByPassword(username, password);
          }
        } catch (err) {}
      }

      if (matched) {
        authenticateSuccess(matched);
      } else {
        if (looksLikePassword(password)) registerLoginFailure();
        showAuthError('Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
    });

    // Xử lý đăng nhập Form 2: Mã PIN nhanh
    elements.formAuthPin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = elements.inputAuthPin ? elements.inputAuthPin.value.trim() : '';
      if (rejectIfLoginLocked()) return;
      let matched = findUserByPin(pin);

      // Nếu chưa khớp trong memory local (ví dụ vừa mở tab ẩn danh và cloud pull chưa về kịp):
      if (!matched && window.CloudSyncManager && typeof window.CloudSyncManager.pullFromCloud === 'function') {
        try {
          const res = await window.CloudSyncManager.pullFromCloud();
          if (res.success) {
            loadAdminUsers();
            matched = findUserByPin(pin);
          }
        } catch (err) {}
      }

      if (matched) {
        authenticateSuccess(matched);
      } else {
        if (looksLikePin(pin)) registerLoginFailure();
        showAuthError('Mã PIN không đúng! Vui lòng thử lại hoặc dùng tài khoản.');
      }
    });

    // Tự động ẩn lỗi khi người dùng bắt đầu gõ lại
    elements.inputAuthUsername?.addEventListener('input', hideAuthError);
    elements.inputAuthPassword?.addEventListener('input', hideAuthError);
    elements.inputAuthPin?.addEventListener('input', hideAuthError);

    // Đăng xuất an toàn
    elements.btnAdminLogout?.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi phiên làm việc Quản Trị?')) {
        clearAdminSession();
        state.isAuthenticated = false;
        state.currentUser = null;
        lockAdminDashboard();
        showToast('Đã đăng xuất khỏi hệ thống an toàn!', 'info');
      }
    });

    // Xuất API xác thực cho kiểm thử và tích hợp
    window.AdminAuth = {
      login: (username, password) => {
        if (rejectIfLoginLocked()) {
          return { success: false, message: 'Tạm khoá do nhập sai quá nhiều lần.' };
        }
        const uStr = (username || '').trim().toLowerCase();
        const matched = findUserByPassword(uStr, password);
        if (matched) {
          authenticateSuccess(matched);
          return { success: true, user: matched };
        }
        if (looksLikePassword(password)) registerLoginFailure();
        showAuthError('Tên đăng nhập hoặc mật khẩu không chính xác!');
        return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' };
      },
      loginPin: (pin) => {
        const pStr = (pin || '').trim();
        if (rejectIfLoginLocked()) {
          return { success: false, message: 'Tạm khoá do nhập sai quá nhiều lần.' };
        }
        const matched = findUserByPin(pStr);
        if (matched) {
          authenticateSuccess(matched);
          return { success: true, user: matched };
        }
        if (looksLikePin(pStr)) registerLoginFailure();
        showAuthError('Mã PIN không đúng! Vui lòng thử lại hoặc dùng tài khoản.');
        return { success: false, message: 'Mã PIN không đúng!' };
      },
      logout: () => {
        clearAdminSession();
        state.isAuthenticated = false;
        state.currentUser = null;
        lockAdminDashboard();
      },
      isAuthenticated: () => state.isAuthenticated,
      getCurrentUser: () => state.currentUser,
      getAdminUsers: () => [...state.adminUsers],
      // Dùng cho kiểm thử & chẩn đoán: phiên đã quá hạn 12 giờ chưa?
      isSessionExpired: () => isSessionExpired()
    };
  }

  /**
   * Chỉ giữ các trường KHÔNG bí mật của tài khoản cán bộ.
   * Dùng khi serialize vào sessionStorage — mật khẩu/PIN không bao giờ được
   * ghi ra storage mà script cùng origin (hoặc extension) đọc được.
   */
  function publicUserFields(user) {
    if (!user || typeof user !== 'object') return null;
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    };
  }

  /**
   * Cửa DUY NHẤT ghi phiên đăng nhập vào sessionStorage.
   * Mọi nơi khác phải gọi hàm này — nhờ vậy không thể vô tình serialize
   * mật khẩu/PIN của cán bộ ra storage (có test 6.13 canh).
   */
  function persistCurrentUser(user) {
    try {
      sessionStorage.setItem(
        STORAGE_KEYS.CURRENT_USER,
        JSON.stringify(publicUserFields(user))
      );
    } catch (e) {
      // Storage bị chặn (chế độ riêng tư) — phiên vẫn dùng được trong RAM.
    }
  }

  function authenticateSuccess(user) {
    state.isAuthenticated = true;
    state.currentUser = user;
    // Nếu tài khoản còn lưu plaintext (mặc định / dữ liệu cũ) thì băm ngay.
    upgradeLegacyCredentials(user);
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'true');
    // Đăng nhập thành công -> xoá bộ đếm sai và ghi mốc bắt đầu phiên.
    resetLoginFailures();
    try {
      sessionStorage.setItem(LOGIN_GUARD.SESSION_STARTED_KEY, String(Date.now()));
    } catch (e) { /* storage bị chặn */ }
    // KHÔNG serialize mật khẩu/PIN vào sessionStorage.
    //
    // sessionStorage đọc được từ bất kỳ script cùng origin nào (XSS, extension),
    // và trên máy dùng chung nó tồn tại tới khi đóng tab. Chỉ cần id/username/
    // fullName/role để vẽ header và phân quyền; thông tin xác thực tra lại từ
    // state.adminUsers khi thực sự cần (đổi mật khẩu).
    persistCurrentUser(user);

    hideAuthError();
    unlockAdminDashboard();
    showToast(`Xin chào ${user.fullName}! Đăng nhập quản trị thành công.`, 'success');

    // Đã bỏ cảnh báo mật khẩu yếu: nó hiện mỗi lần đăng nhập vì mật khẩu nằm
    // trong mã nguồn công khai, nên cảnh báo luôn bật và chỉ gây mời mắt sau vài
    // lần. Việc đổi mật khẩu vẫn làm được qua nút "🔑 Cấp Quyền & Đổi MK".
  }

  /**
   * Cảnh báo mật khẩu yếu — ĐÃ BỎ theo yêu cầu chủ dự án (2026-10-17).
   * @deprecated Không còn được gọi. Giữ lại để tham chiếu lịch sử.
   */
  function warnIfWeakCredentials() {
    return;
  }

  function showAuthError(msg) {
    if (elements.authErrorBox) {
      elements.authErrorBox.style.display = 'flex';
      if (elements.authErrorMsg) elements.authErrorMsg.textContent = msg;
    }
    try {
      const card = document.querySelector('.auth-card');
      if (card) {
        card.classList.remove('shake-error');
        void card.offsetWidth;
        card.classList.add('shake-error');
        setTimeout(() => card.classList.remove('shake-error'), 600);
      }
    } catch (e) {}
  }

  function hideAuthError() {
    if (elements.authErrorBox) {
      elements.authErrorBox.style.display = 'none';
    }
  }

  function bindUserMgmtEvents() {
    // Mở modal quản lý quyền
    elements.btnOpenUserMgmt?.addEventListener('click', () => {
      renderUserMgmtTable();
      switchUserMgmtTab('list');
      if (elements.userMgmtModal) elements.userMgmtModal.classList.add('active');
    });

    elements.btnCloseUserMgmtModal?.addEventListener('click', () => {
      if (elements.userMgmtModal) elements.userMgmtModal.classList.remove('active');
    });

    elements.userMgmtModal?.addEventListener('click', (e) => {
      if (e.target === elements.userMgmtModal) {
        elements.userMgmtModal.classList.remove('active');
      }
    });

    // Chuyển tab trong modal
    elements.tabBtnUserList?.addEventListener('click', () => switchUserMgmtTab('list'));
    elements.tabBtnAddUser?.addEventListener('click', () => switchUserMgmtTab('add'));
    elements.tabBtnChangePwd?.addEventListener('click', () => switchUserMgmtTab('pwd'));

    // Form thêm cán bộ mới
    elements.formAddAdminUser?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fullName = document.getElementById('add-user-fullname')?.value.trim();
      const username = document.getElementById('add-user-username')?.value.trim().toLowerCase();
      const role = document.getElementById('add-user-role')?.value;
      const password = document.getElementById('add-user-pwd')?.value;
      const pin = document.getElementById('add-user-pin')?.value.trim();

      if (!fullName || !username || !password) {
        showToast('Vui lòng điền đủ họ tên, username và mật khẩu!', 'error');
        return;
      }

      if (state.adminUsers.some(u => u.username.toLowerCase() === username)) {
        showToast(`Tên đăng nhập "${username}" đã tồn tại! Vui lòng chọn tên khác.`, 'error');
        return;
      }

      const newUser = {
        id: 'usr_' + Date.now(),
        username,
        fullName,
        role: role || 'Điều phối viên tuyển sinh',
        createdAt: Date.now()
      };
      // Chỉ lưu hash có muối — không bao giờ lưu mật khẩu/PIN đọc được,
      // kể cả trên máy này. Nhờ vậy payload đẩy lên Cloud cũng chỉ có hash.
      setUserSecret(newUser, 'password', password);
      if (pin) setUserSecret(newUser, 'pin', pin);

      state.adminUsers.push(newUser);
      saveAdminUsers();
      elements.formAddAdminUser.reset();
      showToast(`Đã cấp quyền truy cập thành công cho cán bộ ${fullName}!`, 'success');
      switchUserMgmtTab('list');
    });

    // Form đổi mật khẩu cho tài khoản hiện tại
    elements.formChangeCurrentPwd?.addEventListener('submit', (e) => {
      e.preventDefault();
      const currentPwd = document.getElementById('pwd-current')?.value;
      const newPwd = document.getElementById('pwd-new')?.value;
      const confirmPwd = document.getElementById('pwd-confirm')?.value;
      const newPin = document.getElementById('pin-new')?.value.trim();

      const user = state.currentUser;
      if (!user) return;

      // state.currentUser được khôi phục từ sessionStorage nên KHÔNG còn chứa
      // mật khẩu (xem publicUserFields). Luôn đối chiếu với bản ghi thật trong
      // danh sách cán bộ, nếu không thì sau khi F5 form đổi mật khẩu sẽ luôn
      // báo "mật khẩu hiện tại không đúng".
      const liveUser = state.adminUsers.find(
        u => (user.id && u.id === user.id) || (user.username && u.username === user.username)
      );
      if (!liveUser) {
        showToast('Không tìm thấy tài khoản cán bộ tương ứng. Vui lòng đăng nhập lại!', 'error');
        return;
      }

      if (!verifyUserSecret(liveUser, 'password', currentPwd)) {
        showToast('Mật khẩu hiện tại không đúng!', 'error');
        return;
      }

      if (!newPwd || newPwd.length < 3) {
        showToast('Mật khẩu mới phải có ít nhất 3 ký tự!', 'error');
        return;
      }

      if (newPwd !== confirmPwd) {
        showToast('Mật khẩu xác nhận không khớp!', 'error');
        return;
      }

      // Cập nhật trong danh sách cán bộ
      const idx = state.adminUsers.findIndex(u => u.id === liveUser.id);
      if (idx !== -1) {
        setUserSecret(state.adminUsers[idx], 'password', newPwd);
        if (newPin) setUserSecret(state.adminUsers[idx], 'pin', newPin);
        saveAdminUsers();

        // Giữ state.currentUser đồng bộ nhưng KHÔNG chứa bí mật.
        state.currentUser = publicUserFields(state.adminUsers[idx]);
        persistCurrentUser(state.currentUser);
      }

      elements.formChangeCurrentPwd.reset();
      showToast('Đã đổi mật khẩu thành công!', 'success');
      switchUserMgmtTab('list');
    });
  }

  function switchUserMgmtTab(tab) {
    elements.tabBtnUserList?.classList.toggle('active', tab === 'list');
    elements.tabBtnAddUser?.classList.toggle('active', tab === 'add');
    elements.tabBtnChangePwd?.classList.toggle('active', tab === 'pwd');

    if (elements.panelUserList) elements.panelUserList.style.display = tab === 'list' ? 'block' : 'none';
    if (elements.formAddAdminUser) elements.formAddAdminUser.style.display = tab === 'add' ? 'block' : 'none';
    if (elements.formChangeCurrentPwd) elements.formChangeCurrentPwd.style.display = tab === 'pwd' ? 'block' : 'none';

    if (tab === 'list') renderUserMgmtTable();
  }

  function renderUserMgmtTable() {
    if (!elements.userMgmtTableBody) return;
    elements.userMgmtTableBody.innerHTML = '';

    state.adminUsers.forEach((user, index) => {
      const tr = document.createElement('tr');
      const isRoot = user.username === 'admin';
      const isCurrent = state.currentUser && state.currentUser.username === user.username;

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-weight: 700;">${index + 1}</td>
        <td><code>${escapeHtml(user.username)}</code> ${isCurrent ? '<span class="badge" style="background:#e0e7ff; color:#3730a3; font-size:0.7rem; padding:1px 5px;">Bạn</span>' : ''}</td>
        <td><strong>${escapeHtml(user.fullName)}</strong></td>
        <td><span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(user.role)}</span></td>
        <td>
          <code class="pin-cell" data-pin="${escapeHtml(user.pin || '')}" data-hidden="1">${user.pin ? '••••' : '—'}</code>
          ${user.pin ? `<button type="button" class="btn-action btn-reveal-pin" data-uid="${escapeHtml(user.id)}" title="Hiện/ẩn mã PIN" aria-label="Hiện hoặc ẩn mã PIN của ${escapeHtml(user.fullName)}">👁️</button>` : ''}
        </td>
        <td>
          ${isRoot ? '<span style="font-size:0.75rem; color:#94a3b8;">Mặc định</span>' : `
            <button type="button" class="btn-action delete btn-delete-user" data-uid="${escapeHtml(user.id)}" title="Thu hồi quyền truy cập">🗑️</button>
          `}
        </td>
      `;

      elements.userMgmtTableBody.appendChild(tr);
    });

    elements.userMgmtTableBody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-uid');
        const target = state.adminUsers.find(u => u.id === uid);
        if (!target) return;
        if (confirm(`Bạn có chắc muốn thu hồi quyền truy cập của cán bộ "${target.fullName}" (${target.username}) không?`)) {
          state.adminUsers = state.adminUsers.filter(u => u.id !== uid);
          saveAdminUsers();
          renderUserMgmtTable();
          showToast(`Đã thu hồi quyền của cán bộ ${target.fullName}!`, 'info');
        }
      });
    });

    // Hiện/ẩn mã PIN: mặc định CHE. Bảng này hay được mở ngay tại quầy tư vấn
    // (có sinh viên đứng trước), nên PIN không được hiện sẵn cho người lạ đọc.
    elements.userMgmtTableBody.querySelectorAll('.btn-reveal-pin').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest ? btn.closest('tr') : null;
        const cell = row ? row.querySelector('.pin-cell') : null;
        if (!cell) return;
        const isHidden = cell.getAttribute('data-hidden') === '1';
        cell.textContent = isHidden ? (cell.getAttribute('data-pin') || '—') : '••••';
        cell.setAttribute('data-hidden', isHidden ? '0' : '1');
        btn.textContent = isHidden ? '🙈' : '👁️';
      });
    });
  }

  function loadData() {
    try {
      const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      let parsedStudents = [];
      try {
        if (rawStudents) parsedStudents = JSON.parse(rawStudents) || [];
      } catch (e) {
        parsedStudents = [];
      }

      if (Array.isArray(parsedStudents) && parsedStudents.length > 0) {
        // Đã có dữ liệu trong LocalStorage/Cloud -> GIỮ NGUYÊN 100%, TUYỆT ĐỐI KHÔNG GHI ĐÈ!
        state.students = parsedStudents;
      } else {
        // Chỉ khi máy hoàn toàn trống chưa có dữ liệu nào (lần đầu tiên mở web) mới nạp mẫu ban đầu
        if (window.SAMPLE_HCM_UTE_STUDENTS && window.SAMPLE_HCM_UTE_STUDENTS.length > 0) {
          state.students = JSON.parse(JSON.stringify(window.SAMPLE_HCM_UTE_STUDENTS));
          saveStudents(true);
        } else {
          state.students = [];
        }
      }

      const rawMonth = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE) || localStorage.getItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      const rawSchedule = localStorage.getItem(STORAGE_KEYS.SCHEDULE);

      if (rawMonth) {
        state.monthSchedule = JSON.parse(rawMonth);
        state.twoWeekSchedule = state.monthSchedule;
        const weekIdx = Math.min(Math.max(1, state.viewWeek || 1), 4) - 1;
        state.currentSchedule = state.monthSchedule.weeks?.[weekIdx] || state.monthSchedule.week1 || state.monthSchedule;
      } else if (rawSchedule) {
        state.monthSchedule = null;
        state.twoWeekSchedule = null;
        state.currentSchedule = JSON.parse(rawSchedule);
      } else {
        state.monthSchedule = null;
        state.twoWeekSchedule = null;
        state.currentSchedule = null;
      }

      try {
        const rawActiveMonth = localStorage.getItem(STORAGE_KEYS.ACTIVE_MONTH);
        if (rawActiveMonth) {
          const parsed = JSON.parse(rawActiveMonth);
          if (parsed && parsed.month) state.currentMonth = parseInt(parsed.month, 10);
          if (parsed && parsed.year) state.currentYear = parseInt(parsed.year, 10);
        } else {
          // Dự phòng cho dữ liệu cũ đã lưu dạng chuỗi thay vì JSON.
          // CHỈ ĐỌC, không còn ghi key này nữa.
          const legacy = localStorage.getItem('ts_scheduler_active_month');
          if (legacy) state.currentMonth = parseInt(legacy, 10);
        }
      } catch (e) {}

      if (state.monthSchedule && state.monthSchedule.month) {
        state.currentMonth = state.monthSchedule.month;
        if (state.monthSchedule.year) state.currentYear = state.monthSchedule.year;
      }

      try {
        state.events = EventManager.getEvents();
      } catch (e) {
        state.events = [];
      }

      // Ca rảnh phải thuộc đúng tháng đang mở. Nếu khoá tháng lưu khác tháng
      // này (máy mới mở lại, tháng vừa được đổi từ máy khác), ca rảnh cũ
      // không còn ý nghĩa → xoá để mọi CTV đăng ký lại từ đầu.
      try {
        resetAvailabilityIfNewMonth(state.currentMonth, state.currentYear);
      } catch (e) {
        console.warn('[Admin] Không kiểm tra được tháng của ca rảnh:', e);
      }
    } catch (err) {
      console.error(err);
      state.students = [];
      state.monthSchedule = null;
      state.twoWeekSchedule = null;
      state.currentSchedule = null;
    }
  }

  function saveStudents(syncImmediate = true) {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(state.students));
    if (window.CloudSyncManager) {
      if (syncImmediate && typeof window.CloudSyncManager.pushToCloud === 'function') {
        window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Push error:', err));
      } else if (typeof window.CloudSyncManager.triggerAutoPush === 'function') {
        window.CloudSyncManager.triggerAutoPush();
      }
    }
  }

  function saveSchedule(syncImmediate = true) {
    if (state.currentSchedule) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.currentSchedule));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
    }
    if (state.monthSchedule) {
      localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
      localStorage.setItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE, JSON.stringify(state.monthSchedule));

      const curY = state.currentYear || 2026;
      const curM = state.currentMonth || 10;
      let allMonths = {};
      try {
        const rawAll = localStorage.getItem(STORAGE_KEYS.ALL_MONTHS);
        if (rawAll) allMonths = JSON.parse(rawAll) || {};
      } catch (e) {
        allMonths = {};
      }
      allMonths[`${curY}-${String(curM).padStart(2, '0')}`] = state.monthSchedule;
      try {
        localStorage.setItem(STORAGE_KEYS.ALL_MONTHS, JSON.stringify(allMonths));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_MONTH, JSON.stringify({ month: curM, year: curY }));
      } catch (e) {}
    } else {
      localStorage.removeItem(STORAGE_KEYS.MONTH_SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
    }
    if (window.CloudSyncManager) {
      if (syncImmediate && typeof window.CloudSyncManager.pushToCloud === 'function') {
        window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Push error:', err));
      } else if (typeof window.CloudSyncManager.triggerAutoPush === 'function') {
        window.CloudSyncManager.triggerAutoPush();
      }
    }
  }

  /** Ghi nhận ô ca đã được chỉnh tay, để không mất khi xếp lại lịch.
 * @param {number} weekNumber - 1..4
 * @param {string} shiftId - ví dụ 'T2_S'
 * @param {object} slot - { oldMember, newMember }
 */
function recordManualSlot(weekNumber, shiftId, slot) {
  try {
    let map = {};
    try {
      map = JSON.parse(localStorage.getItem(STORAGE_KEYS.MANUAL_SLOTS) || '{}') || {};
    } catch (e) { map = {}; }

    const wk = String(weekNumber || 1);
    if (!map[wk]) map[wk] = {};
    // Chỉ lưu tham chiếu nhẹ (id + tên) chứ không nhân bản cả hồ sơ SV,
    // tránh phình localStorage.
    map[wk][shiftId] = {
      oldId: slot.oldMember ? slot.oldMember.id : null,
      newId: slot.newMember ? slot.newMember.id : null,
      at: Date.now()
    };

    localStorage.setItem(STORAGE_KEYS.MANUAL_SLOTS, JSON.stringify(map));
  } catch (e) {
    console.warn('[Admin] Không lưu được ô ca chỉnh tay:', e);
  }
}

/**
 * Áp lại các ô đã được chỉnh tay sau khi xếp lịch tự động.
 *
 * Mỗi chỉnh sửa được kiểm tra lại: sinh viên còn tồn tại không, còn rảnh ca
 * đó không, còn trùng ngày không. Ô không hợp lệ bị bỏ qua và ghi cảnh báo
 * thay vì âm thầm tạo lịch không hợp lệ.
 *
 * @returns {{ applied: number, skipped: string[] }}
 */
function reapplyManualSlots(monthSchedule) {
  const result = { applied: 0, skipped: [] };
  if (!monthSchedule || !monthSchedule.weeks) return result;

  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(STORAGE_KEYS.MANUAL_SLOTS) || '{}') || {};
  } catch (e) { return result; }

  const byId = {};
  state.students.forEach(s => { if (s && s.id) byId[s.id] = s; });

  Object.keys(map).forEach(wk => {
    const weekIdx = parseInt(wk, 10) - 1;
    const weekData = monthSchedule.weeks[weekIdx];
    if (!weekData || !weekData.scheduleTable) return;

    Object.keys(map[wk] || {}).forEach(shiftId => {
      const override = map[wk][shiftId];
      if (!override) return;
      const slot = weekData.scheduleTable[shiftId];
      if (!slot) {
        result.skipped.push(`${wk}/${shiftId}: không có ô ca này`);
        return;
      }

      const resolve = (id) => {
        if (!id) return null;
        const st = byId[id];
        if (!st) {
          result.skipped.push(`${wk}/${shiftId}: CTV #${id} không còn trong danh sách`);
          return undefined; // undefined = lỗi, null = xoá hẳn
        }
        const declared = st.monthlyAvailableShifts
          ? (st.monthlyAvailableShifts[weekIdx + 1] || st.monthlyAvailableShifts[String(weekIdx + 1)])
          : st.availableShifts;
        if (Array.isArray(declared) && !declared.includes(shiftId)) {
          result.skipped.push(`${wk}/${shiftId}: ${st.fullName} không còn rảnh ca này`);
          return undefined;
        }
        return st;
      };

      const oldM = resolve(override.oldId);
      const newM = resolve(override.newId);
      if (oldM === undefined || newM === undefined) return;

      if (oldM && newM && oldM.id === newM.id) {
        result.skipped.push(`${wk}/${shiftId}: không thể gán cùng 1 người cho cả 2 vị trí`);
        return;
      }
      if (oldM && oldM.role !== 'old') {
        result.skipped.push(`${wk}/${shiftId}: ${oldM.fullName} không phải Chính Thức`);
        return;
      }
      if (newM && newM.role !== 'new') {
        result.skipped.push(`${wk}/${shiftId}: ${newM.fullName} không phải Tập Sự`);
        return;
      }

      slot.oldMember = oldM;
      slot.newMember = newM;
      slot.status = (oldM && newM) ? 'full' : ((oldM || newM) ? 'partial' : 'empty');
      slot.manuallyEdited = true;
      result.applied++;
    });

    recomputeWeekStats(weekData);
  });

  return result;
}

function runFullSchedule() {
    if (state.students.length === 0) {
      state.currentSchedule = null;
      state.twoWeekSchedule = null;
      state.monthSchedule = null;
      saveSchedule();
      return;
    }

    // Xếp ca trọn vẹn 1 tháng (4 tuần) theo đúng Năm và Tháng đang chọn
    const curY = state.currentYear || 2026;
    const curM = state.currentMonth || 10;
    const monthEngine = window.SchedulerEngine?.runMonthSchedule || window.SchedulerEngine?.runTwoWeekSchedule;
    const monthResult = monthEngine ? monthEngine(state.students, curY, curM) : null;

    // Áp lại các ô quản trị viên đã chỉnh tay. Trước đây mọi thao tác gọi
    // runFullSchedule() (đổi vai trò hàng loạt, nhập CSV, thêm/xoá SV) đều
    // xoá sạch các đổi nhân sự tay đã được phê duyệt.
    if (monthResult) {
      const reapplied = reapplyManualSlots(monthResult);
      if (reapplied.applied > 0) {
      }
      if (reapplied.skipped.length > 0) {
        console.warn('[Admin] Bỏ qua phân công chỉnh tay không còn hợp lệ:', reapplied.skipped);
        showToast(`⚠️ Có ${reapplied.skipped.length} phân công chỉnh tay không còn hợp lệ (CTV đã bị xoá / không còn rảnh ca) và đã được bỏ qua. Xem Console để biết chi tiết.`, 'warning', 8000);
      }
    }

    state.monthSchedule = monthResult;
    state.twoWeekSchedule = monthResult;

    const weekIdx = Math.min(Math.max(1, state.viewWeek || 1), 4) - 1;
    state.currentSchedule = monthResult?.weeks?.[weekIdx] || monthResult?.week1 || monthResult;
    saveSchedule();
  }

  function switchAdminWeek(w) {
    state.viewWeek = w;
    document.querySelectorAll('#admin-week-selector .filter-btn').forEach(btn => {
      const btnW = parseInt(btn.getAttribute('data-week'), 10);
      btn.classList.toggle('active', btnW === w);
    });

    if (state.monthSchedule?.weeks?.[w - 1]) {
      state.currentSchedule = state.monthSchedule.weeks[w - 1];
    } else if (state.twoWeekSchedule) {
      state.currentSchedule = (w === 2 ? state.twoWeekSchedule.week2 : state.twoWeekSchedule.week1);
    } else {
      state.currentSchedule = null;
    }
    renderTimetable();
    renderFairness();
    renderStudentTable();
    if (typeof renderUteSheetPreview === 'function') {
      renderUteSheetPreview();
    }
  }

  /**
   * ==========================================================================
   * ĐIỀU HƯỚNG THÁNG & TỰ ĐỘNG SAO LƯU KHI CHUYỂN THÁNG (TASK MONTH SWITCHER)
   * ==========================================================================
   */
  function updateMonthNavigatorUI() {
    const curM = state.currentMonth || 10;
    const curY = state.currentYear || 2026;
    const pad2 = (n) => String(n).padStart(2, '0');

    // 1. Cập nhật tiêu đề tháng trên thẻ điều hướng
    if (elements.currentMonthTitle) {
      if (curM === 1 && curY === 2027) {
        elements.currentMonthTitle.textContent = 'Tháng 01/2027 (Kỳ 13)';
      } else {
        elements.currentMonthTitle.textContent = `Tháng ${pad2(curM)}/${curY}`;
      }
    }

    // 2. Cập nhật tiêu đề phụ trên bảng thời khóa biểu
    if (elements.timetableMonthSubtitle) {
      if (curM === 1 && curY === 2027) {
        elements.timetableMonthSubtitle.textContent = 'Tháng 01/2027 (Kỳ 13)';
      } else {
        elements.timetableMonthSubtitle.textContent = `Tháng ${pad2(curM)}/${curY}`;
      }
    }

    // 3. Cập nhật dropdown chọn nhanh
    if (elements.selectQuickMonth) {
      const targetVal = `${curY}-${pad2(curM)}`;
      if (elements.selectQuickMonth.options && typeof elements.selectQuickMonth.options.length === 'number') {
        let foundOption = false;
        const opts = elements.selectQuickMonth.options;
        for (let i = 0; i < opts.length; i++) {
          if (opts[i] && opts[i].value === targetVal) {
            elements.selectQuickMonth.selectedIndex = i;
            foundOption = true;
            break;
          }
        }
        if (!foundOption && typeof elements.selectQuickMonth.appendChild === 'function') {
          try {
            const opt = document.createElement('option');
            opt.value = targetVal;
            opt.textContent = (curM === 1 && curY === 2027) ? 'Tháng 01/2027 (Kỳ 13)' : `Tháng ${pad2(curM)}/${curY}`;
            elements.selectQuickMonth.appendChild(opt);
          } catch (e) {}
        }
      }
      try {
        elements.selectQuickMonth.value = targetVal;
      } catch (e) {}
    }

    // 4. Cập nhật ngày tháng trên 4 nút chọn tuần (Tuần 1 -> Tuần 4)
    let calWeeks = [];
    if (window.SchedulerEngine?.MonthCalendarHelper) {
      calWeeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(curM, curY);
    }
    for (let w = 1; w <= 4; w++) {
      const btn = document.getElementById(`btn-admin-week-${w}`);
      if (btn && calWeeks[w - 1]) {
        btn.innerHTML = `Tuần ${w} <span style="font-size:0.75rem; opacity:0.85; margin-left:3px; font-weight:600;">(${calWeeks[w - 1].startDateStr} - ${calWeeks[w - 1].endDateStr})</span>`;
      }
    }
  }

  /**
 * Số tháng tối đa giữ lại trong kho lịch (ts_scheduler_all_months_v1).
 *
 * Mỗi monthSchedule ~108KB với 30 sinh viên. Giữ không giới hạn thì:
 *   24 tháng = 2.5 MB, 36 tháng = 3.8 MB
 * cộng 6 bản sao lưu web (~750KB) là vượt quota localStorage 5MB.
 * Khi vượt, setItem ném QuotaExceededError và bị nuốt bởi try/catch ->
 * mất lịch tháng mà người dùng không hề biết.
 * 24 tháng là ranh giới hợp lý (2 năm lịch trực), vẫn xem được các tháng cũ
 * qua phần lịch sử.
 */
const MAX_MONTH_ARCHIVE = 24;

/**
 * Cắt bớt kho lịch, luôn GIỮ LẠI tháng vừa lưu.
 * @param {Object} archive - Dạng { '2026-10': monthSchedule, ... }
 * @param {string} keepKey - Khoá tháng bắt buộc phải giữ (tháng vừa chuyển khỏi)
 * @returns {Object} Đối tượng đã cắt
 */
function trimMonthArchive(archive, keepKey) {
  if (!archive || typeof archive !== 'object') return {};
  const keys = Object.keys(archive).sort().reverse();
  if (keys.length <= MAX_MONTH_ARCHIVE) return archive;

  const kept = [];
  keys.forEach(k => {
    if (k === keepKey || kept.length < MAX_MONTH_ARCHIVE) kept.push(k);
  });
  const result = {};
  kept.forEach(k => { result[k] = archive[k]; });
  return result;
}

/**
 * Xoá toàn bộ ca rảnh khi sang tháng mới.
 *
 * Quy tắc nghiệp vụ: mỗi tháng sinh viên đăng ký ca rảnh LẠI TỪ ĐẦU. Ca rảnh
 * của tháng trước không mang ý nghĩa với tháng sau, và giữ lại chỉ gây nhầm lẫn
 * — bộ xếp ca có thể dùng nhầm ca của tháng cũ.
 *
 * Dùng khoá `AVAILABILITY_MONTH` để biết ca rảnh hiện có thuộc tháng nào:
 *   - Tháng mới HƠN khoá  → xoá hết, ghi khoá tháng mới.      (sang tháng mới)
 *   - Tháng BẰNG khoá      → giữ nguyên.                     (vẫn tháng này)
 *   - Tháng CŨ HƠN khoá    → giữ nguyên, KHÔNG ghi khoá.     (quay lại xem
 *                                                                tháng cũ — không
 *                                                                được mất ca)
 *
 * So sánh theo giá trị số 'YYYYMM' để xử lý đúng ranh giới năm/tháng
 * (12/2026 → 01/2027). Đây là điểm dễ sai: nếu chỉ so "khác khoá", quay lại
 * tháng trước cũng bị xoá — tức là chỉ muốn xem lại cũng mất đăng ký.
 *
 * @param {number} month - Tháng đang mở (1-12)
 * @param {number} year  - Năm đang mở
 * @returns {{reset: boolean, cleared: number, monthKey: string}} Kết quả để ghi log/toast
 */
function resetAvailabilityIfNewMonth(month, year) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthKey = `${year}-${pad2(month)}`;
  const monthNum = (year * 100) + month;

  let storedMonth = null;
  try {
    storedMonth = localStorage.getItem(STORAGE_KEYS.AVAILABILITY_MONTH) || null;
  } catch (e) {
    storedMonth = null;
  }

    // Khoá tháng có thể đến từ 2 nơi:
    //   - localStorage của chính máy này (đã dùng nhiều lần trước)
    //   - Cloud: applyPayload() khôi phục vào localStorage khi máy mới mở lần đầu
    // Đọc ở đây đã bao gồm cả hai. Nếu Cloud chưa kịp tải về, storedMonth vẫn
    // null và nhánh dưới GIỮ NGUYÊN dữ liệu — an toàn hơn xoá nhầm.
  if (!storedMonth) {
    // MÁY MỚI (hoặc localStorage đã bị xoá): KHÔNG có khoá tháng nào để so sánh.
    //
    // Trước đây chỗ này rơi xuống dưới và xoá sạch ca rảnh của MỌI CTV, rồi
    // saveStudents(true) đẩy lên cloud — tức là mở trang quản trị lần đầu
    // trên một máy khác là mất sạch ca rảnh thật. Đã tái hiện được:
    //   58 CTV / 10 lượt ca rảnh thật  ->  0 lượt, khoá tháng tự sinh là 2026-11
    //
    // Vì không biết dữ liệu ca rảnh đang thuộc tháng nào, mà xoá nhầm thì mất
    // thật còn bỏ sót thì chỉ cần bấm "Khởi tạo lịch tháng mới" là xong —
    // thiệt hại không cân bằng nên mặc định KHÔNG xoá.
    try {
      localStorage.setItem(STORAGE_KEYS.AVAILABILITY_MONTH, monthKey);
    } catch (e) {
      console.warn('[Admin] Không lưu được tháng của ca rảnh:', e);
    }
    return { reset: false, cleared: 0, monthKey, reason: 'khong-co-khoa-thang-giu-nguyen' };
  }

  if (storedMonth) {
    const m = /^(\d{4})-(\d{2})$/.exec(storedMonth);
    if (m) {
      const storedNum = (parseInt(m[1], 10) * 100) + parseInt(m[2], 10);
      // Cùng tháng, hoặc đang xem lại tháng đã qua → giữ nguyên ca rảnh.
      if (monthNum <= storedNum) {
        return { reset: false, cleared: 0, monthKey };
      }
    }
  }

  // Xoá ca rảnh của mọi CTV. `availableShifts` là dạng đã gộp 4 tuần, nên
  // phải xoá cả hai để không còn sót ở đường đọc nào.
  let cleared = 0;
  (state.students || []).forEach((s) => {
    const hadAny = (Array.isArray(s.availableShifts) && s.availableShifts.length > 0)
      || (s.monthlyAvailableShifts
          && Object.values(s.monthlyAvailableShifts).some(v => Array.isArray(v) && v.length > 0));
    if (hadAny) cleared += 1;
    s.availableShifts = [];
    s.monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
  });

  try {
    localStorage.setItem(STORAGE_KEYS.AVAILABILITY_MONTH, monthKey);
  } catch (e) {
    console.warn('[Admin] Không lưu được tháng của ca rảnh:', e);
  }

  if (cleared > 0) saveStudents(true);
  return { reset: true, cleared, monthKey };
}

async function switchAdminMonth(targetMonth, targetYear, autoBackup = true) {
    targetMonth = parseInt(targetMonth, 10);
    targetYear = parseInt(targetYear, 10);
    if (!targetMonth || !targetYear) return;

    if (targetMonth === state.currentMonth && targetYear === state.currentYear) {
      return;
    }

    const oldMonth = state.currentMonth || 10;
    const oldYear = state.currentYear || 2026;
    const pad2 = (n) => String(n).padStart(2, '0');

    // 1. Tự động sao lưu tháng cũ nếu có ca trực đã xếp (theo yêu cầu của Tris)
    if (autoBackup && state.monthSchedule && state.monthSchedule.weeks && state.monthSchedule.weeks.length > 0) {
      const backupName = `Bản Chấm Công & Tự Động Sao Lưu Tháng ${pad2(oldMonth)}/${oldYear} (Chuyển kỳ)`;
      try {
        createWebBackup(backupName);
        renderWebBackupsTable();
        showToast(`📦 ĐÃ TỰ ĐỘNG SAO LƯU THÁNG ${pad2(oldMonth)}/${oldYear} VÀO BẢN SAO LƯU WEB & ĐÁM MÂY!`, 'info', 3500);
      } catch (bkErr) {
        console.warn('Lỗi tự động sao lưu khi chuyển tháng:', bkErr);
      }
    }

    // Lưu lịch của tháng cũ vào kho lưu trữ allMonthSchedules
    let allMonths = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ALL_MONTHS);
      if (raw) allMonths = JSON.parse(raw) || {};
    } catch (e) {
      allMonths = {};
    }

    if (state.monthSchedule) {
      allMonths[`${oldYear}-${pad2(oldMonth)}`] = state.monthSchedule;
      try {
        localStorage.setItem(STORAGE_KEYS.ALL_MONTHS, JSON.stringify(allMonths));
      } catch (e) {
        // ⚠️ TRƯỚC ĐÂY `catch (e) {}` — lỗi hết dung lượng bị nuốt hoàn toàn.
        // Người dùng thấy thông báo "Đã chuyển sang Tháng X" trong khi lịch
        // tháng cũ đã bị mất vĩnh viễn, không có cảnh báo nào.
        // Mỗi monthSchedule ~108KB; 24 tháng = 2.5MB, 36 tháng = 3.8MB,
        // vượt quota 5MB kèm 6 bản sao lưu web.
        // Thử lại sau khi cắt bớt các tháng cũ nhất (xem MAX_MONTH_ARCHIVE).
        const trimmed = trimMonthArchive(allMonths, `${oldYear}-${pad2(oldMonth)}`);
        try {
          localStorage.setItem(STORAGE_KEYS.ALL_MONTHS, JSON.stringify(trimmed));
          showToast(`⚠️ Bộ nhớ đã đầy — đã tự động dọn lịch sử, chỉ giữ ${MAX_MONTH_ARCHIVE} tháng gần nhất (đã lưu lịch tháng ${pad2(oldMonth)}/${oldYear}).`, 'warning', 7000);
        } catch (e2) {
          showToast(`⚠️ BỘ NHỚ TRÌNH DUYỆT ĐÃ ĐẦY — không lưu được lịch tháng ${pad2(oldMonth)}/${oldYear} vào lịch sử. Hãy xoá bớt Sao Lưu cũ trong Trung Tâm Sao Lưu.`, 'error', 9000);
          console.error('[Admin] Không lưu được kho lịch tháng:', e2);
        }
      }
    }

    // 2. Chuyển sang tháng mới
    state.currentMonth = targetMonth;
    state.currentYear = targetYear;
    try {
      // Nguồn sự thật DUY NHẤT cho tháng đang áp dụng.
      // Trước đây còn ghi thêm 2 key legacy (ts_scheduler_active_month/_year)
      // chỉ để admin.js tự đọc lại — nhưng student.js KHÔNG đọc chúng, dẫn tới
      // hai nguồn sự thật song song dễ lệch nhau. Đã gỡ hoàn toàn.
      localStorage.setItem(STORAGE_KEYS.ACTIVE_MONTH, JSON.stringify({ month: targetMonth, year: targetYear }));
    } catch (e) {
      console.warn('[Admin] Không lưu được tháng đang áp dụng:', e);
    }

    // 2b. Sang tháng mới → xoá ca rảnh cũ, mọi CTV đăng ký lại từ đầu.
    // Quay lại xem tháng đã có lịch thì KHÔNG xoá (khoá tháng khớp).
    const availabilityReset = resetAvailabilityIfNewMonth(targetMonth, targetYear);

    // 3. Khôi phục lịch tháng mới nếu đã lưu trước đó, hoặc tự động phân bổ lịch cho tháng mới
    const targetKey = `${targetYear}-${pad2(targetMonth)}`;
    if (allMonths[targetKey]) {
      state.monthSchedule = allMonths[targetKey];
      state.twoWeekSchedule = allMonths[targetKey];
      const weekIdx = Math.min(Math.max(1, state.viewWeek || 1), 4) - 1;
      state.currentSchedule = state.monthSchedule.weeks?.[weekIdx] || state.monthSchedule.week1 || state.monthSchedule;
      saveSchedule(true);
    } else {
      runFullSchedule();
    }

    // 4. Cập nhật giao diện
    const monthLabelForReset = `${pad2(targetMonth)}/${targetYear}`;
    if (availabilityReset.reset && availabilityReset.cleared > 0) {
      // Xoá ca rảnh phải nói rõ: người dùng cần biết vì sao mọi đăng ký biến mất.
      showToast(
        `🔄 Đã mở đăng ký ca rảnh cho tháng ${monthLabelForReset}: xoá ca rảnh cũ của ${availabilityReset.cleared} CTV. `
        + 'Các bạn cần tick lại ca rảnh cho tháng này.',
        'info', 6000
      );
    }

    updateMonthNavigatorUI();
    renderAll();

    // 5. Đồng bộ lên Firebase Cloud
    if (window.CloudSyncManager && typeof window.CloudSyncManager.pushToCloud === 'function') {
      window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Month switch error:', err));
    }

    const monthLabel = (targetMonth === 1 && targetYear === 2027) ? 'Tháng 01/2027 (Kỳ 13)' : `Tháng ${pad2(targetMonth)}/${targetYear}`;
    showToast(`📅 Đã chuyển sang ${monthLabel}! Bảng phân công đã được cập nhật ngày tháng tương ứng.`, 'success', 4000);
  }

  function goToNextMonth() {
    let nextMonth = (state.currentMonth || 10) + 1;
    let nextYear = state.currentYear || 2026;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    switchAdminMonth(nextMonth, nextYear, true);
  }

  function goToPrevMonth() {
    let prevMonth = (state.currentMonth || 10) - 1;
    let prevYear = state.currentYear || 2026;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    switchAdminMonth(prevMonth, prevYear, true);
  }

  function bindMonthNavigatorEvents() {
    elements.btnPrevMonth?.addEventListener('click', goToPrevMonth);
    elements.btnNextMonth?.addEventListener('click', goToNextMonth);
    elements.selectQuickMonth?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        const parts = val.split('-');
        if (parts.length === 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          switchAdminMonth(m, y, true);
        }
      }
    });
  }


// ------------------------------------------------------------------
  // XÁC NHẬN 2 BƯỚC cho thao tác xóa sạch dữ liệu
  //
  // confirm() của trình duyệt chỉ có 1 bước: bấm nhầm là mất luôn cả bảng
  // phân công 4 tuần hoặc cả 58 CTV — mà mất thì chỉ khôi phục được từ bản
  // sao lưu trên web, tốn công nhập lại tay. Bước 2 bắt gõ đúng từ khoá
  // để người dùng phải đọc và xác nhận đúng ý mình.
  //
  // Dùng lại class CSS sẵn có (.modal-overlay + .active, .btn-danger-outline,
  // .form-input) nên không phải thêm dòng CSS nào. Ẩn/hiện bằng CẢ thuộc
  // tính `hidden` lẫn class `active` để không phụ thuộc giá trị display mặc
  // định của .modal-overlay.
  // ------------------------------------------------------------------
  let dangerConfirmResolver = null;

  const ensureDangerConfirmModal = () => {
    const existing = document.getElementById('danger-confirm-overlay');
    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'danger-confirm-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="danger-confirm-title">
        <div class="modal-header">
          <h3 class="modal-title" id="danger-confirm-title"></h3>
        </div>
        <div class="modal-body">
          <p id="danger-confirm-msg" style="white-space: pre-line;"></p>
          <ul id="danger-confirm-list" style="margin: .6rem 0 0; padding-left: 1.2rem;"></ul>
          <label for="danger-confirm-input" id="danger-confirm-hint"
                 style="display: block; margin: 1rem 0 .4rem; font-weight: 700;"></label>
          <input type="text" id="danger-confirm-input" class="form-input"
                 autocomplete="off" autocapitalize="characters" spellcheck="false">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="danger-confirm-cancel">Huỷ bỏ</button>
          <button type="button" class="btn btn-danger-outline" id="danger-confirm-ok" disabled></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#danger-confirm-input');
    const okBtn = overlay.querySelector('#danger-confirm-ok');
    input.addEventListener('input', () => {
      const want = (overlay.dataset.keyword || '').toUpperCase();
      okBtn.disabled = input.value.trim().toUpperCase() !== want;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !okBtn.disabled) { e.preventDefault(); closeDangerConfirm(true); }
      if (e.key === 'Escape') { e.preventDefault(); closeDangerConfirm(false); }
    });
    okBtn.addEventListener('click', () => closeDangerConfirm(true));
    overlay.querySelector('#danger-confirm-cancel').addEventListener('click', () => closeDangerConfirm(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDangerConfirm(false); });
    return overlay;
  };

  function closeDangerConfirm(accepted) {
    const resolver = dangerConfirmResolver;
    dangerConfirmResolver = null;
    const overlay = document.getElementById('danger-confirm-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.querySelector('#danger-confirm-input').value = '';
      overlay.querySelector('#danger-confirm-ok').disabled = true;
    }
    if (typeof resolver === 'function') resolver(!!accepted);
  }

  // Trả về Promise<boolean>: true = đã gõ đúng từ khoá và bấm nút xác nhận.
  const confirmDangerAction = ({ title, message, losses = [], keyword, confirmLabel }) => {
    // Còn một hộp thoại nào đang mở dở -> coi như huỷ, tránh mất resolver.
    if (dangerConfirmResolver) closeDangerConfirm(false);

    // Môi trường không dựng được DOM thật (unit test dùng mock DOM thiếu
    // querySelector/dataset, hoặc trình duyệt quá cũ): lùi về confirm() gốc để
    // thao tác vẫn chạy được, thay vì treo vô hạn ở một Promise không ai giải.
    const fallBackToNativeConfirm = (err) => {
      console.warn('[confirmDangerAction] Không dựng được hộp thoại, dùng confirm():', err);
      try {
        const bad = document.getElementById('danger-confirm-overlay');
        if (bad && bad.parentElement) bad.parentElement.removeChild(bad);
      } catch (_) { /* không dọn được thì kệ */ }
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    };

    let overlay;
    try {
      overlay = ensureDangerConfirmModal();
      if (!overlay.dataset || typeof overlay.querySelector !== 'function') {
        throw new Error('overlay không có dataset/querySelector');
      }
    } catch (err) {
      return fallBackToNativeConfirm(err);
    }

    try {
      overlay.dataset.keyword = keyword;
      overlay.querySelector('#danger-confirm-title').textContent = title;
      overlay.querySelector('#danger-confirm-msg').textContent = message;
      overlay.querySelector('#danger-confirm-hint').textContent = `Gõ đúng "${keyword}" để xác nhận:`;

      const list = overlay.querySelector('#danger-confirm-list');
      list.innerHTML = '';
      losses.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });

      const okBtn = overlay.querySelector('#danger-confirm-ok');
      okBtn.textContent = confirmLabel;
      okBtn.disabled = true;
      const input = overlay.querySelector('#danger-confirm-input');
      input.value = '';
    } catch (err) {
      return fallBackToNativeConfirm(err);
    }

    overlay.hidden = false;
    overlay.classList.add('active');
    // KHÔNG dùng biến `input` ở đây: nó khai báo bên trong khối try nên không
    // có phạm vi ở ngoài -> ReferenceError. Truy lại qua overlay cho chắc.
    setTimeout(() => overlay.querySelector('#danger-confirm-input')?.focus(), 30);

    return new Promise((resolve) => { dangerConfirmResolver = resolve; });
  };

  // Đếm tổng số lượt ca rảnh đã đăng ký của một danh sách CTV (để hiện trong cảnh báo).
  const countRegisteredShifts = (list) => (list || []).reduce(
    (total, s) => total + Object.values(s.monthlyAvailableShifts || {})
      .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
    0
  );

  function bindEvents() {
    bindMonthNavigatorEvents();
    elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    elements.filterButtons.forEach(btn => {
      if (btn.hasAttribute('data-filter')) {
        btn.addEventListener('click', () => {
          elements.filterButtons.forEach(b => {
            if (b.hasAttribute('data-filter')) b.classList.remove('active');
          });
          btn.classList.add('active');
          state.roleFilter = btn.getAttribute('data-filter');
          renderStudentTable();
        });
      }
    });

    // Bộ chọn Tuần 1 -> Tuần 4 (Lịch 1 Tháng)
    document.querySelectorAll('#admin-week-selector .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.getAttribute('data-week'), 10) || 1;
        switchAdminWeek(w);
      });
    });

    elements.inputSearch?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderStudentTable();
    });

    // Tự động phân bổ lịch
    elements.btnAutoSchedule?.addEventListener('click', () => {
      triggerAutoSchedule(true);
    });


    // Xóa bảng phân công ca trực (vẫn giữ nguyên danh sách sinh viên)
    elements.btnClearSchedule?.addEventListener('click', async () => {
      if (!state.currentSchedule && !state.twoWeekSchedule && !state.monthSchedule) {
        showToast('Hiện tại chưa có bảng phân công nào để xóa!', 'info');
        return;
      }
      const weeks = state.monthSchedule?.weeks?.length || 4;
      const filled = (state.monthSchedule?.weeks || []).reduce(
        (total, w) => total + Object.values(w.scheduleTable || {})
          .filter((cell) => cell && cell.status === 'full').length,
        0
      );
      const accepted = await confirmDangerAction({
        title: 'Xóa toàn bộ bảng phân công ca trực',
        message: `Bảng phân công ${weeks} tuần sẽ bị xóa sạch. `
          + 'Muốn khôi phục thì phải xếp ca lại từ đầu — ca rảnh CTV đã đăng ký vẫn còn nguyên.',
        losses: [
          `${filled} ca đang có người trực sẽ trống`,
          'Bảng phân công của cả tháng (không chỉ tuần đang xem)',
          'Danh sách CTV và ca rảnh đã đăng ký: GIỮ NGUYÊN',
        ],
        keyword: 'XOA LICH',
        confirmLabel: 'Xóa bảng phân công',
      });
      if (!accepted) return;

      state.currentSchedule = null;
      state.twoWeekSchedule = null;
      state.monthSchedule = null;
      localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.MONTH_SCHEDULE);
      saveSchedule();
      renderAll();
      if (typeof renderUteSheetPreview === 'function') {
        renderUteSheetPreview();
      }
      showToast('Đã xóa sạch toàn bộ bảng phân công 4 tuần! Danh sách sinh viên vẫn được giữ nguyên.', 'success');
    });

    // Xóa toàn bộ sinh viên và lịch trực
    const handleClearAllStudents = async () => {
      if (state.students.length === 0) {
        showToast('Danh sách sinh viên hiện đang trống!', 'info');
        return;
      }
      const totalShifts = countRegisteredShifts(state.students);
      const accepted = await confirmDangerAction({
        title: 'Xóa toàn bộ danh sách CTV',
        message: `Toàn bộ ${state.students.length} CTV sẽ bị xóa khỏi hệ thống. `
          + 'Sau khi xóa, không ai đăng nhập được vào Cổng Đăng Ký nữa.',
        losses: [
          `${state.students.length} hồ sơ CTV (cả Chính Thức lẫn Tập Sự)`,
          `${totalShifts} lượt ca rảnh đã đăng ký`,
          'Toàn bộ bảng phân công ca trực',
          'Các đề xuất đổi ca đang chờ duyệt',
        ],
        keyword: 'XOA SV',
        confirmLabel: `Xóa ${state.students.length} CTV`,
      });
      if (!accepted) return;

      state.students = [];
      state.currentSchedule = null;
      state.twoWeekSchedule = null;
      state.monthSchedule = null;
      localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.MONTH_SCHEDULE);
      saveStudents();
      saveSchedule();
      renderAll();
      if (typeof renderUteSheetPreview === 'function') {
        renderUteSheetPreview();
      }
      showToast('Đã xóa toàn bộ danh sách sinh viên và làm trống hệ thống!', 'info');
    };

    elements.btnClearStudents?.addEventListener('click', handleClearAllStudents);
    elements.btnResetData?.addEventListener('click', handleClearAllStudents);

    elements.btnExportCsv?.addEventListener('click', exportScheduleToCsv);
    // In lịch — chụp bản sao lưu trước, chuyển sang toàn cảnh 4 tuần, rồi mới in.
    //
    // Trước đây nút này gọi thẳng window.print() nên chỉ in đúng tuần đang xem.
    // Nhưng 2 nút chuyển chế độ xem lại bị @media print ẩn đi, nên người dùng
    // không còn cách bấm "Toàn Cảnh 1 Tháng" rồi in — chỉ còn cách in 1 tuần.
    // Vì vậy chuyển chế độ phải nằm TRƯỚC khi in, ở đây.
    elements.btnPrintSchedule?.addEventListener('click', async () => {
      try {
        await createWebBackup('Trước khi in lịch');
      } catch (e) {
        console.warn('[Admin] Không chụp được bản sao lưu trước khi in:', e);
      }

      const masterBtn = elements.btnViewMasterMonth;
      if (masterBtn && !masterBtn.classList.contains('active')) {
        masterBtn.click();
        await new Promise((r) => setTimeout(r, 450));   // chờ render xong bảng 4 tuần
      }

      window.print();
    });

    // Mở modal xuất Excel / Google Sheets
    elements.btnOpenExcelModal?.addEventListener('click', () => {
      openExcelModal();
    });

    // Sao chép nhanh bảng để dán vào Google Sheets (Quick Copy 1-Click)
    elements.btnQuickCopySheet?.addEventListener('click', () => {
      copyUteSheetToClipboard(true);
    });

    // Đóng modal Excel
    elements.btnCloseExcelModal?.addEventListener('click', closeExcelModal);
    elements.excelModal?.addEventListener('click', (e) => {
      if (e.target === elements.excelModal) closeExcelModal();
    });

    // Thay đổi cấu hình ngày / phạm vi -> render lại preview bảng tính
    elements.exportStartDate?.addEventListener('change', renderUteSheetPreview);
    elements.exportRangeSelect?.addEventListener('change', renderUteSheetPreview);

    // Các nút thao tác trong modal Excel
    elements.btnModalCopyClipboard?.addEventListener('click', () => copyUteSheetToClipboard(false));
    elements.btnModalDownloadXls?.addEventListener('click', downloadUteExcelFile);
    elements.btnModalDownloadCsv?.addEventListener('click', downloadUteCsvFile);
    elements.btnModalPrintSheet?.addEventListener('click', printUteSheet);

    elements.modalCloseBtn?.addEventListener('click', closeReassignModal);
    elements.modalCancelBtn?.addEventListener('click', closeReassignModal);
    elements.modalSaveBtn?.addEventListener('click', saveManualReassignment);
    elements.reassignModal?.addEventListener('click', (e) => {
      if (e.target === elements.reassignModal) closeReassignModal();
    });

    elements.btnOpenAddStudent?.addEventListener('click', openAddStudentModal);
    elements.btnCloseStudentModal?.addEventListener('click', closeStudentModal);
    elements.btnCancelStudentModal?.addEventListener('click', closeStudentModal);
    elements.adminStudentForm?.addEventListener('submit', handleSaveStudentForm);
    elements.studentModal?.addEventListener('click', (e) => {
      if (e.target === elements.studentModal) closeStudentModal();
    });

    elements.btnAdminQuickAll?.addEventListener('click', () => {
      elements.adminSlotCbs.forEach(cb => cb.checked = true);
    });
    elements.btnAdminQuickClear?.addEventListener('click', () => {
      elements.adminSlotCbs.forEach(cb => cb.checked = false);
    });
    elements.btnAdminModalClearShifts?.addEventListener('click', () => {
      elements.adminSlotCbs.forEach(cb => cb.checked = false);
      showToast('Đã xóa tất cả ca chọn trong bảng (đưa về 0 ca). Bấm "Lưu Thông Tin" để hoàn tất.', 'info');
    });

    // Bulk Multi-Select Actions (Task 2)
    elements.cbStudentSelectAll?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.cb-student-row').forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkStudentActions();
    });

    elements.studentTableBody?.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('cb-student-row')) {
        updateBulkStudentActions();
      }
    });

    elements.btnBulkRoleOld?.addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.cb-student-row:checked')).map(cb => cb.dataset.id);
      if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 sinh viên!', 'warning');
        return;
      }
      state.students.forEach(s => {
        if (selectedIds.includes(s.id)) {
          s.role = 'old';
          s.updatedAt = Date.now();
        }
      });
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã chuyển ${selectedIds.length} sinh viên sang Chính Thức!`, 'success');
    });

    elements.btnBulkRoleNew?.addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.cb-student-row:checked')).map(cb => cb.dataset.id);
      if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 sinh viên!', 'warning');
        return;
      }
      state.students.forEach(s => {
        if (selectedIds.includes(s.id)) {
          s.role = 'new';
          s.updatedAt = Date.now();
        }
      });
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã chuyển ${selectedIds.length} sinh viên sang Tập Sự!`, 'success');
    });

elements.btnBulkClearShifts?.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.cb-student-row:checked')).map(cb => cb.dataset.id);
      if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 sinh viên!', 'warning');
        return;
      }
      const dcclrMany = await confirmDangerAction({
        title: "Xóa ca rảnh của CTV đã chọn",
        message: "${selectedIds.length} CTV đã chọn sẽ bị xóa sạch toàn bộ ca rảnh, đưa về 0 ca.",
        losses: ["Toàn bộ ca rảnh của ${selectedIds.length} CTV đã chọn", "Hồ sơ CTV: GIỮ NGUYÊN"],
        keyword: 'XOA CA RANH',
        confirmLabel: "Xóa ca rảnh của ${selectedIds.length} CTV",
      });
      if (!dcclrMany) {
        return;
      }
      state.students.forEach(s => {
        if (selectedIds.includes(s.id)) {
          s.availableShifts = [];
          s.monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
          s.updatedAt = Date.now();
        }
      });
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã xóa sạch ca rảnh của ${selectedIds.length} sinh viên!`, 'success');
    });

elements.btnBulkDeleteStudents?.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.cb-student-row:checked')).map(cb => cb.dataset.id);
      if (selectedIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 sinh viên!', 'warning');
        return;
      }
      const dcdelMany = await confirmDangerAction({
        title: "Xóa CTV đã chọn khỏi danh sách",
        message: "${selectedIds.length} CTV đã chọn sẽ bị xóa khỏi danh sách. Thao tác này không thể hoàn tác.",
        losses: ["${selectedIds.length} hồ sơ CTV đã chọn", "Toàn bộ ca rảnh và lịch trực của họ"],
        keyword: 'XOA NTV',
        confirmLabel: "Xóa ${selectedIds.length} CTV",
      });
      if (!dcdelMany) {
        return;
      }
      state.students = state.students.filter(s => !selectedIds.includes(s.id));
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã xóa ${selectedIds.length} sinh viên khỏi danh sách!`, 'success');
    });

    elements.btnLoadUtePreset?.addEventListener('click', loadUtePresetStudents);

    // Hỗ trợ phím tắt Escape để đóng nhanh các modal quản trị (Task 3)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        // 1. Modal Cấp quyền & Đổi mật khẩu
        if (elements.userMgmtModal?.classList.contains('active')) {
          elements.userMgmtModal.classList.remove('active');
        }
        // 2. Modal Quản lý Đổi ca
        const swapModal = elements.modalManageSwaps || document.getElementById('modal-manage-swaps');
        if (swapModal && (swapModal.classList.contains('active') || swapModal.style.display === 'flex')) {
          closeSwapMgmtModal();
        }
        // 3. Modal Tinh chỉnh phân công ca trực
        if (elements.reassignModal?.classList.contains('active')) {
          closeReassignModal();
        }
        // 4. Modal Thêm / Sửa sinh viên
        if (elements.studentModal?.classList.contains('active')) {
          closeStudentModal();
        }
        // 5. Modal Bảng tính Excel / Google Sheets
        if (elements.excelModal?.classList.contains('active')) {
          closeExcelModal();
        }
        // 6. Modal Nhập Excel / CSV
        if (elements.importModal?.classList.contains('active')) {
          closeImportModal();
        }
        // 7. Modal Sao lưu & Phục hồi dữ liệu
        const backupModal = elements.modalBackupCenter || document.getElementById('modal-backup-center');
        if (backupModal && (backupModal.classList.contains('active') || backupModal.style.display === 'flex')) {
          closeBackupCenterModal();
        }
      }
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabId);
    });

    // Tab Sự Kiện: nạp dữ liệu mỗi khi mở để luôn thấy bản mới nhất
    if (tabId === 'tab-event-mgmt' && typeof window.renderEventsTable === 'function') {
      window.renderEventsTable();
    }
  }

  function triggerAutoSchedule(animate = true) {
    if (state.students.length === 0) {
      showToast('Chưa có CTV nào trong danh sách. Hãy nhập file CSV danh sách trước khi xếp ca.', 'warning');
      return;
    }

    if (animate && elements.btnAutoSchedule) {
      const originalText = elements.btnAutoSchedule.innerHTML;
      elements.btnAutoSchedule.innerHTML = '<span>⚡ Đang tối ưu thuật toán…</span>';
      elements.btnAutoSchedule.disabled = true;

      setTimeout(() => {
        runFullSchedule();
        elements.btnAutoSchedule.innerHTML = originalText;
        elements.btnAutoSchedule.disabled = false;
        renderAll();
        const msg = state.twoWeekSchedule 
          ? `Đã xếp lịch luân phiên 2 tuần: ${state.twoWeekSchedule.uniqueAssignedCount}/${state.twoWeekSchedule.totalStudents} bạn có ca!`
          : 'Đã hoàn tất phân bổ ca trực 1 cũ + 1 mới!';
        showToast(msg, 'success');
      }, 350);
    } else {
      runFullSchedule();
      renderAll();
    }
  }

  function renderAll() {
    renderSummary();
    renderStudentTable();
    renderNeedsAction();
    updateMonthNavigatorUI();
    if (state.viewMode === 'master') {
      renderMasterMonthGrid();
    } else {
      renderTimetable();
    }
    renderFairness();
    updateStickyHeroStats();
  }

  function renderSummary() {
    const total = state.students.length;
    const oldStudents = state.students.filter(s => s.role === 'old').length;
    const newStudents = state.students.filter(s => s.role === 'new').length;

    if (elements.totalStudentsCount) elements.totalStudentsCount.textContent = total;
    if (elements.oldStudentsCount) elements.oldStudentsCount.textContent = oldStudents;
    if (elements.newStudentsCount) elements.newStudentsCount.textContent = newStudents;
    if (elements.badgeAdminStudentCount) elements.badgeAdminStudentCount.textContent = total;

    if (elements.filledShiftsCount) {
      if (state.monthSchedule?.weeks) {
        let totalFull = 0;
        state.monthSchedule.weeks.forEach(w => {
          totalFull += w.summary?.fullShifts || 0;
        });
        elements.filledShiftsCount.textContent = `${totalFull}/40 ca`;
      } else {
        const fullShifts = state.currentSchedule?.summary?.fullShifts || 0;
        elements.filledShiftsCount.textContent = `${fullShifts}/10 ca`;
      }
    }
  }

  function updateBulkStudentActions() {
    const rowCheckboxes = document.querySelectorAll('.cb-student-row');
    const checkedBoxes = document.querySelectorAll('.cb-student-row:checked');
    const count = checkedBoxes.length;
    const bulkBar = elements.bulkStudentActions || document.getElementById('bulk-student-actions');
    const countEl = elements.bulkSelectedCount || document.getElementById('bulk-selected-count');
    const selectAllCb = elements.cbStudentSelectAll || document.getElementById('cb-student-select-all');

    if (countEl) countEl.textContent = count;
    if (bulkBar) {
      bulkBar.style.display = count > 0 ? 'flex' : 'none';
    }
    if (selectAllCb) {
      if (rowCheckboxes.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else {
        selectAllCb.checked = count === rowCheckboxes.length;
        selectAllCb.indeterminate = count > 0 && count < rowCheckboxes.length;
      }
    }
  }

  /**
 * Khối "Cần xử lý": số liệu SỐNG thay vì checklist tĩnh.
 *
 * Trước đây khối này chỉ là hướng dẫn liên kết tới 3 chỗ khác. Người xếp ca
 * phải tự đi tìm xem ai chưa đăng ký, có bao nhiêu đề xuất đổi ca, cổng đóng
 * lúc nào — mỗi thứ một chỗ. Nay đếm thẳng ở đây.
 *
 * Ô nào không có gì để làm thì ẩn hẳn, không hiện số 0.
 */
function renderNeedsAction() {
  const setItem = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  };

  // 1. CTV chưa đăng ký ca rảnh nào — không xếp được ca cho họ.
  const total = state.students.length;
  const noShift = state.students.filter((s) => {
    const weekly = s.monthlyAvailableShifts
      && Object.values(s.monthlyAvailableShifts).some((arr) => Array.isArray(arr) && arr.length > 0);
    const flat = Array.isArray(s.availableShifts) && s.availableShifts.length > 0;
    return !weekly && !flat;
  }).length;
  if (total === 0) {
    setItem('need-count-no-shift', '');
  } else {
    setItem('need-count-no-shift', noShift > 0
      ? `${noShift}/${total} CTV chưa đăng ký ca rảnh nào`
      : `Tất cả ${total} CTV đã đăng ký ca rảnh`);
  }

  // 2. Đề xuất đổi ca chờ duyệt — đọc cùng nguồn với updateSwapCountBadges().
  let pending = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) pending = list.filter((r) => r.status === 'pending').length;
    }
  } catch (e) { pending = 0; }
  setItem('need-count-swap-pending', pending > 0 ? `${pending} đề xuất đổi ca chờ duyệt` : '');

  // 3. Cổng đăng ký đóng lúc nào.
  const cfg = state.regConfig || {};
  if (cfg.mode === 'always_open') {
    setItem('need-reg-deadline-text', 'Cổng đăng ký đang mở tự do');
  } else if (cfg.mode === 'always_closed') {
    setItem('need-reg-deadline-text', 'Cổng đăng ký đang đóng');
  } else {
    const fmt = (v) => {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };
    const open = fmt(cfg.startTime);
    const close = fmt(cfg.endTime);
    if (open && close) setItem('need-reg-deadline-text', `Cổng mở ${open} · đóng ${close}`);
    else if (close) setItem('need-reg-deadline-text', `Cổng đóng lúc ${close}`);
    else setItem('need-reg-deadline-text', 'Cổng đăng ký theo khung giờ đã đặt');
  }
}

function renderStudentTable() {
    if (!elements.studentTableBody) return;

    let filtered = [...state.students];

    if (state.roleFilter !== 'all') {
      filtered = filtered.filter(s => s.role === state.roleFilter);
    }

    if (state.searchQuery) {
      filtered = filtered.filter(s => 
        s.fullName.toLowerCase().includes(state.searchQuery) ||
        s.studentId.toLowerCase().includes(state.searchQuery)
      );
    }

    if (filtered.length === 0) {
      // Phân biệt 2 nguyên nhân rất khác nhau:
      //  - Chưa nạp danh sách: cần import CSV. Đây là trạng thái bình thường
      //    sau khi gỡ danh sách mẫu 30 người.
      //  - Đã có danh sách nhưng bộ lọc không khớp.
      const rosterEmpty = !state.students || state.students.length === 0;
      elements.studentTableBody.innerHTML = rosterEmpty
        ? `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-state-icon">📥</div>
              <h3>Danh sách CTV chưa được nạp</h3>
              <p>Danh sách 58 CTV không nằm sẵn trong mã nguồn. Hãy nhập file CSV danh sách một lần — dữ liệu được lưu trong máy và đồng bộ đám mây.</p>
              <p style="margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted)">Định dạng CSV: <code>STT, Họ tên, MSSV, Email, Vai trò</code></p>
            </div>
          </td>
        </tr>
      `
        : `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <h3>Không tìm thấy CTV nào khớp bộ lọc</h3>
              <p>Danh sách có ${state.students.length} người nhưng không có ai khớp điều kiện lọc. Xoá bộ lọc hoặc thử từ khoá khác.</p>
            </div>
          </td>
        </tr>
      `;
      updateBulkStudentActions();
      return;
    }

    const assignedCounts = state.currentSchedule?.studentStats || {};
    const combinedStats = state.twoWeekSchedule?.combinedStats || {};

    elements.studentTableBody.innerHTML = filtered.map((s, index) => {
      const isOld = s.role === 'old';
      const roleBadge = isOld 
        ? `<span class="badge badge-role-old">🎓 Chính Thức</span>` 
        : `<span class="badge badge-role-new">🌱 Tập Sự</span>`;
      
      const currentAssigned = assignedCounts[s.id]?.assignedCount || 0;
      const totalTwoWeeks = combinedStats[s.id]?.totalCount || currentAssigned;
      
      const shiftTags = (s.availableShifts || []).map(id => {
        const info = SHIFT_MAP[id];
        return info ? `<span class="shift-tag">${info.dayName} ${info.period}</span>` : '';
      }).join('');

      return `
        <tr>
          <td style="text-align: center;"><input type="checkbox" class="cb-student-row" data-id="${escapeHtml(s.id)}"></td>
          <td style="font-weight: 600; color: #94a3b8;">#${index + 1}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(s.fullName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${s.phone ? 'SĐT: ' + escapeHtml(s.phone) : 'Chưa có SĐT'}</div>
          </td>
          <td><code style="font-weight: 700; color: var(--primary);">${escapeHtml(s.studentId)}</code></td>
          <td>${roleBadge}</td>
          <td>
            <div class="shift-tag-list">${shiftTags}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">
              Rảnh <strong>${s.availableShifts?.length || 0}</strong> ca
            </div>
          </td>
          <td>
            <strong style="color: var(--primary); font-size: 1rem;">${currentAssigned}</strong> ca tuần này
            ${state.twoWeekSchedule ? `<div style="font-size: 0.72rem; color: var(--text-muted);">(Tổng 2 tuần: ${totalTwoWeeks} ca)</div>` : ''}
          </td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" onclick="window.adminEditStudent('${escapeHtml(s.id)}')" title="Sửa thông tin & ca rảnh">✏️ Sửa</button>
              <button class="btn btn-warning-outline btn-sm" onclick="window.adminClearStudentShifts('${escapeHtml(s.id)}')" title="Xóa toàn bộ ca rảnh của bạn này (về 0 ca)">🧹 Xóa ca</button>
              <button class="btn btn-danger-outline btn-sm" onclick="window.adminDeleteStudent('${escapeHtml(s.id)}')" title="Xóa">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    updateBulkStudentActions();
  }

  function renderTimetable() {
    if (!elements.timetableGrid) return;

    const schedule = state.currentSchedule?.scheduleTable || {};
    const days = [
      { key: 'T2', name: 'Thứ Hai', sub: 'Thứ 2' },
      { key: 'T3', name: 'Thứ Ba', sub: 'Thứ 3' },
      { key: 'T4', name: 'Thứ Tư', sub: 'Thứ 4' },
      { key: 'T5', name: 'Thứ Năm', sub: 'Thứ 5' },
      { key: 'T6', name: 'Thứ Sáu', sub: 'Thứ 6' }
    ];

    const curM = state.currentMonth || 10;
    const curY = state.currentYear || 2026;
    let calendarWeeks = [];
    if (window.SchedulerEngine && window.SchedulerEngine.MonthCalendarHelper) {
      calendarWeeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(curM, curY);
    } else if (state.monthSchedule && state.monthSchedule.calendarWeeks) {
      calendarWeeks = state.monthSchedule.calendarWeeks;
    }

    const currentWeekIdx = Math.min(Math.max(1, state.viewWeek || 1), 4) - 1;
    const activeWeekCalendar = calendarWeeks[currentWeekIdx] || null;

    let gridHtml = '';

    const weekRangeLabel = activeWeekCalendar ? ` (${activeWeekCalendar.startDateStr} - ${activeWeekCalendar.endDateStr})` : '';
    gridHtml += `
      <div class="grid-cell grid-header">
        <span class="day-name">Ca / Ngày</span>
        <span class="day-sub" style="font-size:0.75rem; color:var(--primary); font-weight:700;">Tuần ${state.viewWeek || 1}${weekRangeLabel}</span>
      </div>
    `;

    days.forEach(day => {
      const dayInfo = activeWeekCalendar?.days?.[day.key];
      const dateDisplay = dayInfo ? dayInfo.dateStr : '';
      gridHtml += `
        <div class="grid-cell grid-header">
          <span class="day-name">${day.name}</span>
          <span class="day-sub" style="font-weight:700; color:var(--primary); background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px; margin-top:2px; display:inline-block;">📅 ${dateDisplay || day.sub}</span>
        </div>
      `;
    });

    // Sáng (07:30 - 11:30)
    gridHtml += `
      <div class="grid-cell period-cell">
        <span class="period-name">☀️ Sáng</span>
        <span class="period-time">07:30 - 11:30</span>
      </div>
    `;
    days.forEach(day => {
      const shiftId = `${day.key}_S`;
      const slot = schedule[shiftId];
      gridHtml += renderShiftSlotHtml(shiftId, slot);
    });

    // Chiều (13:00 - 16:30)
    gridHtml += `
      <div class="grid-cell period-cell">
        <span class="period-name">🌤️ Chiều</span>
        <span class="period-time">13:00 - 16:30</span>
      </div>
    `;
    days.forEach(day => {
      const shiftId = `${day.key}_C`;
      const slot = schedule[shiftId];
      gridHtml += renderShiftSlotHtml(shiftId, slot);
    });

    elements.timetableGrid.innerHTML = gridHtml;

    // Hiển thị danh sách Dự bị / Ưu tiên cho Tuần 2
    if (elements.standbyBox) {
      const unassigned = state.currentSchedule?.unassignedMembers || [];
      if (unassigned.length > 0 && state.viewWeek === 1) {
        elements.standbyBox.style.display = 'block';
        elements.standbyBox.innerHTML = `
          <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: var(--radius-md); padding: 1rem 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: gap: 0.5rem;">
              <h4 style="color: #166534; font-weight: 700; font-size: 0.95rem;">
                📋 Danh Sách ${unassigned.length} Sinh Viên Dự Bị (Được Ưu Tiên 100% Xếp Vào Tuần 2):
              </h4>
              <button class="btn btn-primary btn-sm" id="btn-quick-switch-w2" style="font-size: 0.78rem;">
                <span>Xem Lịch Tuần 2 →</span>
              </button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
              ${unassigned.map(m => `
                <span class="badge ${m.role === 'old' ? 'badge-old' : 'badge-new'}" style="font-size: 0.78rem;">
                  ${m.role === 'old' ? '🎓' : '🌱'} ${escapeHtml(m.fullName)} (${escapeHtml(m.studentId)})
                </span>
              `).join('')}
            </div>
          </div>
        `;
        document.getElementById('btn-quick-switch-w2')?.addEventListener('click', () => {
          elements.btnWeek2?.click();
        });
      } else {
        elements.standbyBox.style.display = 'none';
      }
    }
  }

  function renderShiftSlotHtml(shiftId, slot) {
    if (!slot) {
      return `<div class="grid-cell shift-duty-slot"><div class="empty-state">Chưa xếp</div></div>`;
    }

    const oldMem = slot.oldMember;
    const newMem = slot.newMember;

    let statusPill = '';
    if (slot.status === 'full') {
      statusPill = `<span class="shift-status-pill full">✓ Đủ 2 bạn</span>`;
    } else if (slot.status === 'partial') {
      statusPill = `<span class="shift-status-pill warning">Thiếu 1 bạn</span>`;
    } else {
      statusPill = `<span class="shift-status-pill empty">Trống</span>`;
    }

    const oldCard = oldMem ? `
      <div class="duty-member-card role-old" title="Chính Thức - Có kinh nghiệm">
        <div class="member-info">
          <span class="member-role-tag">🎓 Chính Thức</span>
          <span class="member-name">${escapeHtml(oldMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(oldMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'old')" title="Đổi bạn khác">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'old')" style="cursor: pointer;" title="Nhấn để gán Chính Thức">
        <span>+ Chưa có Chính Thức</span>
      </div>
    `;

    const newCard = newMem ? `
      <div class="duty-member-card role-new" title="Tập Sự">
        <div class="member-info">
          <span class="member-role-tag">🌱 Tập Sự</span>
          <span class="member-name">${escapeHtml(newMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(newMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'new')" title="Đổi bạn khác">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'new')" style="cursor: pointer;" title="Nhấn để gán Tập Sự">
        <span>+ Chưa có Tập Sự</span>
      </div>
    `;

    return `
      <div class="grid-cell shift-duty-slot">
        <div class="shift-slot-header">
          <span>${slot.shiftInfo?.dayName || ''}</span>
          ${statusPill}
        </div>
        ${oldCard}
        ${newCard}
      </div>
    `;
  }

  function renderFairness() {
    if (!elements.fairnessListOld || !elements.fairnessListNew) return;

    const stats = state.currentSchedule?.studentStats || {};
    const oldMembers = state.students.filter(s => s.role === 'old');
    const newMembers = state.students.filter(s => s.role === 'new');

    function renderList(members, container, roleColor) {
      if (members.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">Chưa có sinh viên nhóm này.</div>`;
        return;
      }

      container.innerHTML = members.map(m => {
        const assigned = stats[m.id]?.assignedCount || 0;
        const fillPercentage = Math.min(100, Math.round((assigned / 3) * 100));

        return `
          <div class="fairness-item">
            <div class="fairness-item-left">
              <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${escapeHtml(m.fullName)}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">(${escapeHtml(m.studentId)})</span>
            </div>
            <div class="fairness-item-count">
              <div class="shift-progress-bar">
                <div class="shift-progress-fill" style="width: ${fillPercentage}%; background: ${roleColor};"></div>
              </div>
              <strong style="color: var(--text-main); font-size: 0.95rem; width: 45px; text-align: right;">${assigned} ca</strong>
            </div>
          </div>
        `;
      }).join('');
    }

    renderList(oldMembers, elements.fairnessListOld, '#6366f1');
    renderList(newMembers, elements.fairnessListNew, '#10b981');
  }

  window.adminOpenReassignModal = function(shiftId, role, weekNumber = null) {
    state.reassignModalData = { shiftId, role, weekNumber };
    const shiftInfo = SHIFT_MAP[shiftId];
    const roleTitle = role === 'old' ? 'Chính Thức' : 'Tập Sự';
    const targetSchedule = weekNumber && state.monthSchedule?.weeks?.[weekNumber - 1]
      ? state.monthSchedule.weeks[weekNumber - 1]
      : state.currentSchedule;

    if (elements.modalSlotTitle) {
      const weekPrefix = weekNumber ? `[Tuần ${weekNumber}] ` : '';
      elements.modalSlotTitle.textContent = `${weekPrefix}${shiftInfo.dayName} (${shiftInfo.period}: ${shiftInfo.time})`;
    }

    if (elements.modalRoleBadge) {
      elements.modalRoleBadge.textContent = roleTitle;
      elements.modalRoleBadge.className = `badge ${role === 'old' ? 'badge-role-old' : 'badge-role-new'}`;
    }

    const eligibleStudents = state.students.filter(s => s.role === role);
    const currentAssigned = targetSchedule?.scheduleTable?.[shiftId]?.[role === 'old' ? 'oldMember' : 'newMember'];

    let selectHtml = `<option value="">-- Để trống (Chưa gán) --</option>`;

    eligibleStudents.sort((a, b) => {
      const aAvail = (a.availableShifts || []).includes(shiftId) ? 1 : 0;
      const bAvail = (b.availableShifts || []).includes(shiftId) ? 1 : 0;
      return bAvail - aAvail;
    });

    eligibleStudents.forEach(s => {
      const isAvailable = (s.availableShifts || []).includes(shiftId);
      const isSelected = currentAssigned?.id === s.id;
      const availLabel = isAvailable ? '✓ Có rảnh ca này' : '⚠️ Không đăng ký rảnh';

      selectHtml += `
        <option value="${escapeHtml(s.id)}" ${isSelected ? 'selected' : ''}>
          ${escapeHtml(s.fullName)} (${escapeHtml(s.studentId)}) - ${availLabel}
        </option>
      `;
    });

    if (elements.modalCandidateSelect) {
      elements.modalCandidateSelect.innerHTML = selectHtml;
    }

    elements.reassignModal?.classList.add('active');
  };

  function closeReassignModal() {
    elements.reassignModal?.classList.remove('active');
    state.reassignModalData = null;
  }

  function saveManualReassignment() {
    if (!state.reassignModalData) return;

    const { shiftId, role, weekNumber } = state.reassignModalData;
    const targetSchedule = weekNumber && state.monthSchedule?.weeks?.[weekNumber - 1]
      ? state.monthSchedule.weeks[weekNumber - 1]
      : state.currentSchedule;

    if (!targetSchedule) {
      showToast('Không tìm thấy tuần/lịch cần sửa. Vui lòng tải lại trang rồi thử lại.', 'error');
      return;
    }

    const selectedStudentId = elements.modalCandidateSelect?.value;
    const newStudent = selectedStudentId ? state.students.find(s => s.id === selectedStudentId) : null;

    const slot = targetSchedule.scheduleTable?.[shiftId];
    if (!slot) {
      showToast(`Không tìm thấy ca ${shiftId} trong lịch. Lịch có thể đã thay đổi — vui lòng tải lại trang.`, 'error');
      return;
    }

    // Chặn gán sai vai trò: một Tập Sự không thể đảm nhiệm vị trí Chính Thức
    // (và ngược lại). Trước đây chỉ gán thẳng, phá vỡ luật 1 Cũ + 1 Mới.
    if (newStudent && role === 'old' && newStudent.role !== 'old') {
      showToast(`${newStudent.fullName} là Tập Sự, không thể đảm nhiệm vị trí Người Cũ (Kinh Nghiệm)!`, 'error');
      return;
    }
    if (newStudent && role === 'new' && newStudent.role !== 'new') {
      showToast(`${newStudent.fullName} là Chính Thức, không thể đảm nhiệm vị trí Người Mới (Tập Sự)!`, 'error');
      return;
    }

    // KIỂM TRA CA RẢNH. Modal có cả danh sách "⚠️ Không đăng ký rảnh" và trước
    // đây cho phép chọn -> gán ca vượt ngoài ca SV đã đăng ký.
    const realWeekNumber = weekNumber
      || ((state.monthSchedule?.weeks || []).findIndex(w => w === targetSchedule) + 1)
      || state.currentWeek
      || 1;
    if (newStudent) {
      const declared = newStudent.monthlyAvailableShifts
        ? (newStudent.monthlyAvailableShifts[realWeekNumber] || newStudent.monthlyAvailableShifts[String(realWeekNumber)])
        : newStudent.availableShifts;
      // monthlyAvailableShifts có thể là mảng rỗng (nghĩa là KHÔNG rảnh)
      if (Array.isArray(declared) && !declared.includes(shiftId)) {
        showToast(`${newStudent.fullName} KHÔNG đăng ký rảnh ca ${shiftId} ở tuần ${realWeekNumber}! Vui lòng chọn người khác hoặc cập nhật ca rảnh trước.`, 'error');
        return;
      }

      // Chặn trùng ca cùng ngày (vd gán cả T2_S và T2_C cho một người).
      const dayKey = (window.SchedulerEngine?.SHIFT_MAP || {})[shiftId]?.dayKey
        || String(shiftId).split('_')[0];
      const clash = Object.entries(targetSchedule.scheduleTable).some(([sid, other]) => {
        if (sid === shiftId) return false;
        if (other.oldMember?.id === newStudent.id || other.newMember?.id === newStudent.id) return false;
        const oKey = (window.SchedulerEngine?.SHIFT_MAP || {})[sid]?.dayKey || String(sid).split('_')[0];
        return oKey === dayKey;
      });
      if (clash) {
        showToast(`${newStudent.fullName} đã được xếp một ca khác trong cùng ngày ${dayKey} ở tuần này!`, 'error');
        return;
      }
    }

    if (role === 'old') {
      slot.oldMember = newStudent || null;
    } else {
      slot.newMember = newStudent || null;
    }

    slot.status = (slot.oldMember && slot.newMember) ? 'full' : ((slot.oldMember || slot.newMember) ? 'partial' : 'empty');

    // Tính lại TOÀN BỘ thống kê của tuần. Trước đây chỉ cập nhật studentStats,
    // còn summary.fullShifts/partialShifts và combinedStats bị đóng băng ->
    // ô "X/40 ca", thanh công bằng, badge "✓ Đủ 10/10 ca" đều sai.
    recomputeWeekStats(targetSchedule);
    // Ghi nhận để lần xếp lịch tự động sau (đổi vai trò hàng loạt, nhập CSV,
    // thêm/xoá SV) không xoá mất thay đổi này.
    slot.manuallyEdited = true;
    recordManualSlot(realWeekNumber, shiftId, slot);
    targetSchedule.timestamp = Date.now();

    state.currentSchedule = targetSchedule;
    state.twoWeekSchedule = state.monthSchedule;
    localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
    saveSchedule(true);
    window.dispatchEvent(new CustomEvent('ts:data-changed', {
      detail: { keys: [STORAGE_KEYS.MONTH_SCHEDULE, STORAGE_KEYS.SCHEDULE] }
    }));

    renderAll();
    closeReassignModal();
    showToast(`Đã lưu thay đổi nhân sự trực ${weekNumber ? `Tuần ${weekNumber}` : ''}!`, 'success');
  }

  function openAddStudentModal() {
    if (!elements.studentModal) return;
    elements.studentModalTitle.textContent = 'Thêm Sinh Viên Mới';
    elements.editStudentIdInput.value = '';
    elements.inputAdminFullName.value = '';
    elements.inputAdminStudentId.value = '';
    if (elements.inputAdminPhone) elements.inputAdminPhone.value = '';
    elements.adminSlotCbs.forEach(cb => cb.checked = false);

    const roleRadio = document.querySelector('input[name="adminStudentRole"][value="new"]');
    if (roleRadio) roleRadio.checked = true;

    elements.studentModal.classList.add('active');
    elements.inputAdminFullName.focus();
  }

  window.adminEditStudent = function(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    elements.studentModalTitle.textContent = 'Chỉnh Sửa Hồ Sơ Sinh Viên';
    elements.editStudentIdInput.value = student.id;
    elements.inputAdminFullName.value = student.fullName;
    elements.inputAdminStudentId.value = student.studentId;
    if (elements.inputAdminPhone) elements.inputAdminPhone.value = student.phone || '';

    const roleRadio = document.querySelector(`input[name="adminStudentRole"][value="${student.role}"]`);
    if (roleRadio) roleRadio.checked = true;

    const availSet = new Set(student.availableShifts || []);
    elements.adminSlotCbs.forEach(cb => {
      cb.checked = availSet.has(cb.value);
    });

    elements.studentModal.classList.add('active');
  };

  function closeStudentModal() {
    elements.studentModal?.classList.remove('active');
  }

  function handleSaveStudentForm(e) {
    e.preventDefault();

    const editId = elements.editStudentIdInput.value;
    const fullName = elements.inputAdminFullName.value.trim();
    const studentId = elements.inputAdminStudentId.value.trim();
    const phone = elements.inputAdminPhone ? elements.inputAdminPhone.value.trim() : '';
    const role = document.querySelector('input[name="adminStudentRole"]:checked')?.value || 'new';

    const availableShifts = [];
    elements.adminSlotCbs.forEach(cb => {
      if (cb.checked) availableShifts.push(cb.value);
    });

    if (!fullName || !studentId) {
      showToast('Vui lòng nhập đầy đủ Họ tên và MSSV!', 'error');
      return;
    }

    if (editId) {
      const idx = state.students.findIndex(s => s.id === editId);
      if (idx !== -1) {
        const studentToUpdate = state.students[idx];
        const monthlyShifts = (availableShifts.length === 0)
          ? { 1: [], 2: [], 3: [], 4: [] }
          : (studentToUpdate.monthlyAvailableShifts || { 1: [...availableShifts], 2: [...availableShifts], 3: [...availableShifts], 4: [...availableShifts] });

        state.students[idx] = {
          ...studentToUpdate,
          fullName,
          studentId,
          phone,
          role,
          availableShifts,
          monthlyAvailableShifts: monthlyShifts,
          updatedAt: Date.now()
        };
        showToast(`Đã cập nhật sinh viên ${fullName}!`, 'success');
      }
    } else {
      const existing = state.students.find(s => s.studentId.toLowerCase() === studentId.toLowerCase());
      if (existing) {
        showToast(`MSSV ${studentId} đã tồn tại trong hệ thống!`, 'error');
        elements.inputAdminStudentId.focus();
        return;
      }

      const newStudent = {
        id: 's_' + Date.now(),
        fullName,
        studentId,
        phone,
        role,
        availableShifts,
        monthlyAvailableShifts: { 1: [...availableShifts], 2: [...availableShifts], 3: [...availableShifts], 4: [...availableShifts] },
        createdAt: Date.now()
      };
      state.students.unshift(newStudent);
      showToast(`Đã thêm thành công bạn ${fullName}!`, 'success');
    }

    saveStudents();
    runFullSchedule();
    renderAll();
    closeStudentModal();
  }

window.adminClearStudentShifts = async function(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

      const dcclrOne = await confirmDangerAction({
        title: "Xóa sạch ca rảnh của một CTV",
        message: "Toàn bộ ca rảnh đã đăng ký của CTV này sẽ về 0 ca.",
        losses: ["Toàn bộ ca rảnh đã đăng ký của CTV này — hồ sơ vẫn được giữ"],
        keyword: 'XOA CA',
        confirmLabel: "Xóa sạch ca rảnh",
      });
      if (dcclrOne) {
      student.availableShifts = [];
      student.monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
      student.updatedAt = Date.now();
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã xóa sạch toàn bộ ca rảnh của bạn ${student.fullName} (về 0 ca)!`, 'success');
    }
  };

window.adminDeleteStudent = async function(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

      const dcdelOne = await confirmDangerAction({
        title: "Xóa CTV khỏi danh sách",
        message: "Hồ sơ CTV này sẽ bị xóa cùng toàn bộ ca rảnh đã đăng ký.",
        losses: ["1 hồ sơ CTV", "Toàn bộ ca rảnh đã đăng ký của người đó"],
        keyword: 'XOA NTV',
        confirmLabel: "Xóa CTV",
      });
      if (dcdelOne) {
      state.students = state.students.filter(s => s.id !== studentId);
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã xóa bạn ${student.fullName}!`, 'info');
    }
  };

  /**
   * ==========================================================================
   * 1. GIAO DIỆN SÁNG / TỐI (DARK / LIGHT THEME SWITCHER - TASK 19)
   * ==========================================================================
   */
  function initThemeToggle() {
    const btnLight = elements.btnThemeLight || document.getElementById('btn-theme-light');
    const btnDark = elements.btnThemeDark || document.getElementById('btn-theme-dark');

    function applyTheme(theme) {
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      try {
        localStorage.setItem('ts_scheduler_theme', theme);
      } catch (e) {}
      updateThemeUI(theme === 'dark');
    }

    function updateThemeUI(isDark) {
      if (btnLight) btnLight.classList.toggle('active', !isDark);
      if (btnDark) btnDark.classList.toggle('active', isDark);
    }

    const currentDark = document.documentElement.getAttribute('data-theme') === 'dark';
    updateThemeUI(currentDark);

    if (btnLight) {
      btnLight.addEventListener('click', () => applyTheme('light'));
    }
    if (btnDark) {
      btnDark.addEventListener('click', () => applyTheme('dark'));
    }

    window.addEventListener('storage', (e) => {
      if (e.key === 'ts_scheduler_theme') {
        const isDark = e.newValue === 'dark';
        if (isDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        updateThemeUI(isDark);
      }
    });
  }

  /**
   * ==========================================================================
   * 2. STICKY HERO TOOLBAR & BẢNG CHỈ SỐ NHANH (TASK 17)
   * ==========================================================================
   */
  function bindStickyHeroEvents() {
    elements.btnStickyAutoSchedule?.addEventListener('click', () => {
      elements.btnAutoSchedule?.click();
    });
    elements.btnStickyQuickCopy?.addEventListener('click', () => {
      elements.btnQuickCopySheet?.click();
    });
    elements.btnStickyOpenExcel?.addEventListener('click', () => {
      elements.btnOpenExcelModal?.click();
    });

    // Ẩn khi ở đỉnh trang, hiện mượt mà khi cuộn xuống quá 220px
    function handleScroll() {
      if (!elements.stickyHeroBar) return;
      if (window.scrollY > 220) {
        elements.stickyHeroBar.classList.add('sticky-active');
      } else {
        elements.stickyHeroBar.classList.remove('sticky-active');
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  function updateStickyHeroStats() {
    const total = state.students.length;
    if (elements.stickyStatStudents) {
      elements.stickyStatStudents.textContent = `${total} CTV`;
    }

    if (elements.stickyStatFilled) {
      if (state.monthSchedule?.weeks) {
        let totalFull = 0;
        let totalEmpty = 0;
        state.monthSchedule.weeks.forEach(w => {
          totalFull += w.summary?.fullShifts || 0;
          totalEmpty += (w.summary?.emptyShifts || 0) + (w.summary?.partialShifts || 0);
        });
        elements.stickyStatFilled.textContent = `${totalFull}/40 ca`;
        if (elements.stickyStatEmpty && elements.stickyPillEmpty) {
          if (totalEmpty > 0) {
            elements.stickyStatEmpty.textContent = `${totalEmpty} ca chưa đủ`;
            elements.stickyPillEmpty.style.display = 'inline-flex';
          } else {
            elements.stickyPillEmpty.style.display = 'none';
          }
        }
      } else {
        const fullShifts = state.currentSchedule?.summary?.fullShifts || 0;
        const emptyShifts = (state.currentSchedule?.summary?.emptyShifts || 0) + (state.currentSchedule?.summary?.partialShifts || 0);
        elements.stickyStatFilled.textContent = `${fullShifts}/10 ca`;
        if (elements.stickyStatEmpty && elements.stickyPillEmpty) {
          if (emptyShifts > 0) {
            elements.stickyStatEmpty.textContent = `${emptyShifts} ca chưa đủ`;
            elements.stickyPillEmpty.style.display = 'inline-flex';
          } else {
            elements.stickyPillEmpty.style.display = 'none';
          }
        }
      }
    }
  }

  /**
   * ==========================================================================
   * 3. CHẾ ĐỘ XEM TOÀN CẢNH MA TRẬN 1 THÁNG (FULL-MONTH MASTER GRID - TASK 16)
   * ==========================================================================
   */
  function bindViewModeEvents() {
    elements.btnViewSingleWeek?.addEventListener('click', () => {
      switchViewMode('single');
    });
    elements.btnViewMasterMonth?.addEventListener('click', () => {
      switchViewMode('master');
    });

    // Nút cuộn trái / phải
    elements.btnMasterScrollLeft?.addEventListener('click', () => {
      const scrollStep = (elements.adminMasterMonthContainer?.querySelector('.master-week-section')?.offsetWidth || 1180) + 24;
      elements.adminMasterMonthContainer?.scrollBy({ left: -scrollStep, behavior: 'smooth' });
    });
    elements.btnMasterScrollRight?.addEventListener('click', () => {
      const scrollStep = (elements.adminMasterMonthContainer?.querySelector('.master-week-section')?.offsetWidth || 1180) + 24;
      elements.adminMasterMonthContainer?.scrollBy({ left: scrollStep, behavior: 'smooth' });
    });

    // Chuyển kiểu hiển thị: Cuộn Ngang ↔ Xếp Dọc
    elements.btnLayoutHorizontal?.addEventListener('click', () => {
      elements.btnLayoutHorizontal.classList.add('active');
      elements.btnLayoutVertical?.classList.remove('active');
      elements.adminMasterMonthContainer?.classList.remove('layout-vertical');
      elements.adminMasterMonthContainer?.classList.add('layout-horizontal');
    });
    elements.btnLayoutVertical?.addEventListener('click', () => {
      elements.btnLayoutVertical.classList.add('active');
      elements.btnLayoutHorizontal?.classList.remove('active');
      elements.adminMasterMonthContainer?.classList.remove('layout-horizontal');
      elements.adminMasterMonthContainer?.classList.add('layout-vertical');
    });

    // Chip chuyển nhanh Tuần 1 -> Tuần 4
    document.getElementById('master-nav-chips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.master-chip-btn');
      if (!btn) return;
      const weekNum = parseInt(btn.dataset.jumpWeek, 10);
      const targetSec = document.getElementById(`master-week-section-${weekNum}`);
      if (targetSec && elements.adminMasterMonthContainer) {
        if (elements.adminMasterMonthContainer.classList.contains('layout-horizontal')) {
          const offsetLeft = targetSec.offsetLeft - elements.adminMasterMonthContainer.offsetLeft;
          elements.adminMasterMonthContainer.scrollTo({ left: offsetLeft, behavior: 'smooth' });
        } else {
          targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      document.querySelectorAll('.master-chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Kéo trượt chuột (Mouse Drag to Scroll) & Lăn chuột ngang (Mouse Wheel)
    const container = elements.adminMasterMonthContainer;
    if (container) {
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      container.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.modal-content')) return;
        isDown = true;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
      });

      window.addEventListener('mouseup', () => { isDown = false; });
      container.addEventListener('mouseleave', () => { isDown = false; });

      container.addEventListener('mousemove', (e) => {
        if (!isDown || !container.classList.contains('layout-horizontal')) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5;
        container.scrollLeft = scrollLeft - walk;
      });

      // Lăn chuột dọc chuyển thành cuộn ngang tự nhiên khi rê chuột trong bảng
      container.addEventListener('wheel', (e) => {
        if (container.classList.contains('layout-horizontal') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
        }
      }, { passive: false });

      // Tự động kích hoạt chip tuần tương ứng khi cuộn tới
      container.addEventListener('scroll', () => {
        if (!container.classList.contains('layout-horizontal')) return;
        const sections = container.querySelectorAll('.master-week-section');
        let currentWeek = 1;
        sections.forEach((sec, idx) => {
          const offset = sec.offsetLeft - container.offsetLeft;
          if (container.scrollLeft >= offset - 150) {
            currentWeek = idx + 1;
          }
        });
        document.querySelectorAll('.master-chip-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.jumpWeek, 10) === currentWeek);
        });
      }, { passive: true });
    }
  }

  function switchViewMode(mode) {
    state.viewMode = mode;
    if (elements.btnViewSingleWeek) {
      elements.btnViewSingleWeek.classList.toggle('active', mode === 'single');
    }
    if (elements.btnViewMasterMonth) {
      elements.btnViewMasterMonth.classList.toggle('active', mode === 'master');
    }

    if (mode === 'single') {
      if (elements.adminSingleWeekControls) elements.adminSingleWeekControls.style.display = 'flex';
      if (elements.adminSingleWeekWrapper) elements.adminSingleWeekWrapper.style.display = 'block';
      if (elements.adminMasterMonthWrapper) elements.adminMasterMonthWrapper.style.display = 'none';
      renderTimetable();
    } else {
      if (elements.adminSingleWeekControls) elements.adminSingleWeekControls.style.display = 'none';
      if (elements.adminSingleWeekWrapper) elements.adminSingleWeekWrapper.style.display = 'none';
      if (elements.adminMasterMonthWrapper) elements.adminMasterMonthWrapper.style.display = 'block';
      renderMasterMonthGrid();
    }
  }

  function renderMasterMonthGrid() {
    if (!elements.adminMasterMonthContainer) return;

    const curMonth = state.currentMonth || 10;
    const curYear = state.currentYear || 2026;

    if (!state.monthSchedule || !state.monthSchedule.weeks || state.monthSchedule.weeks.length === 0) {
      elements.adminMasterMonthContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md); width: 100%;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📅</div>
          <h3 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.35rem;">Chưa Có Bảng Phân Công Tháng ${String(curMonth).padStart(2, '0')}/${curYear}</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">
            Nhấn "⚡ TỰ ĐỘNG PHÂN BỔ LỊCH TRỰC" ở trên để hệ thống tự động phân bổ trọn vẹn cả 4 tuần trong tháng!
          </p>
          <button type="button" class="btn btn-primary" onclick="document.getElementById('btn-admin-auto-schedule')?.click()">
            <span>⚡ Phân Bổ Ngay</span>
          </button>
        </div>
      `;
      return;
    }

    let calendarWeeks = [];
    if (window.SchedulerEngine && window.SchedulerEngine.MonthCalendarHelper) {
      calendarWeeks = window.SchedulerEngine.MonthCalendarHelper.getMonthWeeks(curMonth, curYear);
    } else if (state.monthSchedule && state.monthSchedule.calendarWeeks) {
      calendarWeeks = state.monthSchedule.calendarWeeks;
    }

    const days = [
      { key: 'T2', name: 'Thứ Hai', sub: 'Thứ 2' },
      { key: 'T3', name: 'Thứ Ba', sub: 'Thứ 3' },
      { key: 'T4', name: 'Thứ Tư', sub: 'Thứ 4' },
      { key: 'T5', name: 'Thứ Năm', sub: 'Thứ 5' },
      { key: 'T6', name: 'Thứ Sáu', sub: 'Thứ 6' }
    ];

    let html = '';

    state.monthSchedule.weeks.forEach((weekObj, wIdx) => {
      const weekNum = wIdx + 1;
      const weekCal = calendarWeeks[wIdx] || null;
      const dateRangeStr = weekCal ? ` (${weekCal.startDateStr} - ${weekCal.endDateStr}/${curYear})` : '';
      const schedule = weekObj.scheduleTable || {};
      const fullCount = weekObj.summary?.fullShifts || 0;

      let gridHtml = '';
      gridHtml += `<div class="grid-cell grid-header"><span class="day-name">Ca / Ngày</span></div>`;
      days.forEach(day => {
        const dayInfo = weekCal?.days?.[day.key];
        const dateStr = dayInfo ? dayInfo.dateStr : '';
        gridHtml += `
          <div class="grid-cell grid-header">
            <span class="day-name">${day.name}</span>
            <span class="day-sub" style="font-weight:700; color:var(--primary); font-size:0.75rem; background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px; margin-top:2px; display:inline-block;">📅 ${dateStr || day.sub}</span>
          </div>
        `;
      });

      // Sáng (07:30 - 11:30)
      gridHtml += `
        <div class="grid-cell period-cell">
          <span class="period-name">☀️ Sáng</span>
          <span class="period-time">07:30 - 11:30</span>
        </div>
      `;
      days.forEach(day => {
        const shiftId = `${day.key}_S`;
        const slot = schedule[shiftId];
        gridHtml += renderShiftSlotHtmlForWeek(shiftId, slot, weekNum);
      });

      // Chiều (13:00 - 16:30)
      gridHtml += `
        <div class="grid-cell period-cell">
          <span class="period-name">🌤️ Chiều</span>
          <span class="period-time">13:00 - 16:30</span>
        </div>
      `;
      days.forEach(day => {
        const shiftId = `${day.key}_C`;
        const slot = schedule[shiftId];
        gridHtml += renderShiftSlotHtmlForWeek(shiftId, slot, weekNum);
      });

      html += `
        <div class="master-week-section" id="master-week-section-${weekNum}">
          <div class="master-week-header">
            <div class="master-week-title">
              <span>🗓️ Tuần ${weekNum}${dateRangeStr} (10 Ca Trực)</span>
              <span class="badge" style="background: ${fullCount === 10 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${fullCount === 10 ? '#10b981' : '#f59e0b'}; font-size: 0.75rem;">
                ${fullCount === 10 ? '✓ Đủ 10/10 ca' : `⚠️ Đã lấp đầy ${fullCount}/10 ca`}
              </span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.adminQuickSwitchToSingleWeek(${weekNum})" style="font-size: 0.78rem;">
              <span>Xem riêng tuần ${weekNum} →</span>
            </button>
          </div>
          <div class="timetable-wrapper">
            <div class="timetable-grid">
              ${gridHtml}
            </div>
          </div>
        </div>
      `;
    });

    elements.adminMasterMonthContainer.innerHTML = html;
  }

  function renderShiftSlotHtmlForWeek(shiftId, slot, weekNum) {
    if (!slot) {
      return `<div class="grid-cell shift-duty-slot"><div class="empty-state">Chưa xếp</div></div>`;
    }

    const oldMem = slot.oldMember;
    const newMem = slot.newMember;

    let statusPill = '';
    if (slot.status === 'full') {
      statusPill = `<span class="shift-status-pill full">✓ Đủ 2 bạn</span>`;
    } else if (slot.status === 'partial') {
      statusPill = `<span class="shift-status-pill warning">Thiếu 1 bạn</span>`;
    } else {
      statusPill = `<span class="shift-status-pill empty">Trống</span>`;
    }

    const oldCard = oldMem ? `
      <div class="duty-member-card role-old" title="Chính Thức - Có kinh nghiệm">
        <div class="member-info">
          <span class="member-role-tag">🎓 Chính Thức</span>
          <span class="member-name">${escapeHtml(oldMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(oldMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'old', ${weekNum})" title="Đổi bạn khác ở Tuần ${weekNum}">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'old', ${weekNum})" style="cursor: pointer;" title="Nhấn để gán Chính Thức ở Tuần ${weekNum}">
        <span>+ Chưa có Chính Thức</span>
      </div>
    `;

    const newCard = newMem ? `
      <div class="duty-member-card role-new" title="Tập Sự">
        <div class="member-info">
          <span class="member-role-tag">🌱 Tập Sự</span>
          <span class="member-name">${escapeHtml(newMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(newMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'new', ${weekNum})" title="Đổi bạn khác ở Tuần ${weekNum}">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'new', ${weekNum})" style="cursor: pointer;" title="Nhấn để gán Tập Sự ở Tuần ${weekNum}">
        <span>+ Chưa có Tập Sự</span>
      </div>
    `;

    return `
      <div class="grid-cell shift-duty-slot">
        <div class="shift-slot-header">
          <span>${slot.shiftInfo?.dayName || ''}</span>
          ${statusPill}
        </div>
        ${oldCard}
        ${newCard}
      </div>
    `;
  }

  window.adminQuickSwitchToSingleWeek = function(w) {
    switchViewMode('single');
    switchAdminWeek(w);
  };

  /**
   * ==========================================================================
   * 4. NHẬP DANH SÁCH SINH VIÊN TỪ EXCEL / CSV (TASK 18)
   * ==========================================================================
   */
  function bindImportEvents() {
    elements.btnOpenImportModal?.addEventListener('click', openImportModal);
    elements.btnCloseImportModal?.addEventListener('click', closeImportModal);
    elements.btnCancelImport?.addEventListener('click', closeImportModal);
    elements.btnDownloadImportTemplate?.addEventListener('click', downloadImportTemplateCsv);

    elements.importModal?.addEventListener('click', (e) => {
      if (e.target === elements.importModal) closeImportModal();
    });

    const dropzone = elements.importFileDropzone;
    const fileInput = elements.inputImportFile;

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleImportFileSelect(files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      const files = e.target?.files;
      if (files && files.length > 0) {
        handleImportFileSelect(files[0]);
      }
    });

    elements.btnConfirmImport?.addEventListener('click', confirmImportStudents);
  }

  function openImportModal() {
    state.importedCandidates = [];
    if (elements.importPreviewSection) elements.importPreviewSection.style.display = 'none';
    if (elements.importPreviewTbody) elements.importPreviewTbody.innerHTML = '';
    if (elements.btnConfirmImport) {
      elements.btnConfirmImport.disabled = true;
      elements.btnConfirmImport.style.opacity = '0.6';
    }
    if (elements.inputImportFile) elements.inputImportFile.value = '';
    elements.importModal?.classList.add('active');
  }

  function closeImportModal() {
    elements.importModal?.classList.remove('active');
    state.importedCandidates = [];
  }

  function downloadImportTemplateCsv() {
    const csvContent = '\uFEFF' + [
      'Họ và Tên,Mã Số Sinh Viên,Số Điện Thoại,Phân Loại (Người cũ/Người mới),Các Ca Rảnh (cách nhau bởi dấu phẩy)',
      'Nguyễn Văn A,2102001,0912345678,Người cũ,"T2_S, T2_C, T3_S, T4_C, T5_S, T6_C"',
      'Trần Thị Bích,2302002,0987654321,Người mới,"T2_S, T3_S, T4_S, T5_S, T6_S"',
      'Lê Hoàng Cường,2102003,0934567890,Người cũ,"T2_S, T3_C, T4_S, T4_C, T5_S, T6_S"'
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_danh_sach_ctv_tvts.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống file mẫu CSV chuẩn UTF-8!', 'success');
  }

  function handleImportFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      showToast('Vui lòng chọn file định dạng .CSV (UTF-8)!', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        const parsed = parseStudentsCsv(text);
        if (parsed.length === 0) {
          showToast('Không đọc được dữ liệu sinh viên nào từ file. Vui lòng kiểm tra lại cấu trúc file!', 'error');
          return;
        }
        state.importedCandidates = parsed;
        renderImportPreview(parsed, file.name);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function parseStudentsCsv(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return [];

    const candidates = [];
    const validShiftIds = (SHIFTS || []).map(s => s.id);

    function parseCsvRow(lineStr) {
      const row = [];
      let inQuotes = false;
      let currentVal = '';
      for (let c = 0; c < lineStr.length; c++) {
        const ch = lineStr[c];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          row.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += ch;
        }
      }
      row.push(currentVal.trim());
      return row.map(v => v.replace(/^"|"$/g, '').trim());
    }

    let headerRow = parseCsvRow(lines[0]);
    let colIdx = {
      fullName: -1,
      studentId: -1,
      phone: -1,
      role: -1,
      shifts: -1
    };

    headerRow.forEach((col, idx) => {
      const h = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (colIdx.fullName === -1 && (h.includes('ho ten') || h.includes('ho va ten') || h.includes('ten') || h.includes('fullname') || h.includes('name'))) {
        colIdx.fullName = idx;
      } else if (colIdx.studentId === -1 && (h.includes('mssv') || h.includes('ma so sinh vien') || h.includes('ma sv') || h.includes('student id') || h.includes('studentid') || h === 'id')) {
        colIdx.studentId = idx;
      } else if (colIdx.phone === -1 && (h.includes('sdt') || h.includes('dien thoai') || h.includes('phone') || h.includes('so dien thoai') || h.includes('mobile'))) {
        colIdx.phone = idx;
      } else if (colIdx.role === -1 && (h.includes('vai tro') || h.includes('phan loai') || h.includes('doi tuong') || h.includes('loai') || h.includes('role'))) {
        colIdx.role = idx;
      } else if (colIdx.shifts === -1 && (h.includes('ca') || h.includes('shift') || h.includes('dang ky'))) {
        colIdx.shifts = idx;
      }
    });

    let startIndex = 1;
    if (colIdx.fullName === -1 && colIdx.studentId === -1) {
      colIdx = { fullName: 0, studentId: 1, phone: 2, role: 3, shifts: 4 };
      if (/^\d{6,10}$/.test(headerRow[1]) || /^\d{6,10}$/.test(headerRow[0])) {
        startIndex = 0;
      }
    } else {
      if (colIdx.fullName === -1) colIdx.fullName = 0;
      if (colIdx.studentId === -1) colIdx.studentId = 1;
      if (colIdx.phone === -1) colIdx.phone = 2;
      if (colIdx.role === -1) colIdx.role = -1;
      if (colIdx.shifts === -1) colIdx.shifts = -1;
    }

    // ⚠️ NẾU TIÊU ĐỀ CỘT VAI TRÒ TRỐNG, PHẢI ĐOÁN THEO NỘI DUNG CHỨ KHÔNG
    // ĐOÁN THEO VỊ TRÍ.
    //
    // File CSV thật của Ban: "STT,Họ và tên,MSSV,Email," — cột thứ 5 KHÔNG
    // CÓ tên tiêu đề, chỉ chứa giá trị "CTV cũ" / "CTV mới".
    // Trước đây khi không tìm thấy cột vai trò theo tiêu đề, code đoán cứng
    // là cột index 3 — cột đó trong file này là EMAIL. Kết quả đo thật:
    //   58/58 người bị nhận thành Tập Sự (0 Chính Thức)
    // vì địa chỉ email không chứa từ khoá "cũ", và luật 1 Chính Thức +
    // 1 Tập Sự vì thế không thể xếp ca nào.
    if (colIdx.role === -1) {
      // Quét các dòng dữ liệu, tìm cột có giá trị trông như vai trò
      const deGiaiDau = [];
      for (let r = startIndex; r < lines.length && deGiaiDau.length < 12; r++) {
        const ln = lines[r].trim();
        if (!ln) continue;
        deGiaiDau.push(parseCsvRow(ln));
      }

      const laVaiTro = (v) => {
        const s = String(v || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (!s) return false;
        return /^(ctv\s*)?(cu|moi|chinh thuc|tap su|tap su|old|new|nguoi cu|nguoi moi)$/
          .test(s.replace(/\s+/g, ' '));
      };

      const soCot = Math.max(...deGiaiDau.map(r => r.length), 0);
      for (let c = 0; c < soCot; c++) {
        // Bỏ qua cột đã gán cho tên/MSSV/SĐT và cột có dạng email
        if (c === colIdx.fullName || c === colIdx.studentId || c === colIdx.phone) continue;
        const gia = deGiaiDau.map(r => r[c]);
        const khop = gia.filter(laVaiTro).length;
        // Cần phần lớn các dòng khớp mới coi là cột vai trò
        if (khop >= Math.max(2, Math.ceil(gia.length * 0.6))) {
          colIdx.role = c;
          break;
        }
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = parseCsvRow(line);
      let fullName = (row[colIdx.fullName] || '').trim();
      let studentId = (row[colIdx.studentId] || '').trim();
      const phone = (row[colIdx.phone] || '').trim();
      const roleRaw = (row[colIdx.role] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const shiftsRaw = (row[colIdx.shifts] || '').trim();

      if (/^\d{6,10}$/.test(fullName) && !/^\d{6,10}$/.test(studentId)) {
        const tmp = fullName;
        fullName = studentId;
        studentId = tmp;
      }

      if (!fullName || !studentId) continue;

      // So khớp CẢ GIÁ TRỊ, không dùng includes() rời.
      // Trước đây `roleRaw.includes('cu')` khớp trúng bất kỳ chuỗi nào có
      // chữ "cu" — ví dụ email "nguyencuong@..." hoặc tên "Đặng Thị Cúc"
      // sẽ bị nhận nhầm là Chính Thức.
      const roleText = roleRaw.replace(/\s+/g, ' ');
      const isOld = /^(ctv\s*)?(cu|nguoi cu|chinh thuc|old|kinh nghiem|vet|ct)$/.test(roleText);
      const role = isOld ? 'old' : 'new';

      const availableShifts = [];
      const shiftTokens = shiftsRaw.split(/[,;\s]+/).map(t => t.trim().toUpperCase().replace('-', '_'));

      shiftTokens.forEach(token => {
        if (validShiftIds.includes(token)) {
          if (!availableShifts.includes(token)) availableShifts.push(token);
        }
      });

      const isExisting = (state.students || []).some(s => s.studentId && s.studentId.toLowerCase() === studentId.toLowerCase());

      candidates.push({
        fullName,
        studentId,
        phone,
        role,
        availableShifts,
        isExisting
      });
    }

    return candidates;
  }

  function renderImportPreview(candidates, filename) {
    if (!elements.importPreviewSection || !elements.importPreviewTbody) return;

    elements.importPreviewSection.style.display = 'block';
    if (elements.importFileNameLabel) {
      elements.importFileNameLabel.textContent = `File: ${filename}`;
    }
    if (elements.importPreviewCountLabel) {
      elements.importPreviewCountLabel.textContent = `📋 Nhận diện được: ${candidates.length} sinh viên hợp lệ`;
    }

    elements.importPreviewTbody.innerHTML = candidates.map((c, idx) => {
      const statusBadge = c.isExisting 
        ? `<span class="badge" style="background:#fef3c7; color:#92400e;">🔄 Ghi đè</span>`
        : `<span class="badge" style="background:#d1fae5; color:#065f46;">🌱 Thêm mới</span>`;
      const roleBadge = c.role === 'old'
        ? `<span class="badge badge-role-old" style="font-size:0.7rem;">🎓 Chính Thức</span>`
        : `<span class="badge badge-role-new" style="font-size:0.7rem;">🌱 Tập Sự</span>`;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(c.fullName)}</strong></td>
          <td><code>${escapeHtml(c.studentId)}</code></td>
          <td>${escapeHtml(c.phone || '-')}</td>
          <td>${roleBadge}</td>
          <td><strong style="color:var(--primary);">${c.availableShifts.length}</strong> ca</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');

    if (elements.btnConfirmImport) {
      elements.btnConfirmImport.disabled = false;
      elements.btnConfirmImport.style.opacity = '1';
      elements.btnConfirmImport.innerHTML = `<span>☁️ Xác Nhận Nạp & Lưu Lên Cloud (${candidates.length} Sinh Viên)</span>`;
    }
  }

  async function confirmImportStudents() {
    const candidates = state.importedCandidates || [];
    if (candidates.length === 0) return;

    const modeRadio = document.querySelector('input[name="importMode"]:checked');
    const isReplace = modeRadio && modeRadio.value === 'replace';

    if (isReplace) {
      const ok = await confirmDangerAction({
        title: "Thay thế toàn bộ danh sách CTV",
        message: "Toàn bộ danh sách hiện tại sẽ bị XÓA và thay bằng danh sách trong file. Ca rảnh đã đăng ký của CTV cũ cũng mất theo.",
        losses: ["Toàn bộ danh sách CTV đang có trong hệ thống", "Toàn bộ ca rảnh đã đăng ký của CTV cũ"],
        keyword: 'THAY THE',
        confirmLabel: "Thay thế toàn bộ",
      });
      if (!ok) return;
      state.students = [];
    }

    let addedCount = 0;
    let updatedCount = 0;

    candidates.forEach(c => {
      const existingIdx = state.students.findIndex(s => s.studentId && s.studentId.toLowerCase() === c.studentId.toLowerCase());
      
      const monthlyShifts = c.monthlyAvailableShifts || {
        1: [...c.availableShifts],
        2: [...c.availableShifts],
        3: [...c.availableShifts],
        4: [...c.availableShifts]
      };

      if (existingIdx !== -1) {
        state.students[existingIdx] = {
          ...state.students[existingIdx],
          fullName: c.fullName,
          phone: c.phone || state.students[existingIdx].phone || '',
          role: c.role || state.students[existingIdx].role || 'old',
          availableShifts: c.availableShifts.length > 0 ? c.availableShifts : (state.students[existingIdx].availableShifts || []),
          monthlyAvailableShifts: c.availableShifts.length > 0 ? monthlyShifts : (state.students[existingIdx].monthlyAvailableShifts || monthlyShifts),
          updatedAt: Date.now()
        };
        updatedCount++;
      } else {
        state.students.push({
          id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          fullName: c.fullName,
          studentId: c.studentId,
          phone: c.phone || '',
          role: c.role || 'new',
          availableShifts: c.availableShifts,
          monthlyAvailableShifts: monthlyShifts,
          createdAt: Date.now()
        });
        addedCount++;
      }
    });

    saveStudents(true);
    runFullSchedule();
    renderAll();
    closeImportModal();

    if (window.CloudSyncManager && typeof window.CloudSyncManager.pushToCloud === 'function') {
      showToast('⏳ Đang lưu dữ liệu và đồng bộ lên Firebase Đám Mây…', 'info', 2500);
      try {
        const syncRes = await window.CloudSyncManager.pushToCloud();
        if (syncRes && syncRes.success) {
          showToast(`☁️ ĐÃ LƯU VÀ ĐỒNG BỘ LÊN CLOUD THÀNH CÔNG! Đã nạp ${candidates.length} CTV (Thêm mới: ${addedCount}, Cập nhật: ${updatedCount}). Tải lại web dữ liệu vẫn nguyên vẹn 100%!`, 'success', 6000);
        } else {
          showToast(`Đã lưu cục bộ! Đẩy lên Cloud gặp cảnh báo: ${syncRes?.error || 'Chưa hoàn tất'}`, 'warning', 4000);
        }
      } catch (cloudErr) {
        showToast(`Đã lưu cục bộ! Lỗi kết nối Cloud: ${cloudErr.message}`, 'warning', 4000);
      }
    } else {
      showToast(`Đã nạp thành công ${candidates.length} sinh viên (Thêm mới: ${addedCount}, Cập nhật: ${updatedCount})!`, 'success', 4000);
    }
  }

  /**
   * ==========================================================================
   * 5. QUẢN LÝ & PHÊ DUYỆT ĐỀ XUẤT ĐỔI CA / NHỜ TRỰC HỘ (TASK 26)
   * ==========================================================================
   */
  function bindSwapMgmtEvents() {
    elements.btnOpenSwapMgmt?.addEventListener('click', openSwapMgmtModal);
    elements.btnStickySwapMgmt?.addEventListener('click', openSwapMgmtModal);
    elements.btnCloseSwapMgmtModal?.addEventListener('click', closeSwapMgmtModal);
    elements.btnCloseSwapMgmtFooter?.addEventListener('click', closeSwapMgmtModal);
    elements.btnRefreshSwaps?.addEventListener('click', renderSwapRequestsTable);

    elements.modalManageSwaps?.addEventListener('click', (e) => {
      if (e.target === elements.modalManageSwaps) closeSwapMgmtModal();
    });
  }

  function updateSwapCountBadges() {
    let count = 0;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) {
        const list = JSON.parse(raw);
        count = list.filter(r => r.status === 'pending').length;
      }
    } catch (e) {}

    if (elements.badgeSwapCount) {
      elements.badgeSwapCount.textContent = count;
      elements.badgeSwapCount.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (elements.badgeStickySwapCount) {
      elements.badgeStickySwapCount.textContent = count;
      elements.badgeStickySwapCount.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (elements.swapMgmtCountLabel) {
      elements.swapMgmtCountLabel.textContent = `⏳ Đang chờ duyệt: ${count} yêu cầu`;
    }
  }

  function openSwapMgmtModal() {
    const modal = elements.modalManageSwaps || document.getElementById('modal-manage-swaps');
    renderSwapRequestsTable();
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  function closeSwapMgmtModal() {
    const modal = elements.modalManageSwaps || document.getElementById('modal-manage-swaps');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  function renderSwapRequestsTable() {
    if (!elements.tbodyManageSwaps) return;
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}

    updateSwapCountBadges();

    if (list.length === 0) {
      elements.tbodyManageSwaps.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            🌱 Chưa có đề xuất đổi ca hoặc nhờ trực hộ nào từ sinh viên.
          </td>
        </tr>
      `;
      return;
    }

    elements.tbodyManageSwaps.innerHTML = list.map((req, idx) => {
      let statusBadge = '';
      let actionButtons = '';

      if (req.status === 'approved') {
        statusBadge = '<span class="swap-status-pill swap-status-approved">✓ Đã Duyệt</span>';
        actionButtons = '<span style="font-size: 0.78rem; color: var(--success); font-weight: 700;">Đã cập nhật lịch</span>';
      } else if (req.status === 'rejected') {
        statusBadge = '<span class="swap-status-pill swap-status-rejected">✕ Từ Chối</span>';
        actionButtons = '<span style="font-size: 0.78rem; color: var(--text-muted);">Đã hủy</span>';
      } else {
        statusBadge = '<span class="swap-status-pill swap-status-pending">⏳ Chờ Duyệt</span>';
        actionButtons = `
          <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
            <button type="button" class="btn btn-primary btn-sm" style="font-size: 0.76rem; padding: 0.25rem 0.55rem;" onclick="window.adminApproveSwap('${escapeHtml(req.id)}')" title="Phê duyệt và tự động đổi lịch 1-click">
              ✓ Duyệt
            </button>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.76rem; padding: 0.25rem 0.55rem; color: #ef4444;" onclick="window.adminRejectSwap('${escapeHtml(req.id)}')" title="Từ chối yêu cầu này">
              ✕
            </button>
          </div>
        `;
      }

      const typeBadge = req.swapType === 'cover'
        ? '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-weight: 700;">🤝 Trực Hộ</span>'
        : '<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #4f46e5; font-weight: 700;">🔄 Đổi Ca Chéo</span>';

      return `
        <tr>
          <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
          <td>
            <strong>${escapeHtml(req.studentName)}</strong><br>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(req.studentId)}</span>
          </td>
          <td>
            <span class="badge" style="background: var(--primary-light); color: var(--primary); font-weight: 800; font-size: 0.72rem;">Tuần ${req.weekNum}</span><br>
            <span style="font-size: 0.82rem; font-weight: 600;">${escapeHtml(req.shiftName)}</span>
          </td>
          <td>
            <strong>${escapeHtml(req.targetStudentName)}</strong><br>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(req.targetStudentId)}</span>
          </td>
          <td>${typeBadge}</td>
          <td style="max-width: 220px; font-size: 0.82rem;" title="${escapeHtml(req.reason)}">
            ${escapeHtml(req.reason)}
          </td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">${actionButtons}</td>
        </tr>
      `;
    }).join('');
  }

  function handleApproveSwap(swapId) {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}

    const req = list.find(r => r.id === swapId);
    if (!req) {
      showToast('Không tìm thấy đề xuất đổi ca này!', 'error');
      return;
    }

    // CHỐT TRẠNG THÁI: trước đây thiếu mắt này nên bấm "Duyệt" 2 lần, hoặc
    // duyệt lại một đề xuất đã bị từ chối, đều chạy tiếp và báo thành công.
    if (req.status && req.status !== 'pending') {
      showToast(`Đề xuất này đã được xử lý (${req.status === 'approved' ? 'đã duyệt' : 'đã từ chối'})!`, 'warning');
      return;
    }

    // Lấy target student object từ danh sách sinh viên
    const targetStudent = state.students.find(s => s.studentId?.toLowerCase() === req.targetStudentId?.toLowerCase());
    if (!targetStudent) {
      // Trước đây tự tạo object "ma" với id giả (s_target_<mssv>) — id này không
      // khớp state.students nên bảng chấm công KHÔNG BAO GIỜ tính ca cho người này.
      showToast(`Không tìm thấy CTV ${req.targetStudentName || req.targetStudentId} trong danh sách! Vui lòng kiểm tra lại đề xuất.`, 'error');
      return;
    }

    const senderStudent = state.students.find(s => s.studentId?.toLowerCase() === req.studentId?.toLowerCase()) || {
      id: 's_sender_' + req.studentId,
      studentId: req.studentId,
      fullName: req.studentName,
      role: req.studentRole || 'old'
    };

    // Tìm tuần trong state.monthSchedule
    const weekIdx = (req.weekNum || 1) - 1;
    const weekData = state.monthSchedule?.weeks?.[weekIdx];
    if (!weekData || !weekData.scheduleTable) {
      showToast('Không tìm thấy tuần tương ứng trong lịch để áp dụng đề xuất!', 'error');
      return;
    }

    const table = weekData.scheduleTable;
    const slot = table[req.shiftId];
    if (!slot) {
      showToast('Không tìm thấy ca trực cần đổi trong lịch!', 'error');
      return;
    }

    // KIỂM TRA NGƯỜI NHẬN THỰC SỰ RẢNH CA NÀY.
    // Trước đây không kiểm tra gì -> có thể gán người không đăng ký rảnh.
    const shiftMeta = (window.SchedulerEngine?.SHIFT_MAP || {})[req.shiftId];
    const weekNumber = weekIdx + 1;
    const declaredAvail = targetStudent.monthlyAvailableShifts
      ? (targetStudent.monthlyAvailableShifts[weekNumber] || targetStudent.monthlyAvailableShifts[String(weekNumber)])
      : targetStudent.availableShifts;
    const isAvailable = Array.isArray(declaredAvail)
      ? declaredAvail.includes(req.shiftId)
      : true;
    if (!isAvailable) {
      showToast(`${targetStudent.fullName} KHÔNG đăng ký rảnh ${req.shiftId} ở tuần này! Vui lòng kiểm tra lại ca rảnh.`, 'error');
      return;
    }

    // Tránh trùng 2 ca cùng 1 ngày với người nhận.
    const targetDayKey = shiftMeta ? shiftMeta.dayKey : String(req.shiftId).split('_')[0];
    const alreadyThatDay = Object.entries(table).some(([sid, other]) => {
      if (sid === req.shiftId) return false;
      const oKey = (window.SchedulerEngine?.SHIFT_MAP || {})[sid];
      if (!oKey || oKey.dayKey !== targetDayKey) return false;
      return other.oldMember?.id === targetStudent.id || other.newMember?.id === targetStudent.id;
    });
    if (alreadyThatDay) {
      showToast(`${targetStudent.fullName} đã có ca khác trong cùng ngày ${targetDayKey}! Vui lòng kiểm tra lại.`, 'error');
      return;
    }

    const senderMssv = String(req.studentId || '').toLowerCase();
    let replaced = false;
    if (slot.oldMember?.studentId?.toLowerCase() === senderMssv) {
      slot.oldMember = targetStudent;
      replaced = true;
    } else if (slot.newMember?.studentId?.toLowerCase() === senderMssv) {
      slot.newMember = targetStudent;
      replaced = true;
    }

    if (!replaced) {
      showToast('Ca trực này không còn thuộc về CTV gửi đề xuất — có thể lịch đã thay đổi. Đề xuất sẽ được giữ nguyên để Ban rà soát.', 'warning');
      return;
    }

    slot.status = (slot.oldMember && slot.newMember) ? 'full' : ((slot.oldMember || slot.newMember) ? 'partial' : 'empty');
    slot.manuallyEdited = true;

    // Tính lại toàn bộ thống kê của tuần (studentStats + summary).
    // Trước đây bỏ qua bước này -> bảng SV, thanh công bằng và số ca đều lệch.
    recomputeWeekStats(weekData);
    // Giữ lại để không mất khi hệ thống xếp lại lịch tự động.
    recordManualSlot(weekNumber, req.shiftId, slot);

    state.currentSchedule = weekData;
    state.twoWeekSchedule = state.monthSchedule;
    localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
    saveSchedule(true);

    req.status = 'approved';
    req.approvedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(list));

    // Đồng bộ sang cổng sinh viên
    window.dispatchEvent(new CustomEvent('ts:data-changed', {
      detail: { keys: [STORAGE_KEYS.MONTH_SCHEDULE, STORAGE_KEYS.SWAP_REQUESTS, STORAGE_KEYS.SCHEDULE] }
    }));

    renderSwapRequestsTable();
    renderAll();
    showToast(`Đã phê duyệt đề xuất của CTV ${req.studentName}! Lịch trực đã được tự động cập nhật.`, 'success');
  }

  /**
   * Tính lại studentStats + summary cho một tuần sau khi thay đổi thủ công.
   * @param {object} weekData - Đối tượng tuần trong monthSchedule
   */
  function recomputeWeekStats(weekData) {
    if (!weekData || !weekData.scheduleTable) return;
    const stats = {};
    state.students.forEach(s => {
      stats[s.id] = {
        studentId: s.id,
        fullName: s.fullName,
        role: s.role,
        assignedCount: 0,
        registeredCount: (s.availableShifts || []).length
      };
    });

    let full = 0, partial = 0, empty = 0;
    const table = weekData.scheduleTable;
    Object.values(table).forEach(slot => {
      [slot.oldMember, slot.newMember].forEach(member => {
        if (member && stats[member.id]) stats[member.id].assignedCount += 1;
      });
      const hasOld = !!slot.oldMember;
      const hasNew = !!slot.newMember;
      slot.status = (hasOld && hasNew) ? 'full' : ((hasOld || hasNew) ? 'partial' : 'empty');
      if (slot.status === 'full') full++;
      else if (slot.status === 'partial') partial++;
      else empty++;
    });

    weekData.studentStats = stats;
    weekData.summary = Object.assign({}, weekData.summary, {
      totalShifts: Object.keys(table).length,
      fullShifts: full,
      partialShifts: partial,
      emptyShifts: empty,
      totalStudents: state.students.length,
      oldStudentsCount: state.students.filter(s => s.role === 'old').length,
      newStudentsCount: state.students.filter(s => s.role === 'new').length,
      unassignedStudentsCount: Object.values(stats).filter(x => x.assignedCount === 0).length
    });
  }

  function handleRejectSwap(swapId) {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}

    const req = list.find(r => r.id === swapId);
    if (!req) {
      showToast('Không tìm thấy đề xuất đổi ca này!', 'error');
      return;
    }
    if (req.status && req.status !== 'pending') {
      showToast(`Đề xuất này đã được xử lý (${req.status === 'approved' ? 'đã duyệt' : 'đã từ chối'})!`, 'warning');
      return;
    }

    req.status = 'rejected';
    req.rejectedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(list));

    window.dispatchEvent(new CustomEvent('ts:data-changed', {
      detail: { keys: [STORAGE_KEYS.SWAP_REQUESTS] }
    }));
    renderSwapRequestsTable();
    showToast(`Đã từ chối đề xuất của CTV ${req.studentName}.`, 'info');
  }

  /**
   * ==========================================================================
   * 6. TRUNG TÂM SAO LƯU & PHỤC HỒI DỮ LIỆU TUYỂN SINH (TASK 27)
   * ==========================================================================
   */
  let pendingRestoreData = null;

  function bindBackupCenterEvents() {
    elements.btnOpenBackupCenter?.addEventListener('click', openBackupCenterModal);
    elements.btnStickyBackupCenter?.addEventListener('click', openBackupCenterModal);
    elements.btnCloseBackupModal?.addEventListener('click', closeBackupCenterModal);
    elements.btnCloseBackupFooter?.addEventListener('click', closeBackupCenterModal);

    elements.modalBackupCenter?.addEventListener('click', (e) => {
      if (e.target === elements.modalBackupCenter) closeBackupCenterModal();
    });

    elements.backupTabBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-backup-tab');
        if (targetTab) switchBackupTab(targetTab);
      });
    });

    elements.btnDownloadBackupJson?.addEventListener('click', handleExportBackupJson);

    // Dropzone setup
    const dropzone = elements.backupFileDropzone;
    const fileInput = elements.inputBackupFile;

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) handleBackupFileSelected(files[0]);
    });
    fileInput?.addEventListener('change', (e) => {
      const files = e.target?.files;
      if (files && files.length > 0) handleBackupFileSelected(files[0]);
    });

    elements.btnCancelRestorePreview?.addEventListener('click', () => {
      pendingRestoreData = null;
      if (elements.backupPreviewBox) elements.backupPreviewBox.style.display = 'none';
      if (elements.inputBackupFile) elements.inputBackupFile.value = '';
    });

    elements.btnConfirmRestore?.addEventListener('click', handleConfirmRestore);
    elements.btnStartNewMonth?.addEventListener('click', handleStartNewMonth);
    elements.btnCreateWebBackup?.addEventListener('click', () => handleTriggerCreateWebBackup());
  }

  function openBackupCenterModal() {
    const modal = elements.modalBackupCenter || document.getElementById('modal-backup-center');
    updateBackupStats();
    renderWebBackupsTable();
    switchBackupTab('tab-web-backups');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  function closeBackupCenterModal() {
    const modal = elements.modalBackupCenter || document.getElementById('modal-backup-center');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
    pendingRestoreData = null;
    if (elements.backupPreviewBox) elements.backupPreviewBox.style.display = 'none';
  }

  function switchBackupTab(targetTabId) {
    if (elements.backupTabBtns) {
      elements.backupTabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-backup-tab') === targetTabId);
      });
    }
    if (elements.backupTabContents) {
      elements.backupTabContents.forEach(content => {
        content.style.display = content.id === targetTabId ? 'block' : 'none';
      });
    }
  }

  function updateBackupStats() {
    if (elements.backupStatStudents) {
      elements.backupStatStudents.textContent = (state.students || []).length;
    }
    if (elements.backupStatWeeks) {
      const weeks = state.monthSchedule?.weeks?.length || 4;
      elements.backupStatWeeks.textContent = weeks;
    }
    if (elements.backupStatSwaps) {
      let swapCount = 0;
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
        if (raw) swapCount = JSON.parse(raw).length;
      } catch (e) {}
      elements.backupStatSwaps.textContent = swapCount;
    }
    if (elements.backupStatAdmins) {
      elements.backupStatAdmins.textContent = (state.adminUsers || []).length;
    }
  }

  function handleExportBackupJson() {
    let swapList = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) swapList = JSON.parse(raw);
    } catch (e) {}

    const backupPayload = {
      meta: {
        appName: 'Hệ Thống Phân Công Lịch Trực Ban TVTS HCM-UTE',
        version: '2.6',
        exportedAt: new Date().toISOString(),
        exportedBy: state.currentUser ? state.currentUser.fullName : 'Admin'
      },
      students: state.students || [],
      monthSchedule: state.monthSchedule || null,
      scheduleResult: state.scheduleResult || null,
      regConfig: state.regConfig || null,
      adminUsers: state.adminUsers || [],
      swapRequests: swapList,
      // Trước đây 3 key này KHÔNG được xuất, dù handleConfirmRestore đọc
      // chúng. Hậu quả: khôi phục "100%" mà mất sạch sự kiện (mất luôn
      // phần eventWorkUnits trong bảng chấm công) và hiển thị lịch khôi
      // phục dưới sai nhãn tháng.
      events: state.events || [],
      activeMonth: (function () {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_MONTH) || 'null'); }
        catch (e) { return { month: state.currentMonth, year: state.currentYear }; }
      })(),
      allMonths: (function () {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_MONTHS) || '{}'); }
        catch (e) { return {}; }
      })()
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `TVTS_Backup_${dateStr}_${timeStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Đã tải xuống bản sao lưu (.json) an toàn thành công!', 'success');
  }

  function handleBackupFileSelected(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showToast('Vui lòng chọn file sao lưu định dạng .json!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || (!parsed.students && !parsed.monthSchedule && !parsed.meta)) {
          showToast('File JSON không đúng cấu trúc sao lưu của hệ thống!', 'error');
          return;
        }

        pendingRestoreData = parsed;

        const studentCount = (parsed.students || []).length;
        const weekCount = (parsed.monthSchedule?.weeks || []).length;
        const swapCount = (parsed.swapRequests || []).length;
        const exportedAt = parsed.meta?.exportedAt ? formatVNDateTime(parsed.meta.exportedAt) : 'Không xác định';

        if (elements.backupPreviewDetails) {
          elements.backupPreviewDetails.innerHTML = `
            <div>• <strong>Tên file:</strong> ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)</div>
            <div>• <strong>Thời gian tạo backup:</strong> ${escapeHtml(exportedAt)}</div>
            <div>• <strong>Dữ liệu nhận diện:</strong> ${studentCount} CTV, ${weekCount} tuần xếp lịch, ${swapCount} đề xuất đổi ca</div>
            <div style="margin-top: 0.5rem; color: #b45309; font-weight: 600;">
              ⚠️ Lưu ý: Khi bấm "Xác Nhận Khôi Phục", toàn bộ dữ liệu hiện tại sẽ được cập nhật đồng bộ theo bản sao lưu này.
            </div>
          `;
        }

        if (elements.backupPreviewBox) elements.backupPreviewBox.style.display = 'block';
        showToast('Đã đọc và xác thực file sao lưu hợp lệ!', 'info');
      } catch (err) {
        showToast('Lỗi khi đọc file sao lưu: File bị hỏng hoặc định dạng JSON sai!', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

async function handleConfirmRestore() {
    if (!pendingRestoreData) {
      showToast('Không có dữ liệu hợp lệ để khôi phục!', 'error');
      return;
    }

    try {
      if (pendingRestoreData.students) {
        state.students = pendingRestoreData.students;
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(state.students));
      }
      if (pendingRestoreData.monthSchedule) {
        state.monthSchedule = pendingRestoreData.monthSchedule;
        localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
      }
      if (pendingRestoreData.scheduleResult) {
        state.scheduleResult = pendingRestoreData.scheduleResult;
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.scheduleResult));
      }
      if (pendingRestoreData.regConfig) {
        state.regConfig = pendingRestoreData.regConfig;
        localStorage.setItem(STORAGE_KEYS.REG_CONFIG, JSON.stringify(state.regConfig));
      }
      if (pendingRestoreData.adminUsers && pendingRestoreData.adminUsers.length > 0) {
        state.adminUsers = pendingRestoreData.adminUsers;
        localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(state.adminUsers));
      }
      if (pendingRestoreData.swapRequests) {
        state.swapRequests = pendingRestoreData.swapRequests;
        localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(state.swapRequests));
      }
      // Sự kiện cũng phải được khôi phục: bảng chấm công cộng eventWorkUnits,
      // và sự kiện còn sót lại tham chiếu sinh viên đã bị xoá sẽ tiếp tục
      // đóng góp công cho những người không còn tồn tại.
      if (Array.isArray(pendingRestoreData.events)) {
        state.events = pendingRestoreData.events;
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(state.events));
      }

      // ⚠️ state.currentSchedule / twoWeekSchedule phải được tính lại.
      // Trước đây chỉ ghi storage rồi renderAll() — mà renderAll() đọc
      // state.currentSchedule (đang giữ lịch CŨ trong RAM), nên thông báo
      // "khôi phục 100%" hiện ra trong khi bảng vẫn là dữ liệu trước khi
      // khôi phục. Chỉ tải lại trang mới thấy dữ liệu mới.
      state.twoWeekSchedule = state.monthSchedule;
      state.currentSchedule = state.monthSchedule
        ? (state.monthSchedule.weeks?.[state.currentWeek - 1]
          || state.monthSchedule.weeks?.[0]
          || state.monthSchedule)
        : null;

      // Khôi phục cả kỳ đang áp dụng và kho lịch các tháng khác
      if (pendingRestoreData.activeMonth) {
        try {
          const am = typeof pendingRestoreData.activeMonth === 'string'
            ? JSON.parse(pendingRestoreData.activeMonth)
            : pendingRestoreData.activeMonth;
          if (am && am.month) {
            state.currentMonth = parseInt(am.month, 10);
            if (am.year) state.currentYear = parseInt(am.year, 10);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_MONTH, JSON.stringify(am));
          }
        } catch (e) { /* dữ liệu tháng không hợp lệ -> giữ nguyên kỳ hiện tại */ }
      }
      if (pendingRestoreData.allMonths && typeof pendingRestoreData.allMonths === 'object') {
        localStorage.setItem(STORAGE_KEYS.ALL_MONTHS, JSON.stringify(pendingRestoreData.allMonths));
      }

      window.dispatchEvent(new CustomEvent('ts:data-changed', {
        detail: {
          keys: [
            STORAGE_KEYS.STUDENTS, STORAGE_KEYS.MONTH_SCHEDULE, STORAGE_KEYS.SCHEDULE,
            STORAGE_KEYS.REG_CONFIG, STORAGE_KEYS.ADMIN_USERS, STORAGE_KEYS.SWAP_REQUESTS,
            STORAGE_KEYS.EVENTS, STORAGE_KEYS.ACTIVE_MONTH, STORAGE_KEYS.ALL_MONTHS
          ]
        }
      }));

      renderAll();
      renderRegConfigUI();
      updateBackupStats();
      updateSwapCountBadges();
      closeBackupCenterModal();

      showToast('Khôi phục toàn bộ hệ thống từ bản sao lưu thành công 100%!', 'success');
    } catch (err) {
      showToast('Đã có lỗi xảy ra trong quá trình ghi dữ liệu khôi phục!', 'error');
    }
  }

async function handleStartNewMonth() {
      const dcreset = await confirmDangerAction({
        title: "Khởi tạo lịch tháng mới",
        message: "Bảng lịch 4 tuần sẽ được làm sạch và xếp mới. Danh sách CTV đã đăng ký được giữ nguyên.",
        losses: ["Bảng phân công ca trực hiện tại của cả tháng"],
        keyword: 'TAO LICH MOI',
        confirmLabel: "Khởi tạo lịch tháng mới",
      });
      if (!dcreset) return;

    // Tự động lưu 1 snapshot vào Web Backups trước khi reset
    const now = new Date();
    const monthTag = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    createWebBackup(`Tự động lưu trữ trước khi sang tháng mới (${monthTag})`);

    // Tự động tải 1 bản snapshot file về máy
    handleExportBackupJson();

    // Làm sạch bảng 4 tuần
    const cleanWeeks = [1, 2, 3, 4].map(w => ({
      weekNum: w,
      weekLabel: `Tuần ${w}`,
      scheduleTable: {},
      stats: { totalAssignedShifts: 0, fullyFilledCount: 0, emptyCount: 10 },
      isClean: true
    }));

    state.monthSchedule = {
      createdAt: Date.now(),
      totalWeeks: 4,
      month: state.currentMonth,
      year: state.currentYear,
      weeks: cleanWeeks
    };

    state.scheduleResult = {
      createdAt: Date.now(),
      scheduleTable: {},
      stats: { totalAssignedShifts: 0, fullyFilledCount: 0, emptyCount: 10 }
    };

    localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.scheduleResult));
    localStorage.removeItem(STORAGE_KEYS.SWAP_REQUESTS);
    state.swapRequests = [];

    // ⚠️ THIẾU SO VỚI CÁC ĐƯỜNG KHÁC: renderTimetable() đọc
    // state.currentSchedule.scheduleTable và renderStudentTable() đọc
    // state.currentSchedule.studentStats. Nếu chỉ xoá storage mà không
    // cập nhật 2 biến này, bảng điều khiển VẪN HIỆN LỊCH CŨ trong khi
    // dữ liệu trên đĩa đã bị xoá — và lần saveSchedule() kế tiếp sẽ ghi đè
    // lịch tháng mới bằng lịch cũ.
    state.twoWeekSchedule = state.monthSchedule;
    state.currentSchedule = state.monthSchedule.weeks[0];

    window.dispatchEvent(new CustomEvent('ts:data-changed', {
      detail: { keys: [STORAGE_KEYS.MONTH_SCHEDULE, STORAGE_KEYS.SCHEDULE, STORAGE_KEYS.SWAP_REQUESTS] }
    }));

    renderAll();
    updateBackupStats();
    updateSwapCountBadges();
    closeBackupCenterModal();

    showToast('Đã khởi tạo kỳ trực tháng mới thành công! Danh sách sinh viên vẫn được bảo toàn nguyên vẹn.', 'success');
  }

  /**
   * ==========================================================================
   * 1. QUẢN LÝ SỰ KIỆN & HOẠT ĐỘNG NGOẠI KIỂM TUYỂN SINH (EVENT MANAGER)
   * ==========================================================================
   */
  const EventManager = {
    getEvents(monthKey) {
      let list = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
        if (raw) list = JSON.parse(raw);
      } catch (e) {
        console.error('Lỗi khi đọc danh sách sự kiện:', e);
        list = [];
      }
      if (!Array.isArray(list)) list = [];

      // Sắp xếp theo ngày tăng dần
      list.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateA - dateB;
      });

      if (monthKey) {
        return list.filter(e => {
          if (e.monthKey === monthKey) return true;
          if (e.date && e.date.startsWith(monthKey)) return true;
          return false;
        });
      }

      return list;
    },

    saveEvents(list) {
      try {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.EVENTS] } }));
      } catch (err) {
        console.error('Lỗi khi lưu danh sách sự kiện:', err);
        showToast('Lỗi lưu trữ danh sách sự kiện!', 'error');
      }
    },

    addEvent(eventData) {
      if (!eventData || !eventData.title || !eventData.title.trim() || !eventData.date || !eventData.date.trim()) {
        throw new Error('Sự kiện phải có tiêu đề và ngày diễn ra');
      }

      const list = this.getEvents();
      const createdAt = Date.now();
      const timeOfDay = eventData.timeOfDay || 'morning';
      const defaultUnits = timeOfDay === 'fullday' ? 2 : 1;
      const workUnits = (typeof eventData.workUnits === 'number' && !isNaN(eventData.workUnits))
        ? eventData.workUnits
        : defaultUnits;

      const dateStr = eventData.date.trim();
      const monthKey = eventData.monthKey || dateStr.substring(0, 7);

      const newEvent = {
        id: eventData.id || ('evt_' + createdAt + '_' + Math.random().toString(36).slice(2, 8)),
        title: eventData.title.trim(),
        date: dateStr,
        monthKey: monthKey,
        location: (eventData.location || '').trim(),
        timeOfDay: timeOfDay,
        workUnits: workUnits,
        assignedStudentIds: Array.isArray(eventData.assignedStudentIds) ? [...eventData.assignedStudentIds] : [],
        note: (eventData.note || '').trim(),
        createdAt: createdAt
      };

      list.push(newEvent);
      this.saveEvents(list);
      state.events = list;
      return newEvent;
    },

    assignStudent(eventId, studentIdOrMssv) {
      const list = this.getEvents();
      const evt = list.find(e => e.id === eventId);
      if (!evt) return false;

      if (!Array.isArray(evt.assignedStudentIds)) {
        evt.assignedStudentIds = [];
      }

      if (evt.assignedStudentIds.includes(studentIdOrMssv)) {
        return false; // Đã tồn tại, tránh trùng lặp
      }

      evt.assignedStudentIds.push(studentIdOrMssv);
      this.saveEvents(list);
      state.events = list;
      return true;
    },

    deleteEvent(id) {
      let list = this.getEvents();
      const initialLen = list.length;
      list = list.filter(e => e.id !== id);
      if (list.length === initialLen) {
        return false;
      }
      this.saveEvents(list);
      state.events = list;
      return true;
    }
  };

  /**
   * ==========================================================================
   * 2. BỘ TÍNH CÔNG THÁNG & CHẤM CÔNG CTV (PAYROLL CALCULATOR)
   * ==========================================================================
   */
  const PayrollCalculator = {
    calculateOfficeShifts(student, monthSchedule) {
      if (!student || !monthSchedule) {
        return { count: 0, details: [] };
      }

      const weeks = Array.isArray(monthSchedule.weeks) ? monthSchedule.weeks : [];
      let count = 0;
      const details = [];

      const targetId = student.id;
      const targetMssv = student.studentId;

      weeks.forEach((w, wIdx) => {
        const weekNum = w.weekNumber || w.weekNum || (wIdx + 1);
        const schedTable = w.scheduleTable || {};

        Object.entries(schedTable).forEach(([shiftId, slot]) => {
          if (!slot) return;

          const isMatch = (member) => {
            if (!member) return false;
            return (targetId && member.id === targetId) ||
                   (targetMssv && (member.studentId === targetMssv || member.id === targetMssv));
          };

          if (isMatch(slot.oldMember) || isMatch(slot.newMember)) {
            count += 1;
            const dayKey = slot.dayKey || shiftId.split('_')[0];
            const period = slot.period || (shiftId.endsWith('_S') ? 'S' : 'C');
            const periodName = period === 'S' ? 'Sáng' : 'Chiều';
            details.push(`Tuần ${weekNum}: ${dayKey} ${periodName} (${shiftId})`);
          }
        });
      });

      return { count, details };
    },

    calculateEventWorkUnits(student, events, monthKey) {
      if (!student || !Array.isArray(events)) {
        return { count: 0, workUnits: 0, details: [] };
      }

      let count = 0;
      let totalWorkUnits = 0;
      const details = [];

      const targetId = student.id;
      const targetMssv = student.studentId;

      events.forEach(evt => {
        if (!evt) return;
        if (monthKey) {
          const matchMonth = evt.monthKey === monthKey || (evt.date && evt.date.startsWith(monthKey));
          if (!matchMonth) return;
        }

        const assigned = Array.isArray(evt.assignedStudentIds) ? evt.assignedStudentIds : [];
        const isAssigned = (targetId && assigned.includes(targetId)) ||
                           (targetMssv && assigned.includes(targetMssv));

        if (isAssigned) {
          count += 1;
          const timeOfDay = evt.timeOfDay || 'morning';
          const units = (typeof evt.workUnits === 'number' && !isNaN(evt.workUnits))
            ? evt.workUnits
            : (timeOfDay === 'fullday' ? 2 : 1);

          totalWorkUnits += units;
          details.push({
            id: evt.id,
            title: evt.title,
            date: evt.date,
            timeOfDay: evt.timeOfDay,
            workUnits: units
          });
        }
      });

      return { count, workUnits: totalWorkUnits, details };
    },

    calculateMonthlyPayroll(param1, param2, param3, param4) {
      let students = [];
      let monthSchedule = null;
      let events = [];
      let monthKey = null;

      if (param1 && !Array.isArray(param1) && typeof param1 === 'object') {
        students = param1.students || [];
        monthSchedule = param1.monthSchedule || null;
        events = param1.events || [];
        monthKey = param1.monthKey || null;
      } else {
        students = Array.isArray(param1) ? param1 : [];
        monthSchedule = param2 || null;
        events = Array.isArray(param3) ? param3 : [];
        monthKey = param4 || null;
      }

      const results = [];

      students.forEach(st => {
        const office = this.calculateOfficeShifts(st, monthSchedule);
        const eventData = this.calculateEventWorkUnits(st, events, monthKey);
        const totalWorkUnits = office.count + eventData.workUnits;

        results.push({
          studentId: st.id,
          studentMssv: st.studentId || '',
          fullName: st.fullName || '',
          role: st.role || 'new',
          officeShiftsCount: office.count,
          eventCount: eventData.count,
          eventWorkUnits: eventData.workUnits,
          totalWorkUnits: totalWorkUnits,
          officeShiftDetails: office.details,
          eventDetails: eventData.details
        });
      });

      // Sắp xếp: totalWorkUnits giảm dần, sau đó theo fullName tiếng Việt
      results.sort((a, b) => {
        if (b.totalWorkUnits !== a.totalWorkUnits) {
          return b.totalWorkUnits - a.totalWorkUnits;
        }
        return (a.fullName || '').localeCompare(b.fullName || '', 'vi');
      });

      return results;
    },

    getPayrollSummary(payrollItems) {
      const items = Array.isArray(payrollItems) ? payrollItems : [];
      const totalStudents = items.length;
      const oldStudentsCount = items.filter(p => p.role === 'old').length;
      const newStudentsCount = items.filter(p => p.role === 'new').length;
      const totalOfficeShifts = items.reduce((sum, p) => sum + (p.officeShiftsCount || 0), 0);
      const totalEventUnits = items.reduce((sum, p) => sum + (p.eventWorkUnits || 0), 0);
      const grandTotalWorkUnits = items.reduce((sum, p) => sum + (p.totalWorkUnits || 0), 0);

      return {
        totalStudents,
        oldStudentsCount,
        newStudentsCount,
        totalOfficeShifts,
        totalEventUnits,
        grandTotalWorkUnits
      };
    },

    getPayrollFromBackup(backupItem) {
      if (!backupItem || !backupItem.payload) {
        return {
          backupId: '',
          monthKey: '',
          monthLabel: '',
          createdAt: 0,
          payrollItems: [],
          summary: this.getPayrollSummary([])
        };
      }

      const monthKey = backupItem.monthKey || '2026-10';
      const monthLabel = backupItem.monthLabel || backupItem.name || 'Tháng 10/2026';
      const students = backupItem.payload.students || [];
      const monthSchedule = backupItem.payload.monthSchedule || null;
      const events = backupItem.payload.events || [];

      const payrollItems = this.calculateMonthlyPayroll({
        students,
        monthSchedule,
        events,
        monthKey
      });

      const summary = this.getPayrollSummary(payrollItems);

      return {
        backupId: backupItem.id,
        monthKey: monthKey,
        monthLabel: monthLabel,
        createdAt: backupItem.createdAt,
        payrollItems: payrollItems,
        summary: summary
      };
    },

    exportReport(payrollReport, format = 'csv') {
      const items = payrollReport.payrollItems || [];
      const monthLabel = payrollReport.monthLabel || 'Kỳ Trực';

      if (format === 'csv') {
        const rows = [
          `"BẢNG CHẤM CÔNG CỘNG TÁC VIÊN BAN TƯ VẤN TUYỂN SINH - ${monthLabel}"`,
          `"Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}"`,
          '',
          '"STT","MSSV","Họ và Tên","Phân Loại","Số Ca Trực VP","Số Sự Kiện","Công Sự Kiện","Tổng Công Quy Đổi"'
        ];

        items.forEach((item, idx) => {
          const roleLabel = item.role === 'old' ? 'Người Cũ' : 'Người Mới';
          rows.push([
          escapeCsvCell(idx + 1),
          escapeCsvCell(item.studentMssv),
          escapeCsvCell(item.fullName),
          escapeCsvCell(roleLabel),
          escapeCsvCell(item.officeShiftsCount),
          escapeCsvCell(item.eventCount),
          escapeCsvCell(item.eventWorkUnits),
          escapeCsvCell(item.totalWorkUnits)
        ].join(','));
        });

        return '\uFEFF' + rows.join('\r\n');
      }

      if (format === 'html') {
        const rowsHtml = items.map((item, idx) => {
          const roleLabel = item.role === 'old' ? 'Người Cũ' : 'Người Mới';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(item.studentMssv)}</td>
              <td>${escapeHtml(item.fullName)}</td>
              <td>${escapeHtml(roleLabel)}</td>
              <td>${item.officeShiftsCount}</td>
              <td>${item.eventCount}</td>
              <td>${item.eventWorkUnits}</td>
              <td><strong>${item.totalWorkUnits}</strong></td>
            </tr>
          `;
        }).join('');

        return `
          <table class="payroll-report-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>MSSV</th>
                <th>Họ và Tên</th>
                <th>Phân Loại</th>
                <th>Trực VP</th>
                <th>Sự Kiện</th>
                <th>Công SK</th>
                <th>Tổng Công</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        `;
      }

      return '';
    }
  };

  /**
   * ==========================================================================
   * HỆ THỐNG SAO LƯU TRỰC TIẾP TRÊN WEB (TỐI ĐA 6 THÁNG / 180 NGÀY)
   * ==========================================================================
   */
  const MAX_WEB_BACKUPS = 6;
  const RETENTION_PERIOD_MS = 180 * 24 * 60 * 60 * 1000; // 6 tháng (~180 ngày)

  function getWebBackups() {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WEB_BACKUPS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {
      console.error('Lỗi khi đọc danh sách bản sao lưu web:', e);
      list = [];
    }

    if (!Array.isArray(list)) list = [];

    // Tự động dọn dẹp các bản sao lưu cũ quá 6 tháng (180 ngày)
    const now = Date.now();
    const initialLen = list.length;
    list = list.filter(item => {
      if (!item || !item.createdAt) return false;
      return (now - item.createdAt) <= RETENTION_PERIOD_MS;
    });

    // Sắp xếp mới nhất lên đầu
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Giới hạn tối đa 6 bản gần nhất
    if (list.length > MAX_WEB_BACKUPS) {
      list = list.slice(0, MAX_WEB_BACKUPS);
    }

    // Nếu có sự thay đổi do dọn dẹp bản cũ quá 6 tháng, lưu ngược lại
    if (list.length !== initialLen) {
      try {
        localStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify(list));
      } catch (err) {}
    }

    return list;
  }

  function saveWebBackups(list) {
    try {
      localStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify(list));
window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.WEB_BACKUPS] } }));
      if (window.CloudSyncManager && typeof window.CloudSyncManager.pushToCloud === 'function') {
        window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] WebBackups push error:', err));
      }
    } catch (err) {
      console.error('Lỗi khi lưu bản sao lưu web:', err);
      showToast('Lỗi lưu trữ: Bộ nhớ LocalStorage trình duyệt có thể đã đầy!', 'error');
    }
  }

  function createWebBackup(customName) {
    let swapList = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) swapList = JSON.parse(raw);
    } catch (e) {}

    const now = new Date();
    const createdAt = Date.now();
    const monthNum = state.currentMonth || (now.getMonth() + 1);
    const yearNum = state.currentYear || now.getFullYear();
    const monthKey = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    const monthLabel = `Tháng ${String(monthNum).padStart(2, '0')}/${yearNum}`;

    const defaultName = (typeof customName === 'string' && customName.trim())
      ? customName.trim()
      : `Bản Chấm Công & Sao Lưu Tháng ${String(monthNum).padStart(2, '0')}/${yearNum}`;

    let studentList = (state.students && state.students.length > 0) ? state.students : [];
    if (studentList.length === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        if (raw) studentList = JSON.parse(raw) || [];
      } catch (e) {}
    }

    let monthSched = state.monthSchedule;
    if (!monthSched) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE);
        if (raw) monthSched = JSON.parse(raw);
      } catch (e) {}
    }

    let schedRes = state.scheduleResult;
    if (!schedRes) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
        if (raw) schedRes = JSON.parse(raw);
      } catch (e) {}
    }

    let regCfg = state.regConfig;
    if (!regCfg) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.REG_CONFIG);
        if (raw) regCfg = JSON.parse(raw);
      } catch (e) {}
    }

    let adminUserList = (state.adminUsers && state.adminUsers.length > 0) ? state.adminUsers : [];
    if (adminUserList.length === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_USERS);
        if (raw) adminUserList = JSON.parse(raw) || [];
      } catch (e) {}
    }

    let eventList = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (raw) eventList = JSON.parse(raw) || [];
    } catch (e) {}
    if (eventList.length === 0 && state.events && state.events.length > 0) {
      eventList = state.events;
    }

    // ⚠️ Phải truyền monthKey: không có nó, calculateEventWorkUnits KHÔNG lọc
    // theo tháng, nên công của sự kiện MỌI tháng đều cộng vào bản sao lưu của
    // tháng này — tổng công bị thổi phồng theo thời gian.
    const backupMonthKey = monthSched?.monthKey
      || (monthSched?.month && monthSched?.year
        ? `${monthSched.year}-${String(monthSched.month).padStart(2, '0')}`
        : `${state.currentYear || 2026}-${String(state.currentMonth || 10).padStart(2, '0')}`);

    const payroll = PayrollCalculator.calculateMonthlyPayroll(studentList, monthSched, eventList, backupMonthKey);
    const totalWorkUnits = payroll.reduce((sum, item) => sum + (item.totalWorkUnits || 0), 0);

    const backupPayload = {
      // monthKey để về sau lọc đúng công sự kiện của kỳ này. Trước đây
      // payload không có khoá tháng nên khi xem bảng chấm công của một bản
      // sao lưu, công của mọi tháng cộng chung vào.
      monthKey,
      month: monthNum,
      year: yearNum,
      students: studentList,
      monthSchedule: monthSched,
      scheduleResult: schedRes,
      regConfig: regCfg,
      adminUsers: adminUserList,
      swapRequests: swapList,
      events: eventList
    };

    const payloadJson = JSON.stringify(backupPayload);
    const sizeBytes = typeof Blob !== 'undefined' ? new Blob([payloadJson]).size : payloadJson.length;

    const backupItem = {
      id: `wbk_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
      name: defaultName,
      monthKey: monthKey,
      monthLabel: monthLabel,
      createdAt: createdAt,
      expiresAt: createdAt + RETENTION_PERIOD_MS,
      sizeBytes: sizeBytes,
      stats: {
        studentCount: studentList.length,
        weekCount: (monthSched?.weeks || []).length || 4,
        swapCount: swapList.length,
        adminCount: adminUserList.length,
        eventCount: eventList.length,
        totalWorkUnits: totalWorkUnits
      },
      payload: backupPayload
    };

    let backups = getWebBackups();
    backups.unshift(backupItem);

    if (backups.length > MAX_WEB_BACKUPS) {
      backups = backups.slice(0, MAX_WEB_BACKUPS);
    }

    saveWebBackups(backups);
    renderWebBackupsTable();
    updateBackupStats();

    return backupItem;
  }

  function handleTriggerCreateWebBackup(customName) {
    const now = new Date();
    const monthNum = now.getMonth() + 1;
    const yearNum = now.getFullYear();
    const finalName = (typeof customName === 'string' && customName.trim())
      ? customName.trim()
      : `Bản Chấm Công & Sao Lưu Tháng ${monthNum}/${yearNum}`;

    const backupItem = createWebBackup(finalName);
    showToast(`Đã tạo bản sao lưu "${backupItem.name}" thành công!`, 'success');
    return backupItem;
  }

  function renderWebBackupsTable() {
    const tbody = elements.webBackupTableBody || document.getElementById('web-backup-table-body');
    const badge = elements.webBackupCountBadge || document.getElementById('web-backup-count-badge');
    const storageInfo = elements.webBackupStorageInfo || document.getElementById('web-backup-storage-info');

    if (!tbody) return;

    const backups = getWebBackups();

    if (badge) {
      badge.textContent = `${backups.length} / ${MAX_WEB_BACKUPS} bản`;
      badge.style.color = backups.length >= MAX_WEB_BACKUPS ? '#b45309' : 'var(--text-main)';
    }

    let totalBytes = 0;
    backups.forEach(b => { totalBytes += (b.sizeBytes || 0); });

    if (storageInfo) {
      const kb = (totalBytes / 1024).toFixed(1);
      storageInfo.textContent = `Dung lượng đã dùng: ${kb} KB | Lưu trữ tối đa 6 tháng (${backups.length}/${MAX_WEB_BACKUPS} kỳ)`;
    }

    if (backups.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.35rem;">📭</div>
            <div style="font-weight: 600; font-size: 0.92rem; margin-bottom: 0.25rem;">Chưa có bản sao lưu nào được lưu trên web</div>
            <div style="font-size: 0.8rem; margin-bottom: 0.85rem;">Nhấn nút bên dưới để tạo ngay bản snapshot đầu tiên của hệ thống.</div>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.adminTriggerCreateWebBackup && window.adminTriggerCreateWebBackup()" style="font-weight: 700;">
              💾 Tạo Bản Sao Lưu Đầu Tiên
            </button>
          </td>
        </tr>
      `;
      return;
    }

    const now = Date.now();

    tbody.innerHTML = backups.map((item, idx) => {
      const createdDate = new Date(item.createdAt);
      const createdStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')} ngày ${createdDate.getDate()}/${createdDate.getMonth() + 1}/${createdDate.getFullYear()}`;
      
      const diffMs = (item.expiresAt || (item.createdAt + RETENTION_PERIOD_MS)) - now;
      const remDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const expiryText = remDays > 0 ? `Còn ${remDays} ngày` : 'Sắp hết hạn';

      const sizeKb = ((item.sizeBytes || 0) / 1024).toFixed(1);
      const stats = item.stats || { studentCount: 0, weekCount: 4, swapCount: 0, adminCount: 2 };

      return `
        <tr>
          <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${idx + 1}</td>
          <td>
            <a href="javascript:void(0)" onclick="window.adminViewMonthPayroll && window.adminViewMonthPayroll('${escapeHtml(item.id)}')" class="backup-payroll-link" title="Bấm để xem Bảng Chấm Công chi tiết của tháng này">
              <span style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${escapeHtml(item.name)}</span>
            </a>
            <div style="display: flex; gap: 0.35rem; align-items: center; margin-top: 0.25rem;">
              <button type="button" onclick="window.adminViewMonthPayroll && window.adminViewMonthPayroll('${escapeHtml(item.id)}')" class="badge" style="background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; font-size: 0.72rem; padding: 0.15rem 0.55rem; border-radius: var(--radius-full); cursor: pointer; font-weight: 700;" title="Xem Bảng Chấm Công tháng này">
                🗓️ ${escapeHtml(item.monthLabel || 'Kỳ trực')} &bull; Xem công
              </button>
            </div>
          </td>
          <td>
            <div style="font-weight: 600; font-size: 0.84rem; color: var(--text-main);">${escapeHtml(createdStr)}</div>
            <div style="font-size: 0.75rem; color: #059669; font-weight: 600; margin-top: 0.15rem;">
              ⏳ Hạn lưu: ${escapeHtml(expiryText)} (Tối đa 6 tháng)
            </div>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: var(--text-main);">
              👥 <strong>${stats.studentCount}</strong> CTV &bull; 📅 <strong>${stats.weekCount}</strong> tuần
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              🎟️ <strong>${stats.eventCount || 0}</strong> SK &bull; 💼 <strong>${stats.totalWorkUnits || 0}</strong> công
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              🔄 ${stats.swapCount} đề xuất &bull; 🔑 ${stats.adminCount || 2} cán bộ
            </div>
          </td>
          <td style="text-align: center; font-size: 0.82rem; font-weight: 600; color: var(--text-muted);">
            ${sizeKb} KB
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm btn-view-payroll-highlight" onclick="window.adminViewMonthPayroll && window.adminViewMonthPayroll('${escapeHtml(item.id)}')" title="Xem bảng chấm công tổng hợp CTV trong tháng này" style="font-size: 0.76rem; padding: 0.25rem 0.55rem; font-weight: 700; background: #ecfdf5; color: #065f46; border: 1.5px solid #a7f3d0;">
                👁️ Xem Bảng Công
              </button>
              <button type="button" class="btn btn-primary btn-sm" onclick="window.adminRestoreFromWebBackup('${escapeHtml(item.id)}')" title="Khôi phục nhanh 1-click về bản sao lưu này" style="font-size: 0.76rem; padding: 0.25rem 0.55rem; font-weight: 700;">
                🔄 Khôi Phục
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.adminDownloadSingleWebBackup('${escapeHtml(item.id)}')" title="Tải file JSON về máy tính" style="font-size: 0.76rem; padding: 0.25rem 0.45rem;">
                ⬇️
              </button>
              <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.adminDeleteWebBackup('${escapeHtml(item.id)}')" title="Xóa bản sao lưu này" style="font-size: 0.76rem; padding: 0.25rem 0.45rem;">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

async function handleRestoreFromWebBackup(backupId) {
    const backups = getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (!target || !target.payload) {
      showToast('Không tìm thấy bản sao lưu hợp lệ!', 'error');
      return;
    }

    const createdDate = new Date(target.createdAt);
    const dateStr = `${createdDate.toLocaleDateString('vi-VN')} ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;

      const dcrestore = await confirmDangerAction({
        title: "Khôi phục hệ thống từ bản sao lưu",
        message: "Toàn bộ dữ liệu đang có trên trình duyệt sẽ bị THAY THẾ bằng bản sao lưu này.",
        losses: ["Toàn bộ danh sách CTV hiện tại", "Toàn bộ ca rảnh và lịch trực hiện tại", "Mọi thay đổi chưa được lưu lên sao lưu"],
        keyword: 'KHOI PHUC',
        confirmLabel: "Khôi phục và ghi đè",
      });
      if (!dcrestore) return;

    try {
      const payload = target.payload;

      if (payload.students) {
        state.students = payload.students;
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(state.students));
      }
      if (payload.monthSchedule) {
        state.monthSchedule = payload.monthSchedule;
        localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
      }
      if (payload.scheduleResult) {
        state.scheduleResult = payload.scheduleResult;
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.scheduleResult));
      }
      if (payload.regConfig) {
        state.regConfig = payload.regConfig;
        localStorage.setItem(STORAGE_KEYS.REG_CONFIG, JSON.stringify(state.regConfig));
      }
      if (payload.adminUsers && payload.adminUsers.length > 0) {
        state.adminUsers = payload.adminUsers;
        localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(state.adminUsers));
      }
      if (payload.swapRequests) {
        localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(payload.swapRequests));
      }
      if (payload.events) {
        state.events = payload.events;
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(state.events));
      }

window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.EVENTS] } }));

      renderAll();
      renderRegConfigUI();
      updateBackupStats();
      updateSwapCountBadges();
      renderWebBackupsTable();
      closeBackupCenterModal();

      showToast(`Đã khôi phục toàn bộ hệ thống từ "${target.name}" thành công 100%!`, 'success');
    } catch (err) {
      console.error('Lỗi khôi phục web backup:', err);
      showToast('Đã có lỗi xảy ra trong quá trình ghi dữ liệu khôi phục!', 'error');
    }
  }

  function handleDownloadSingleWebBackup(backupId) {
    const backups = getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (!target || !target.payload) {
      showToast('Không tìm thấy dữ liệu bản sao lưu!', 'error');
      return;
    }

    const backupPayload = {
      meta: {
        appName: 'Hệ Thống Phân Công Lịch Trực Ban TVTS HCM-UTE',
        version: '2.5',
        backupId: target.id,
        backupName: target.name,
        monthKey: target.monthKey,
        exportedAt: new Date(target.createdAt).toISOString(),
        exportedBy: state.currentUser ? state.currentUser.fullName : 'Admin'
      },
      ...target.payload
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeName = (target.name || 'WebBackup').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_');
    const link = document.createElement('a');
    link.href = url;
    link.download = `TVTS_${safeName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Đã tải xuống file sao lưu "${target.name}" (.json)!`, 'success');
  }

async function handleDeleteWebBackup(backupId) {
    const backups = getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (!target) return;

      const dcbackup = await confirmDangerAction({
        title: "Xóa bản sao lưu",
        message: "Bản sao lưu này sẽ bị xóa khỏi trình duyệt và không thể khôi phục lại.",
        losses: ["1 bản sao lưu (dữ liệu CTV + lịch trực trong bản sao đó)"],
        keyword: 'XOA BACKUP',
        confirmLabel: "Xóa bản sao lưu",
      });
      if (!dcbackup) {
        return;
      }

    const updated = backups.filter(b => b.id !== backupId);
    saveWebBackups(updated);
    renderWebBackupsTable();
    updateBackupStats();
    showToast(`Đã xóa bản sao lưu "${target.name}" khỏi web!`, 'info');
  }

  /**
   * ==========================================================================
   * 3. XEM BẢNG CHẤM CÔNG THÁNG & MODAL PAYROLL
   * ==========================================================================
   */
  function handleViewMonthPayroll(backupId) {
    let students = [];
    let monthSchedule = null;
    let events = [];
    let monthLabel = '';
    // Khoá tháng đang xem, ví dụ '2026-10'. Bắt buộc để lọc công sự kiện
    // theo đúng kỳ — xem calculateEventWorkUnits.
    let monthKey = null;

    if (backupId && backupId !== 'current') {
      const backups = getWebBackups();
      const target = backups.find(b => b.id === backupId);
      if (!target || !target.payload) {
        showToast('Không tìm thấy dữ liệu bản sao lưu hợp lệ!', 'error');
        return null;
      }
      students = target.payload.students || [];
      monthSchedule = target.payload.monthSchedule || null;
      events = target.payload.events || [];
      monthLabel = target.name || target.monthLabel || 'Kỳ Sao Lưu';
      // Bản sao lưu có thể đã mang monthKey do createWebBackup ghi kèm
      monthKey = target.payload.monthKey
        || target.monthKey
        || (monthSchedule?.monthKey
          || (monthSchedule?.month && monthSchedule?.year
            ? `${monthSchedule.year}-${String(monthSchedule.month).padStart(2, '0')}`
            : null));
    } else {
      // Dữ liệu tháng hiện tại
      students = (state.students && state.students.length > 0) ? state.students : [];
      if (students.length === 0) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
          if (raw) students = JSON.parse(raw) || [];
        } catch (e) {}
      }
      monthSchedule = state.monthSchedule;
      if (!monthSchedule) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE);
          if (raw) monthSchedule = JSON.parse(raw);
        } catch (e) {}
      }
      events = EventManager.getEvents();
      // Bắt buộc lọc theo kỳ: nếu không, công sự kiện của MỌI tháng cộng vào
      // bảng "Tháng X/YYYY" đang xem và tổng côg bị thổi phồng.
      monthKey = monthSchedule?.monthKey
        || (monthSchedule?.month && monthSchedule?.year
          ? `${monthSchedule.year}-${String(monthSchedule.month).padStart(2, '0')}`
          : `${state.currentYear || 2026}-${String(state.currentMonth || 10).padStart(2, '0')}`);
      const now = new Date();
      monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()} (Hiện Tại)`;
    }

    const payrollData = PayrollCalculator.calculateMonthlyPayroll(students, monthSchedule, events, monthKey);
    renderMonthlyPayrollModal(payrollData, monthLabel);
    return payrollData;
  }

  function renderMonthlyPayrollModal(payrollData, monthLabel) {
    let modal = document.getElementById('modal-monthly-payroll');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-monthly-payroll';
      modal.className = 'modal-overlay modal-backdrop';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const totalStudents = payrollData.length;
    const totalWorkUnits = payrollData.reduce((sum, item) => sum + (item.totalWorkUnits || 0), 0);
    const totalOfficeShifts = payrollData.reduce((sum, item) => sum + (item.officeShiftsCount || 0), 0);
    const totalEventUnits = payrollData.reduce((sum, item) => sum + (item.eventWorkUnits || 0), 0);

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 980px; width: 95vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); background: var(--bg-card, #ffffff);">
        
        <!-- Modal Header -->
        <div class="modal-header" style="background: linear-gradient(135deg, #1e1b4b, #3730a3); color: #ffffff; padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 class="modal-title" style="color: #ffffff; font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
              <span>📊 Bảng Chấm Công & Phân Bổ Công Tác Tuyển Sinh</span>
            </h3>
            <p style="font-size: 0.84rem; color: #c7d2fe; margin-top: 0.25rem; margin-bottom: 0;">
              🗓️ <strong>${escapeHtml(monthLabel)}</strong> &bull; Tổng hợp 4 tuần trực văn phòng & các đợt đi tour/sự kiện
            </p>
          </div>
          <button type="button" class="modal-close-btn" onclick="window.adminCloseMonthPayroll && window.adminCloseMonthPayroll()" style="color: #ffffff; background: rgba(255,255,255,0.15); border: none; font-size: 1.5rem; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>

        <!-- Modal Body with Scroll -->
        <div class="modal-body" style="padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1;">
          
          <!-- Summary Metrics Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem; margin-bottom: 1.25rem;">
            <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-transform: uppercase;">👥 Tổng Số CTV</div>
              <div style="font-size: 1.45rem; font-weight: 800; color: #1e293b; margin-top: 0.2rem;">${totalStudents} <span style="font-size: 0.85rem; font-weight: 600; color: #64748b;">sinh viên</span></div>
            </div>
            <div style="background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 10px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.78rem; color: #047857; font-weight: 600; text-transform: uppercase;">💼 Tổng Công Toàn Đoàn</div>
              <div style="font-size: 1.45rem; font-weight: 800; color: #065f46; margin-top: 0.2rem;">${totalWorkUnits} <span style="font-size: 0.85rem; font-weight: 600; color: #047857;">công</span></div>
            </div>
            <div style="background: #eef2ff; border: 1.5px solid #c7d2fe; border-radius: 10px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.78rem; color: #4338ca; font-weight: 600; text-transform: uppercase;">🏢 Trực Văn Phòng (4 Tuần)</div>
              <div style="font-size: 1.45rem; font-weight: 800; color: #312e81; margin-top: 0.2rem;">${totalOfficeShifts} <span style="font-size: 0.85rem; font-weight: 600; color: #4338ca;">ca</span></div>
            </div>
            <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.78rem; color: #b45309; font-weight: 600; text-transform: uppercase;">🎟️ Công Sự Kiện / Tour</div>
              <div style="font-size: 1.45rem; font-weight: 800; color: #92400e; margin-top: 0.2rem;">${totalEventUnits} <span style="font-size: 0.85rem; font-weight: 600; color: #b45309;">công</span></div>
            </div>
          </div>

          <!-- Search & Filter Controls -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
            <div style="position: relative; flex: 1; min-width: 240px; max-width: 400px;">
              <input type="text" id="payroll-search-input" placeholder="🔍 Tìm theo Tên hoặc MSSV…" style="width: 100%; padding: 0.5rem 0.85rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; outline: none;">
            </div>
            <div style="display: flex; gap: 0.4rem;">
              <button type="button" class="btn btn-secondary btn-sm payroll-role-filter active" data-role="all" style="font-weight: 700;">Tất cả (${totalStudents})</button>
              <button type="button" class="btn btn-secondary btn-sm payroll-role-filter" data-role="old" style="font-weight: 700;">🎓 Chính Thức</button>
              <button type="button" class="btn btn-secondary btn-sm payroll-role-filter" data-role="new" style="font-weight: 700;">🌱 Tập Sự</button>
            </div>
          </div>

          <!-- Table Container -->
          <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow-x: auto; background: #ffffff;">
            <table class="user-mgmt-table" style="margin: 0; min-width: 780px; width: 100%; border-collapse: collapse;" id="payroll-main-table">
              <thead style="background: #f1f5f9;">
                <tr>
                  <th style="width: 50px; text-align: center; padding: 0.65rem 0.5rem;">STT</th>
                  <th style="width: 110px; padding: 0.65rem 0.75rem;">MSSV</th>
                  <th style="padding: 0.65rem 0.75rem;">Họ và Tên</th>
                  <th style="width: 110px; text-align: center; padding: 0.65rem 0.5rem;">Phân Loại</th>
                  <th style="width: 100px; text-align: center; padding: 0.65rem 0.5rem;">Trực VP (ca)</th>
                  <th style="width: 100px; text-align: center; padding: 0.65rem 0.5rem;">Sự Kiện (lần)</th>
                  <th style="width: 100px; text-align: center; padding: 0.65rem 0.5rem;">Công SK</th>
                  <th style="width: 110px; text-align: center; padding: 0.65rem 0.5rem; background: #f0fdf4;">TỔNG CÔNG</th>
                  <th style="padding: 0.65rem 0.75rem;">Chi Tiết Phân Bổ</th>
                </tr>
              </thead>
              <tbody id="payroll-table-body">
                ${renderPayrollRows(payrollData)}
              </tbody>
            </table>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="padding: 0.85rem 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="font-size: 0.82rem; color: #64748b;">
            💡 <em>Quy đổi: 1 ca trực văn phòng = 1 công. Đi sự kiện: Buổi = 1 công, Cả ngày = 2 công.</em>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()" style="font-weight: 700;">
              🖨️ In Bảng Chấm Công
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.adminCloseMonthPayroll && window.adminCloseMonthPayroll()" style="font-weight: 700;">
              Đóng
            </button>
          </div>
        </div>

      </div>
    `;

    modal.style.display = 'flex';

    // Hook search & filter in modal
    const searchInput = modal.querySelector('#payroll-search-input');
    const filterBtns = modal.querySelectorAll('.payroll-role-filter');
    const tbody = modal.querySelector('#payroll-table-body');

    let currentRole = 'all';
    let currentSearch = '';

    function filterAndRender() {
      const filtered = payrollData.filter(item => {
        if (currentRole !== 'all' && item.role !== currentRole) return false;
        if (currentSearch) {
          const s = currentSearch.toLowerCase();
          const matchName = (item.fullName || '').toLowerCase().includes(s);
          const matchMssv = (item.studentMssv || '').toLowerCase().includes(s);
          if (!matchName && !matchMssv) return false;
        }
        return true;
      });
      tbody.innerHTML = renderPayrollRows(filtered);
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        filterAndRender();
      });
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRole = btn.getAttribute('data-role') || 'all';
        filterAndRender();
      });
    });
  }

  function renderPayrollRows(list) {
    if (!list || list.length === 0) {
      return `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #64748b;">
            Không tìm thấy dữ liệu chấm công phù hợp.
          </td>
        </tr>
      `;
    }

    return list.map((item, idx) => {
      const roleBadge = item.role === 'old'
        ? `<span class="badge badge-role-old" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;">🎓 Chính Thức</span>`
        : `<span class="badge badge-role-new" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;">🌱 Tập Sự</span>`;

      const officeDetails = item.officeShiftDetails && item.officeShiftDetails.length > 0
        ? item.officeShiftDetails.join(', ')
        : 'Chưa có ca';

      const eventDetails = item.eventDetails && item.eventDetails.length > 0
        ? item.eventDetails.map(e => `${e.title} (${e.workUnits} công)`).join('; ')
        : '';

      const detailText = [
        officeDetails !== 'Chưa có ca' ? `🏢 ${officeDetails}` : null,
        eventDetails ? `🎟️ ${eventDetails}` : null
      ].filter(Boolean).join(' | ') || 'Chưa phân bổ';

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="text-align: center; font-weight: 600; color: #64748b; padding: 0.6rem 0.5rem;">${idx + 1}</td>
          <td style="font-weight: 700; color: #334155; font-size: 0.86rem; padding: 0.6rem 0.75rem;">${escapeHtml(item.studentMssv || '—')}</td>
          <td style="font-weight: 700; color: #0f172a; font-size: 0.9rem; padding: 0.6rem 0.75rem;">${escapeHtml(item.fullName)}</td>
          <td style="text-align: center; padding: 0.6rem 0.5rem;">${roleBadge}</td>
          <td style="text-align: center; font-weight: 600; color: #3730a3; padding: 0.6rem 0.5rem;">${item.officeShiftsCount}</td>
          <td style="text-align: center; font-weight: 600; color: #92400e; padding: 0.6rem 0.5rem;">${item.eventCount}</td>
          <td style="text-align: center; font-weight: 600; color: #b45309; padding: 0.6rem 0.5rem;">${item.eventWorkUnits}</td>
          <td style="text-align: center; font-weight: 800; font-size: 1rem; color: #065f46; background: #f0fdf4; padding: 0.6rem 0.5rem;">
            <span style="background: #10b981; color: #ffffff; padding: 0.2rem 0.65rem; border-radius: 9999px; display: inline-block;">
              ${item.totalWorkUnits}
            </span>
          </td>
          <td style="font-size: 0.78rem; color: #64748b; line-height: 1.4; padding: 0.6rem 0.75rem; max-width: 250px;">
            ${escapeHtml(detailText)}
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * ==========================================================================
   * 4. QUẢN LÝ MODAL THÊM / SỬA / XÓA SỰ KIỆN NGOẠI KIỂM
   * ==========================================================================
   */
  function handleOpenAddEventModal(eventData) {
    let modal = document.getElementById('modal-event-form');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-event-form';
      modal.className = 'modal-overlay modal-backdrop';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const students = (state.students && state.students.length > 0) ? state.students : [];
    const ev = eventData || {};
    const assignedIds = new Set(ev.assignedStudentIds || []);

    const studentsHtml = students.length > 0
      ? students.map(st => {
          const isChecked = assignedIds.has(st.id) || (st.studentId && assignedIds.has(st.studentId));
          const roleLabel = st.role === 'old' ? '🎓 Người cũ' : '🌱 Người mới';
          return `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-size: 0.84rem;">
              <input type="checkbox" class="event-student-cb" value="${escapeHtml(st.id)}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
              <span style="font-weight: 600; color: #1e293b;">${escapeHtml(st.fullName)}</span>
              <span style="color: #64748b; font-size: 0.78rem;">(${escapeHtml(st.studentId || '')})</span>
              <span style="margin-left: auto; font-size: 0.72rem; color: ${st.role === 'old' ? '#7e22ce' : '#c2410c'}; font-weight: 600;">${roleLabel}</span>
            </label>
          `;
        }).join('')
      : '<div style="color: #64748b; font-size: 0.84rem;">Chưa có sinh viên nào trong danh sách.</div>';

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 650px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 14px; box-shadow: 0 20px 45px -10px rgba(0,0,0,0.3); background: var(--bg-card, #ffffff);">
        <div class="modal-header" style="background: linear-gradient(135deg, #0f766e, #0d9488); color: #ffffff; padding: 1.15rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 class="modal-title" style="color: #ffffff; font-size: 1.1rem; font-weight: 700; margin: 0;">
              🎟️ ${ev.id ? 'Chỉnh Sửa Sự Kiện / Tour' : 'Thêm Sự Kiện / Tour Tuyển Sinh'}
            </h3>
            <p style="font-size: 0.82rem; color: #ccfbf1; margin-top: 0.2rem; margin-bottom: 0;">
              Ghi nhận các hoạt động đi tour ngoại kiểm để tính công tự động vào bảng chấm công tháng
            </p>
          </div>
          <button type="button" class="modal-close-btn" onclick="window.adminCloseEventModal && window.adminCloseEventModal()" style="color: #ffffff; background: rgba(255,255,255,0.15); border: none; font-size: 1.4rem; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">&times;</button>
        </div>

        <form id="admin-event-form" onsubmit="event.preventDefault(); window.adminSaveEvent && window.adminSaveEvent();" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; margin: 0;">
          <input type="hidden" id="event-input-id" value="${escapeHtml(ev.id || '')}">
          <div class="modal-body" style="padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1;">
            
            <div class="form-group" style="margin-bottom: 0.85rem;">
              <label class="form-label" for="event-input-title" style="font-weight: 700; font-size: 0.88rem;">Tên Sự Kiện / Chương Trình <span style="color: #ef4444;">*</span></label>
              <input type="text" id="event-input-title" class="form-input" placeholder="Ví dụ: Tư vấn tuyển sinh THPT Gia Định" value="${escapeHtml(ev.title || '')}" required style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 0.85rem;">
              <div class="form-group">
                <label class="form-label" for="event-input-date" style="font-weight: 700; font-size: 0.88rem;">Ngày Diễn Ra <span style="color: #ef4444;">*</span></label>
                <input type="date" id="event-input-date" class="form-input" value="${escapeHtml(ev.date || new Date().toISOString().split('T')[0])}" required style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
              </div>
              <div class="form-group">
                <label class="form-label" for="event-input-timeofday" style="font-weight: 700; font-size: 0.88rem;">Buổi / Khung Giờ</label>
                <select id="event-input-timeofday" class="form-input" style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
                  <option value="morning" ${ev.timeOfDay === 'morning' ? 'selected' : ''}>Sáng (07:30 - 11:30) [1 công]</option>
                  <option value="afternoon" ${ev.timeOfDay === 'afternoon' ? 'selected' : ''}>Chiều (13:00 - 16:30) [1 công]</option>
                  <option value="fullday" ${ev.timeOfDay === 'fullday' ? 'selected' : ''}>Cả ngày (07:30 - 16:30) [2 công]</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 0.85rem;">
              <div class="form-group">
                <label class="form-label" for="event-input-workunits" style="font-weight: 700; font-size: 0.88rem;">Số Công Quy Đổi</label>
                <input type="number" id="event-input-workunits" class="form-input" min="0.5" step="0.5" value="${ev.workUnits || (ev.timeOfDay === 'fullday' ? 2 : 1)}" style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
              </div>
              <div class="form-group">
                <label class="form-label" for="event-input-location" style="font-weight: 700; font-size: 0.88rem;">Địa Điểm</label>
                <input type="text" id="event-input-location" class="form-input" placeholder="Ví dụ: Bình Thạnh, TP.HCM" value="${escapeHtml(ev.location || '')}" style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 0.85rem;">
              <label class="form-label" for="event-input-note" style="font-weight: 700; font-size: 0.88rem;">Ghi Chú</label>
              <input type="text" id="event-input-note" class="form-input" placeholder="Ghi chú thêm về trang thiết bị, phương tiện…" value="${escapeHtml(ev.note || '')}" style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px;">
            </div>

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.88rem; margin: 0;">
                  👥 Chọn Sinh Viên CTV Tham Gia:
                </label>
                <div style="font-size: 0.78rem; display: flex; gap: 0.4rem;">
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-event-select-all" style="padding: 0.15rem 0.45rem; font-size: 0.75rem;">Chọn tất cả</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-event-deselect-all" style="padding: 0.15rem 0.45rem; font-size: 0.75rem;">Bỏ chọn</button>
                </div>
              </div>
              <div style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #ffffff;">
                ${studentsHtml}
              </div>
            </div>

          </div>

          <div class="modal-footer" style="padding: 0.85rem 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.5rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.adminCloseEventModal && window.adminCloseEventModal()">Hủy Bỏ</button>
            <button type="submit" class="btn btn-primary btn-sm" style="font-weight: 700; background: #0d9488; border-color: #0f766e; color: #ffffff;">
              💾 Lưu Sự Kiện
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = 'flex';

    // Auto update work units when timeOfDay changes
    const timeSelect = modal.querySelector('#event-input-timeofday');
    const workInput = modal.querySelector('#event-input-workunits');
    if (timeSelect && workInput) {
      timeSelect.addEventListener('change', () => {
        workInput.value = timeSelect.value === 'fullday' ? 2 : 1;
      });
    }

    const btnSelectAll = modal.querySelector('#btn-event-select-all');
    const btnDeselectAll = modal.querySelector('#btn-event-deselect-all');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        modal.querySelectorAll('.event-student-cb').forEach(cb => cb.checked = true);
      });
    }
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        modal.querySelectorAll('.event-student-cb').forEach(cb => cb.checked = false);
      });
    }
  }

  function handleSaveEvent(eventData) {
    let payload = eventData;
    if (!payload || !payload.title) {
      const idInput = document.getElementById('event-input-id');
      const titleInput = document.getElementById('event-input-title');
      const dateInput = document.getElementById('event-input-date');
      const timeInput = document.getElementById('event-input-timeofday');
      const workInput = document.getElementById('event-input-workunits');
      const locInput = document.getElementById('event-input-location');
      const noteInput = document.getElementById('event-input-note');
      const checkedBoxes = document.querySelectorAll('.event-student-cb:checked');

      if (!titleInput || !titleInput.value.trim()) {
        showToast('Vui lòng nhập tên sự kiện!', 'error');
        return null;
      }

      const assignedStudentIds = Array.from(checkedBoxes).map(cb => cb.value);

      payload = {
        id: idInput?.value || undefined,
        title: titleInput.value.trim(),
        date: dateInput?.value || new Date().toISOString().split('T')[0],
        timeOfDay: timeInput?.value || 'morning',
        workUnits: parseFloat(workInput?.value) || (timeInput?.value === 'fullday' ? 2 : 1),
        location: locInput?.value?.trim() || '',
        note: noteInput?.value?.trim() || '',
        assignedStudentIds: assignedStudentIds
      };
    }

    let savedItem;
    if (payload.id) {
      EventManager.deleteEvent(payload.id);
      savedItem = EventManager.addEvent(payload);
    } else {
      savedItem = EventManager.addEvent(payload);
    }

    closeEventModal();
    showToast(`Đã lưu sự kiện "${savedItem.title}" thành công!`, 'success');
    return savedItem;
  }

async function handleDeleteEvent(id) {
      const dcevent = await confirmDangerAction({
        title: "Xóa sự kiện",
        message: "Sự kiện này sẽ bị xóa cùng toàn bộ công của các bạn tham gia.",
        losses: ["Sự kiện", "Mọi bản ghi công của người tham gia"],
        keyword: 'XOA SK',
        confirmLabel: "Xóa sự kiện",
      });
      if (!dcevent) {
        return;
      }
    const updated = EventManager.deleteEvent(id);
    showToast('Đã xóa sự kiện thành công!', 'info');
    return updated;
  }

  function closeEventModal() {
    const modal = document.getElementById('modal-event-form');
    if (modal) modal.style.display = 'none';
  }

  window.adminApproveSwap = (swapId) => handleApproveSwap(swapId);
  window.adminRejectSwap = (swapId) => handleRejectSwap(swapId);
  window.adminOpenSwapModal = () => openSwapMgmtModal();
  window.adminCloseSwapModal = () => closeSwapMgmtModal();
  window.adminOpenBackupModal = () => openBackupCenterModal();
  window.adminCloseBackupModal = () => closeBackupCenterModal();
  window.adminTriggerCreateWebBackup = (customName) => handleTriggerCreateWebBackup(customName);
  window.adminRestoreFromWebBackup = (id) => handleRestoreFromWebBackup(id);
  window.adminDownloadSingleWebBackup = (id) => handleDownloadSingleWebBackup(id);
  window.adminDeleteWebBackup = (id) => handleDeleteWebBackup(id);
  window.adminStartNewMonth = () => handleStartNewMonth();
  window.adminOpenAddEventModal = (eventData) => handleOpenAddEventModal(eventData);
  window.adminSaveEvent = (eventData) => handleSaveEvent(eventData);
  window.adminDeleteEvent = (id) => handleDeleteEvent(id);
  window.adminCloseEventModal = () => closeEventModal();

  // API nội bộ cho bộ kiểm thử tự động (không dùng trong giao diện).
  window.adminTestHelper = {
    loadData,
    saveStudents,
    saveSchedule,
    runFullSchedule,
    switchAdminMonth,
    getState: () => ({ ...state })
  };

  window.EventManager = EventManager;
  window.PayrollCalculator = PayrollCalculator;
  window.WebBackupManager = {
    getWebBackups,
    createWebBackup,
    restoreFromWebBackup: handleRestoreFromWebBackup,
    deleteWebBackup: handleDeleteWebBackup,
    adminViewMonthPayroll: handleViewMonthPayroll,
    MAX_WEB_BACKUPS,
    RETENTION_PERIOD_MS
  };

  /**
   * ==========================================================================
   * TIỆN ÍCH SAO LƯU NHANH & SỰ KIỆN & CHẤM CÔNG THÁNG (PAYROLL-01 & 02)
   * ==========================================================================
   */
  window.adminQuickBackupCurrentMonth = function() {
    const now = new Date();
    const monthNum = now.getMonth() + 1;
    const yearNum = now.getFullYear();
    const monthLabel = `Tháng ${monthNum}/${yearNum}`;
    const name = `Bản sao lưu ${monthLabel} (${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')})`;
    createWebBackup(name);
    showToast(`Đã tạo bản sao lưu nhanh cho ${monthLabel} trên web thành công!`, 'success');
  };

  window.renderEventsTable = function() {
    const tbody = document.getElementById('events-table-body');
    const badge = document.getElementById('badge-events-count');
    if (!tbody) return;

    const events = EventManager.getEvents();
    if (badge) {
      badge.textContent = `${events.length} sự kiện`;
    }

    if (events.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.35rem;">🎟️</div>
            <div style="font-weight: 600; font-size: 0.92rem; margin-bottom: 0.25rem;">Chưa có sự kiện ngoại kiểm nào được tạo</div>
            <div style="font-size: 0.8rem; margin-bottom: 0.85rem;">Thêm sự kiện đi tour để tự động tính công cho cộng tác viên.</div>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.adminOpenAddEventModal && window.adminOpenAddEventModal()" style="font-weight: 700; background: linear-gradient(135deg, #db2777, #be185d); border: none;">
              🎟️ Thêm Sự Kiện Đầu Tiên
            </button>
          </td>
        </tr>
      `;
      return;
    }

    // Lookup tên CTV
    let studentList = state.students || [];
    if (!studentList || studentList.length === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        if (raw) studentList = JSON.parse(raw) || [];
      } catch (e) {}
    }
    const stMap = new Map();
    studentList.forEach(s => {
      stMap.set(s.id, s.fullName);
      if (s.studentId) stMap.set(s.studentId, s.fullName);
    });

    tbody.innerHTML = events.map((ev, idx) => {
      const assignedNames = (ev.assignedStudentIds || []).map(id => stMap.get(id) || id).slice(0, 3).join(', ');
      const moreCount = (ev.assignedStudentIds || []).length > 3 ? ` +${(ev.assignedStudentIds || []).length - 3}` : '';
      const sessionLabel = ev.timeOfDay === 'morning' ? 'Sáng (1 công)' : (ev.timeOfDay === 'afternoon' ? 'Chiều (1 công)' : 'Cả ngày (2 công)');

      return `
        <tr>
          <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${idx + 1}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${escapeHtml(ev.title)}</div>
            ${ev.note ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(ev.note)}</div>` : ''}
          </td>
          <td>
            <div style="font-weight: 600; font-size: 0.84rem; color: var(--text-main);">${escapeHtml(ev.date)}</div>
          </td>
          <td style="text-align: center;">
            <span class="badge" style="background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; font-size: 0.76rem; font-weight: 700;">
              ${escapeHtml(sessionLabel)}
            </span>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: var(--text-main);">${escapeHtml(ev.location || '-')}</div>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: var(--text-main); font-weight: 600;">
              👥 ${(ev.assignedStudentIds || []).length} bạn
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);" title="${escapeHtml((ev.assignedStudentIds || []).map(id => stMap.get(id) || id).join(', '))}">
              ${escapeHtml(assignedNames + moreCount)}
            </div>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.adminEditEvent && window.adminEditEvent('${escapeHtml(ev.id)}')" title="Sửa thông tin sự kiện này" style="font-size: 0.76rem; padding: 0.25rem 0.5rem;">
              ✏️
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.adminDeleteEvent && window.adminDeleteEvent('${escapeHtml(ev.id)}')" title="Xóa sự kiện này" style="font-size: 0.76rem; padding: 0.25rem 0.5rem;">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };


  window.adminEditEvent = function(id) {
    const ev = EventManager.getEvents().find(e => e.id === id);
    if (!ev) {
      showToast('Không tìm thấy sự kiện cần sửa!', 'error');
      return;
    }
    handleOpenAddEventModal(ev);
  };

  // Quản lý Modal Bảng Chấm Công Tháng
  let activePayrollData = {
    list: [],
    monthLabel: '',
    currentFilter: 'all',
    currentSearch: ''
  };

  window.adminViewCurrentMonthPayroll = function() {
    window.adminViewMonthPayroll(null);
  };

  window.adminViewMonthPayroll = function(backupId = null) {
    const modal = document.getElementById('modal-month-payroll');
    if (!modal) return;

    let students = state.students || [];
    let monthSchedule = state.monthSchedule;
    let events = EventManager.getEvents();
    // Nhãn tháng phải theo kỳ đang áp dụng, KHÔNG dùng new Date()
    // (sai khi Ban Điều Hành đang xem kỳ 11/12/2026 trong năm 2027).
    const curM = state.currentMonth || 10;
    const curY = state.currentYear || 2026;
    let monthLabel = `Tháng ${String(curM).padStart(2, '0')}/${curY}`;

    if (backupId) {
      const backups = getWebBackups();
      const target = backups.find(b => b.id === backupId);
      if (target && target.payload) {
        students = target.payload.students || [];
        monthSchedule = target.payload.monthSchedule;
        events = target.payload.events || [];
        monthLabel = target.monthLabel || target.name || 'Kỳ đã lưu';
      }
    } else {
      if (!students || students.length === 0) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
          if (raw) students = JSON.parse(raw) || [];
        } catch (e) {}
      }
      if (!monthSchedule) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE);
          if (raw) monthSchedule = JSON.parse(raw);
        } catch (e) {}
      }
    }

    // Lọc công sự kiện theo kỳ đang xem — không có monthKey thì mọi tháng cộng chung
    const payrollMonthKey = monthSchedule?.monthKey
      || (monthSchedule?.month && monthSchedule?.year
        ? `${monthSchedule.year}-${String(monthSchedule.month).padStart(2, '0')}`
        : `${state.currentYear || 2026}-${String(state.currentMonth || 10).padStart(2, '0')}`);
    const payrollList = PayrollCalculator.calculateMonthlyPayroll(students, monthSchedule, events, payrollMonthKey);

    activePayrollData.list = payrollList;
    activePayrollData.monthLabel = monthLabel;
    activePayrollData.currentFilter = 'all';
    activePayrollData.currentSearch = '';

    // Cập nhật tiêu đề modal
    const titleEl = document.getElementById('month-payroll-title');
    if (titleEl) {
      titleEl.textContent = `📋 BẢNG CHẤM CÔNG CTV - ${monthLabel.toUpperCase()}`;
    }

    // Tính 4 ô chỉ số
    let totalOfficeShifts = 0;
    let totalEventUnits = 0;
    let grandTotalUnits = 0;

    payrollList.forEach(p => {
      totalOfficeShifts += (p.officeShiftsCount || 0);
      totalEventUnits += (p.eventWorkUnits || 0);
      grandTotalUnits += (p.totalWorkUnits || 0);
    });

    const statStudents = document.getElementById('payroll-stat-total-students');
    const statOffice = document.getElementById('payroll-stat-office-shifts');
    const statEvents = document.getElementById('payroll-stat-event-units');
    const statTotal = document.getElementById('payroll-stat-total-units');

    if (statStudents) statStudents.textContent = payrollList.length;
    if (statOffice) statOffice.textContent = totalOfficeShifts;
    if (statEvents) statEvents.textContent = totalEventUnits;
    if (statTotal) statTotal.textContent = grandTotalUnits;

    // Reset bộ lọc & tìm kiếm
    const searchInput = document.getElementById('input-search-payroll');
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = function(e) {
        activePayrollData.currentSearch = (e.target.value || '').trim().toLowerCase();
        renderPayrollTableRows();
      };
    }

    document.querySelectorAll('#payroll-role-filters .filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-payroll-filter') === 'all');
      btn.onclick = function() {
        document.querySelectorAll('#payroll-role-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activePayrollData.currentFilter = btn.getAttribute('data-payroll-filter') || 'all';
        renderPayrollTableRows();
      };
    });

    renderPayrollTableRows();

    modal.style.display = 'flex';
    modal.classList.add('active');
  };

  function renderPayrollTableRows() {
    const tbody = document.getElementById('tbody-month-payroll');
    const footerSummary = document.getElementById('payroll-footer-summary-text');
    if (!tbody) return;

    let filtered = activePayrollData.list;

    // Lọc theo vai trò
    if (activePayrollData.currentFilter === 'old') {
      filtered = filtered.filter(p => p.role === 'old');
    } else if (activePayrollData.currentFilter === 'new') {
      filtered = filtered.filter(p => p.role === 'new');
    }

    // Lọc theo từ khóa tìm kiếm
    if (activePayrollData.currentSearch) {
      const q = activePayrollData.currentSearch;
      filtered = filtered.filter(p => 
        (p.fullName || '').toLowerCase().includes(q) || 
        (p.studentMssv || '').toLowerCase().includes(q)
      );
    }

    if (footerSummary) {
      footerSummary.textContent = `Hiển thị ${filtered.length} / ${activePayrollData.list.length} CTV trong danh sách`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.35rem;">🔍</div>
            <div style="font-weight: 600; font-size: 0.92rem;">Không tìm thấy CTV nào khớp với điều kiện lọc</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      const isOld = item.role === 'old';
      const roleBadge = isOld 
        ? '<span class="badge badge-role-old" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;">🎓 Chính Thức</span>'
        : '<span class="badge badge-role-new" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;">🌱 Tập Sự</span>';

      return `
        <tr>
          <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${idx + 1}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.92rem;">${escapeHtml(item.fullName)}</div>
          </td>
          <td>
            <code style="font-weight: 600; color: var(--primary); font-size: 0.85rem;">${escapeHtml(item.studentMssv || '-')}</code>
          </td>
          <td style="text-align: center;">${roleBadge}</td>
          <td style="text-align: center;">
            <span class="badge-office-shifts">
              🏢 ${item.officeShiftsCount || 0} ca
            </span>
          </td>
          <td style="text-align: center; display: none;">
            <span class="badge-event-shifts">
              🎟️ ${item.eventCount || 0} buổi (${item.eventWorkUnits || 0} công)
            </span>
          </td>
          <td style="text-align: center;">
            <span class="badge-total-work">
              ${item.totalWorkUnits || 0}
            </span>
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.adminOpenPayrollStudentDetail('${escapeHtml(item.studentId)}')" title="Xem chi tiết các ca trực của bạn này" style="font-size: 0.78rem; padding: 0.25rem 0.55rem; font-weight: 700;">
              👁️ Chi tiết
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.adminCloseMonthPayroll = function() {
    const modal = document.getElementById('modal-month-payroll');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  };

  window.adminPrintMonthPayroll = function() {
    document.body.classList.add('printing-payroll');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-payroll');
    }, 1000);
  };

  window.adminExportMonthPayrollExcel = function() {
    const list = activePayrollData.list || [];
    const monthLabel = activePayrollData.monthLabel || 'Thang';

    let rowsHtml = list.map((item, idx) => `
      <tr>
        <td style="text-align: center; border: 1px solid #000; padding: 5px;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 5px;">${escapeHtml(item.fullName)}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px; mso-number-format: '\\@';">${escapeHtml(item.studentMssv)}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.role === 'old' ? 'Người Cũ' : 'Người Mới'}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.officeShiftsCount || 0}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.eventCount || 0}</td>
        <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.eventWorkUnits || 0}</td>
        <td style="text-align: center; font-weight: bold; border: 1px solid #000; padding: 5px; background-color: #d1fae5;">${item.totalWorkUnits || 0}</td>
      </tr>
    `).join('');

    const excelDoc = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:x="urn:schemas-microsoft-com:office:excel" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
          th { background-color: #c2dfd3; font-weight: bold; border: 1px solid #000; padding: 6px; }
          td { border: 1px solid #000; padding: 5px; }
        </style>
      </head>
      <body>
        <table style="width: 100%;">
          <thead>
            <tr>
              <th colspan="8" style="font-size: 14pt; height: 35px; background: #ffffff; text-align: center; border: none; font-weight: bold;">
                BẢNG CHẤM CÔNG CỘNG TÁC VIÊN TUYỂN SINH - ${escapeHtml(monthLabel.toUpperCase())}
              </th>
            </tr>
            <tr>
              <th>STT</th>
              <th>Họ và Tên</th>
              <th>MSSV</th>
              <th>Phân Loại</th>
              <th>Ca Trực VP (4 Tuần)</th>
              <th>Số Buổi Sự Kiện</th>
              <th>Công Sự Kiện</th>
              <th>TỔNG CÔNG</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF' + excelDoc], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bang_Cham_Cong_CTV_${monthLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Đã xuất file Excel Bảng Chấm Công (.xls) thành công!', 'success');
  };

  window.adminOpenPayrollStudentDetail = function(studentId) {
    const modal = document.getElementById('modal-payroll-student-detail');
    if (!modal) return;

    const item = (activePayrollData.list || []).find(p => p.studentId === studentId || p.studentMssv === studentId);
    if (!item) return;

    const nameEl = document.getElementById('payroll-detail-student-name');
    const metaEl = document.getElementById('payroll-detail-student-meta');
    const officeCountEl = document.getElementById('payroll-detail-office-count');
    const officeListEl = document.getElementById('payroll-detail-office-list');
    const eventCountEl = document.getElementById('payroll-detail-event-count');
    const eventListEl = document.getElementById('payroll-detail-event-list');

    if (nameEl) nameEl.textContent = `👤 Chi Tiết Công Trực: ${item.fullName}`;
    if (metaEl) metaEl.textContent = `MSSV: ${item.studentMssv || '-'} • ${item.role === 'old' ? '🎓 Chính Thức' : '🌱 Tập Sự'}`;
    if (officeCountEl) officeCountEl.textContent = `${item.officeShiftsCount || 0} ca`;
    if (eventCountEl) eventCountEl.textContent = `${item.eventCount || 0} sự kiện (${item.eventWorkUnits || 0} công)`;

    if (officeListEl) {
      if (item.officeShiftDetails && item.officeShiftDetails.length > 0) {
        officeListEl.innerHTML = item.officeShiftDetails.map(d => `<li>${escapeHtml(d)}</li>`).join('');
      } else {
        officeListEl.innerHTML = '<li style="color: var(--text-muted);">Không có ca trực văn phòng nào trong tháng.</li>';
      }
    }

    if (eventListEl) {
      if (item.eventDetails && item.eventDetails.length > 0) {
        eventListEl.innerHTML = item.eventDetails.map(ev => `
          <li>
            <strong>${escapeHtml(ev.title)}</strong> &bull; Ngày: ${escapeHtml(ev.date || '-')} &bull; <span style="color: #db2777; font-weight: 700;">+${ev.workUnits} công</span>
          </li>
        `).join('');
      } else {
        eventListEl.innerHTML = '<li style="color: var(--text-muted);">Chưa tham gia sự kiện ngoại kiểm nào.</li>';
      }
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
  };

  window.adminClosePayrollStudentDetail = function() {
    const modal = document.getElementById('modal-payroll-student-detail');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  };

  /**
   * ==========================================================================
   * QUẢN LÝ CẤU HÌNH THỜI GIAN MỞ CỔNG ĐĂNG KÝ (ADMIN)
   * ==========================================================================
   */
  function toDateTimeLocalString(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function formatVNDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
  }

  function getRemainingText(targetIso) {
    const diff = new Date(targetIso).getTime() - Date.now();
    if (diff <= 0) return 'Đã hết hạn';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) {
      return `Còn ${days} ngày ${remHours} giờ`;
    }
    return `Còn ${hours} giờ ${mins} phút`;
  }

  function loadRegConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REG_CONFIG);
      if (raw) {
        state.regConfig = JSON.parse(raw);
        state.regConfig.publishSchedule = state.regConfig.publishSchedule === true;
      } else {
        const now = new Date();
        const end = new Date(Date.now() + 7 * 24 * 3600 * 1000);
        state.regConfig = {
          mode: 'always_open',
          startTime: toDateTimeLocalString(now),
          endTime: toDateTimeLocalString(end),
          closedNotice: 'Cổng đăng ký ca trực tạm khóa để ban điều hành chốt danh sách xếp lịch.',
          publishSchedule: false
        };
        saveRegConfig(false);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function saveRegConfig(notify = true) {
    localStorage.setItem(STORAGE_KEYS.REG_CONFIG, JSON.stringify(state.regConfig));
    if (notify) {
      showToast('Đã lưu cấu hình thời gian mở cổng đăng ký!', 'success');
      if (elements.configSaveHint) {
        elements.configSaveHint.textContent = `✓ Đã lưu lúc ${new Date().toLocaleTimeString('vi-VN')}`;
        setTimeout(() => {
          if (elements.configSaveHint) elements.configSaveHint.textContent = '';
        }, 4000);
      }
    }
    updateRegLiveStatus();
  }

  function renderRegConfigUI() {
    if (!elements.adminRegModeRadios) return;

    elements.adminRegModeRadios.forEach(radio => {
      radio.checked = radio.value === state.regConfig.mode;
    });

    updateModeCardStyles(state.regConfig.mode);

    if (elements.adminRegStart) {
      elements.adminRegStart.value = state.regConfig.startTime || '';
    }
    if (elements.adminRegEnd) {
      elements.adminRegEnd.value = state.regConfig.endTime || '';
    }
    if (elements.adminRegClosedMsg) {
      elements.adminRegClosedMsg.value = state.regConfig.closedNotice || '';
    }

    // Cập nhật trạng thái hiển thị lịch trực trên Cổng Sinh Viên
    const isPublished = state.regConfig.publishSchedule === true;
    if (elements.inputPublishSchedule) {
      elements.inputPublishSchedule.checked = isPublished;
    }
    if (elements.publishLabel) {
      elements.publishLabel.textContent = isPublished ? 'Đang công bố lịch' : 'Tạm ẩn lịch trực';
    }
    if (elements.publishStatusTag) {
      elements.publishStatusTag.textContent = isPublished ? 'Đang Công Bố' : 'Đang Tạm Ẩn';
      elements.publishStatusTag.style.background = isPublished ? '#ecfdf5' : '#fef2f2';
      elements.publishStatusTag.style.color = isPublished ? '#047857' : '#dc2626';
      elements.publishStatusTag.style.borderColor = isPublished ? '#a7f3d0' : '#fecaca';
    }
    if (elements.btnTogglePublishSchedule) {
      elements.btnTogglePublishSchedule.style.background = isPublished ? '#ecfdf5' : '#eef2ff';
      elements.btnTogglePublishSchedule.style.color = isPublished ? '#047857' : '#4338ca';
      elements.btnTogglePublishSchedule.style.borderColor = isPublished ? '#10b981' : '#a5b4fc';
    }
    if (elements.btnPublishScheduleIcon) {
      elements.btnPublishScheduleIcon.textContent = isPublished ? '👁️' : '📢';
    }
    if (elements.btnPublishScheduleText) {
      elements.btnPublishScheduleText.textContent = isPublished ? 'Đang Hiện Lịch (Bấm để Ẩn)' : 'Công Bố Lịch Cho SV';
    }

    updateRegLiveStatus();
  }

  function updateModeCardStyles(selectedMode) {
    elements.cardModeOpen?.classList.toggle('active', selectedMode === 'always_open');
    elements.cardModeTime?.classList.toggle('active', selectedMode === 'time_window');
    elements.cardModeClosed?.classList.toggle('active', selectedMode === 'closed');
  }

  function updateRegLiveStatus() {
    if (!elements.adminRegLiveStatus) return;

    const mode = state.regConfig.mode;
    const now = Date.now();
    const start = state.regConfig.startTime ? new Date(state.regConfig.startTime).getTime() : 0;
    const end = state.regConfig.endTime ? new Date(state.regConfig.endTime).getTime() : 0;

    elements.adminRegLiveStatus.className = 'admin-config-status-badge';

    if (mode === 'always_open') {
      elements.adminRegLiveStatus.classList.add('open');
      elements.adminRegLiveStatus.innerHTML = '<span>🟢 Cổng Đang Mở Tự Do (Luôn mở)</span>';
    } else if (mode === 'closed') {
      elements.adminRegLiveStatus.classList.add('closed');
      elements.adminRegLiveStatus.innerHTML = '<span>🔴 Cổng Đang Đóng (Khóa bởi Admin)</span>';
    } else if (mode === 'time_window') {
      if (start && now < start) {
        elements.adminRegLiveStatus.classList.add('scheduled');
        elements.adminRegLiveStatus.innerHTML = `<span>⏳ Chưa Mở (Bắt đầu: ${formatVNDateTime(state.regConfig.startTime)})</span>`;
      } else if (end && now > end) {
        elements.adminRegLiveStatus.classList.add('closed');
        elements.adminRegLiveStatus.innerHTML = `<span>🔴 Đã Hết Hạn Đăng Ký (${formatVNDateTime(state.regConfig.endTime)})</span>`;
      } else {
        elements.adminRegLiveStatus.classList.add('open');
        const remaining = end ? getRemainingText(state.regConfig.endTime) : '';
        elements.adminRegLiveStatus.innerHTML = `<span>🟢 Đang Mở Cho Sinh Viên (${remaining})</span>`;
      }
    }
  }

  function bindRegConfigEvents() {
    elements.adminRegModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        state.regConfig.mode = radio.value;
        updateModeCardStyles(radio.value);
        updateRegLiveStatus();
      });
    });

    // Nút toggle công bố lịch trên thanh Header/Hero
    elements.btnTogglePublishSchedule?.addEventListener('click', () => {
      state.regConfig.publishSchedule = !state.regConfig.publishSchedule;
      saveRegConfig(true);
      renderRegConfigUI();
window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.REG_CONFIG] } }));
      const msg = state.regConfig.publishSchedule
        ? '📢 Đã CÔNG BỐ lịch trực cho sinh viên xem trên Cổng Sinh Viên!'
        : '🔒 Đã TẠM ẨN lịch trực trên Cổng Sinh Viên (chỉ hiển thị khi đóng cổng hoặc công bố)!';
      showToast(msg, state.regConfig.publishSchedule ? 'success' : 'info');
    });

    // Checkbox toggle trong form cấu hình
    elements.inputPublishSchedule?.addEventListener('change', (e) => {
      state.regConfig.publishSchedule = e.target.checked;
      renderRegConfigUI();
    });

    elements.btnPresetNow?.addEventListener('click', () => {
      const nowStr = toDateTimeLocalString(new Date());
      if (elements.adminRegStart) elements.adminRegStart.value = nowStr;
      state.regConfig.startTime = nowStr;
      showToast('Đã đặt thời gian bắt đầu là bây giờ', 'info');
      updateRegLiveStatus();
    });

    elements.btnPreset3days?.addEventListener('click', () => {
      const end = new Date(Date.now() + 3 * 24 * 3600 * 1000);
      const endStr = toDateTimeLocalString(end);
      if (elements.adminRegEnd) elements.adminRegEnd.value = endStr;
      state.regConfig.endTime = endStr;
      showToast('Đã gia hạn đóng cổng: +3 ngày', 'info');
      updateRegLiveStatus();
    });

    elements.btnPreset5days?.addEventListener('click', () => {
      const end = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      const endStr = toDateTimeLocalString(end);
      if (elements.adminRegEnd) elements.adminRegEnd.value = endStr;
      state.regConfig.endTime = endStr;
      showToast('Đã gia hạn đóng cổng: +5 ngày', 'info');
      updateRegLiveStatus();
    });

    elements.btnPreset7days?.addEventListener('click', () => {
      const end = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const endStr = toDateTimeLocalString(end);
      if (elements.adminRegEnd) elements.adminRegEnd.value = endStr;
      state.regConfig.endTime = endStr;
      showToast('Đã gia hạn đóng cổng: +7 ngày (1 tuần)', 'info');
      updateRegLiveStatus();
    });

    elements.regConfigForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const selectedMode = document.querySelector('input[name="adminRegMode"]:checked')?.value || 'always_open';
      const startTime = elements.adminRegStart ? elements.adminRegStart.value : '';
      const endTime = elements.adminRegEnd ? elements.adminRegEnd.value : '';
      const closedNotice = elements.adminRegClosedMsg ? elements.adminRegClosedMsg.value.trim() : '';
      const publishSchedule = elements.inputPublishSchedule ? elements.inputPublishSchedule.checked : (state.regConfig.publishSchedule === true);

      if (selectedMode === 'time_window' && startTime && endTime) {
        if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
          showToast('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu!', 'error');
          return;
        }
      }

      state.regConfig = {
        mode: selectedMode,
        startTime,
        endTime,
        closedNotice: closedNotice || 'Cổng đăng ký ca trực tạm khóa để ban điều hành chốt danh sách xếp lịch.',
        publishSchedule
      };

      saveRegConfig(true);
      renderRegConfigUI();
window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.REG_CONFIG] } }));
    });
  }

  function exportScheduleToCsv() {
    if (!state.currentSchedule) {
      showToast('Chưa có lịch trực nào để xuất!', 'warning');
      return;
    }

    const schedule = state.currentSchedule.scheduleTable;
    let csvContent = '\uFEFF';
    csvContent += 'STT,Thứ,Buổi,Khung Giờ,Người Cũ (Kinh Nghiệm),MSSV Người Cũ,Người Mới (Tập Sự),MSSV Người Mới,Trạng Thái Ca\r\n';

    SHIFTS.forEach((shift, index) => {
      const slot = schedule[shift.id];
      const oldName = slot?.oldMember?.fullName || 'Chưa có';
      const oldMssv = slot?.oldMember?.studentId || '-';
      const newName = slot?.newMember?.fullName || 'Chưa có';
      const newMssv = slot?.newMember?.studentId || '-';
      const statusText = slot?.status === 'full' ? 'Đủ 2 bạn' : (slot?.status === 'partial' ? 'Thiếu 1 bạn' : 'Trống ca');

      // escapeCsvCell: chống CSV injection + escape đúng chuẩn RFC 4180.
      // Trước đây dấu " trong tên làm hỏng cột, và tên bắt đầu "=" bị Excel
      // hiểu thành công thức khi mở file.
      csvContent += [
        escapeCsvCell(index + 1),
        escapeCsvCell(shift.dayName),
        escapeCsvCell(shift.period),
        escapeCsvCell(shift.time),
        escapeCsvCell(oldName),
        escapeCsvCell(oldMssv),
        escapeCsvCell(newName),
        escapeCsvCell(newMssv),
        escapeCsvCell(statusText)
      ].join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Lich_Truc_Tuyen_Sinh_Tuan_${state.viewWeek}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Đã tải file CSV lịch trực Tuần ${state.viewWeek}!`, 'success');
  }

  /**
   * ==========================================================================
   * BẢNG TÍNH XUẤT EXCEL & SAO CHÉP GOOGLE SHEETS CHUẨN HCM-UTE 2026
   * ==========================================================================
   */
  function openExcelModal() {
    if (!elements.excelModal) {
      elements.excelModal = document.getElementById('excel-export-modal');
    }
    if (!elements.excelModal) return;
    if (elements.exportStartDate) {
      // Ô nhập ngày phải mặc định theo kỳ đang xem, không phải một tháng
      // cố định — trước đây luôn là 07/2026 nên xuất kỳ 13/2027 vẫn ra bảng
      // tháng 7 và ghi sai vào bảng đăng ký chính thức.
      const curM = state.currentMonth || 10;
      const curY = state.currentYear || 2026;
      const firstDay = new Date(curY, curM - 1, 1);
      const pad2 = (n) => String(n).padStart(2, '0');
      elements.exportStartDate.value =
        `${firstDay.getFullYear()}-${pad2(firstDay.getMonth() + 1)}-01`;
    }
    renderUteSheetPreview();
    elements.excelModal.classList.add('active');
  }

  function closeExcelModal() {
    if (!elements.excelModal) {
      elements.excelModal = document.getElementById('excel-export-modal');
    }
    elements.excelModal?.classList.remove('active');
  }

  window.openExcelModal = openExcelModal;
  window.closeExcelModal = closeExcelModal;
  window.loadUtePresetStudents = loadUtePresetStudents;

  function loadUtePresetStudents() {
    const uteList = window.SAMPLE_HCM_UTE_STUDENTS || [];
    if (uteList.length === 0) {
      // Danh sách mẫu đã được gỡ (js/roster.js). Nạp danh sách 30 người cũ ở
      // đây sẽ XOÁ danh sách thật đã nạp từ CSV.
      showToast('Đã gỡ danh sách mẫu. Hãy dùng nút "Nhập CSV" để nạp danh sách CTV thật.', 'warning');
      return;
    }

    state.students = JSON.parse(JSON.stringify(uteList));
    saveStudents();
    runFullSchedule();
    renderAll();
    openExcelModal();
    showToast('Đã nạp 16 CTV HCM-UTE chuẩn theo ảnh thực tế và mở bảng tính!', 'success');
  }

  function generateUteExportData() {
    // Dự phòng theo kỳ đang xem (openExcelModal đã điền sẵn ô nhập).
    const pad2d = (n) => String(n).padStart(2, '0');
    const fallbackStart = `${state.currentYear || 2026}-${pad2d(state.currentMonth || 10)}-01`;
    const startDateVal = elements.exportStartDate?.value || fallbackStart;
    const rangeMode = elements.exportRangeSelect?.value || '30days_month';

    // Parse ngày bắt đầu an toàn
    const parts = startDateVal.split('-');
    let curDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(curDate.getTime())) {
      curDate = new Date(2026, 6, 1); // 01/07/2026
    }

    let daysToGenerate = 30;
    let onlyWorkdays = false;
    let forceWeek = null;

    if (rangeMode === '30days_month') {
      daysToGenerate = 30;
      onlyWorkdays = false;
    } else if (rangeMode === '20days_4weeks') {
      daysToGenerate = 20;
      onlyWorkdays = true;
    } else if (rangeMode === '14days_full') {
      daysToGenerate = 14;
      onlyWorkdays = false;
    } else if (rangeMode === '10days_2weeks') {
      daysToGenerate = 10;
      onlyWorkdays = true;
    } else if (rangeMode === '5days_w1') {
      daysToGenerate = 5;
      onlyWorkdays = true;
      forceWeek = 1;
    } else if (rangeMode === '5days_w2') {
      daysToGenerate = 5;
      onlyWorkdays = true;
      forceWeek = 2;
    } else if (rangeMode === '5days_w3') {
      daysToGenerate = 5;
      onlyWorkdays = true;
      forceWeek = 3;
    } else if (rangeMode === '5days_w4') {
      daysToGenerate = 5;
      onlyWorkdays = true;
      forceWeek = 4;
    }

    const weekTables = [
      state.monthSchedule?.weeks?.[0]?.scheduleTable || state.twoWeekSchedule?.week1?.scheduleTable || state.currentSchedule?.scheduleTable || {},
      state.monthSchedule?.weeks?.[1]?.scheduleTable || state.twoWeekSchedule?.week2?.scheduleTable || state.currentSchedule?.scheduleTable || {},
      state.monthSchedule?.weeks?.[2]?.scheduleTable || state.monthSchedule?.weeks?.[0]?.scheduleTable || state.currentSchedule?.scheduleTable || {},
      state.monthSchedule?.weeks?.[3]?.scheduleTable || state.monthSchedule?.weeks?.[1]?.scheduleTable || state.currentSchedule?.scheduleTable || {}
    ];

    const rows = [];
    let addedCount = 0;
    let loopGuard = 0;

    const dayKeyMap = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6' };

    while (addedCount < daysToGenerate && loopGuard < 70) {
      loopGuard++;
      const dayOfWeek = curDate.getDay(); // 0: CN, 1: T2, ..., 6: T7

      if (onlyWorkdays && (dayOfWeek === 0 || dayOfWeek === 6)) {
        curDate.setDate(curDate.getDate() + 1);
        continue;
      }

      addedCount++;
      const stt = addedCount;
      const dd = String(curDate.getDate()).padStart(2, '0');
      const mm = String(curDate.getMonth() + 1).padStart(2, '0');
      const yyyy = curDate.getFullYear();
      const dateStr = `${dd}/${mm}/${yyyy}`;

      let activeTable;
      if (forceWeek && forceWeek >= 1 && forceWeek <= 4) {
        activeTable = weekTables[forceWeek - 1];
      } else {
        const weekIndex = onlyWorkdays 
          ? Math.min(3, Math.floor((addedCount - 1) / 5)) 
          : Math.min(3, Math.floor((addedCount - 1) / 7));
        activeTable = weekTables[weekIndex] || weekTables[0];
      }

      let morningText = '';
      let afternoonText = '';

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // Thứ 2 đến Thứ 6
        const dayKey = dayKeyMap[dayOfWeek];
        const morningSlot = activeTable[`${dayKey}_S`];
        const afternoonSlot = activeTable[`${dayKey}_C`];

        const mList = [];
        if (morningSlot?.oldMember) mList.push(`${morningSlot.oldMember.fullName} - ${morningSlot.oldMember.studentId}`);
        if (morningSlot?.newMember) mList.push(`${morningSlot.newMember.fullName} - ${morningSlot.newMember.studentId}`);
        morningText = mList.join('\n');

        const aList = [];
        if (afternoonSlot?.oldMember) aList.push(`${afternoonSlot.oldMember.fullName} - ${afternoonSlot.oldMember.studentId}`);
        if (afternoonSlot?.newMember) aList.push(`${afternoonSlot.newMember.fullName} - ${afternoonSlot.newMember.studentId}`);
        afternoonText = aList.join('\n');
      } else {
        // Thứ 7 / Chủ Nhật: KHÔNG có ca trực trong hệ thống (chỉ T2–T6).
        // Trước đây chọn ngẫu nhiên 2 sinh viên và nhân đôi cho cả sáng lẫn
        // chiều — tạo dữ liệu BỊA trên bảng đăng ký chính thức HCM-UTE.
        // Nay ghi rõ "Không trực" để bảng phản ánh đúng thực tế.
        morningText = 'Không trực cuối tuần';
        afternoonText = 'Không trực cuối tuần';
      }

      rows.push({
        stt,
        dateStr,
        dayOfWeek,
        morningText,
        afternoonText
      });

      curDate.setDate(curDate.getDate() + 1);
    }

    return rows;
  }

  function renderUteSheetPreview() {
    if (!elements.excelPreviewTableContainer) return;

    const rows = generateUteExportData();

    let html = `
      <table class="ute-sheet-table">
        <thead>
          <tr>
            <th colspan="9" class="ute-title-row">
              CỘNG TÁC VIÊN ĐĂNG KÝ TRỰC PHÒNG VÀ THAM GIA HOẠT ĐỘNG TƯ VẤN TUYỂN SINH
            </th>
          </tr>
          <tr>
            <th class="ute-th-green ute-col-stt">STT</th>
            <th class="ute-th-green ute-col-date">NGÀY</th>
            <th class="ute-th-green ute-col-time" style="width: 80px;">THỜI GIAN</th>
            <th class="ute-th-green ute-col-desc" style="width: 90px;">NỘI DUNG</th>
            <th class="ute-th-yellow ute-col-shift" style="width: 220px;">TRỰC VĂN PHÒNG TVTS CA SÁNG<br>(7H30-11H30)</th>
            <th class="ute-th-yellow ute-col-shift" style="width: 220px;">TRỰC VĂN PHÒNG TVTS CA CHIỀU<br>(13H-16H30)</th>
            <th class="ute-th-white" style="width: 120px;">TƯ VẤN SỰ KIỆN</th>
            <th class="ute-th-white" style="width: 100px;">DẪN TOUR</th>
            <th class="ute-th-white" style="width: 100px;">GHI CHÚ</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      const morningSafe = (r.morningText || '').split('\n').map(l => escapeHtml(l)).join('<br>');
      const afternoonSafe = (r.afternoonText || '').split('\n').map(l => escapeHtml(l)).join('<br>');

      html += `
        <tr>
          <td class="ute-col-stt">${r.stt}</td>
          <td class="ute-col-date">${r.dateStr}</td>
          <td style="text-align: center;"></td>
          <td></td>
          <td class="ute-cell-multiline">${morningSafe}</td>
          <td class="ute-cell-multiline">${afternoonSafe}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    elements.excelPreviewTableContainer.innerHTML = html;
  }

  function buildUteHtmlTable(rows) {
    let html = `
      <table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; border: 1px solid #000000; width: 100%;">
        <thead>
          <tr>
            <th colspan="9" style="text-align: center; font-weight: bold; font-size: 13pt; height: 35px; border: 1px solid #000000; vertical-align: middle; background-color: #ffffff; text-transform: uppercase;">
              CỘNG TÁC VIÊN ĐĂNG KÝ TRỰC PHÒNG VÀ THAM GIA HOẠT ĐỘNG TƯ VẤN TUYỂN SINH
            </th>
          </tr>
          <tr>
            <th style="background-color: #c2dfd3; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 45px;">STT</th>
            <th style="background-color: #c2dfd3; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 95px;">NGÀY</th>
            <th style="background-color: #c2dfd3; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 85px;">THỜI GIAN</th>
            <th style="background-color: #c2dfd3; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 95px;">NỘI DUNG</th>
            <th style="background-color: #ffff00; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 230px;">TRỰC VĂN PHÒNG TVTS CA SÁNG<br>(7H30-11H30)</th>
            <th style="background-color: #ffff00; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 230px;">TRỰC VĂN PHÒNG TVTS CA CHIỀU<br>(13H-16H30)</th>
            <th style="background-color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 120px;">TƯ VẤN SỰ KIỆN</th>
            <th style="background-color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 100px;">DẪN TOUR</th>
            <th style="background-color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #000000; padding: 6px 8px; vertical-align: middle; width: 100px;">GHI CHÚ</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      const morningLines = (r.morningText || '').split('\n').map(l => escapeHtml(l)).join('<br style="mso-data-placement: same-cell;">');
      const afternoonLines = (r.afternoonText || '').split('\n').map(l => escapeHtml(l)).join('<br style="mso-data-placement: same-cell;">');

      html += `
        <tr>
          <td style="text-align: center; font-weight: bold; border: 1px solid #000000; padding: 6px 8px; vertical-align: top;">${r.stt}</td>
          <td style="text-align: center; font-weight: bold; border: 1px solid #000000; padding: 6px 8px; vertical-align: top; mso-number-format: '\\@';">${r.dateStr}</td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top;"></td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top;"></td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top; white-space: pre-line; mso-data-placement: same-cell; mso-number-format: '\\@';">${morningLines}</td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top; white-space: pre-line; mso-data-placement: same-cell; mso-number-format: '\\@';">${afternoonLines}</td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top;"></td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top;"></td>
          <td style="border: 1px solid #000000; padding: 6px 8px; vertical-align: top;"></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }

  function buildUteTsvString(rows) {
    let tsv = 'CỘNG TÁC VIÊN ĐĂNG KÝ TRỰC PHÒNG VÀ THAM GIA HOẠT ĐỘNG TƯ VẤN TUYỂN SINH\t\t\t\t\t\t\t\t\r\n';
    tsv += 'STT\tNGÀY\tTHỜI GIAN\tNỘI DUNG\t"TRỰC VĂN PHÒNG TVTS CA SÁNG\n(7H30-11H30)"\t"TRỰC VĂN PHÒNG TVTS CA CHIỀU\n(13H-16H30)"\tTƯ VẤN SỰ KIỆN\tDẪN TOUR\tGHI CHÚ\r\n';

    rows.forEach(r => {
      const morningEscaped = r.morningText ? `"${r.morningText.replace(/"/g, '""')}"` : '';
      const afternoonEscaped = r.afternoonText ? `"${r.afternoonText.replace(/"/g, '""')}"` : '';

      tsv += `${r.stt}\t${r.dateStr}\t\t\t${morningEscaped}\t${afternoonEscaped}\t\t\t\r\n`;
    });

    return tsv;
  }

  async function copyUteSheetToClipboard(isQuick = false) {
    const rows = generateUteExportData();
    const htmlTable = buildUteHtmlTable(rows);
    const tsvData = buildUteTsvString(rows);

    let copied = false;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([htmlTable], { type: 'text/html' });
        const blobText = new Blob([tsvData], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
          })
        ]);
        copied = true;
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsvData);
        copied = true;
      }
    } catch (err) {
      console.warn('Clipboard write failed, using textarea fallback', err);
      const ta = document.createElement('textarea');
      ta.value = tsvData;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    }

    if (copied) {
      const targetBtn = isQuick ? elements.btnQuickCopySheet : elements.btnModalCopyClipboard;
      if (targetBtn) {
        const origText = targetBtn.innerHTML;
        targetBtn.innerHTML = '<span>✓ ĐÃ SAO CHÉP THÀNH CÔNG!</span>';
        targetBtn.style.background = '#059669';
        setTimeout(() => {
          targetBtn.innerHTML = origText;
          targetBtn.style.background = '';
        }, 2500);
      }

      if (elements.excelCopyStatusHint) {
        elements.excelCopyStatusHint.innerHTML = '<span style="color: #059669; font-weight: 700;">✓ Đã sao chép vào Clipboard! Hãy mở Google Sheets hoặc Excel và nhấn <strong>Ctrl + V</strong> (Dán) ngay!</span>';
      }

      showToast('Đã sao chép toàn bộ bảng! Chỉ cần sang Google Sheets hoặc Excel nhấn Ctrl + V là ăn ngay!', 'success');
    } else {
      showToast('Không thể tự động sao chép. Vui lòng cho phép quyền truy cập Clipboard!', 'error');
    }
  }

  function downloadUteExcelFile() {
    const rows = generateUteExportData();
    const htmlTable = buildUteHtmlTable(rows);

    const excelDoc = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:x="urn:schemas-microsoft-com:office:excel" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>CTV_Truc_Phong_TVTS_2026</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
          td, th { border: 1px solid #000000; padding: 6px 8px; vertical-align: top; mso-number-format: "\\@"; }
          br { mso-data-placement: same-cell; }
        </style>
      </head>
      <body>
        ${htmlTable}
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF' + excelDoc], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CTV_Dang_Ky_Truc_Phong_TVTS_HCM-UTE_2026.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Đã tải xuống file Excel (.xls) chuẩn mẫu HCM-UTE!', 'success');
  }

  function downloadUteCsvFile() {
    const rows = generateUteExportData();
    const tsvData = buildUteTsvString(rows);
    // Thay đổi Tab thành Phẩy cho CSV
    const csvContent = '\uFEFF' + tsvData.split('\r\n').map(line => {
      return line.split('\t').join(',');
    }).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CTV_Dang_Ky_Truc_Phong_TVTS_HCM-UTE_2026.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Đã tải xuống file CSV tiếng Việt UTF-8!', 'success');
  }

  function printUteSheet() {
    window.print();
  }

  function showToast(message, type = 'info', duration) {
    // LỖI phải được đọc NGAY bởi trình đọc màn hình, không phải đợi đến
    // khi trình đọc rảnh. Vùng toast là aria-live="polite" nên thông báo
    // lỗi trước đây bị bỏ qua nếu người dùng đang nghe nội dung khác.
    if (type === 'error' && window.ModalA11y && typeof window.ModalA11y.announceAlert === 'function') {
      window.ModalA11y.announceAlert(String(message).replace(/<[^>]*>/g, ''));
    }

    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    if (type === 'error') toast.setAttribute('role', 'alert');
    // Bắt buộc escapeHtml: message có thể chứa tên/MSSV/thông báo lỗi Cloud
    // do người dùng nhập hoặc từ dịch vụ ngoài trả về.
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${escapeHtml(String(message))}</span>
    `;

    elements.toastContainer.appendChild(toast);

    // Thời gian hiển thị: trước đây tham số thứ 3 của showToast bị BỎ QUA hoàn
    // toàn và luôn cứng 3200ms. Vì vậy cảnh báo "bộ nhớ trình duyệt đã đầy" xin
    // 9 giây lại biến mất sau 3.2 giây — người dùng không kịp đọc.
    const lifetime = Number(duration) > 0 ? Number(duration) : 3200;

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, lifetime);
  }

  /**
   * ==========================================================================
   * LIÊN KẾT GIAO DIỆN ĐỒNG BỘ ĐÁM MÂY (FIREBASE CLOUD SYNC UI BINDINGS)
   * ==========================================================================
   */
  function bindCloudSyncEvents() {
    function updateCloudUIStatus() {
      const cfg = window.CloudSyncManager ? window.CloudSyncManager.getConfig() : null;
      const isEnabled = Boolean(cfg && cfg.enabled && cfg.databaseUrl);
      const icon = document.getElementById('badge-cloud-header-icon');
      if (icon) {
        icon.textContent = isEnabled ? '🟢' : '☁️';
      }

      const indicator = document.getElementById('cloud-status-indicator');
      const title = document.getElementById('cloud-status-title');
      const desc = document.getElementById('cloud-status-desc');
      const lastSyncEl = document.getElementById('cloud-last-sync-time');

      if (indicator) indicator.style.background = isEnabled ? '#22c55e' : '#94a3b8';
      if (title) title.textContent = isEnabled ? '🟢 Đám Mây: Đang Kết Nối & Tự Động Đồng Bộ' : 'Chế độ Cục bộ (Local-Only)';
      if (desc) {
        desc.textContent = isEnabled 
          ? `Đã liên kết với Firebase: ${cfg.databaseUrl}` 
          : 'Dữ liệu hiện chỉ lưu trên trình duyệt máy này. Kích hoạt Cloud để dùng chung mọi máy tính.';
      }
      if (lastSyncEl && cfg && cfg.lastSyncTime) {
        const d = new Date(cfg.lastSyncTime);
        lastSyncEl.textContent = `Lần đồng bộ gần nhất: ${d.toLocaleTimeString()} ngày ${d.toLocaleDateString()}`;
      }
    }

    window.addEventListener('ts:cloud-status', updateCloudUIStatus);
    window.addEventListener('ts:cloud-synced', () => {
      loadAdminUsers();
      if (state.isAuthenticated) {
        loadData();
        renderAll();
        renderUserMgmtTable();
        updateBackupStats();
      }
    });

    updateCloudUIStatus();

    // Mở Modal Cấu hình Cloud Sync
    window.adminOpenCloudSyncModal = function() {
      const modal = document.getElementById('modal-cloud-sync');
      if (!modal) return;
      const cfg = window.CloudSyncManager ? window.CloudSyncManager.getConfig() : {};
      const enabledInput = document.getElementById('cloud-input-enabled');
      const urlInput = document.getElementById('cloud-input-url');
      const pathInput = document.getElementById('cloud-input-path');
      const keyInput = document.getElementById('cloud-input-key');
      const autosyncInput = document.getElementById('cloud-input-autosync');

      if (enabledInput) enabledInput.checked = Boolean(cfg.enabled);
      if (urlInput) urlInput.value = cfg.databaseUrl || '';
      if (pathInput) pathInput.value = cfg.syncPath || 'tvts_production_data';
      if (keyInput) keyInput.value = cfg.apiKey || '';
      if (autosyncInput) autosyncInput.checked = cfg.autoSync !== false;

      updateCloudUIStatus();
      modal.style.display = 'flex';
      modal.classList.add('active');
    };

    window.adminCloseCloudSyncModal = function() {
      const modal = document.getElementById('modal-cloud-sync');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    };

    // Đóng khi click backdrop
    const modal = document.getElementById('modal-cloud-sync');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) window.adminCloseCloudSyncModal();
      });
    }

    // Nút Lưu Cấu Hình
    document.getElementById('btn-cloud-save-cfg')?.addEventListener('click', () => {
      const enabled = document.getElementById('cloud-input-enabled')?.checked;
      const databaseUrl = document.getElementById('cloud-input-url')?.value.trim();
      const syncPath = document.getElementById('cloud-input-path')?.value.trim() || 'tvts_production_data';
      const apiKey = document.getElementById('cloud-input-key')?.value.trim();
      const autoSync = document.getElementById('cloud-input-autosync')?.checked;

      if (enabled && !databaseUrl) {
        showToast('Vui lòng nhập đường dẫn Firebase Database URL!', 'error');
        return;
      }

      if (window.CloudSyncManager) {
        window.CloudSyncManager.saveConfig({
          enabled,
          databaseUrl,
          syncPath,
          apiKey,
          autoSync
        });
        showToast('Đã lưu cấu hình Đồng bộ Đám mây thành công!', 'success');
        updateCloudUIStatus();
      }
    });

    // Nút Kiểm Tra Kết Nối
    document.getElementById('btn-cloud-test-conn')?.addEventListener('click', async () => {
      const databaseUrl = document.getElementById('cloud-input-url')?.value.trim();
      const syncPath = document.getElementById('cloud-input-path')?.value.trim() || 'tvts_production_data';
      const apiKey = document.getElementById('cloud-input-key')?.value.trim();

      if (!databaseUrl) {
        showToast('Vui lòng nhập URL Firebase để kiểm tra kết nối!', 'error');
        return;
      }

      showToast('Đang kiểm tra kết nối tới Firebase…', 'info');
      if (window.CloudSyncManager) {
        const res = await window.CloudSyncManager.testConnection({ databaseUrl, syncPath, apiKey });
        if (res.success) {
          showToast(res.message, 'success');
        } else {
          showToast(res.message, 'error');
        }
      }
    });

    // Nút Đẩy dữ liệu lên Cloud
    document.getElementById('btn-cloud-modal-push')?.addEventListener('click', async () => {
      if (!window.CloudSyncManager) return;
      showToast('Đang đẩy dữ liệu lên Firebase Đám mây…', 'info');
      const res = await window.CloudSyncManager.pushToCloud();
      if (res.success) {
        showToast('Đẩy toàn bộ dữ liệu lên Đám mây thành công!', 'success');
        updateCloudUIStatus();
      } else {
        showToast('Lỗi đẩy dữ liệu: ' + res.error, 'error');
      }
    });

    // Nút Kéo dữ liệu từ Cloud về máy này
    document.getElementById('btn-cloud-modal-pull')?.addEventListener('click', async () => {
      if (!window.CloudSyncManager) return;
      showToast('Đang kéo dữ liệu từ Firebase Đám mây về…', 'info');
      const res = await window.CloudSyncManager.pullFromCloud();
      if (res.success) {
        loadAdminUsers();
        loadData();
        renderAll();
        renderUserMgmtTable();
        updateBackupStats();
        showToast('Đã kéo và nạp dữ liệu mới nhất từ Đám mây thành công!', 'success');
        updateCloudUIStatus();
      } else {
        showToast('Lỗi kéo dữ liệu: ' + res.error, 'error');
      }
    });

    // Xử lý Quick Cloud Pull ở màn hình đăng nhập (Tab Ẩn Danh)
    window.adminTriggerAuthCloudPull = async function() {
      const statusBox = document.getElementById('auth-cloud-sync-status');
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.textContent = '⏳ Đang kết nối Đám mây kéo mã PIN & tài khoản…';
        statusBox.style.color = '#0284c7';
      }

      if (!window.CloudSyncManager) {
        if (statusBox) statusBox.textContent = '⚠️ Module Cloud Sync chưa sẵn sàng.';
        return;
      }

      const cfg = window.CloudSyncManager.getConfig();
      if (!cfg.databaseUrl) {
        if (statusBox) {
          statusBox.textContent = 'ℹ️ Chưa cấu hình Firebase URL. Vui lòng đăng nhập bằng PIN 9999 để cấu hình.';
          statusBox.style.color = '#f59e0b';
        }
        showToast('Chưa cấu hình Firebase URL. Đăng nhập bằng PIN 9999 để cấu hình.', 'info');
        return;
      }

      const res = await window.CloudSyncManager.pullFromCloud();
      if (res.success) {
        loadAdminUsers();
        if (statusBox) {
          statusBox.textContent = '✅ Đã đồng bộ mã PIN mới nhất! Bạn có thể nhập mã PIN ngay.';
          statusBox.style.color = '#16a34a';
        }
        showToast('Đã đồng bộ mã PIN mới nhất từ Cloud!', 'success');
      } else {
        if (statusBox) {
          statusBox.textContent = '✕ Lỗi đồng bộ: ' + res.error;
          statusBox.style.color = '#ef4444';
        }
      }
    };

    // Đồng bộ tức thì lên Cloud qua các nút bấm ☁️ Lưu Lên Cloud
    window.adminForceSyncCloud = async function() {
      if (!window.CloudSyncManager) {
        showToast('⚠️ Hệ thống Cloud Sync chưa sẵn sàng!', 'warning');
        return;
      }
      showToast('⏳ Đang lưu và đẩy dữ liệu lên Firebase Đám Mây…', 'info', 2000);
      try {
        saveStudents(true);
        saveSchedule(true);
        const res = await window.CloudSyncManager.pushToCloud();
        if (res && res.success) {
          showToast('☁️ ĐÃ LƯU VÀ ĐỒNG BỘ LÊN CLOUD THÀNH CÔNG! Dữ liệu đã an toàn trên mọi thiết bị và không bị mất khi tải lại trang.', 'success', 5000);
          updateCloudUIStatus();
        } else {
          showToast('Lỗi đẩy dữ liệu lên Cloud: ' + (res?.error || 'Không xác định'), 'error', 4000);
        }
      } catch (err) {
        showToast('Lỗi đẩy dữ liệu lên Cloud: ' + err.message, 'error', 4000);
      }
    };

    // Bắt sự kiện cho các nút Lưu Lên Cloud
    document.getElementById('btn-hero-sync-cloud')?.addEventListener('click', window.adminForceSyncCloud);
    document.getElementById('btn-sync-students-cloud')?.addEventListener('click', window.adminForceSyncCloud);
  }

  window.adminSwitchMonth = (month, year, autoBackup = true) => switchAdminMonth(month, year, autoBackup);
  window.adminGoToNextMonth = () => goToNextMonth();
  window.adminGoToPrevMonth = () => goToPrevMonth();

  window.adminReloadAdminUsers = function() {
    loadAdminUsers();
    renderUserMgmtTable();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPortal);
  } else {
    initAdminPortal();
  }
})();
