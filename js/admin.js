/**
 * ==========================================================================
 * ADMIN PORTAL LOGIC (Bảng Điều Hành Quản Trị & Xếp Lịch)
 * ==========================================================================
 * Đóng gói trong IIFE để tránh xung đột biến toàn cục.
 * Hỗ trợ demo 30 sinh viên và luân phiên 2 tuần (Tuần 1 & Tuần 2)
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
    WEB_BACKUPS: 'ts_scheduler_web_backups_v1'
  };

  // Danh sách tài khoản cán bộ mặc định có quyền quản trị
  const DEFAULT_ADMIN_USERS = [
    {
      id: 'usr_admin',
      username: 'admin',
      password: '123',
      pin: '9999',
      fullName: 'Trưởng Ban Tuyển Sinh',
      role: 'Trưởng ban điều hành',
      createdAt: Date.now() - 500000
    },
    {
      id: 'usr_diephoi',
      username: 'diephoi',
      password: '123',
      pin: '8888',
      fullName: 'Cán Bộ Điều Phối Tuyển Sinh',
      role: 'Điều phối viên tuyển sinh',
      createdAt: Date.now() - 300000
    }
  ];

  // Dữ liệu mẫu ban đầu (12 SV) và 30 SV
  const SAMPLE_12_STUDENTS = [
    { id: 's_old_1', fullName: 'Nguyễn Văn An', studentId: '2102001', phone: '0912345678', role: 'old', availableShifts: ['T2_S', 'T2_C', 'T3_S', 'T4_S', 'T5_C', 'T6_S'], createdAt: Date.now() - 100000 },
    { id: 's_old_2', fullName: 'Trần Thị Bích', studentId: '2102002', phone: '0923456789', role: 'old', availableShifts: ['T2_C', 'T3_S', 'T3_C', 'T4_C', 'T5_S', 'T6_C'], createdAt: Date.now() - 90000 },
    { id: 's_old_3', fullName: 'Lê Hoàng Cường', studentId: '2102003', phone: '0934567890', role: 'old', availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T6_S'], createdAt: Date.now() - 80000 },
    { id: 's_old_4', fullName: 'Phạm Minh Đức', studentId: '2102004', phone: '0945678901', role: 'old', availableShifts: ['T2_S', 'T3_S', 'T4_C', 'T5_C', 'T6_S', 'T6_C'], createdAt: Date.now() - 70000 },
    { id: 's_old_5', fullName: 'Vũ Thị Hồng', studentId: '2102005', phone: '0956789012', role: 'old', availableShifts: ['T2_C', 'T3_C', 'T4_S', 'T5_S', 'T5_C', 'T6_C'], createdAt: Date.now() - 60000 },
    { id: 's_new_1', fullName: 'Hoàng Lan Anh', studentId: '2302001', phone: '0967890123', role: 'new', availableShifts: ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'], createdAt: Date.now() - 50000 },
    { id: 's_new_2', fullName: 'Ngô Gia Bảo', studentId: '2302002', phone: '0978901234', role: 'new', availableShifts: ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_C'], createdAt: Date.now() - 40000 },
    { id: 's_new_3', fullName: 'Bùi Khánh Linh', studentId: '2302003', phone: '0989012345', role: 'new', availableShifts: ['T2_S', 'T2_C', 'T3_S', 'T4_C', 'T5_S', 'T6_S'], createdAt: Date.now() - 30000 },
    { id: 's_new_4', fullName: 'Đỗ Tuấn Kiệt', studentId: '2302004', phone: '0990123456', role: 'new', availableShifts: ['T3_S', 'T3_C', 'T4_S', 'T5_C', 'T6_C'], createdAt: Date.now() - 20000 },
    { id: 's_new_5', fullName: 'Lý Thu Trang', studentId: '2302005', phone: '0901234567', role: 'new', availableShifts: ['T2_S', 'T3_C', 'T4_S', 'T4_C', 'T5_S', 'T6_S'], createdAt: Date.now() - 15000 },
    { id: 's_new_6', fullName: 'Dương Minh Trí', studentId: '2302006', phone: '0911223344', role: 'new', availableShifts: ['T2_C', 'T3_S', 'T4_S', 'T5_C', 'T6_C'], createdAt: Date.now() - 10000 },
    { id: 's_new_7', fullName: 'Mai Phương Thảo', studentId: '2302007', phone: '0922334455', role: 'new', availableShifts: ['T2_S', 'T3_C', 'T5_S', 'T5_C', 'T6_S'], createdAt: Date.now() - 5000 }
  ];

  const state = {
    students: [],
    currentSchedule: null,
    twoWeekSchedule: null,
    monthSchedule: null,
    viewWeek: 1, // 1, 2, 3, hoặc 4
    viewMode: 'single', // 'single' (từng tuần) hoặc 'master' (toàn cảnh 4 tuần)
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
    isAuthenticated: false
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
      btnLoadSample30: document.getElementById('btn-load-sample-30'),
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
      filterButtons: document.querySelectorAll('.filter-btn'),
      inputSearch: document.getElementById('input-search-student'),
      btnOpenAddStudent: document.getElementById('btn-open-add-student'),
      btnLoadSample: document.getElementById('btn-load-sample'),
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
      exportOptRepPage: document.getElementById('export-opt-reppage'),
      exportOptRedCells: document.getElementById('export-opt-redcells'),
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
      btnThemeToggle: document.getElementById('btn-theme-toggle'),

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
    bindSwapMgmtEvents();
    bindBackupCenterEvents();

    // Kiểm tra phiên đăng nhập quản trị trong sessionStorage
    const isAuth = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) === 'true';
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
      }
    });
  }

  function unlockAdminDashboard() {
    if (elements.authScreen) elements.authScreen.style.display = 'none';
    if (elements.dashboardContainer) elements.dashboardContainer.style.display = 'block';

    updateAdminUserHeader();

    loadData();
    loadRegConfig();
    bindEvents();
    bindRegConfigEvents();
    bindStickyHeroEvents();
    bindViewModeEvents();
    bindImportEvents();
    bindSwapMgmtEvents();
    bindBackupCenterEvents();
    renderAll();
    renderRegConfigUI();
    updateSwapCountBadges();

    // Cập nhật trạng thái đếm ngược trực tiếp mỗi 30 giây
    setInterval(updateRegLiveStatus, 30000);
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
        state.adminUsers = JSON.parse(raw);
      } else {
        state.adminUsers = [...DEFAULT_ADMIN_USERS];
        saveAdminUsers();
      }
    } catch (err) {
      state.adminUsers = [...DEFAULT_ADMIN_USERS];
    }
  }

  function saveAdminUsers() {
    localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(state.adminUsers));
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
    elements.formAuthCredentials?.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = elements.inputAuthUsername ? elements.inputAuthUsername.value.trim().toLowerCase() : '';
      const password = elements.inputAuthPassword ? elements.inputAuthPassword.value : '';

      const matched = state.adminUsers.find(u => u.username.toLowerCase() === username && u.password === password);
      if (matched) {
        authenticateSuccess(matched);
      } else {
        showAuthError('Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
    });

    // Xử lý đăng nhập Form 2: Mã PIN nhanh
    elements.formAuthPin?.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = elements.inputAuthPin ? elements.inputAuthPin.value.trim() : '';
      const matched = state.adminUsers.find(u => u.pin && u.pin === pin);
      if (matched) {
        authenticateSuccess(matched);
      } else {
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
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        state.isAuthenticated = false;
        state.currentUser = null;
        lockAdminDashboard();
        showToast('Đã đăng xuất khỏi hệ thống an toàn!', 'info');
      }
    });

    // Xuất API xác thực cho kiểm thử và tích hợp
    window.AdminAuth = {
      login: (username, password) => {
        const uStr = (username || '').trim().toLowerCase();
        const matched = state.adminUsers.find(u => u.username.toLowerCase() === uStr && u.password === password);
        if (matched) {
          authenticateSuccess(matched);
          return { success: true, user: matched };
        }
        showAuthError('Tên đăng nhập hoặc mật khẩu không chính xác!');
        return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' };
      },
      loginPin: (pin) => {
        const pStr = (pin || '').trim();
        const matched = state.adminUsers.find(u => u.pin && u.pin === pStr);
        if (matched) {
          authenticateSuccess(matched);
          return { success: true, user: matched };
        }
        showAuthError('Mã PIN không đúng! Vui lòng thử lại hoặc dùng tài khoản.');
        return { success: false, message: 'Mã PIN không đúng!' };
      },
      logout: () => {
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        state.isAuthenticated = false;
        state.currentUser = null;
        lockAdminDashboard();
      },
      isAuthenticated: () => state.isAuthenticated,
      getCurrentUser: () => state.currentUser,
      getAdminUsers: () => [...state.adminUsers]
    };
  }

  function authenticateSuccess(user) {
    state.isAuthenticated = true;
    state.currentUser = user;
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'true');
    sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));

    hideAuthError();
    unlockAdminDashboard();
    showToast(`Xin chào ${user.fullName}! Đăng nhập quản trị thành công.`, 'success');
  }

  function showAuthError(msg) {
    if (elements.authErrorBox) {
      elements.authErrorBox.style.display = 'flex';
      if (elements.authErrorMsg) elements.authErrorMsg.textContent = msg;
    }
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
        password,
        pin: pin || '',
        fullName,
        role: role || 'Điều phối viên tuyển sinh',
        createdAt: Date.now()
      };

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

      if (currentPwd !== user.password) {
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
      const idx = state.adminUsers.findIndex(u => u.id === user.id || u.username === user.username);
      if (idx !== -1) {
        state.adminUsers[idx].password = newPwd;
        if (newPin) state.adminUsers[idx].pin = newPin;
        saveAdminUsers();

        state.currentUser.password = newPwd;
        if (newPin) state.currentUser.pin = newPin;
        sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
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
        <td><span style="font-size: 0.78rem; color: #4338ca;">${escapeHtml(user.role)}</span></td>
        <td><code>${escapeHtml(user.pin || '-')}</code></td>
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
  }

  function loadData() {
    try {
      const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (rawStudents !== null) {
        state.students = JSON.parse(rawStudents) || [];
      } else {
        state.students = [];
        saveStudents();
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
    } catch (err) {
      console.error(err);
      state.students = [];
      state.monthSchedule = null;
      state.twoWeekSchedule = null;
      state.currentSchedule = null;
    }
  }

  function saveStudents() {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(state.students));
  }

  function saveSchedule() {
    if (state.currentSchedule) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.currentSchedule));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
    }
    if (state.monthSchedule) {
      localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
      localStorage.setItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE, JSON.stringify(state.monthSchedule));
    } else {
      localStorage.removeItem(STORAGE_KEYS.MONTH_SCHEDULE);
      localStorage.removeItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
    }
  }

  function runFullSchedule() {
    if (state.students.length === 0) {
      state.currentSchedule = null;
      state.twoWeekSchedule = null;
      state.monthSchedule = null;
      saveSchedule();
      return;
    }

    // Xếp ca trọn vẹn 1 tháng (4 tuần)
    const monthEngine = window.SchedulerEngine?.runMonthSchedule || window.SchedulerEngine?.runTwoWeekSchedule;
    const monthResult = monthEngine ? monthEngine(state.students) : null;
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

  function bindEvents() {
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
    elements.btnClearSchedule?.addEventListener('click', () => {
      if (!state.currentSchedule && !state.twoWeekSchedule && !state.monthSchedule) {
        showToast('Hiện tại chưa có bảng phân công nào để xóa!', 'info');
        return;
      }
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ bảng phân công ca trực (toàn bộ 4 tuần) không?\n(Lưu ý: Danh sách sinh viên và các ca rảnh đã đăng ký vẫn được giữ nguyên)')) {
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
      }
    });

    // Xóa toàn bộ sinh viên và lịch trực
    const handleClearAllStudents = () => {
      if (state.students.length === 0) {
        showToast('Danh sách sinh viên hiện đang trống!', 'info');
        return;
      }
      if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ ${state.students.length} sinh viên đã đăng ký không?\nThao tác này sẽ xóa sạch hồ sơ sinh viên và bảng phân công liên quan.`)) {
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
      }
    };

    elements.btnClearStudents?.addEventListener('click', handleClearAllStudents);
    elements.btnResetData?.addEventListener('click', handleClearAllStudents);

    elements.btnExportCsv?.addEventListener('click', exportScheduleToCsv);
    elements.btnPrintSchedule?.addEventListener('click', () => window.print());

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
    elements.exportOptRepPage?.addEventListener('change', renderUteSheetPreview);
    elements.exportOptRedCells?.addEventListener('change', renderUteSheetPreview);

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

    elements.btnLoadSample30?.addEventListener('click', () => {
      const sampleList = window.SAMPLE_30_STUDENTS || SAMPLE_12_STUDENTS || [];
      if (sampleList.length === 0) {
        showToast('Không tìm thấy dữ liệu mẫu 30 sinh viên!', 'error');
        return;
      }
      state.students = JSON.parse(JSON.stringify(sampleList));
      saveStudents();
      runFullSchedule();
      renderAll();
      showToast(`Đã nạp thành công ${state.students.length} sinh viên mẫu và tự động phân bổ lịch!`, 'success');
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
  }

  function triggerAutoSchedule(animate = true) {
    if (state.students.length === 0) {
      showToast('Chưa có sinh viên nào. Vui lòng thêm sinh viên hoặc nạp dữ liệu mẫu!', 'warning');
      return;
    }

    if (animate && elements.btnAutoSchedule) {
      const originalText = elements.btnAutoSchedule.innerHTML;
      elements.btnAutoSchedule.innerHTML = '<span>⚡ Đang tối ưu thuật toán...</span>';
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
      elements.studentTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon">📋</div>
              <h3>Không tìm thấy sinh viên nào</h3>
              <p>Bấm "+ Thêm Sinh Viên Mới" hoặc chờ sinh viên đăng ký từ Cổng Sinh Viên để bắt đầu.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const assignedCounts = state.currentSchedule?.studentStats || {};
    const combinedStats = state.twoWeekSchedule?.combinedStats || {};

    elements.studentTableBody.innerHTML = filtered.map((s, index) => {
      const isOld = s.role === 'old';
      const roleBadge = isOld 
        ? `<span class="badge badge-old">🎓 Người cũ</span>` 
        : `<span class="badge badge-new">🌱 Người mới</span>`;
      
      const currentAssigned = assignedCounts[s.id]?.assignedCount || 0;
      const totalTwoWeeks = combinedStats[s.id]?.totalCount || currentAssigned;
      
      const shiftTags = (s.availableShifts || []).map(id => {
        const info = SHIFT_MAP[id];
        return info ? `<span class="shift-tag">${info.dayName} ${info.period}</span>` : '';
      }).join('');

      return `
        <tr>
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
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.adminEditStudent('${escapeHtml(s.id)}')" title="Sửa thông tin & ca rảnh">✏️ Sửa</button>
              <button class="btn btn-danger-outline btn-sm" onclick="window.adminDeleteStudent('${escapeHtml(s.id)}')" title="Xóa">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
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

    let gridHtml = '';

    gridHtml += `<div class="grid-cell grid-header"><span class="day-name">Ca / Ngày</span></div>`;
    days.forEach(day => {
      gridHtml += `
        <div class="grid-cell grid-header">
          <span class="day-name">${day.name}</span>
          <span class="day-sub">${day.sub}</span>
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
      <div class="duty-member-card role-old" title="Người cũ - Có kinh nghiệm">
        <div class="member-info">
          <span class="member-role-tag">🎓 Người Cũ</span>
          <span class="member-name">${escapeHtml(oldMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(oldMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'old')" title="Đổi bạn khác">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'old')" style="cursor: pointer;" title="Nhấn để gán người cũ">
        <span>+ Chưa có Người Cũ</span>
      </div>
    `;

    const newCard = newMem ? `
      <div class="duty-member-card role-new" title="Người mới - Tập sự">
        <div class="member-info">
          <span class="member-role-tag">🌱 Người Mới</span>
          <span class="member-name">${escapeHtml(newMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(newMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'new')" title="Đổi bạn khác">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'new')" style="cursor: pointer;" title="Nhấn để gán người mới">
        <span>+ Chưa có Người Mới</span>
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
    const roleTitle = role === 'old' ? 'Người Cũ' : 'Người Mới';
    const targetSchedule = weekNumber && state.monthSchedule?.weeks?.[weekNumber - 1]
      ? state.monthSchedule.weeks[weekNumber - 1]
      : state.currentSchedule;

    if (elements.modalSlotTitle) {
      const weekPrefix = weekNumber ? `[Tuần ${weekNumber}] ` : '';
      elements.modalSlotTitle.textContent = `${weekPrefix}${shiftInfo.dayName} (${shiftInfo.period}: ${shiftInfo.time})`;
    }

    if (elements.modalRoleBadge) {
      elements.modalRoleBadge.textContent = roleTitle;
      elements.modalRoleBadge.className = `badge ${role === 'old' ? 'badge-old' : 'badge-new'}`;
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

    if (!targetSchedule) return;

    const selectedStudentId = elements.modalCandidateSelect.value;
    const newStudent = selectedStudentId ? state.students.find(s => s.id === selectedStudentId) : null;

    const slot = targetSchedule.scheduleTable[shiftId];
    if (!slot) return;

    if (role === 'old') {
      slot.oldMember = newStudent;
    } else {
      slot.newMember = newStudent;
    }

    if (slot.oldMember && slot.newMember) {
      slot.status = 'full';
    } else if (!slot.oldMember && !slot.newMember) {
      slot.status = 'empty';
    } else {
      slot.status = 'partial';
    }

    const newStats = {};
    state.students.forEach(s => {
      newStats[s.id] = {
        student: s,
        assignedCount: 0,
        registeredCount: (s.availableShifts || []).length
      };
    });

    Object.values(targetSchedule.scheduleTable).forEach(s => {
      if (s.oldMember && newStats[s.oldMember.id]) newStats[s.oldMember.id].assignedCount++;
      if (s.newMember && newStats[s.newMember.id]) newStats[s.newMember.id].assignedCount++;
    });

    targetSchedule.studentStats = newStats;
    targetSchedule.timestamp = Date.now();

    saveSchedule();
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

    if (availableShifts.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 ca rảnh!', 'error');
      return;
    }

    if (editId) {
      const idx = state.students.findIndex(s => s.id === editId);
      if (idx !== -1) {
        state.students[idx] = {
          ...state.students[idx],
          fullName,
          studentId,
          phone,
          role,
          availableShifts,
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

  window.adminDeleteStudent = function(studentId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return;

    if (confirm(`Bạn có chắc muốn xóa bạn "${student.fullName}" (MSSV: ${student.studentId}) không?`)) {
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
    const legacyBtn = elements.btnThemeToggle || document.getElementById('btn-theme-toggle');

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

      if (legacyBtn) {
        const icon = legacyBtn.querySelector('.theme-icon');
        const text = legacyBtn.querySelector('.theme-text');
        if (icon) icon.textContent = isDark ? '☀️' : '🌙';
        if (text) text.textContent = isDark ? 'Sáng' : 'Tối';
        legacyBtn.title = isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối (Dark Mode)';
      }
    }

    const currentDark = document.documentElement.getAttribute('data-theme') === 'dark';
    updateThemeUI(currentDark);

    if (btnLight) {
      btnLight.addEventListener('click', () => applyTheme('light'));
    }
    if (btnDark) {
      btnDark.addEventListener('click', () => applyTheme('dark'));
    }
    if (legacyBtn) {
      legacyBtn.addEventListener('click', () => {
        const isCurrentlyDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyTheme(isCurrentlyDark ? 'light' : 'dark');
      });
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

    if (!state.monthSchedule || !state.monthSchedule.weeks || state.monthSchedule.weeks.length === 0) {
      elements.adminMasterMonthContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md); width: 100%;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📅</div>
          <h3 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.35rem;">Chưa Có Bảng Phân Công 1 Tháng</h3>
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
      const schedule = weekObj.scheduleTable || {};
      const fullCount = weekObj.summary?.fullShifts || 0;

      let gridHtml = '';
      gridHtml += `<div class="grid-cell grid-header"><span class="day-name">Ca / Ngày</span></div>`;
      days.forEach(day => {
        gridHtml += `
          <div class="grid-cell grid-header">
            <span class="day-name">${day.name}</span>
            <span class="day-sub">${day.sub}</span>
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
              <span>🗓️ Tuần ${weekNum} (10 Ca Trực)</span>
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
      <div class="duty-member-card role-old" title="Người cũ - Có kinh nghiệm">
        <div class="member-info">
          <span class="member-role-tag">🎓 Người Cũ</span>
          <span class="member-name">${escapeHtml(oldMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(oldMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'old', ${weekNum})" title="Đổi bạn khác ở Tuần ${weekNum}">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'old', ${weekNum})" style="cursor: pointer;" title="Nhấn để gán người cũ ở Tuần ${weekNum}">
        <span>+ Chưa có Người Cũ</span>
      </div>
    `;

    const newCard = newMem ? `
      <div class="duty-member-card role-new" title="Người mới - Tập sự">
        <div class="member-info">
          <span class="member-role-tag">🌱 Người Mới</span>
          <span class="member-name">${escapeHtml(newMem.fullName)}</span>
          <span class="member-mssv">MSSV: ${escapeHtml(newMem.studentId)}</span>
        </div>
        <button class="duty-change-btn" onclick="window.adminOpenReassignModal('${shiftId}', 'new', ${weekNum})" title="Đổi bạn khác ở Tuần ${weekNum}">🔄</button>
      </div>
    ` : `
      <div class="duty-member-card empty-member" onclick="window.adminOpenReassignModal('${shiftId}', 'new', ${weekNum})" style="cursor: pointer;" title="Nhấn để gán người mới ở Tuần ${weekNum}">
        <span>+ Chưa có Người Mới</span>
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
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return [];

    const candidates = [];
    const validShiftIds = SHIFTS.map(s => s.id);

    // Bỏ qua dòng tiêu đề
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Phân tách CSV xử lý dấu ngoặc kép RFC 4180
      const row = [];
      let inQuotes = false;
      let currentVal = '';

      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
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

      const fullName = (row[0] || '').replace(/^"|"$/g, '').trim();
      const studentId = (row[1] || '').replace(/^"|"$/g, '').trim();
      const phone = (row[2] || '').replace(/^"|"$/g, '').trim();
      const roleRaw = (row[3] || '').toLowerCase();
      const shiftsRaw = (row[4] || '').replace(/^"|"$/g, '').trim();

      if (!fullName || !studentId) continue;

      const isOld = roleRaw.includes('cũ') || roleRaw.includes('old') || roleRaw.includes('kinh nghiệm');
      const role = isOld ? 'old' : 'new';

      // Phân tích danh sách ca rảnh
      const availableShifts = [];
      const shiftTokens = shiftsRaw.split(/[,;\s]+/).map(t => t.trim().toUpperCase());
      
      shiftTokens.forEach(token => {
        if (validShiftIds.includes(token)) {
          if (!availableShifts.includes(token)) availableShifts.push(token);
        }
      });

      // Nếu không nhập mã ca chuẩn, gán mặc định ít nhất các ca rảnh hợp lý
      if (availableShifts.length === 0) {
        availableShifts.push('T2_S', 'T3_C', 'T4_S', 'T5_C', 'T6_S');
      }

      const isExisting = state.students.some(s => s.studentId.toLowerCase() === studentId.toLowerCase());

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
        ? `<span class="badge badge-old" style="font-size:0.7rem;">🎓 Người cũ</span>`
        : `<span class="badge badge-new" style="font-size:0.7rem;">🌱 Người mới</span>`;

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
      elements.btnConfirmImport.innerHTML = `<span>✓ Xác Nhận Nạp ${candidates.length} Sinh Viên</span>`;
    }
  }

  function confirmImportStudents() {
    const candidates = state.importedCandidates || [];
    if (candidates.length === 0) return;

    let addedCount = 0;
    let updatedCount = 0;

    candidates.forEach(c => {
      const existingIdx = state.students.findIndex(s => s.studentId.toLowerCase() === c.studentId.toLowerCase());
      if (existingIdx !== -1) {
        state.students[existingIdx] = {
          ...state.students[existingIdx],
          fullName: c.fullName,
          phone: c.phone || state.students[existingIdx].phone,
          role: c.role,
          availableShifts: c.availableShifts,
          updatedAt: Date.now()
        };
        updatedCount++;
      } else {
        state.students.push({
          id: 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          fullName: c.fullName,
          studentId: c.studentId,
          phone: c.phone,
          role: c.role,
          availableShifts: c.availableShifts,
          createdAt: Date.now()
        });
        addedCount++;
      }
    });

    saveStudents();
    runFullSchedule();
    renderAll();
    closeImportModal();
    showToast(`Đã nạp thành công ${candidates.length} sinh viên (Thêm mới: ${addedCount}, Cập nhật: ${updatedCount})!`, 'success');
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
    if (!req) return;

    // Lấy target student object từ danh sách sinh viên
    const targetStudent = state.students.find(s => s.studentId?.toLowerCase() === req.targetStudentId?.toLowerCase()) || {
      id: 's_target_' + req.targetStudentId,
      studentId: req.targetStudentId,
      fullName: req.targetStudentName,
      role: req.targetStudentRole || 'new'
    };

    const senderStudent = state.students.find(s => s.studentId?.toLowerCase() === req.studentId?.toLowerCase()) || {
      id: 's_sender_' + req.studentId,
      studentId: req.studentId,
      fullName: req.studentName,
      role: req.studentRole || 'old'
    };

    // Tìm tuần trong state.monthSchedule
    const weekIdx = (req.weekNum || 1) - 1;
    if (state.monthSchedule && state.monthSchedule.weeks && state.monthSchedule.weeks[weekIdx]) {
      const table = state.monthSchedule.weeks[weekIdx].scheduleTable;
      const slot = table[req.shiftId];

      if (slot) {
        if (slot.oldMember?.studentId?.toLowerCase() === req.studentId.toLowerCase()) {
          slot.oldMember = targetStudent;
        } else if (slot.newMember?.studentId?.toLowerCase() === req.studentId.toLowerCase()) {
          slot.newMember = targetStudent;
        }

        // Cập nhật trạng thái slot
        slot.status = (slot.oldMember && slot.newMember) ? 'full' : 'partial';
      }

      // Nếu là Tuần 1, đồng bộ sang scheduleResult
      if (weekIdx === 0 && state.scheduleResult && state.scheduleResult.scheduleTable) {
        state.scheduleResult.scheduleTable = table;
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.scheduleResult));
      }

      localStorage.setItem(STORAGE_KEYS.MONTH_SCHEDULE, JSON.stringify(state.monthSchedule));
    }

    req.status = 'approved';
    req.approvedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(list));

    // Đồng bộ sang cổng sinh viên
    window.dispatchEvent(new Event('storage'));

    renderSwapRequestsTable();
    renderAll();
    showToast(`Đã phê duyệt đề xuất của CTV ${req.studentName}! Lịch trực đã được tự động cập nhật.`, 'success');
  }

  function handleRejectSwap(swapId) {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}

    const req = list.find(r => r.id === swapId);
    if (!req) return;

    req.status = 'rejected';
    req.rejectedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(list));

    window.dispatchEvent(new Event('storage'));
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
    elements.btnCreateWebBackup?.addEventListener('click', handleCreateWebBackupPrompt);
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
        version: '2.5',
        exportedAt: new Date().toISOString(),
        exportedBy: state.currentUser ? state.currentUser.fullName : 'Admin'
      },
      students: state.students || [],
      monthSchedule: state.monthSchedule || null,
      scheduleResult: state.scheduleResult || null,
      regConfig: state.regConfig || null,
      adminUsers: state.adminUsers || [],
      swapRequests: swapList
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

  function handleConfirmRestore() {
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
        localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(pendingRestoreData.swapRequests));
      }

      window.dispatchEvent(new Event('storage'));

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

  function handleStartNewMonth() {
    const confirmMsg = 'BẠN CÓ CHẮC CHẮN MUỐN KHỞI TẠO LỊCH THÁNG MỚI?\n\n• Hệ thống sẽ tự động lưu 1 bản snapshot vào danh sách Sao Lưu Trên Web (Lưu 6 tháng).\n• Tự động xuất 1 file dự phòng kỳ cũ về máy bạn.\n• Bảng lịch 4 tuần sẽ được làm sạch để xếp lịch mới.\n• Toàn bộ danh sách CTV đã đăng ký VẪN ĐƯỢC GIỮ NGUYÊN 100%.';
    if (!confirm(confirmMsg)) return;

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

    window.dispatchEvent(new Event('storage'));

    renderAll();
    updateBackupStats();
    updateSwapCountBadges();
    closeBackupCenterModal();

    showToast('Đã khởi tạo kỳ trực tháng mới thành công! Danh sách sinh viên vẫn được bảo toàn nguyên vẹn.', 'success');
  }

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
      window.dispatchEvent(new Event('storage'));
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
    const monthNum = now.getMonth() + 1;
    const yearNum = now.getFullYear();
    const monthKey = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    const monthLabel = `Tháng ${monthNum}/${yearNum}`;

    const defaultName = customName || `Bản sao lưu ${monthLabel} (${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ngày ${now.getDate()}/${monthNum}/${yearNum})`;

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

    const backupPayload = {
      students: studentList,
      monthSchedule: monthSched,
      scheduleResult: schedRes,
      regConfig: regCfg,
      adminUsers: adminUserList,
      swapRequests: swapList
    };

    const payloadJson = JSON.stringify(backupPayload);
    const sizeBytes = typeof Blob !== 'undefined' ? new Blob([payloadJson]).size : payloadJson.length;

    const backupItem = {
      id: `wbk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: defaultName,
      monthKey: monthKey,
      monthLabel: monthLabel,
      createdAt: Date.now(),
      expiresAt: Date.now() + RETENTION_PERIOD_MS,
      sizeBytes: sizeBytes,
      stats: {
        studentCount: studentList.length,
        weekCount: (monthSched?.weeks || []).length || 4,
        swapCount: swapList.length,
        adminCount: adminUserList.length
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

  function handleCreateWebBackupPrompt() {
    const defaultName = `Sao lưu ${new Date().toLocaleDateString('vi-VN')} (${String(new Date().getHours()).padStart(2, '0')}h${String(new Date().getMinutes()).padStart(2, '0')})`;
    const customName = prompt('Nhập tên gợi nhớ cho bản sao lưu trên web (hoặc để mặc định):', defaultName);
    if (customName === null) return; // Người dùng bấm Hủy

    const finalName = customName.trim() || defaultName;
    createWebBackup(finalName);
    showToast(`Đã tạo bản sao lưu "${escapeHtml(finalName)}" trên web thành công!`, 'success');
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
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${escapeHtml(item.name)}</div>
            <div style="display: flex; gap: 0.35rem; align-items: center; margin-top: 0.2rem;">
              <span class="badge" style="background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: var(--radius-full);">
                🗓️ ${escapeHtml(item.monthLabel || 'Kỳ trực')}
              </span>
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
              🔄 ${stats.swapCount} đề xuất đổi ca &bull; 🔑 ${stats.adminCount || 2} cán bộ
            </div>
          </td>
          <td style="text-align: center; font-size: 0.82rem; font-weight: 600; color: var(--text-muted);">
            ${sizeKb} KB
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center; flex-wrap: wrap;">
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

  function handleRestoreFromWebBackup(backupId) {
    const backups = getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (!target || !target.payload) {
      showToast('Không tìm thấy bản sao lưu hợp lệ!', 'error');
      return;
    }

    const createdDate = new Date(target.createdAt);
    const dateStr = `${createdDate.toLocaleDateString('vi-VN')} ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;
    const confirmMsg = `XÁC NHẬN KHÔI PHỤC HỆ THỐNG TỪ BẢN SAO LƯU TRÊN WEB:\n\n• Bản lưu: ${target.name}\n• Thời điểm tạo: ${dateStr}\n• Dữ liệu: ${(target.payload.students || []).length} CTV, ${(target.payload.monthSchedule?.weeks || []).length || 4} tuần lịch trực\n\n⚠️ CẢNH BÁO: Toàn bộ dữ liệu hiện tại trên trình duyệt sẽ được thay thế bằng bản sao lưu này. Bạn có chắc chắn muốn khôi phục không?`;

    if (!confirm(confirmMsg)) return;

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

      window.dispatchEvent(new Event('storage'));

      renderAll();
      renderRegConfigUI();
      updateBackupStats();
      updateSwapCountBadges();
      renderWebBackupsTable();
      closeBackupCenterModal();

      showToast(`Đã khôi phục toàn bộ hệ thống từ "${escapeHtml(target.name)}" thành công 100%!`, 'success');
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

    showToast(`Đã tải xuống file sao lưu "${escapeHtml(target.name)}" (.json)!`, 'success');
  }

  function handleDeleteWebBackup(backupId) {
    const backups = getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (!target) return;

    if (!confirm(`Bạn có chắc chắn muốn xóa bản sao lưu "${target.name}" khỏi trình duyệt không? Thao tác này không thể hoàn tác.`)) {
      return;
    }

    const updated = backups.filter(b => b.id !== backupId);
    saveWebBackups(updated);
    renderWebBackupsTable();
    updateBackupStats();
    showToast(`Đã xóa bản sao lưu "${escapeHtml(target.name)}" khỏi web!`, 'info');
  }

  window.adminApproveSwap = (swapId) => handleApproveSwap(swapId);
  window.adminRejectSwap = (swapId) => handleRejectSwap(swapId);
  window.adminOpenSwapModal = () => openSwapMgmtModal();
  window.adminCloseSwapModal = () => closeSwapMgmtModal();
  window.adminOpenBackupModal = () => openBackupCenterModal();
  window.adminCloseBackupModal = () => closeBackupCenterModal();
  window.adminTriggerCreateWebBackup = () => handleCreateWebBackupPrompt();
  window.adminRestoreFromWebBackup = (id) => handleRestoreFromWebBackup(id);
  window.adminDownloadSingleWebBackup = (id) => handleDownloadSingleWebBackup(id);
  window.adminDeleteWebBackup = (id) => handleDeleteWebBackup(id);
  window.adminStartNewMonth = () => handleStartNewMonth();
  window.WebBackupManager = {
    getWebBackups,
    createWebBackup,
    restoreFromWebBackup: handleRestoreFromWebBackup,
    deleteWebBackup: handleDeleteWebBackup,
    MAX_WEB_BACKUPS,
    RETENTION_PERIOD_MS
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
      window.dispatchEvent(new Event('storage'));
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
      window.dispatchEvent(new Event('storage'));
    });
  }

  function exportScheduleToCsv() {
    if (!state.currentSchedule) {
      showToast('Chưa có lịch trực nào để xuất!', 'warning');
      return;
    }

    const schedule = state.currentSchedule.scheduleTable;
    let csvContent = '\uFEFF';
    csvContent += 'STT,Thứ,Buổi,Khung Giờ,Người Cũ (Kinh Nghiệm),MSSV Người Cũ,Người Mới (Tập Sự),MSSV Người Mới,Trạng Thái Ca\n';

    SHIFTS.forEach((shift, index) => {
      const slot = schedule[shift.id];
      const oldName = slot?.oldMember?.fullName || 'Chưa có';
      const oldMssv = slot?.oldMember?.studentId || '-';
      const newName = slot?.newMember?.fullName || 'Chưa có';
      const newMssv = slot?.newMember?.studentId || '-';
      const statusText = slot?.status === 'full' ? 'Đủ 2 bạn' : (slot?.status === 'partial' ? 'Thiếu 1 bạn' : 'Trống ca');

      csvContent += `"${index + 1}","${shift.dayName}","${shift.period}","${shift.time}","${oldName}","${oldMssv}","${newName}","${newMssv}","${statusText}"\n`;
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
    if (elements.exportStartDate && !elements.exportStartDate.value) {
      elements.exportStartDate.value = '2026-07-01';
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
      showToast('Không tìm thấy danh sách mẫu HCM-UTE!', 'error');
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
    const startDateVal = elements.exportStartDate?.value || '2026-07-01';
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
        // Thứ 7 hoặc Chủ Nhật (Cuối tuần)
        if (state.students.length >= 2) {
          const s1 = state.students[(addedCount * 2) % state.students.length];
          const s2 = state.students[(addedCount * 2 + 1) % state.students.length];
          morningText = `${s1.fullName} - ${s1.studentId}\n${s2.fullName} - ${s2.studentId}`;
          afternoonText = `${s1.fullName} - ${s1.studentId}\n${s2.fullName} - ${s2.studentId}`;
        }
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

  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPortal);
  } else {
    initAdminPortal();
  }
})();
