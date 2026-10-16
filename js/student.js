/**
 * ==========================================================================
 * STUDENT PORTAL LOGIC (Trang Người Dùng / Sinh Viên)
 * ==========================================================================
 * Đóng gói trong IIFE để tránh xung đột biến toàn cục.
 * Hỗ trợ tra cứu ca trực và xem lịch trực chung cho Tuần 1 & Tuần 2.
 */

(() => {
  'use strict';

  const { SHIFTS, SHIFT_MAP } = window.SchedulerEngine || {};

  const STORAGE_KEYS = {
    STUDENTS: 'ts_scheduler_students',
    SCHEDULE: 'ts_scheduler_schedule_result',
    TWO_WEEK_SCHEDULE: 'ts_scheduler_two_week_result',
    MONTH_SCHEDULE: 'ts_scheduler_month_result',
    PREV_MONTH_SCHEDULE: 'ts_scheduler_prev_month_result',
    REG_CONFIG: 'ts_scheduler_reg_config',
    SWAP_REQUESTS: 'ts_scheduler_swap_requests',
    WEB_BACKUPS: 'ts_scheduler_web_backups_v1',
    ALL_MONTHS: 'ts_scheduler_all_months_v1',
    ACTIVE_MONTH: 'ts_scheduler_active_month_v1'
  };

  /**
   * Tháng/năm đang được Ban Điều Hành áp dụng.
   * Nguồn sự thật duy nhất: localStorage `ACTIVE_MONTH` (do Admin ghi khi chuyển kỳ).
   * Dự phòng: đọc từ chính lịch đang lưu, cuối cùng mới về 10/2026.
   */
  function getActiveMonth() {
    let month = null;
    let year = null;

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_MONTH);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          month = parseInt(parsed.month, 10);
          year = parseInt(parsed.year, 10);
        }
      }
    } catch (e) {}

    if (!month || !year) {
      try {
        const sched = readMonthScheduleStore();
        if (sched && sched.month && sched.year) {
          month = parseInt(sched.month, 10);
          year = parseInt(sched.year, 10);
        }
      } catch (e) {}
    }

    if (!month || !year) return { month: 10, year: 2026 };
    return { month, year };
  }

  /** Tháng liền trước tháng đang áp dụng. */
  function getPrevActiveMonth() {
    const cur = getActiveMonth();
    let m = cur.month - 1;
    let y = cur.year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    return { month: m, year: y };
  }

  /** Nhãn tháng dạng "Tháng 10/2026". */
  function formatMonthLabel(month, year) {
    return `Tháng ${String(month).padStart(2, '0')}/${year}`;
  }

  /**
   * Sinh cấu hình 4 tuần cho một tháng bất kỳ từ MonthCalendarHelper.
   * Loại bỏ hoàn toàn việc hardcode ngày tháng trong mã nguồn.
   */
  function buildMonthWeeksConfig(month, year, weekSuffix = '') {
    const helper = (window.SchedulerEngine && window.SchedulerEngine.MonthCalendarHelper)
      || window.MonthCalendarHelper;
    if (!helper || typeof helper.getMonthWeeks !== 'function') return [];

    const weeks = helper.getMonthWeeks(month, year) || [];
    const fullDayNames = {
      T2: 'Thứ Hai', T3: 'Thứ Ba', T4: 'Thứ Tư', T5: 'Thứ Năm', T6: 'Thứ Sáu'
    };

    return weeks.map(w => {
      const days = {};
      ['T2', 'T3', 'T4', 'T5', 'T6'].forEach(dayKey => {
        const d = (w.days && w.days[dayKey]) || {};
        days[dayKey] = {
          name: fullDayNames[dayKey] || d.dayName || dayKey,
          dateStr: d.dateStr || '',
          fullDate: d.fullDate || ''
        };
      });

      const startFull = expandShortDate(w.startDateStr, year);
      const endFull = expandShortDate(w.endDateStr, year);

      return {
        weekNumber: w.weekNumber,
        name: `Tuần ${w.weekNumber}${weekSuffix}`,
        dateRange: `${w.startDateStr} - ${w.endDateStr}`,
        fullRange: `${startFull} - ${endFull}`,
        startDateStr: w.startDateStr,
        endDateStr: w.endDateStr,
        days
      };
    });
  }

  /** "05/10" -> "05/10/2026" (năm suy ra từ ngày đầu tháng của tháng đang xét). */
  function expandShortDate(shortStr, fallbackYear) {
    if (!shortStr) return '';
    const parts = String(shortStr).split('/');
    if (parts.length !== 2) return shortStr;
    return `${parts[0]}/${parts[1]}/${fallbackYear}`;
  }

  /** Cấu hình tuần của tháng đang áp dụng (tính động, không hardcode). */
  function getCurrentMonthWeeksConfig() {
    const cur = getActiveMonth();
    return buildMonthWeeksConfig(cur.month, cur.year);
  }

  /**
   * Lịch tháng trước: ưu tiên kho ALL_MONTHS, sau đó tới bản sao lưu web,
   * cuối cùng mới sinh mẫu bằng SchedulerEngine. Luôn gắn đúng tháng/năm.
   */
  function getPrevMonthSchedule() {
    const prev = getPrevActiveMonth();
    const key = `${prev.year}-${String(prev.month).padStart(2, '0')}`;

    // 1. Kho lưu trữ toàn bộ tháng (Admin ghi khi chuyển kỳ)
    try {
      const rawAll = localStorage.getItem(STORAGE_KEYS.ALL_MONTHS);
      if (rawAll) {
        const allMonths = JSON.parse(rawAll) || {};
        if (allMonths[key] && allMonths[key].weeks) {
          return allMonths[key];
        }
      }
    } catch (e) {}

    // 2. Bản sao lưu web
    try {
      const rawBackups = localStorage.getItem(STORAGE_KEYS.WEB_BACKUPS);
      if (rawBackups) {
        const backups = JSON.parse(rawBackups) || [];
        const label = `${String(prev.month).padStart(2, '0')}/${prev.year}`;
        const hit = backups.find(b => b.monthKey === key)
          || backups.find(b => b.name && b.name.includes(label));
        if (hit && hit.payload && hit.payload.monthSchedule) {
          try {
            localStorage.setItem(STORAGE_KEYS.PREV_MONTH_SCHEDULE, JSON.stringify(hit.payload.monthSchedule));
          } catch (e) {}
          return hit.payload.monthSchedule;
        }
      }
    } catch (e) {}

    // 3. Cache cục bộ
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.PREV_MONTH_SCHEDULE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.month === prev.month && parsed.year === prev.year) {
          return parsed;
        }
      }
    } catch (e) {}

    // 4. Sinh lịch mẫu chân thực cho đúng tháng trước
    let prevSched = null;
    try {
      const students = loadAllStudents();
      if (window.SchedulerEngine && typeof window.SchedulerEngine.runMonthSchedule === 'function' && students.length > 0) {
        prevSched = window.SchedulerEngine.runMonthSchedule(students, prev.year, prev.month);
      }
    } catch (err) {
      console.warn('[Portal] Không thể tự động sinh lịch tháng trước:', err);
    }

    if (prevSched) {
      try {
        localStorage.setItem(STORAGE_KEYS.PREV_MONTH_SCHEDULE, JSON.stringify(prevSched));
      } catch (e) {}
      return prevSched;
    }

    return null;
  }

  /** Đọc lịch tháng hiện tại từ store (có fallback về bản 2-tuần cũ). */
  function readMonthScheduleStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE)
        || localStorage.getItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[Portal] Không đọc được lịch tháng từ bộ nhớ:', e);
    }
    return null;
  }

  /** Đọc lịch tuần (bản cũ 1-tuần) nếu có. */
  function readWeekScheduleStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /** Lấy danh sách CTV từ store, không ghi đè dữ liệu đang có. */
  function loadAllStudents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {}
    try {
      const sample = (typeof window.getSample30Students === 'function')
        ? window.getSample30Students()
        : (window.SAMPLE_30_STUDENTS || []);
      return Array.isArray(sample) ? sample : [];
    } catch (e) {
      return [];
    }
  }

  // State
  let viewWeek = 1;
  let regConfig = null;
  let isRegOpen = true;
  let detectedStudent = null;
  let currentLookupStudent = null;
  let currentLookupShifts = [];
  let selectedMonth = 'current'; // 'current' (tháng đang áp dụng) | 'prev' (tháng liền trước)

  // Quản lý ca rảnh từng tuần trong tháng (MONTHREG-02)
  let currentRegWeek = 1; // 1, 2, 3, 4, hoặc 'all'
  let monthlyAvailableShifts = {
    1: [],
    2: [],
    3: [],
    4: []
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

  // DOM Elements Cache
  let elements = {};

  function cacheDOMElements() {
    elements = {
      // Form Elements
      regForm: document.getElementById('student-reg-form'),
      inputFullName: document.getElementById('input-fullname'),
      inputStudentId: document.getElementById('input-studentid'),
      inputPhone: document.getElementById('input-phone'),
      // Duplicate MSSV Alert Elements
      matrixCheckboxes: document.querySelectorAll('.slot-checkbox'),
      slotToggles: document.querySelectorAll('.slot-toggle'),
      selectedCountDisplay: document.getElementById('selected-shift-count'),
      btnSubmit: document.getElementById('btn-submit-reg'),

      // Gate Locking Elements (Task 1)
      matrixGateNotice: document.getElementById('matrix-gate-notice'),
      studentMatrixArea: document.getElementById('student-matrix-area'),

      // Clear Shift Buttons (Task 3)
      btnClearCurrentWeek: document.getElementById('btn-clear-current-week'),
      btnClearAllShifts: document.getElementById('btn-clear-all-shifts'),

      // Month Selector Tabs (Task 4)
      studentMonthSelector: document.getElementById('student-month-selector'),
      btnMonthCurrent: document.getElementById('btn-month-current'),
      btnMonthPrev: document.getElementById('btn-month-prev'),
      regTitleMonth: document.getElementById('reg-month-title'),
      regMatrixMonthLabel: document.getElementById('reg-matrix-month-label'),

      // Monthly Registration Tab & Toolbar Elements
      regWeekTabs: document.querySelectorAll('#reg-week-tabs .month-week-tab'),
      currentWeekLabel: document.getElementById('current-week-label'),
      btnQuickCopyAll: document.getElementById('btn-quick-copy-all'),
      monthOverviewContainer: document.getElementById('month-overview-container'),
      dateBadges: {
        T2: document.getElementById('date-badge-T2'),
        T3: document.getElementById('date-badge-T3'),
        T4: document.getElementById('date-badge-T4'),
        T5: document.getElementById('date-badge-T5'),
        T6: document.getElementById('date-badge-T6')
      },
      badgeWeekCounts: {
        1: document.getElementById('badge-week-count-1'),
        2: document.getElementById('badge-week-count-2'),
        3: document.getElementById('badge-week-count-3'),
        4: document.getElementById('badge-week-count-4'),
        all: document.getElementById('badge-week-count-all')
      },

      // Registration Window & Locked State Elements
      regStatusBanner: document.getElementById('student-reg-status-banner'),
      regStatusIcon: document.getElementById('student-reg-status-icon'),
      regStatusTitle: document.getElementById('student-reg-status-title'),
      regStatusDesc: document.getElementById('student-reg-status-desc'),
      regCountdown: document.getElementById('student-reg-countdown'),
      regCountdownTime: document.getElementById('student-reg-countdown-time'),
      matrixLockedNotice: document.getElementById('matrix-locked-notice'),
      shiftMatrixContainer: document.getElementById('shift-matrix-container'),
      matrixQuickToolbar: document.getElementById('matrix-quick-toolbar'),

      // MSSV Status Elements
      mssvLiveTag: document.getElementById('mssv-live-tag'),
      mssvInputHint: document.getElementById('mssv-input-hint'),

      // Quick Selection Buttons
      btnQuickMorning: document.getElementById('btn-quick-morning'),
      btnQuickAfternoon: document.getElementById('btn-quick-afternoon'),
      btnQuickAll: document.getElementById('btn-quick-all'),
      btnQuickClear: document.getElementById('btn-quick-clear'),

      // Week switchers (Tuần 1 - Tuần 4)
      weekSelectorButtons: document.querySelectorAll('#student-week-selector .filter-btn'),

      // Banners & Notifications
      regSuccessAlert: document.getElementById('reg-success-alert'),
      regSuccessText: document.getElementById('reg-success-text'),

      // Timetable Display
      timetableGrid: document.getElementById('student-timetable-grid'),
      scheduleUpdateTime: document.getElementById('schedule-update-time'),
      scheduleStatusBanner: document.getElementById('schedule-status-banner'),

      // Lookup Feature
      inputLookupMssv: document.getElementById('input-lookup-mssv'),
      btnLookup: document.getElementById('btn-lookup'),
      lookupResult: document.getElementById('lookup-result'),

      // Swap Request Modal Elements (Task 26)
      modalSwap: document.getElementById('modal-student-swap'),
      formSwap: document.getElementById('form-swap-request'),
      btnCloseSwap: document.getElementById('btn-close-swap-modal'),
      btnCancelSwap: document.getElementById('btn-cancel-swap-modal'),
      inputSwapType: document.getElementById('input-swap-type'),
      typeOptSwap: document.getElementById('type-opt-swap'),
      typeOptCover: document.getElementById('type-opt-cover'),
      selectMyShift: document.getElementById('select-my-shift'),
      selectTargetStudent: document.getElementById('select-target-student'),
      inputSwapReason: document.getElementById('input-swap-reason'),
      swapTargetHint: document.getElementById('swap-target-hint'),
      inputSwapSenderMssv: document.getElementById('input-swap-sender-mssv'),
      btnSwapLoadShifts: document.getElementById('btn-swap-load-shifts'),
      swapSenderStatusMsg: document.getElementById('swap-sender-status-msg'),
      swapSenderRoleBadge: document.getElementById('swap-sender-role-badge'),
      swapMyHistorySection: document.getElementById('swap-my-history-section'),
      swapMyHistoryList: document.getElementById('swap-my-history-list'),

      // Sections & Visibility Containers
      sectionRegistration: document.getElementById('section-student-registration'),
      sectionLookup: document.getElementById('section-student-lookup'),
      sectionTimetable: document.getElementById('section-student-timetable'),
      schedulePendingNotice: document.getElementById('student-schedule-pending-notice'),
      swapCallout: document.getElementById('section-student-swap-callout') || document.querySelector('.swap-action-callout'),

      // Toast Container
      toastContainer: document.getElementById('toast-container')
    };
  }

  /**
   * Đảm bảo danh sách 30 CTV HCM-UTE luôn được nạp sẵn vào LocalStorage
   * và tự động đồng bộ lên Đám Mây (Cloud Sync) cho mọi máy tính.
   */
  function ensureOfficialStudentsLoaded() {
    let students = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) students = JSON.parse(raw);
    } catch (e) {
      students = [];
    }

    if (Array.isArray(students) && students.length > 0) {
      // Đã có dữ liệu trong hệ thống -> GIỮ NGUYÊN 100%, TUYỆT ĐỐI KHÔNG GHI ĐÈ!
      return students;
    }

    // Chỉ khi hoàn toàn chưa có sinh viên nào trong máy mới nạp mẫu ban đầu
    const sample = (window.SAMPLE_HCM_UTE_STUDENTS && window.SAMPLE_HCM_UTE_STUDENTS.length > 0)
      ? window.SAMPLE_HCM_UTE_STUDENTS
      : ((window.SampleDataManager && typeof window.SampleDataManager.getSample30Students === 'function')
        ? window.SampleDataManager.getSample30Students()
        : []);

    if (sample && sample.length > 0) {
      students = JSON.parse(JSON.stringify(sample));
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
        if (window.CloudSyncManager) {
          if (typeof window.CloudSyncManager.pushToCloud === 'function') {
            window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Push error:', err));
          } else if (typeof window.CloudSyncManager.triggerAutoPush === 'function') {
            window.CloudSyncManager.triggerAutoPush();
          }
        }
      } catch (err) {}
    }
    return students;
  }

  function updateIdentityCardShiftsSummary() {
    const cardShifts = document.getElementById('card-student-shifts-summary');
    if (!cardShifts) return;
    const c1 = (monthlyAvailableShifts[1] || []).length;
    const c2 = (monthlyAvailableShifts[2] || []).length;
    const c3 = (monthlyAvailableShifts[3] || []).length;
    const c4 = (monthlyAvailableShifts[4] || []).length;
    const total = c1 + c2 + c3 + c4;
    cardShifts.textContent = `${total} ca đã chọn (T1: ${c1} • T2: ${c2} • T3: ${c3} • T4: ${c4})`;
  }

  /**
   * Cập nhật trạng thái Khóa / Mở Khóa Ma Trận khi nhập MSSV
   */
  function updateMatrixGateState() {
    handleMssvAutoDetect();
  }

  /**
   * Đồng bộ mọi nhãn ngày tháng trên giao diện theo tháng đang áp dụng.
   * Loại bỏ hoàn toàn việc hiển thị tháng tĩnh viết cứng trong index.html.
   */
  function syncMonthLabelsUI() {
    const curM = getActiveMonth();
    const prevM = getPrevActiveMonth();
    const curLabel = formatMonthLabel(curM.month, curM.year);
    const prevLabel = formatMonthLabel(prevM.month, prevM.year);
    const weeks = getCurrentMonthWeeksConfig();

    // Tiêu đề card đăng ký ca rảnh
    if (elements.regTitleMonth) {
      elements.regTitleMonth.textContent = `📝 Đăng Ký Ca Rảnh Trọn Tháng (${curLabel})`;
    }
    if (elements.regMatrixMonthLabel) {
      elements.regMatrixMonthLabel.textContent = `Ca trực ${curLabel}`;
    }

    // Tab chuyển tháng xem lịch chung
    if (elements.btnMonthCurrent) {
      elements.btnMonthCurrent.textContent = `📅 ${curLabel} (Hiện tại)`;
    }
    if (elements.btnMonthPrev) {
      elements.btnMonthPrev.textContent = `⏮️ ${prevLabel} (Tháng trước)`;
    }

    // Ngày trên từng tab tuần + ngày trên từng cột ma trận
    weeks.forEach((w, idx) => {
      const tabDates = document.querySelector(`#reg-week-tabs .month-week-tab[data-week="${w.weekNumber}"] .tab-week-dates`);
      if (tabDates) tabDates.textContent = w.dateRange;
      if (idx === 0 && elements.currentWeekLabel) {
        elements.currentWeekLabel.innerHTML = `📍 Đang chọn ca cho: <strong>${escapeHtml(w.name)} (${escapeHtml(w.fullRange)})</strong>`;
      }
    });
  }

  function initStudentPortal() {
    cacheDOMElements();
    ensureOfficialStudentsLoaded();
    initThemeToggle();
    evaluateRegistrationWindow();
    syncMonthLabelsUI();
    bindEvents();
    switchRegWeek(1);
    updateSelectedCount();
    updateMatrixGateState();
    renderCommonSchedule();

    // Cập nhật trạng thái đếm ngược thời gian mở cổng mỗi 30 giây
    setInterval(evaluateRegistrationWindow, 30000);

    // Đồng bộ chéo tab: khi Admin (tab khác) cập nhật dữ liệu
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key === STORAGE_KEYS.SCHEDULE
        || e.key === STORAGE_KEYS.TWO_WEEK_SCHEDULE
        || e.key === STORAGE_KEYS.MONTH_SCHEDULE
        || e.key === STORAGE_KEYS.ALL_MONTHS
        || e.key === STORAGE_KEYS.ACTIVE_MONTH
        || e.key === STORAGE_KEYS.STUDENTS) {
        syncMonthLabelsUI();
        renderCommonSchedule();
        if (currentLookupStudent) {
          handleLookupMySchedule();
        }
        showToast('Lịch trực vừa được Admin cập nhật thời gian thực!', 'info');
      } else if (e.key === STORAGE_KEYS.REG_CONFIG) {
        evaluateRegistrationWindow();
        showToast('Admin vừa thay đổi thời gian mở cổng đăng ký!', 'info');
      }
    });

    // Cloud Sync kéo dữ liệu mới về: bắt buộc cập nhật giao diện nếu có thay đổi.
    // (Sự kiện storage thuần không mang .key nên không dùng được cho nhánh này.)
    window.addEventListener('ts:data-changed', (e) => {
      const keys = (e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
      const touched = (key) => !keys.length || keys.includes(key);
      if (touched(STORAGE_KEYS.ACTIVE_MONTH) || touched(STORAGE_KEYS.MONTH_SCHEDULE)
        || touched(STORAGE_KEYS.ALL_MONTHS) || touched(STORAGE_KEYS.SCHEDULE)
        || touched(STORAGE_KEYS.TWO_WEEK_SCHEDULE) || touched(STORAGE_KEYS.STUDENTS)) {
        syncMonthLabelsUI();
        switchRegWeek(currentRegWeek);
        renderCommonSchedule();
        if (currentLookupStudent) handleLookupMySchedule();
      }
      if (touched(STORAGE_KEYS.REG_CONFIG)) evaluateRegistrationWindow();
      if (touched(STORAGE_KEYS.SWAP_REQUESTS) && elements.swapModal?.classList.contains('active')) {
        openSwapModal(null, null, currentLookupStudent?.studentId || null);
      }
    });

    // Cảnh báo đầy dung lượng lưu trữ
    window.addEventListener('ts:storage-full', (e) => {
      const msg = (e.detail && e.detail.message) || 'Bộ nhớ trình duyệt đã đầy!';
      showToast('⚠️ ' + msg, 'error', 8000);
    });
  }

  function bindEvents() {
    // Thanh chuyển Tab tuần (Tuần 1 - Tuần 4 & Xem Cả Tháng)
    elements.regWeekTabs?.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetWeek = tab.getAttribute('data-week');
        switchRegWeek(targetWeek === 'all' ? 'all' : (parseInt(targetWeek, 10) || 1));
      });

      // Điều hướng bằng bàn phím theo chuẩn ARIA Tabs (WAI-ARIA APG):
      // ←/→ chuyển tab liền kề, Home/End về đầu/cuối. Trước đây hoàn toàn
      // không có, nên người dùng bàn phím chỉ có thể chuyển tab bằng Tab+Enter
      // và không có manh mốc trực quan nào rằng đây là nhóm chọn một.
      tab.addEventListener('keydown', (e) => {
        const tabs = Array.from(elements.regWeekTabs || []);
        const idx = tabs.indexOf(tab);
        if (idx < 0 || tabs.length === 0) return;

        let nextIdx = -1;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown':  nextIdx = (idx + 1) % tabs.length; break;
          case 'ArrowLeft':
          case 'ArrowUp':    nextIdx = (idx - 1 + tabs.length) % tabs.length; break;
          case 'Home':       nextIdx = 0; break;
          case 'End':        nextIdx = tabs.length - 1; break;
          default: return;
        }

        e.preventDefault();
        const target = tabs[nextIdx];
        // Roving tabindex: tab mới chọn phải nhận tiêu điểm.
        target.focus();
        const targetWeek = target.getAttribute('data-week');
        switchRegWeek(targetWeek === 'all' ? 'all' : (parseInt(targetWeek, 10) || 1));
      });
    });

    // Checkbox Ma Trận Ca Rảnh
    elements.matrixCheckboxes?.forEach(cb => {
      cb.addEventListener('change', () => {
        handleShiftCheckboxToggle(cb);
      });
    });

    elements.slotToggles?.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const cb = toggle.querySelector('.slot-checkbox');
        if (!cb) return;
        if (e.target !== cb) {
          e.preventDefault();
          cb.checked = !cb.checked;
          handleShiftCheckboxToggle(cb);
        }
      });
    });

    // Quick selection buttons
    // Áp dụng tuần này cho các tuần còn lại
    elements.btnQuickCopyAll?.addEventListener('click', (e) => {
      e.preventDefault();
      handleQuickCopyCurrentWeekToMonth();
    });

    // Tất cả ca Sáng cả tháng
    elements.btnQuickMorning?.addEventListener('click', (e) => {
      e.preventDefault();
      handleQuickMorningAllMonth();
    });

    // Tất cả ca Chiều cả tháng
    elements.btnQuickAfternoon?.addEventListener('click', (e) => {
      e.preventDefault();
      handleQuickAfternoonAllMonth();
    });

    // Chọn Cả Tuần (10 ca)
    elements.btnQuickAll?.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentRegWeek >= 1 && currentRegWeek <= 4) {
        elements.matrixCheckboxes?.forEach(cb => {
          cb.checked = true;
          updateCheckboxVisual(cb);
        });
        monthlyAvailableShifts[currentRegWeek] = getSelectedShiftsFromDOM();
        updateSelectedCount();
        showToast(`Đã chọn toàn bộ 10 ca cho Tuần ${currentRegWeek}!`, 'info');
      }
    });

    // Xóa hết ca rảnh cả tháng
    elements.btnQuickClear?.addEventListener('click', (e) => {
      e.preventDefault();
      handleQuickClearAllMonth();
    });

    // Tự động nhận diện MSSV khi sinh viên gõ hoặc blur
    elements.inputStudentId?.addEventListener('input', () => {
      updateMatrixGateState();
      handleMssvAutoDetect();
    });
    elements.inputStudentId?.addEventListener('blur', () => {
      updateMatrixGateState();
      handleMssvAutoDetect();
    });

    // Nút Xóa Ca Tuần Này (Task 3)
    elements.btnClearCurrentWeek?.addEventListener('click', (e) => {
      e.preventDefault();
      clearCurrentWeekShifts();
    });

    // Nút Xóa Toàn Bộ Ca Cả Tháng (Task 3)
    elements.btnClearAllShifts?.addEventListener('click', (e) => {
      e.preventDefault();
      clearAllMonthlyShifts();
    });

    // Chuyển Đổi Tháng Xem Lịch: Tháng 10/2026 (Hiện tại) vs Tháng 09/2026 (Tháng trước) (Task 4)
    elements.btnMonthCurrent?.addEventListener('click', () => {
      selectedMonth = 'current';
      updateMonthSwitcherUI();
      renderCommonSchedule();
    });

    elements.btnMonthPrev?.addEventListener('click', () => {
      selectedMonth = 'prev';
      updateMonthSwitcherUI();
      renderCommonSchedule();
    });

    // Gửi Form Đăng Ký (Hỗ trợ cả 2 nút Submit trên màn hình)
    elements.regForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      processStudentRegistration();
    });

    elements.btnSubmit?.addEventListener('click', (e) => {
      e.preventDefault();
      processStudentRegistration();
    });

    // Bộ chọn Tuần 1 -> Tuần 4 (Lịch 1 Tháng)
    document.querySelectorAll('#student-week-selector .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.getAttribute('data-week'), 10) || 1;
        viewWeek = w;
        document.querySelectorAll('#student-week-selector .filter-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.getAttribute('data-week'), 10) === w);
        });
        renderCommonSchedule();
      });
    });

    // Tra cứu ca trực cá nhân
    elements.btnLookup?.addEventListener('click', handleLookupMySchedule);
    elements.inputLookupMssv?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLookupMySchedule();
      }
    });

    // Sự kiện Modal Đề Xuất Đổi Ca (Task 26)
    elements.btnCloseSwap?.addEventListener('click', closeSwapModal);
    elements.btnCancelSwap?.addEventListener('click', closeSwapModal);
    elements.modalSwap?.addEventListener('click', (e) => {
      if (e.target === elements.modalSwap) closeSwapModal();
    });

    elements.typeOptSwap?.addEventListener('click', () => setSwapType('swap'));
    elements.typeOptCover?.addEventListener('click', () => setSwapType('cover'));

    elements.formSwap?.addEventListener('submit', handleSwapFormSubmit);

    // Tải ca trực của người gửi đề xuất đổi ca
    elements.btnSwapLoadShifts?.addEventListener('click', () => {
      const mssv = elements.inputSwapSenderMssv ? elements.inputSwapSenderMssv.value.trim() : '';
      if (!mssv) {
        showToast('Vui lòng nhập MSSV của bạn trước khi bấm tải ca!', 'warning');
        elements.inputSwapSenderMssv?.focus();
        return;
      }
      loadStudentShiftsForSwap(mssv);
    });

    elements.inputSwapSenderMssv?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const mssv = elements.inputSwapSenderMssv ? elements.inputSwapSenderMssv.value.trim() : '';
        if (mssv) loadStudentShiftsForSwap(mssv);
      }
    });

    // Hỗ trợ phím tắt Escape để đóng nhanh modal Đổi ca (Task 3)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (elements.modalSwap && (elements.modalSwap.classList.contains('active') || elements.modalSwap.style.display === 'flex' || elements.modalSwap.style.display === 'block')) {
          closeSwapModal();
        }
      }
    });
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

  /**
   * Đánh giá trạng thái Cổng Đăng Ký dựa trên cấu hình Admin
   */
  function evaluateRegistrationWindow() {
    let cfg = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REG_CONFIG);
      if (raw) cfg = JSON.parse(raw);
    } catch (err) {
      console.error(err);
    }

    if (!cfg) {
      cfg = { mode: 'always_open', startTime: '', endTime: '', closedNotice: '' };
    }
    regConfig = cfg;

    const mode = cfg.mode || 'always_open';
    const now = Date.now();
    const start = cfg.startTime ? new Date(cfg.startTime).getTime() : 0;
    const end = cfg.endTime ? new Date(cfg.endTime).getTime() : 0;

    let open = true;
    let title = 'Cổng Đăng Ký Ca Trực Đang Mở';
    let desc = 'Sinh viên vui lòng chọn các ca rảnh trong tuần và nhấn Gửi Đăng Ký.';
    let icon = '🟢';
    let bannerClass = 'open';
    let showCountdown = false;
    let countdownText = '';

    if (mode === 'always_open') {
      open = true;
      icon = '🟢';
      title = 'Cổng Đăng Ký Ca Trực Đang Mở (Tự Do)';
      desc = 'Hệ thống đang mở nhận đăng ký ca rảnh từ Thứ 2 đến Thứ 6. Bạn có thể đăng ký hoặc cập nhật bất kỳ lúc nào.';
      bannerClass = 'open';
    } else if (mode === 'closed') {
      open = false;
      icon = '🔒';
      title = 'Cổng Đăng Ký Ca Trực Hiện Đang Đóng';
      desc = cfg.closedNotice || 'Cổng đăng ký tạm khóa để ban điều hành chốt danh sách xếp lịch.';
      bannerClass = 'closed';
    } else if (mode === 'time_window') {
      if (start && now < start) {
        open = false;
        icon = '⏳';
        title = 'Cổng Đăng Ký Chưa Đến Giờ Mở';
        desc = `Thời gian mở đăng ký bắt đầu từ: <strong>${formatVNDateTime(cfg.startTime)}</strong>. Bạn vẫn có thể xem lịch phân công bên dưới.`;
        bannerClass = 'scheduled';
      } else if (end && now > end) {
        open = false;
        icon = '🔒';
        title = 'Cổng Đăng Ký Đã Hết Hạn';
        desc = cfg.closedNotice || `Thời hạn đăng ký đã kết thúc lúc ${formatVNDateTime(cfg.endTime)}. Ban điều hành đã khóa tiếp nhận ca mới.`;
        bannerClass = 'closed';
      } else {
        open = true;
        icon = '🟢';
        title = 'Cổng Đăng Ký Ca Trực Đang Mở';
        desc = `Thời hạn nhận đăng ký đến <strong>${formatVNDateTime(cfg.endTime)}</strong>. Hãy nhanh chóng chọn ca rảnh của bạn!`;
        bannerClass = 'open';
        showCountdown = true;
        countdownText = getRemainingText(cfg.endTime);
      }
    }

    isRegOpen = open;

    // Cập nhật giao diện Banner Trạng Thái
    if (elements.regStatusBanner) {
      elements.regStatusBanner.className = `reg-status-banner ${bannerClass}`;
    }
    if (elements.regStatusIcon) elements.regStatusIcon.textContent = icon;
    if (elements.regStatusTitle) elements.regStatusTitle.innerHTML = title;
    if (elements.regStatusDesc) elements.regStatusDesc.innerHTML = desc;

    if (elements.regCountdown) {
      if (showCountdown && countdownText) {
        elements.regCountdown.style.display = 'inline-flex';
        if (elements.regCountdownTime) elements.regCountdownTime.textContent = countdownText;
      } else {
        elements.regCountdown.style.display = 'none';
      }
    }

    // Khóa hoặc Mở ma trận chọn ca rảnh
    if (elements.shiftMatrixContainer) {
      if (open) {
        elements.shiftMatrixContainer.classList.remove('matrix-container-locked');
      } else {
        elements.shiftMatrixContainer.classList.add('matrix-container-locked');
      }
    }

    if (elements.matrixLockedNotice) {
      elements.matrixLockedNotice.style.display = open ? 'none' : 'flex';
    }

    if (elements.matrixQuickToolbar) {
      elements.matrixQuickToolbar.style.opacity = open ? '1' : '0.5';
      elements.matrixQuickToolbar.style.pointerEvents = open ? 'auto' : 'none';
    }

    // Cập nhật nhãn nút Submit nếu cổng đóng
    updateSubmitButtonState();

    // Cập nhật ẩn/hiện các phân hệ theo trạng thái cổng và quyền Admin
    updatePortalViewVisibility();
  }

  /**
   * Điều chỉnh hiển thị các phân hệ trên Cổng Sinh Viên theo yêu cầu:
   * 1. Nếu cổng ĐÃ KHÓA: Khóa toàn bộ và ẩn form đăng ký, chỉ để lại ca trực tuần và tìm kiếm ca trực bằng MSSV.
   * 2. Nếu cổng CÒN MỞ: Form đăng ký hiển thị, ẩn lịch trực đi (chỉ hiển thị khi Admin cho phép / công bố).
   * 3. Chức năng Đổi ca trực: Luôn giữ nguyên ở mọi trạng thái.
   */
  function updatePortalViewVisibility() {
    const isSchedulePublished = regConfig?.publishSchedule === true;

    if (!isRegOpen) {
      // 1. CỔNG ĐÃ KHÓA:
      // Khóa toàn bộ và ẩn form đăng ký
      if (elements.sectionRegistration) {
        elements.sectionRegistration.style.display = 'none';
      }
      // Chỉ để lại ca trực tuần và tìm kiếm ca trực bằng MSSV
      if (elements.sectionTimetable) {
        elements.sectionTimetable.style.display = 'block';
      }
      if (elements.sectionLookup) {
        elements.sectionLookup.style.display = 'block';
      }
      if (elements.schedulePendingNotice) {
        elements.schedulePendingNotice.style.display = 'none';
      }
    } else {
      // 2. CỔNG CÒN MỞ ĐĂNG KÝ:
      // Form đăng ký hiển thị để sinh viên điền thông tin và chọn ca rảnh
      if (elements.sectionRegistration) {
        elements.sectionRegistration.style.display = 'block';
      }

      // Ẩn lịch trực đi, bao giờ bên admin cho hiển thị thì mới được hiển thị
      if (isSchedulePublished) {
        if (elements.sectionTimetable) elements.sectionTimetable.style.display = 'block';
        if (elements.sectionLookup) elements.sectionLookup.style.display = 'block';
        if (elements.schedulePendingNotice) elements.schedulePendingNotice.style.display = 'none';
      } else {
        if (elements.sectionTimetable) elements.sectionTimetable.style.display = 'none';
        if (elements.sectionLookup) elements.sectionLookup.style.display = 'none';
        if (elements.schedulePendingNotice) elements.schedulePendingNotice.style.display = 'block';
      }
    }

    // 3. ĐỔI CA TRỰC THÌ GIỮ NGUYÊN (luôn hiển thị)
    if (elements.swapCallout) {
      elements.swapCallout.style.display = 'flex';
    }
  }

  function updateSubmitButtonState() {
    if (!elements.btnSubmit) return;

    if (!isRegOpen) {
      elements.btnSubmit.disabled = true;
      elements.btnSubmit.style.opacity = '0.6';
      elements.btnSubmit.style.cursor = 'not-allowed';
      elements.btnSubmit.innerHTML = '<span>🔒 Cổng Đăng Ký Đang Đóng</span>';
    } else {
      elements.btnSubmit.disabled = false;
      elements.btnSubmit.style.opacity = '1';
      elements.btnSubmit.style.cursor = 'pointer';

      elements.btnSubmit.innerHTML = detectedStudent
        ? '<span>🔄 Cập Nhật Ca Trực & Thông Tin</span>'
        : '<span>Gửi Đăng Ký Ca Trực</span>';
    }
  }

  /**
   * Tự động nhận diện MSSV: kiểm tra xem đã từng đăng ký ca rảnh trước đó chưa
   */
  function handleMssvAutoDetect() {
    const rawInput = elements.inputStudentId ? elements.inputStudentId.value.trim() : '';

    const identityCard = document.getElementById('student-identity-card');
    const invalidNotice = document.getElementById('student-invalid-mssv-notice');
    const cardName = document.getElementById('card-student-name');
    const cardMssv = document.getElementById('card-student-mssv');
    const cardMajor = document.getElementById('card-student-major');

    // Khi ô nhập trống hoặc chỉ có 1-2 ký tự: Khóa ma trận và hiển thị hướng dẫn
    if (!rawInput || rawInput.length < 2) {
      clearDetectedStudentState(true);
      if (identityCard) identityCard.style.display = 'none';
      if (invalidNotice) invalidNotice.style.display = 'none';
      if (elements.matrixGateNotice) {
        elements.matrixGateNotice.style.display = 'flex';
        elements.matrixGateNotice.innerHTML = '<span>🔒 Vui lòng nhập Mã Số Sinh Viên (MSSV) của bạn ở trên để bắt đầu chọn ca rảnh.</span>';
      }
      if (elements.studentMatrixArea) {
        elements.studentMatrixArea.classList.add('matrix-locked-state');
      }
      if (elements.inputStudentId) {
        elements.inputStudentId.style.borderColor = '';
        elements.inputStudentId.style.boxShadow = '';
      }
      return;
    }

    // Luôn lấy từ danh sách 30 CTV HCM-UTE đã nạp sẵn
    const students = ensureOfficialStudentsLoaded();
    const matched = students.find(s => s.studentId && s.studentId.toLowerCase() === rawInput.toLowerCase());

    if (matched) {
      // 1. NHẬP ĐÚNG MSSV TRONG DANH SÁCH 30 CTV
      detectedStudent = matched;

      // Ẩn cảnh báo lỗi, ẩn matrix-gate-notice, mở khóa bảng ca rảnh
      if (invalidNotice) invalidNotice.style.display = 'none';
      if (elements.matrixGateNotice) elements.matrixGateNotice.style.display = 'none';
      if (elements.studentMatrixArea) elements.studentMatrixArea.classList.remove('matrix-locked-state');

      // Viền xanh input nhận diện thành công
      if (elements.inputStudentId) {
        elements.inputStudentId.style.borderColor = '#10b981';
        elements.inputStudentId.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
      }

      // Nạp dữ liệu ca rảnh của sinh viên
      populateStudentData(matched);

      // Hiển thị Thẻ Định Danh Sinh Viên (Họ và tên, MSSV, Ca trực của tháng)
      if (identityCard) {
        identityCard.style.display = 'block';
        if (cardName) cardName.textContent = matched.fullName || ('Sinh viên ' + matched.studentId);
        if (cardMssv) cardMssv.textContent = matched.studentId;
        if (cardMajor) {
          const detail = [matched.faculty, matched.major].filter(Boolean).join(' - ');
          cardMajor.textContent = detail ? `• ${detail}` : '';
        }
      }
      updateIdentityCardShiftsSummary();
      updateSubmitButtonState();
    } else {
      // 2. NHẬP SAI MSSV (Không có trong danh sách 30 CTV đã nạp sẵn)
      detectedStudent = null;
      if (identityCard) identityCard.style.display = 'none';

      // Khóa bảng chọn ca rảnh
      if (elements.studentMatrixArea) {
        elements.studentMatrixArea.classList.add('matrix-locked-state');
      }

      // Khi sinh viên đã gõ từ 6 ký tự trở lên -> Báo lỗi rõ ràng
      if (rawInput.length >= 6) {
        if (invalidNotice) invalidNotice.style.display = 'block';
        if (elements.matrixGateNotice) {
          elements.matrixGateNotice.style.display = 'flex';
          elements.matrixGateNotice.innerHTML = '<span>⚠️ <strong>Mã số sinh viên không tồn tại:</strong> Vui lòng kiểm tra lại MSSV trong danh sách Ban Tư Vấn Tuyển Sinh HCM-UTE!</span>';
        }
        if (elements.inputStudentId) {
          elements.inputStudentId.style.borderColor = '#ef4444';
          elements.inputStudentId.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.15)';
        }
      } else {
        if (invalidNotice) invalidNotice.style.display = 'none';
        if (elements.matrixGateNotice) {
          elements.matrixGateNotice.style.display = 'flex';
          elements.matrixGateNotice.innerHTML = '<span>🔒 Đang nhập MSSV… Bảng chọn ca sẽ mở khóa khi nhập đúng MSSV của bạn.</span>';
        }
        if (elements.inputStudentId) {
          elements.inputStudentId.style.borderColor = '';
          elements.inputStudentId.style.boxShadow = '';
        }
      }

      monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
      syncCheckboxesWithActiveWeek();
      updateSelectedCount();
      updateSubmitButtonState();
    }
  }

  function populateStudentData(student) {
    if (elements.inputFullName && student.fullName) {
      elements.inputFullName.value = student.fullName;
    }

    if (elements.inputPhone && student.phone) {
      elements.inputPhone.value = student.phone;
    }

    // Nạp lại ca rảnh theo từng tuần (monthlyAvailableShifts)
    if (student.monthlyAvailableShifts && typeof student.monthlyAvailableShifts === 'object') {
      monthlyAvailableShifts = {
        1: Array.isArray(student.monthlyAvailableShifts[1]) ? [...student.monthlyAvailableShifts[1]] : [],
        2: Array.isArray(student.monthlyAvailableShifts[2]) ? [...student.monthlyAvailableShifts[2]] : [],
        3: Array.isArray(student.monthlyAvailableShifts[3]) ? [...student.monthlyAvailableShifts[3]] : [],
        4: Array.isArray(student.monthlyAvailableShifts[4]) ? [...student.monthlyAvailableShifts[4]] : []
      };
    } else if (Array.isArray(student.availableShifts) && student.availableShifts.length > 0) {
      // Tương thích ngược: Điền đều cho cả 4 tuần
      monthlyAvailableShifts = {
        1: [...student.availableShifts],
        2: [...student.availableShifts],
        3: [...student.availableShifts],
        4: [...student.availableShifts]
      };
    } else {
      monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
    }

    syncCheckboxesWithActiveWeek();
    updateSelectedCount();

    if (elements.mssvLiveTag) {
      elements.mssvLiveTag.style.display = 'none';
    }

    if (elements.inputStudentId) {
      elements.inputStudentId.style.borderColor = '';
      elements.inputStudentId.style.backgroundColor = '';
    }
  }

  function clearDetectedStudentState(resetInputs = false) {
    detectedStudent = null;
    const identityCard = document.getElementById('student-identity-card');
    const invalidNotice = document.getElementById('student-invalid-mssv-notice');
    if (identityCard) identityCard.style.display = 'none';
    if (invalidNotice) invalidNotice.style.display = 'none';

    if (elements.mssvLiveTag) {
      elements.mssvLiveTag.style.display = 'none';
    }
    if (elements.inputStudentId) {
      elements.inputStudentId.style.borderColor = '';
      elements.inputStudentId.style.backgroundColor = '';
      elements.inputStudentId.style.boxShadow = '';
    }
    elements.matrixCheckboxes?.forEach(cb => {
      const parent = cb.closest('.slot-toggle');
      if (parent) parent.classList.remove('pre-checked');
    });
    if (resetInputs) {
      monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
      syncCheckboxesWithActiveWeek();
      updateSelectedCount();
    }
    updateSubmitButtonState();
  }

  function clearStudentForm() {
    if (elements.inputFullName) elements.inputFullName.value = '';
    if (elements.inputStudentId) elements.inputStudentId.value = '';
    if (elements.inputPhone) elements.inputPhone.value = '';

    monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
    switchRegWeek(1);
    updateSelectedCount();
    clearDetectedStudentState(true);
    updateMatrixGateState();
  }

  /**
   * Xóa các ca rảnh đã chọn của tuần hiện tại (Task 3)
   */
  function clearCurrentWeekShifts() {
    if (currentRegWeek >= 1 && currentRegWeek <= 4) {
      monthlyAvailableShifts[currentRegWeek] = [];
      syncCheckboxesWithActiveWeek();
      updateSelectedCount();
      showToast(`Đã xóa sạch ca rảnh của Tuần ${currentRegWeek}.`, 'info');
    } else if (currentRegWeek === 'all') {
      showToast('Vui lòng chọn một tuần cụ thể (Tuần 1 - Tuần 4) để xóa ca tuần đó.', 'warning');
    }
  }

  /**
   * Xóa toàn bộ ca rảnh cả tháng về 0 ca (Task 3)
   */
  function clearAllMonthlyShifts() {
    const confirmed = confirm('Bạn có chắc muốn xóa sạch toàn bộ ca rảnh trong tháng này (về 0 ca)?');
    if (!confirmed) return;

    monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
    syncCheckboxesWithActiveWeek();
    updateSelectedCount();
    if (currentRegWeek === 'all') {
      renderMonthOverview();
    }

    const studentId = elements.inputStudentId ? elements.inputStudentId.value.trim() : '';
    if (studentId) {
      let students = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        if (raw) students = JSON.parse(raw);
      } catch (err) {
        students = [];
      }

      const existingIndex = students.findIndex(s => s.studentId && s.studentId.toLowerCase() === studentId.toLowerCase());
      if (existingIndex !== -1) {
        students[existingIndex] = {
          ...students[existingIndex],
          monthlyAvailableShifts: { 1: [], 2: [], 3: [], 4: [] },
          availableShifts: [],
          updatedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
        if (window.CloudSyncManager) {
          if (typeof window.CloudSyncManager.pushToCloud === 'function') {
            window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Push error:', err));
          } else if (typeof window.CloudSyncManager.triggerAutoPush === 'function') {
            window.CloudSyncManager.triggerAutoPush();
          }
        }
        handleMssvAutoDetect();
      }
    }

    showToast('🗑️ Đã xóa sạch toàn bộ ca rảnh trong tháng (về 0 ca)!', 'success');
  }

  /**
   * Cập nhật giao diện nút chọn tháng (Task 4)
   */
  function updateMonthSwitcherUI() {
    if (elements.btnMonthCurrent) elements.btnMonthCurrent.classList.toggle('active', selectedMonth === 'current');
    if (elements.btnMonthPrev) elements.btnMonthPrev.classList.toggle('active', selectedMonth === 'prev');
  }

  function handleShiftCheckboxToggle(cb) {
    if (currentRegWeek >= 1 && currentRegWeek <= 4) {
      const activeList = new Set(monthlyAvailableShifts[currentRegWeek] || []);
      if (cb.checked) {
        activeList.add(cb.value);
      } else {
        activeList.delete(cb.value);
      }
      monthlyAvailableShifts[currentRegWeek] = Array.from(activeList);
    }
    updateCheckboxVisual(cb);
    updateSelectedCount();
  }

  function handleQuickCopyCurrentWeekToMonth() {
    const srcWeek = (currentRegWeek >= 1 && currentRegWeek <= 4) ? currentRegWeek : 1;
    const currentWeekShifts = [...(monthlyAvailableShifts[srcWeek] || [])];
    
    if (currentWeekShifts.length === 0) {
      showToast(`Tuần ${srcWeek} hiện chưa chọn ca nào để sao chép. Vui lòng chọn ít nhất 1 ca trước!`, 'warning');
      return;
    }

    for (let w = 1; w <= 4; w++) {
      monthlyAvailableShifts[w] = [...currentWeekShifts];
    }

    syncCheckboxesWithActiveWeek();
    updateSelectedCount();
    if (currentRegWeek === 'all') {
      renderMonthOverview();
    }
    showToast(`⚡ Đã áp dụng ${currentWeekShifts.length} ca rảnh của Tuần ${srcWeek} cho tất cả các tuần còn lại trong tháng!`, 'success');
  }

  function handleQuickMorningAllMonth() {
    const morningShifts = ['T2_S', 'T3_S', 'T4_S', 'T5_S', 'T6_S'];
    for (let w = 1; w <= 4; w++) {
      const set = new Set(monthlyAvailableShifts[w] || []);
      morningShifts.forEach(s => set.add(s));
      monthlyAvailableShifts[w] = Array.from(set);
    }
    syncCheckboxesWithActiveWeek();
    updateSelectedCount();
    if (currentRegWeek === 'all') {
      renderMonthOverview();
    }
    showToast('☀️ Đã chọn tất cả ca Sáng (Thứ 2 - Thứ 6) cho cả 4 tuần trong tháng!', 'info');
  }

  function handleQuickAfternoonAllMonth() {
    const afternoonShifts = ['T2_C', 'T3_C', 'T4_C', 'T5_C', 'T6_C'];
    for (let w = 1; w <= 4; w++) {
      const set = new Set(monthlyAvailableShifts[w] || []);
      afternoonShifts.forEach(s => set.add(s));
      monthlyAvailableShifts[w] = Array.from(set);
    }
    syncCheckboxesWithActiveWeek();
    updateSelectedCount();
    if (currentRegWeek === 'all') {
      renderMonthOverview();
    }
    showToast('⛅ Đã chọn tất cả ca Chiều (Thứ 2 - Thứ 6) cho cả 4 tuần trong tháng!', 'info');
  }

  function handleQuickClearAllMonth() {
    monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
    syncCheckboxesWithActiveWeek();
    updateSelectedCount();
    if (currentRegWeek === 'all') {
      renderMonthOverview();
    }
    showToast('🔄 Đã xóa toàn bộ ca rảnh trong tháng.', 'info');
  }

  function switchRegWeek(week) {
    currentRegWeek = week;

    // Cập nhật trạng thái active trên thanh Tab
    elements.regWeekTabs?.forEach(tab => {
      const wVal = tab.getAttribute('data-week');
      const isActive = (week === 'all' && wVal === 'all') || (String(week) === wVal);
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      // ROVING TABINDEX: trong nhóm tab chỉ tab đang chọn mới nằm trong
      // chuỗi Tab. Trước đây cả 5 tab đều tabindex=0 -> người dùng bàn phím
      // phải bấm Tab qua cả 5 tab mới tới được nội dung.
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
      // aria-labelledby của panel phải trỏ tới tab ĐANG CHỌN, không phải
      // tab tuần 1 cố định.
      const panelId = tab.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel && tab.id) panel.setAttribute('aria-labelledby', tab.id);
    });

    if (week === 'all') {
      // Ẩn bảng tuần, hiển thị bảng tổng quan cả tháng
      if (elements.shiftMatrixContainer) elements.shiftMatrixContainer.style.display = 'none';
      if (elements.monthOverviewContainer) {
        elements.monthOverviewContainer.style.display = 'grid';
        renderMonthOverview();
      }
      if (elements.currentWeekLabel) {
        const cur = getActiveMonth();
        elements.currentWeekLabel.innerHTML = `📊 Đang xem: <strong>Tổng Quan Lịch Rảnh Trọn ${escapeHtml(formatMonthLabel(cur.month, cur.year))} (4 Tuần)</strong>`;
      }
    } else {
      // Hiển thị bảng chọn ca tuần cụ thể
      if (elements.shiftMatrixContainer) elements.shiftMatrixContainer.style.display = 'block';
      if (elements.monthOverviewContainer) elements.monthOverviewContainer.style.display = 'none';

      const weekCfg = getCurrentMonthWeeksConfig()[week - 1];
      if (weekCfg) {
        // Cập nhật nhãn tuần & ngày cụ thể
        if (elements.currentWeekLabel) {
          elements.currentWeekLabel.innerHTML = `📍 Đang chọn ca cho: <strong>${escapeHtml(weekCfg.name)} (${escapeHtml(weekCfg.fullRange)})</strong>`;
        }
        // Cập nhật badge ngày trên tiêu đề từng cột T2 -> T6
        ['T2', 'T3', 'T4', 'T5', 'T6'].forEach(dayKey => {
          const badgeEl = elements.dateBadges ? elements.dateBadges[dayKey] : null;
          if (badgeEl && weekCfg.days[dayKey]) {
            badgeEl.textContent = weekCfg.days[dayKey].dateStr;
          }
          // Cập nhật nhãn trong từng ô ca trực
          const slotTextS = document.getElementById(`slot-text-${dayKey}_S`);
          if (slotTextS && weekCfg.days[dayKey]) {
            slotTextS.textContent = `Sáng (${weekCfg.days[dayKey].dateStr})`;
          }
          const slotTextC = document.getElementById(`slot-text-${dayKey}_C`);
          if (slotTextC && weekCfg.days[dayKey]) {
            slotTextC.textContent = `Chiều (${weekCfg.days[dayKey].dateStr})`;
          }
        });
      }

      syncCheckboxesWithActiveWeek();
    }
  }

  function syncCheckboxesWithActiveWeek() {
    if (currentRegWeek < 1 || currentRegWeek > 4) return;
    const activeList = monthlyAvailableShifts[currentRegWeek] || [];
    elements.matrixCheckboxes?.forEach(cb => {
      const isChecked = activeList.includes(cb.value);
      cb.checked = isChecked;
      updateCheckboxVisual(cb);
    });
  }

  function renderMonthOverview() {
    if (!elements.monthOverviewContainer) return;

    let html = '';
    getCurrentMonthWeeksConfig().forEach(cfg => {
      const wShifts = monthlyAvailableShifts[cfg.weekNumber] || [];
      const count = wShifts.length;

      html += `
        <div class="overview-week-card">
          <div class="overview-week-header">
            <div>
              <div class="overview-week-title">${escapeHtml(cfg.name)}</div>
              <div class="overview-week-badge">📅 ${escapeHtml(cfg.dateRange)}</div>
            </div>
            <span class="overview-week-count">${count} ca</span>
          </div>
          <div class="overview-days-grid">
      `;

      ['T2', 'T3', 'T4', 'T5', 'T6'].forEach(dayKey => {
        const dInfo = cfg.days[dayKey];
        const hasS = wShifts.includes(`${dayKey}_S`);
        const hasC = wShifts.includes(`${dayKey}_C`);

        html += `
          <div class="overview-day-row">
            <div class="overview-day-info">
              <span>${dInfo.name}</span>
              <span class="overview-day-date">(${dInfo.dateStr})</span>
            </div>
            <div class="overview-shifts-status">
              <span class="overview-shift-pill ${hasS ? 'active' : 'inactive'}">
                ${hasS ? '☀️ Sáng' : 'Sáng'}
              </span>
              <span class="overview-shift-pill ${hasC ? 'active' : 'inactive'}">
                ${hasC ? '⛅ Chiều' : 'Chiều'}
              </span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
          <div class="overview-week-action">
            <button type="button" class="btn-overview-edit" onclick="window.studentSwitchToWeek && window.studentSwitchToWeek(${cfg.weekNumber})">
              <span>✏️ Chỉnh sửa ${escapeHtml(cfg.name)}</span>
            </button>
          </div>
        </div>
      `;
    });

    elements.monthOverviewContainer.innerHTML = html;
  }

  /**
   * Chuyển từ chế độ "Xem cả tháng" sang chỉnh sửa một tuần cụ thể.
   * (Nút ✏️ trong bảng tổng quan trước đây gọi hàm này nhưng hàm chưa
   *  tồn tại, khiến nút bấm không có tác dụng gì.)
   * @param {number} week - 1..4
   */
  window.studentSwitchToWeek = (week) => {
    const w = Math.min(Math.max(parseInt(week, 10) || 1, 1), 4);
    switchRegWeek(w);
    if (elements.studentMatrixArea) {
      elements.studentMatrixArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  function updateCheckboxVisual(cb) {
    const parent = cb.closest('.slot-toggle');
    if (parent) {
      if (cb.checked) {
        parent.classList.add('selected');
      } else {
        parent.classList.remove('selected');
      }
    }
  }

  function updateSelectedCount() {
    const c1 = (monthlyAvailableShifts[1] || []).length;
    const c2 = (monthlyAvailableShifts[2] || []).length;
    const c3 = (monthlyAvailableShifts[3] || []).length;
    const c4 = (monthlyAvailableShifts[4] || []).length;
    const total = c1 + c2 + c3 + c4;

    // Update tab badges
    if (elements.badgeWeekCounts) {
      if (elements.badgeWeekCounts[1]) elements.badgeWeekCounts[1].textContent = `${c1} ca`;
      if (elements.badgeWeekCounts[2]) elements.badgeWeekCounts[2].textContent = `${c2} ca`;
      if (elements.badgeWeekCounts[3]) elements.badgeWeekCounts[3].textContent = `${c3} ca`;
      if (elements.badgeWeekCounts[4]) elements.badgeWeekCounts[4].textContent = `${c4} ca`;
      if (elements.badgeWeekCounts.all) elements.badgeWeekCounts.all.textContent = `${total} ca`;
    }

    // Update main counter
    if (elements.selectedCountDisplay) {
      elements.selectedCountDisplay.innerHTML = `
        <span class="counter-total">${total} ca đã chọn / tháng</span>
        <span class="counter-breakdown">T1: ${c1} • T2: ${c2} • T3: ${c3} • T4: ${c4}</span>
      `;
      try {
        elements.selectedCountDisplay.classList.remove('counter-pop');
        void elements.selectedCountDisplay.offsetWidth;
        elements.selectedCountDisplay.classList.add('counter-pop');
      } catch (e) {}
    }

    updateIdentityCardShiftsSummary();
  }

  function getSelectedShiftsFromDOM() {
    const selected = [];
    elements.matrixCheckboxes?.forEach(cb => {
      if (cb.checked) selected.push(cb.value);
    });
    return selected;
  }

  function getSelectedShifts() {
    const union = new Set([
      ...(monthlyAvailableShifts[1] || []),
      ...(monthlyAvailableShifts[2] || []),
      ...(monthlyAvailableShifts[3] || []),
      ...(monthlyAvailableShifts[4] || [])
    ]);
    return Array.from(union);
  }

  /**
   * Xử lý lưu đăng ký sinh viên trọn tháng (Section 9 API Contract)
   * Cho phép đăng ký với 0 ca rảnh (nghỉ tháng này / tuần thi) (Task 3)
   * Tuyệt đối KHÔNG tự ý tạo mới sinh viên khi MSSV không có trong danh sách CTV!
   */
  function processStudentRegistration() {
    if (!isRegOpen) {
      showToast('Cổng đăng ký ca trực hiện đang đóng, không thể gửi thông tin!', 'warning');
      return;
    }

    const studentId = elements.inputStudentId ? elements.inputStudentId.value.trim() : '';

    if (!studentId) {
      showToast('Vui lòng nhập Mã số sinh viên (MSSV)!', 'error');
      elements.inputStudentId?.focus();
      return;
    }

    // Luôn lấy từ danh sách 30 CTV HCM-UTE chuẩn đã nạp sẵn
    let students = ensureOfficialStudentsLoaded();

    const existingIndex = students.findIndex(s => s.studentId && s.studentId.toLowerCase() === studentId.toLowerCase());

    // CHẶN BẬC CAO: Nếu MSSV không có trong danh sách CTV nạp sẵn -> BÁO LỖI VÀ DỪNG LẬP TỨC!
    if (existingIndex === -1) {
      const invalidNotice = document.getElementById('student-invalid-mssv-notice');
      if (invalidNotice) invalidNotice.style.display = 'block';
      showToast('⚠️ Mã số sinh viên không tồn tại trong danh sách Ban Tư Vấn Tuyển Sinh! Không thể thêm mới sinh viên.', 'error');
      if (elements.inputStudentId) {
        elements.inputStudentId.focus();
        elements.inputStudentId.style.borderColor = '#ef4444';
      }
      return; // DỪNG LẬP TỨC - TUYỆT ĐỐI KHÔNG TẠO MỚI HAY TĂNG SỐ LƯỢNG SINH VIÊN!
    }

    const existingStudent = students[existingIndex];

    const c1 = (monthlyAvailableShifts[1] || []).length;
    const c2 = (monthlyAvailableShifts[2] || []).length;
    const c3 = (monthlyAvailableShifts[3] || []).length;
    const c4 = (monthlyAvailableShifts[4] || []).length;
    const totalMonthShifts = c1 + c2 + c3 + c4;

    // Hợp nhất (Union) toàn bộ ca rảnh trong tháng
    const unionShiftsSet = new Set([
      ...(monthlyAvailableShifts[1] || []),
      ...(monthlyAvailableShifts[2] || []),
      ...(monthlyAvailableShifts[3] || []),
      ...(monthlyAvailableShifts[4] || [])
    ]);
    const availableShifts = Array.from(unionShiftsSet);

    // Cập nhật bản ghi sinh viên trong danh sách có sẵn
    students[existingIndex] = {
      ...existingStudent,
      monthlyAvailableShifts: {
        1: [...(monthlyAvailableShifts[1] || [])],
        2: [...(monthlyAvailableShifts[2] || [])],
        3: [...(monthlyAvailableShifts[3] || [])],
        4: [...(monthlyAvailableShifts[4] || [])]
      },
      availableShifts: availableShifts,
      updatedAt: Date.now()
    };

    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    if (window.CloudSyncManager) {
      if (typeof window.CloudSyncManager.pushToCloud === 'function') {
        window.CloudSyncManager.pushToCloud().catch(err => console.warn('[CloudSync] Push error:', err));
      } else if (typeof window.CloudSyncManager.triggerAutoPush === 'function') {
        window.CloudSyncManager.triggerAutoPush();
      }
    }

    if (totalMonthShifts === 0) {
      showSuccessBanner(`Đã cập nhật: Bạn đã đăng ký <strong>0 ca rảnh (nghỉ tháng này)</strong> cho CTV: <strong>${escapeHtml(existingStudent.fullName)}</strong> (MSSV: <strong>${escapeHtml(studentId)}</strong>).`);
      showToast('🎉 Đã ghi nhận đăng ký của bạn: 0 ca rảnh (nghỉ tháng này)!', 'success');
    } else {
      const activeM = getActiveMonth();
      showSuccessBanner(`Cập nhật thành công! Đã lưu <strong>${totalMonthShifts} ca rảnh trong ${escapeHtml(formatMonthLabel(activeM.month, activeM.year))}</strong> (T1: ${c1}, T2: ${c2}, T3: ${c3}, T4: ${c4}) cho CTV: <strong>${escapeHtml(existingStudent.fullName)}</strong> (MSSV: <strong>${escapeHtml(studentId)}</strong>).`);
      showToast(`Đã cập nhật ${totalMonthShifts} ca rảnh của bạn trong tháng thành công!`, 'success');
    }

    handleMssvAutoDetect();

    const isSchedulePublished = regConfig?.publishSchedule === true;
    if (elements.inputLookupMssv && (!isRegOpen || isSchedulePublished)) {
      elements.inputLookupMssv.value = studentId;
      handleLookupMySchedule();
    }
  }

  function showSuccessBanner(message) {
    if (elements.regSuccessAlert && elements.regSuccessText) {
      elements.regSuccessText.innerHTML = message;
      elements.regSuccessAlert.style.display = 'block';
      elements.regSuccessAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * Hiển thị Lịch Trực Chung (Read-Only)
   * Hỗ trợ xem tháng đang áp dụng và tháng liền trước (tự động theo ACTIVE_MONTH)
   */
  function renderCommonSchedule() {
    if (!elements.timetableGrid) return;

    const curMonth = getActiveMonth();
    const prevMonth = getPrevActiveMonth();
    const curLabel = formatMonthLabel(curMonth.month, curMonth.year);
    const prevLabel = formatMonthLabel(prevMonth.month, prevMonth.year);

    let scheduleResult = null;
    try {
      if (selectedMonth === 'prev') {
        const prevSched = getPrevMonthSchedule();
        if (prevSched) {
          const wIdx = Math.min(Math.max(1, viewWeek), 4) - 1;
          scheduleResult = prevSched.weeks?.[wIdx] || (viewWeek === 2 ? prevSched.week2 : prevSched.week1);
        }
      } else {
        const month = readMonthScheduleStore();
        if (month) {
          const wIdx = Math.min(Math.max(1, viewWeek), 4) - 1;
          scheduleResult = month.weeks?.[wIdx] || (viewWeek === 2 ? month.week2 : month.week1);
        } else {
          scheduleResult = readWeekScheduleStore();
        }
      }
    } catch (err) {
      console.error(err);
    }

    const schedule = scheduleResult?.scheduleTable || {};
    const days = [
      { key: 'T2', name: 'Thứ Hai', sub: 'Thứ 2' },
      { key: 'T3', name: 'Thứ Ba', sub: 'Thứ 3' },
      { key: 'T4', name: 'Thứ Tư', sub: 'Thứ 4' },
      { key: 'T5', name: 'Thứ Năm', sub: 'Thứ 5' },
      { key: 'T6', name: 'Thứ Sáu', sub: 'Thứ 6' }
    ];

    if (!scheduleResult || Object.keys(schedule).length === 0) {
      elements.timetableGrid.innerHTML = `
        <div style="grid-column: 1 / -1; background: #ffffff; padding: 3rem 1.5rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⏳</div>
          <h3 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.35rem;">Ban Điều Hành Đang Tổng Hợp Lịch</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted);">
            Lịch trực chính thức sẽ được công bố tại đây.
          </p>
        </div>
      `;
      if (elements.scheduleStatusBanner) {
        elements.scheduleStatusBanner.innerHTML = `<span class="badge" style="background: var(--warning-bg); color: var(--warning); border: 1px solid #fde68a;">Đang chờ xếp lịch</span>`;
      }
      return;
    }

    if (elements.scheduleStatusBanner) {
      if (selectedMonth === 'prev') {
        elements.scheduleStatusBanner.innerHTML = `<span class="badge" style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe;">⏮️ Lịch Lưu Trữ ${escapeHtml(prevLabel)} (Tuần ${viewWeek})</span>`;
      } else {
        elements.scheduleStatusBanner.innerHTML = `<span class="badge" style="background: var(--success-bg); color: var(--success); border: 1px solid #a7f3d0;">✓ Lịch trực Tuần ${viewWeek} đã công bố</span>`;
      }
    }

    if (elements.scheduleUpdateTime) {
      if (selectedMonth === 'prev') {
        elements.scheduleUpdateTime.textContent = `Lịch Trực Lưu Trữ ${prevLabel} - Tuần ${viewWeek}`;
      } else if (scheduleResult.timestamp) {
        const timeStr = new Date(scheduleResult.timestamp).toLocaleString('vi-VN');
        elements.scheduleUpdateTime.textContent = `Lịch Tuần ${viewWeek} (Cập nhật: ${timeStr})`;
      } else {
        elements.scheduleUpdateTime.textContent = `Lịch Tuần ${viewWeek} (${curLabel})`;
      }
    }

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
      gridHtml += renderReadOnlyShiftSlot(shiftId, slot);
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
      gridHtml += renderReadOnlyShiftSlot(shiftId, slot);
    });

    elements.timetableGrid.innerHTML = gridHtml;
  }

  /**
   * Render Ô Ca Trực: Tuyệt đối KHÔNG có nhãn/huy hiệu phân loại vai trò (Task 2)
   * Chỉ hiển thị Họ tên và MSSV của 2 bạn trực ca đó, đảm bảo tính bình đẳng và văn minh 100%.
   */
  function renderReadOnlyShiftSlot(shiftId, slot) {
    if (!slot) {
      return `<div class="grid-cell shift-duty-slot"><div class="empty-state">Trống</div></div>`;
    }

    const renderMemberCard = (mem) => {
      if (!mem) {
        return `
          <div class="duty-member-card empty-member">
            <span>Đang xếp…</span>
          </div>
        `;
      }
      return `
        <div class="duty-member-card" style="cursor: default; border-left: 3px solid var(--primary);" title="${escapeHtml(mem.fullName)}">
          <div class="member-info">
            <span class="member-name" style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">👤 ${escapeHtml(mem.fullName)}</span>
            <span class="member-mssv" style="font-size: 0.78rem; color: var(--text-muted);">MSSV: ${escapeHtml(mem.studentId)}</span>
          </div>
        </div>
      `;
    };

    const card1 = renderMemberCard(slot.oldMember);
    const card2 = renderMemberCard(slot.newMember);

    return `
      <div class="grid-cell shift-duty-slot">
        <div class="shift-slot-header">
          <span>${slot.shiftInfo?.dayName || ''}</span>
          <span class="shift-status-pill ${slot.status === 'full' ? 'full' : 'warning'}">
            ${slot.status === 'full' ? '✓ Đủ 2 bạn' : 'Đang bố trí'}
          </span>
        </div>
        ${card1}
        ${card2}
      </div>
    `;
  }

  /**
   * Trích xuất danh sách ca trực của một sinh viên từ bảng lịch bất kỳ
   */
  function extractStudentShiftsFromSchedule(mssv, scheduleObj) {
    if (!scheduleObj || !mssv) return [];
    let weekTables = [];
    if (scheduleObj.weeks && scheduleObj.weeks.length > 0) {
      weekTables = scheduleObj.weeks.map(w => w.scheduleTable);
    } else {
      if (scheduleObj.week1) weekTables.push(scheduleObj.week1.scheduleTable);
      if (scheduleObj.week2) weekTables.push(scheduleObj.week2.scheduleTable);
      if (scheduleObj.scheduleTable) weekTables.push(scheduleObj.scheduleTable);
    }

    const myShifts = [];
    weekTables.forEach((table, idx) => {
      if (!table) return;
      const weekNum = idx + 1;
      Object.entries(table).forEach(([shiftId, slot]) => {
        if (!slot) return;
        const isOld = slot.oldMember?.studentId?.toLowerCase() === mssv;
        const isNew = slot.newMember?.studentId?.toLowerCase() === mssv;
        if (isOld || isNew) {
          const self = isOld ? slot.oldMember : slot.newMember;
          const partner = isOld ? slot.newMember : slot.oldMember;
          myShifts.push({
            shiftId,
            weekNum,
            shift: slot.shiftInfo || { dayName: shiftId.split('_')[0], period: shiftId.split('_')[1] === 'S' ? 'Sáng' : 'Chiều', time: shiftId.split('_')[1] === 'S' ? '07:30 - 11:30' : '13:00 - 16:30' },
            selfName: self?.fullName || '',
            selfMssv: self?.studentId || '',
            selfPhone: self?.phone || '',
            selfRole: isOld ? 'old' : 'new',
            partnerName: partner ? partner.fullName : 'Chưa có bạn trực cùng',
            partnerMssv: partner ? partner.studentId : '',
            partnerPhone: partner?.phone || ''
          });
        }
      });
    });
    return myShifts;
  }

  /**
   * Tra cứu ca trực & Hiển thị Thẻ Lịch Trực Cá Nhân Điện Tử (Task 2 & Task 4)
   * Cho phép CTV xem ca trực tháng này (Tháng 10/2026) và tháng trước (Tháng 09/2026)
   * Tuyệt đối KHÔNG có dặn dò trang phục và KHÔNG có nhãn phân loại vai trò
   */
  function handleLookupMySchedule() {
    const mssv = elements.inputLookupMssv ? elements.inputLookupMssv.value.trim().toLowerCase() : '';
    if (!mssv) {
      showToast('Vui lòng nhập MSSV để tra cứu!', 'warning');
      elements.inputLookupMssv?.focus();
      return;
    }

    const curMonth = getActiveMonth();
    const prevMonth = getPrevActiveMonth();
    const curLabel = formatMonthLabel(curMonth.month, curMonth.year);
    const prevLabel = formatMonthLabel(prevMonth.month, prevMonth.year);

    // 1. Lấy lịch tháng đang áp dụng
    let currentSched = readMonthScheduleStore() || readWeekScheduleStore();

    // Nếu chưa có dữ liệu lịch phân công công bố
    if (!currentSched) {
      elements.lookupResult.innerHTML = `
        <div style="padding: 1.25rem; background: var(--warning-bg, #fffbeb); border: 1.5px solid #fde68a; border-radius: var(--radius-md); font-size: 0.9rem; color: #92400e; text-align: center;">
          ⚠️ <strong>Chưa có lịch trực công bố:</strong> Ban điều hành đang hoàn thiện phân công ca trực. Vui lòng quay lại sau!
        </div>
      `;
      elements.lookupResult.style.display = 'block';
      return;
    }

    // 2. Lấy lịch tháng liền trước
    const prevSched = getPrevMonthSchedule();

    const currentShifts = extractStudentShiftsFromSchedule(mssv, currentSched);
    const prevShifts = extractStudentShiftsFromSchedule(mssv, prevSched);

    if (currentShifts.length === 0 && prevShifts.length === 0) {
      elements.lookupResult.innerHTML = `
        <div style="padding: 1.25rem; background: var(--bg-card-hover); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); font-size: 0.9rem; color: var(--text-muted); text-align: center;">
          ℹ️ Không tìm thấy lịch trực của MSSV <strong>${escapeHtml(elements.inputLookupMssv.value)}</strong> trong ${escapeHtml(curLabel)} và ${escapeHtml(prevLabel)}.<br>
          <span style="font-size: 0.82rem;">(Vui lòng kiểm tra lại MSSV hoặc liên hệ Ban Điều Hành nếu bạn đã đăng ký).</span>
        </div>
      `;
      elements.lookupResult.style.display = 'block';
      return;
    }

    // Tìm thông tin sinh viên từ danh sách đăng ký hoặc dữ liệu mẫu hoặc từ chính slot ca trực
    let studentInfo = null;
    try {
      const list = loadAllStudents();
      studentInfo = list.find(s => s.studentId && String(s.studentId).toLowerCase() === mssv);
    } catch (e) {}

    if (!studentInfo) {
      const matchWithSelf = currentShifts.find(s => s.selfName) || prevShifts.find(s => s.selfName);
      if (matchWithSelf && matchWithSelf.selfName) {
        studentInfo = {
          studentId: matchWithSelf.selfMssv || elements.inputLookupMssv.value.trim().toUpperCase(),
          fullName: matchWithSelf.selfName,
          phone: matchWithSelf.selfPhone || '',
          role: matchWithSelf.selfRole || 'new'
        };
      } else {
        studentInfo = {
          studentId: elements.inputLookupMssv.value.trim().toUpperCase(),
          fullName: 'Cộng Tác Viên Tuyển Sinh',
          phone: ''
        };
      }
    }

    currentLookupStudent = studentInfo;
    currentLookupShifts = currentShifts;

    renderPersonalDutyCard(studentInfo, currentShifts, prevShifts);
    elements.lookupResult.style.display = 'block';
    elements.lookupResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Render Thẻ Lịch Trực Cá Nhân Điện Tử (Task 2 & Task 4)
   * Tuyệt đối KHÔNG có dặn dò trang phục và KHÔNG hiển thị vai trò
   */
  function renderPersonalDutyCard(student, currentShifts = [], prevShifts = []) {
    const curM = getActiveMonth();
    const prevM = getPrevActiveMonth();
    const curLabel = formatMonthLabel(curM.month, curM.year);
    const prevLabel = formatMonthLabel(prevM.month, prevM.year);

    // Lấy danh sách đề xuất đổi ca của sinh viên này
    let mySwaps = [];
    try {
      const rawSwaps = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (rawSwaps) {
        const allSwaps = JSON.parse(rawSwaps);
        mySwaps = allSwaps.filter(s => s.studentId?.toLowerCase() === student.studentId?.toLowerCase());
      }
    } catch (e) {}

    const renderShiftList = (shifts, isCurrent) => {
      if (!shifts || shifts.length === 0) {
        return `<div style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.88rem; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">Không có ca trực nào trong kỳ này.</div>`;
      }
      return shifts.map((s, idx) => `
        <div class="personal-shift-card">
          <div class="shift-card-left">
            <span class="shift-week-chip">Tuần ${s.weekNum}</span>
            <div class="shift-card-timing">
              <span class="shift-card-day">${escapeHtml(s.shift.dayName)}</span>
              <span class="shift-card-period">${escapeHtml(s.shift.period)} (${escapeHtml(s.shift.time)})</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <div class="shift-card-partner">
              👥 Trực cùng: <strong>${escapeHtml(s.partnerName)}</strong>
              ${s.partnerMssv ? `(${escapeHtml(s.partnerMssv)})` : ''}
              ${s.partnerPhone ? `<span style="margin-left: 0.35rem; color: var(--text-muted);">📞 ${escapeHtml(s.partnerPhone)}</span>` : ''}
            </div>
            ${isCurrent ? `
              <button type="button" class="btn btn-secondary btn-sm btn-swap-shift-trigger" onclick="window.studentOpenSwapForShift('${s.shiftId}', ${s.weekNum})" title="Đề xuất đổi hoặc nhờ trực thay ca này">
                🔄 Đổi ca
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');
    };

    const currentShiftsHtml = renderShiftList(currentShifts, true);
    const prevShiftsHtml = renderShiftList(prevShifts, false);

    const swapsHtml = mySwaps.length > 0 ? `
      <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px dashed var(--border-color);">
        <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
          <span>📜</span> Lịch sử đề xuất đổi ca của bạn (${mySwaps.length}):
        </h4>
        <div class="my-swap-history-list">
          ${mySwaps.map(req => {
            let statusBadge = '';
            if (req.status === 'approved') {
              statusBadge = '<span class="swap-status-pill swap-status-approved">✓ Đã Phê Duyệt</span>';
            } else if (req.status === 'rejected') {
              statusBadge = '<span class="swap-status-pill swap-status-rejected">✕ Từ Chối</span>';
            } else {
              statusBadge = '<span class="swap-status-pill swap-status-pending">⏳ Đang Chờ BĐH Duyệt</span>';
            }
            return `
              <div class="my-swap-item">
                <div>
                  <strong>Tuần ${req.weekNum} - ${escapeHtml(req.shiftName || '')}</strong>: 
                  ${req.swapType === 'cover' ? 'Nhờ bạn' : 'Đổi với bạn'} <strong>${escapeHtml(req.targetStudentName || '')}</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
                    Lý do: "${escapeHtml(req.reason || '')}"
                  </div>
                </div>
                <div>${statusBadge}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    elements.lookupResult.innerHTML = `
      <div class="personal-duty-card-wrapper" id="personal-duty-card-print-area">
        <div class="personal-duty-card">
          
          <!-- Header Thẻ Điện Tử -->
          <div class="personal-card-header">
            <div class="personal-card-brand">
              <div class="personal-card-emblem">🎓</div>
              <div>
                <div class="personal-card-org-title">Văn Phòng Tư Vấn Tuyển Sinh</div>
                <div class="personal-card-main-title">THẺ LỊCH TRỰC CỘNG TÁC VIÊN</div>
              </div>
            </div>
            <div class="personal-card-badge-box">
              <span class="personal-card-month-badge">📅 Tra Cứu Ca Trực Cá Nhân</span>
              <span class="badge" style="background: rgba(255, 255, 255, 0.25); color: #ffffff; font-weight: 700;">
                Mã CTV: ${escapeHtml(student.studentId)}
              </span>
            </div>
          </div>

          <!-- Body Thẻ -->
          <div class="personal-card-body">
            
            <!-- Hồ Sơ CTV (Chỉ hiển thị Họ tên, MSSV, SĐT - KHÔNG có dòng phân loại vai trò) -->
            <div class="personal-profile-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
              <div>
                <div class="profile-field-label">Họ và Tên</div>
                <div class="profile-field-value">👤 ${escapeHtml(student.fullName || 'Cộng Tác Viên')}</div>
              </div>
              <div>
                <div class="profile-field-label">Mã Số Sinh Viên</div>
                <div class="profile-field-value">🆔 ${escapeHtml(student.studentId)}</div>
              </div>
              <div>
                <div class="profile-field-label">Số Điện Thoại / Zalo</div>
                <div class="profile-field-value">📞 ${escapeHtml(student.phone || 'Chưa cập nhật')}</div>
              </div>
            </div>

            <!-- Tab Chuyển Đổi Tháng Tra Cứu (Tháng đang áp dụng vs Tháng liền trước) -->
            <div style="margin-top: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1.5px solid var(--border-color); padding-bottom: 0.75rem;">
              <div class="month-selector-tabs" id="lookup-month-tabs">
                <button type="button" class="month-sel-btn active" id="btn-tab-lookup-current" onclick="window.studentToggleLookupMonth && window.studentToggleLookupMonth('current')">
                  📅 ${escapeHtml(curLabel)} (${currentShifts.length} ca)
                </button>
                <button type="button" class="month-sel-btn" id="btn-tab-lookup-prev" onclick="window.studentToggleLookupMonth && window.studentToggleLookupMonth('prev')">
                  ⏮️ ${escapeHtml(prevLabel)} (${prevShifts.length} ca)
                </button>
              </div>
              <div style="font-size: 0.84rem; color: var(--text-muted);" id="lookup-month-count-label">
                Đang xem: <strong>${escapeHtml(curLabel)}</strong> (${currentShifts.length} ca trực)
              </div>
            </div>

            <!-- Danh Sách Ca Trực Tháng Đang Áp Dụng -->
            <div id="lookup-shifts-current" class="personal-shifts-list" style="margin-top: 1rem;">
              ${currentShiftsHtml}
            </div>

            <!-- Danh Sách Ca Trực Tháng Liền Trước (Ẩn mặc định) -->
            <div id="lookup-shifts-prev" class="personal-shifts-list" style="display: none; margin-top: 1rem;">
              ${prevShiftsHtml}
            </div>

            <!-- Lịch Sử Đổi Ca -->
            ${swapsHtml}

            <!-- Nút Hành Động Trên Thẻ -->
            <div class="personal-card-actions">
              <button type="button" class="btn btn-secondary" onclick="window.studentPrintDutyCard()">
                <span>🖨️ In Thẻ Cá Nhân</span>
              </button>
              <button type="button" class="btn btn-secondary" onclick="window.studentCopyDutySchedule()">
                <span>📋 Sao Chép Lịch (Zalo)</span>
              </button>
              <button type="button" class="btn btn-primary" onclick="window.studentOpenSwapModal()">
                <span>🔄 Đề Xuất Đổi Ca / Nhờ Trực</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  /**
   * Chuyển đổi tháng trong Thẻ Tra Cứu Ca Trực Cá Nhân (Task 4)
   */
  window.studentToggleLookupMonth = (monthType) => {
    const isCurrent = monthType === 'current';
    const curDiv = document.getElementById('lookup-shifts-current');
    const prevDiv = document.getElementById('lookup-shifts-prev');
    const btnCur = document.getElementById('btn-tab-lookup-current');
    const btnPrev = document.getElementById('btn-tab-lookup-prev');
    const countLbl = document.getElementById('lookup-month-count-label');

    if (curDiv) curDiv.style.display = isCurrent ? 'block' : 'none';
    if (prevDiv) prevDiv.style.display = isCurrent ? 'none' : 'block';
    if (btnCur) btnCur.classList.toggle('active', isCurrent);
    if (btnPrev) btnPrev.classList.toggle('active', !isCurrent);
    if (countLbl) {
      const curM = getActiveMonth();
      const prevM = getPrevActiveMonth();
      countLbl.innerHTML = isCurrent
        ? `Đang xem: <strong>${escapeHtml(formatMonthLabel(curM.month, curM.year))}</strong> (${currentLookupShifts?.length || 0} ca trực)`
        : `Đang xem: <strong>${escapeHtml(formatMonthLabel(prevM.month, prevM.year))}</strong> (Lịch trực lưu trữ)`;
    }
  };

  /**
   * Sao chép tóm tắt lịch trực cá nhân để gửi qua Zalo (Tuyệt đối KHÔNG có vai trò)
   */
  function copyDutyScheduleText() {
    if (!currentLookupStudent || !currentLookupShifts || currentLookupShifts.length === 0) {
      showToast('Không có dữ liệu ca trực để sao chép!', 'error');
      return;
    }

    const lines = [
      `🎓 LỊCH TRỰC CỘNG TÁC VIÊN TƯ VẤN TUYỂN SINH`,
      `👤 CTV: ${currentLookupStudent.fullName} (MSSV: ${currentLookupStudent.studentId})`,
      `📞 SĐT: ${currentLookupStudent.phone || 'N/A'}`,
      `📅 Tổng số: ${currentLookupShifts.length} ca trực trong tháng`,
      `---------------------------------------`,
      ...currentLookupShifts.map(s => 
        `• Tuần ${s.weekNum}: ${s.shift.dayName} (${s.shift.period}: ${s.shift.time}) | Trực cùng: ${s.partnerName} (${s.partnerMssv})`
      ),
      `---------------------------------------`,
      `Hệ thống xếp lịch tự động Ban TVTS`
    ];

    const textToCopy = lines.join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Đã sao chép lịch trực vào bộ nhớ tạm! Bạn có thể dán vào Zalo ngay.', 'success');
    }).catch(() => {
      showToast('Không thể tự động sao chép, vui lòng thử lại!', 'error');
    });
  }

  /**
   * Quản Lý Modal Đề Xuất Đổi Ca & Nhờ Trực Hộ (Task 26)
   */
  function findStudentAndShiftsByMssv(inputMssv) {
    const mssv = (inputMssv || '').trim().toLowerCase();
    if (!mssv) return { studentInfo: null, myShifts: [] };

    let weekTables = [];
    try {
      const rawMonth = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE) || localStorage.getItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      if (rawMonth) {
        const parsed = JSON.parse(rawMonth);
        if (parsed.weeks && parsed.weeks.length > 0) {
          weekTables = parsed.weeks.map(w => w.scheduleTable);
        } else {
          if (parsed.week1) weekTables.push(parsed.week1.scheduleTable);
          if (parsed.week2) weekTables.push(parsed.week2.scheduleTable);
        }
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
        if (raw) weekTables.push(JSON.parse(raw)?.scheduleTable);
      }
    } catch (err) {
      console.error(err);
    }

    let studentInfo = null;
    try {
      const rawStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (rawStudents) {
        const list = JSON.parse(rawStudents);
        studentInfo = list.find(s => s.studentId && s.studentId.toLowerCase() === mssv) || null;
      }
    } catch (e) {}

    const myShifts = [];
    function findInTable(table, weekNum) {
      if (!table) return;
      Object.entries(table).forEach(([shiftId, slot]) => {
        const isOld = slot.oldMember?.studentId?.toLowerCase() === mssv;
        const isNew = slot.newMember?.studentId?.toLowerCase() === mssv;
        if (isOld || isNew) {
          const self = isOld ? slot.oldMember : slot.newMember;
          const partner = isOld ? slot.newMember : slot.oldMember;

          if (!studentInfo && self) {
            studentInfo = {
              studentId: self.studentId,
              fullName: self.fullName,
              phone: self.phone || '',
              role: isOld ? 'old' : 'new'
            };
          }

          myShifts.push({
            shiftId,
            weekNum,
            shift: slot.shiftInfo,
            myRole: '',
            roleKey: isOld ? 'old' : 'new',
            partnerName: partner ? partner.fullName : 'Chưa có bạn trực cùng',
            partnerMssv: partner ? partner.studentId : '',
            partnerPhone: partner?.phone || ''
          });
        }
      });
    }

    weekTables.forEach((table, idx) => {
      findInTable(table, idx + 1);
    });

    return { studentInfo, myShifts };
  }

  function loadStudentShiftsForSwap(mssv, preselectedShiftId = null, preselectedWeek = null) {
    if (!mssv) return;
    const { studentInfo, myShifts } = findStudentAndShiftsByMssv(mssv);

    if (elements.inputSwapSenderMssv) {
      elements.inputSwapSenderMssv.value = mssv;
    }

    if (!studentInfo && myShifts.length === 0) {
      if (elements.swapSenderStatusMsg) {
        elements.swapSenderStatusMsg.innerHTML = `<span style="color: #ef4444; font-weight: 600;">⚠️ Không tìm thấy sinh viên hoặc ca trực nào với MSSV: <strong>${escapeHtml(mssv)}</strong>. Bạn vui lòng kiểm tra lại mã số.</span>`;
      }
      if (elements.swapSenderRoleBadge) elements.swapSenderRoleBadge.style.display = 'none';
      if (elements.selectMyShift) {
        elements.selectMyShift.innerHTML = `<option value="">-- Không có ca trực khả dụng để đổi --</option>`;
      }
      if (elements.swapMyHistorySection) elements.swapMyHistorySection.style.display = 'none';
      return;
    }

    currentLookupStudent = studentInfo || { studentId: mssv, fullName: 'Sinh viên ' + mssv, role: myShifts[0]?.roleKey || 'new' };
    currentLookupShifts = myShifts;

    if (elements.swapSenderRoleBadge) {
      elements.swapSenderRoleBadge.style.display = 'none';
    }

    if (myShifts.length === 0) {
      if (elements.swapSenderStatusMsg) {
        elements.swapSenderStatusMsg.innerHTML = `<span style="color: #b45309; font-weight: 600;">ℹ️ Chào <strong>${escapeHtml(currentLookupStudent.fullName)}</strong>! Bạn chưa được xếp ca trực nào trong lịch 4 tuần nên chưa thể đổi ca.</span>`;
      }
      if (elements.selectMyShift) {
        elements.selectMyShift.innerHTML = `<option value="">-- Bạn chưa có ca trực nào để đổi --</option>`;
      }
    } else {
      if (elements.swapSenderStatusMsg) {
        elements.swapSenderStatusMsg.innerHTML = `<span style="color: #047857; font-weight: 600;">✓ Chào <strong>${escapeHtml(currentLookupStudent.fullName)}</strong>! Đã tìm thấy <strong>${myShifts.length}</strong> ca trực sẵn sàng hoán đổi.</span>`;
      }

      if (elements.selectMyShift) {
        elements.selectMyShift.innerHTML = myShifts.map(s => {
          const val = `${s.weekNum}__${s.shiftId}`;
          const isSelected = (preselectedShiftId === s.shiftId && preselectedWeek === s.weekNum);
          return `<option value="${val}" ${isSelected ? 'selected' : ''}>
            Tuần ${s.weekNum} - ${escapeHtml(s.shift?.dayName || '')} (${escapeHtml(s.shift?.period || '')}: ${escapeHtml(s.shift?.time || '')}) | Trực cùng: ${escapeHtml(s.partnerName || 'Chưa có bạn')}
          </option>`;
        }).join('');
      }
    }

    // Nạp danh sách các CTV khác vào select target (Không hiển thị phân loại vai trò)
    let allStudents = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) allStudents = JSON.parse(raw);
    } catch (e) {}

    const otherStudents = allStudents.filter(s => s.studentId && s.studentId.toLowerCase() !== mssv.toLowerCase());
    if (elements.selectTargetStudent) {
      if (otherStudents.length === 0) {
        elements.selectTargetStudent.innerHTML = `<option value="">-- Chưa có CTV khác trong danh sách --</option>`;
      } else {
        elements.selectTargetStudent.innerHTML = `
          <option value="">-- Chọn bạn CTV nhận đổi hoặc trực thay --</option>
          ${otherStudents.map(s => `
            <option value="${escapeHtml(s.studentId)}" data-name="${escapeHtml(s.fullName)}" data-role="${escapeHtml(s.role)}">
              ${escapeHtml(s.fullName)} (${escapeHtml(s.studentId)})
            </option>
          `).join('')}
        `;
      }
    }

    // Hiển thị lịch sử đề xuất của sinh viên này
    renderMySwapHistory(mssv);
  }

  function renderMySwapHistory(mssv) {
    if (!elements.swapMyHistorySection || !elements.swapMyHistoryList) return;
    let allSwaps = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) allSwaps = JSON.parse(raw);
    } catch (e) {}

    const myRequests = allSwaps.filter(r => r.studentId && r.studentId.toLowerCase() === mssv.toLowerCase());
    if (myRequests.length === 0) {
      elements.swapMyHistorySection.style.display = 'none';
      return;
    }

    elements.swapMyHistorySection.style.display = 'block';
    elements.swapMyHistoryList.innerHTML = myRequests.map(r => {
      let statusBadge = '<span style="background: #fef3c7; color: #92400e; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;">⏳ Đang chờ BĐH duyệt</span>';
      if (r.status === 'approved') {
        statusBadge = '<span style="background: #d1fae5; color: #065f46; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;">✓ Đã phê duyệt</span>';
      } else if (r.status === 'rejected') {
        statusBadge = '<span style="background: #fee2e2; color: #991b1b; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;">✕ Đã từ chối</span>';
      }

      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <div>
            <div style="font-weight: 700; color: var(--text-main);">
              ${r.swapType === 'cover' ? '🤝 Nhờ trực hộ' : '🔄 Đổi ca'}: Tuần ${r.weekNum} (${escapeHtml(r.shiftName)})
            </div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">
              Người nhận: <strong>${escapeHtml(r.targetStudentName || r.targetStudentId)}</strong> | Lý do: ${escapeHtml(r.reason)}
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');
  }

  function openSwapModal(preselectedShiftId = null, preselectedWeek = null, specificMssv = null) {
    if (elements.modalSwap) {
      elements.modalSwap.style.display = 'flex';
      elements.modalSwap.classList.add('active');
    }

    setSwapType('swap');
    if (elements.inputSwapReason) elements.inputSwapReason.value = '';

    const targetMssv = (specificMssv || 
      elements.inputSwapSenderMssv?.value.trim() || 
      currentLookupStudent?.studentId || 
      elements.inputStudentId?.value.trim() || 
      elements.inputLookupMssv?.value.trim() || '').trim();

    if (targetMssv) {
      loadStudentShiftsForSwap(targetMssv, preselectedShiftId, preselectedWeek);
    } else {
      if (elements.inputSwapSenderMssv) {
        elements.inputSwapSenderMssv.value = '';
        setTimeout(() => elements.inputSwapSenderMssv?.focus(), 100);
      }
      if (elements.swapSenderStatusMsg) {
        elements.swapSenderStatusMsg.innerHTML = `💡 Vui lòng nhập MSSV của bạn và bấm <strong>Tải Ca Trực</strong> để tiếp tục.`;
      }
      if (elements.swapSenderRoleBadge) elements.swapSenderRoleBadge.style.display = 'none';
      if (elements.selectMyShift) {
        elements.selectMyShift.innerHTML = `<option value="">-- Vui lòng nhập MSSV và bấm Tải Ca Trực ở trên --</option>`;
      }
      if (elements.swapMyHistorySection) elements.swapMyHistorySection.style.display = 'none';
    }
  }

  function closeSwapModal() {
    if (elements.modalSwap) {
      elements.modalSwap.style.display = 'none';
      elements.modalSwap.classList.remove('active');
    }
  }

  function setSwapType(type) {
    if (elements.inputSwapType) elements.inputSwapType.value = type;
    if (elements.typeOptSwap) elements.typeOptSwap.classList.toggle('active', type === 'swap');
    if (elements.typeOptCover) elements.typeOptCover.classList.toggle('active', type === 'cover');
    if (elements.swapTargetHint) {
      elements.swapTargetHint.textContent = type === 'swap' 
        ? 'Chọn bạn bạn muốn hoán đổi ca cùng.'
        : 'Chọn bạn CTV bạn nhờ vào trực thay ca này cho mình.';
    }
  }

  function handleSwapFormSubmit(e) {
    e.preventDefault();
    if (!currentLookupStudent) {
      showToast('Vui lòng nhập MSSV và bấm "Tải Ca Trực" trước!', 'warning');
      elements.inputSwapSenderMssv?.focus();
      return;
    }

    const myShiftVal = elements.selectMyShift ? elements.selectMyShift.value : '';
    const targetStudentId = elements.selectTargetStudent ? elements.selectTargetStudent.value : '';
    const reason = elements.inputSwapReason ? elements.inputSwapReason.value.trim() : '';
    const swapType = elements.inputSwapType ? elements.inputSwapType.value : 'swap';

    if (!myShiftVal) {
      showToast('Vui lòng chọn ca trực của bạn cần đổi!', 'warning');
      return;
    }
    if (!targetStudentId) {
      showToast('Vui lòng chọn bạn CTV nhận đổi hoặc trực thay!', 'warning');
      return;
    }
    if (!reason) {
      showToast('Vui lòng điền lý do đổi ca / nhờ trực!', 'warning');
      elements.inputSwapReason?.focus();
      return;
    }

    const [weekNumStr, shiftId] = myShiftVal.split('__');
    const weekNum = parseInt(weekNumStr, 10) || 1;
    const targetOpt = elements.selectTargetStudent.selectedOptions[0];
    const targetName = targetOpt?.getAttribute('data-name') || targetStudentId;
    const targetRole = targetOpt?.getAttribute('data-role') || 'new';

    const currentShiftObj = currentLookupShifts.find(s => s.shiftId === shiftId && s.weekNum === weekNum);
    const shiftName = currentShiftObj ? `${currentShiftObj.shift.dayName} (${currentShiftObj.shift.period})` : shiftId;

    const newRequest = {
      id: 'swap_' + Date.now(),
      createdAt: new Date().toISOString(),
      studentId: currentLookupStudent.studentId,
      studentName: currentLookupStudent.fullName,
      studentRole: currentLookupStudent.role,
      swapType, // 'swap' | 'cover'
      weekNum,
      shiftId,
      shiftName,
      targetStudentId,
      targetStudentName: targetName,
      targetStudentRole: targetRole,
      reason,
      status: 'pending',
      adminNote: ''
    };

    let allSwaps = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SWAP_REQUESTS);
      if (raw) allSwaps = JSON.parse(raw);
    } catch (e) {}

    allSwaps.unshift(newRequest);
    localStorage.setItem(STORAGE_KEYS.SWAP_REQUESTS, JSON.stringify(allSwaps));

    // Thông báo đồng bộ sang trang Admin
window.dispatchEvent(new CustomEvent('ts:data-changed', { detail: { keys: [STORAGE_KEYS.SWAP_REQUESTS] } }));

    closeSwapModal();
    showToast('Đã gửi đề xuất đến Ban Điều Hành! Bạn có thể theo dõi trạng thái ngay tại Thẻ lịch trực.', 'success');

    // Cập nhật lại Thẻ lịch trực để hiện yêu cầu vừa tạo nếu đang xem
    if (elements.lookupResult && elements.lookupResult.style.display !== 'none') {
      renderPersonalDutyCard(currentLookupStudent, currentLookupShifts);
    }
  }

  // Khai báo các hàm global phục vụ gọi trực tiếp từ giao diện
  window.studentPrintDutyCard = () => {
    window.print();
  };

  window.studentCopyDutySchedule = () => {
    copyDutyScheduleText();
  };

  window.studentOpenSwapModal = (shiftId = null, weekNum = null, specificMssv = null) => {
    openSwapModal(shiftId, weekNum, specificMssv);
  };

  window.studentOpenSwapDirectly = (specificMssv = null) => {
    openSwapModal(null, null, specificMssv);
  };

  window.studentOpenSwapForShift = (shiftId, weekNum) => {
    openSwapModal(shiftId, weekNum);
  };

  function showToast(message, type = 'info', duration) {
    // LỖI phải được đọc NGAY bởi trình đọc màn hình, không phải đợi đến
    // khi trình đọc rảnh (vùng toast là aria-live="polite").
    if (type === 'error' && window.ModalA11y && typeof window.ModalA11y.announceAlert === 'function') {
      window.ModalA11y.announceAlert(String(message).replace(/<[^>]*>/g, ''));
    }

    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    if (type === 'error') toast.setAttribute('role', 'alert');
    // Bắt buộc escapeHtml: message có thể chứa tên/MSSV do người dùng nhập.
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${escapeHtml(String(message))}</span>
    `;

    elements.toastContainer.appendChild(toast);

    // Tôn trọng tham số thời lượng thay vì luôn cứng 3.2 giây.
    const lifetime = Number(duration) > 0 ? Number(duration) : 3200;

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, lifetime);
  }

  // Quản lý Chế độ Sáng / Tối (Dark / Light Theme Switcher)
  function initThemeToggle() {
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');

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

  // Phím tắt bí mật dành cho Ban Điều Hành Tuyển Sinh (Ctrl + Shift + A)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      window.location.href = 'admin.html';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudentPortal);
  } else {
    initStudentPortal();
  }
})();
