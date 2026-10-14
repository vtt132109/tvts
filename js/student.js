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
    REG_CONFIG: 'ts_scheduler_reg_config'
  };

  // State
  let viewWeek = 1;
  let regConfig = null;
  let isRegOpen = true;
  let detectedStudent = null;

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
      roleInputs: document.querySelectorAll('input[name="studentRole"]'),
      matrixCheckboxes: document.querySelectorAll('.slot-checkbox'),
      slotToggles: document.querySelectorAll('.slot-toggle'),
      selectedCountDisplay: document.getElementById('selected-shift-count'),
      btnSubmit: document.getElementById('btn-submit-reg'),
      btnSubmit2: document.getElementById('btn-submit-reg-2'),

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

      // Duplicate MSSV Alert Elements
      mssvAlertBox: document.getElementById('mssv-registered-alert-box'),
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

      // Toast Container
      toastContainer: document.getElementById('toast-container')
    };
  }

  function initStudentPortal() {
    cacheDOMElements();
    initThemeToggle();
    evaluateRegistrationWindow();
    bindEvents();
    renderCommonSchedule();

    // Cập nhật trạng thái đếm ngược thời gian mở cổng mỗi 30 giây
    setInterval(evaluateRegistrationWindow, 30000);

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.SCHEDULE || e.key === STORAGE_KEYS.TWO_WEEK_SCHEDULE || e.key === STORAGE_KEYS.STUDENTS) {
        renderCommonSchedule();
        showToast('Lịch trực vừa được Admin cập nhật thời gian thực!', 'info');
      } else if (e.key === STORAGE_KEYS.REG_CONFIG) {
        evaluateRegistrationWindow();
        showToast('Admin vừa thay đổi thời gian mở cổng đăng ký!', 'info');
      }
    });
  }

  function bindEvents() {
    // Checkbox Ma Trận Ca Rảnh
    elements.matrixCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        updateCheckboxVisual(cb);
        updateSelectedCount();
      });
    });

    elements.slotToggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const cb = toggle.querySelector('.slot-checkbox');
        if (!cb) return;
        if (e.target !== cb) {
          e.preventDefault();
          cb.checked = !cb.checked;
          updateCheckboxVisual(cb);
          updateSelectedCount();
        }
      });
    });

    // Quick selection buttons
    elements.btnQuickMorning?.addEventListener('click', (e) => {
      e.preventDefault();
      elements.matrixCheckboxes.forEach(cb => {
        if (cb.value.endsWith('_S')) {
          cb.checked = true;
          updateCheckboxVisual(cb);
        }
      });
      updateSelectedCount();
      showToast('Đã chọn tất cả ca Sáng (Thứ 2 - Thứ 6)!', 'info');
    });

    elements.btnQuickAfternoon?.addEventListener('click', (e) => {
      e.preventDefault();
      elements.matrixCheckboxes.forEach(cb => {
        if (cb.value.endsWith('_C')) {
          cb.checked = true;
          updateCheckboxVisual(cb);
        }
      });
      updateSelectedCount();
      showToast('Đã chọn tất cả ca Chiều (Thứ 2 - Thứ 6)!', 'info');
    });

    elements.btnQuickAll?.addEventListener('click', (e) => {
      e.preventDefault();
      elements.matrixCheckboxes.forEach(cb => {
        cb.checked = true;
        updateCheckboxVisual(cb);
      });
      updateSelectedCount();
      showToast('Đã chọn toàn bộ 10 ca trong tuần!', 'info');
    });

    elements.btnQuickClear?.addEventListener('click', (e) => {
      e.preventDefault();
      elements.matrixCheckboxes.forEach(cb => {
        cb.checked = false;
        updateCheckboxVisual(cb);
      });
      updateSelectedCount();
      showToast('Đã xóa chọn tất cả các ca.', 'info');
    });

    // Tự động nhận diện MSSV khi sinh viên gõ hoặc blur
    elements.inputStudentId?.addEventListener('input', handleMssvAutoDetect);
    elements.inputStudentId?.addEventListener('blur', handleMssvAutoDetect);

    // Gửi Form Đăng Ký (Hỗ trợ cả 2 nút Submit trên màn hình)
    elements.regForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      processStudentRegistration();
    });

    elements.btnSubmit?.addEventListener('click', (e) => {
      e.preventDefault();
      processStudentRegistration();
    });

    elements.btnSubmit2?.addEventListener('click', (e) => {
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
  }

  function updateSubmitButtonState() {
    if (!elements.btnSubmit) return;

    if (!isRegOpen) {
      elements.btnSubmit.disabled = true;
      elements.btnSubmit.style.opacity = '0.6';
      elements.btnSubmit.style.cursor = 'not-allowed';
      elements.btnSubmit.innerHTML = '<span>🔒 Cổng Đăng Ký Đang Đóng</span>';

      if (elements.btnSubmit2) {
        elements.btnSubmit2.disabled = true;
        elements.btnSubmit2.style.opacity = '0.6';
        elements.btnSubmit2.style.cursor = 'not-allowed';
        elements.btnSubmit2.innerHTML = '<span>🔒 Cổng Đăng Ký Đang Đóng</span>';
      }
    } else {
      elements.btnSubmit.disabled = false;
      elements.btnSubmit.style.opacity = '1';
      elements.btnSubmit.style.cursor = 'pointer';

      if (elements.btnSubmit2) {
        elements.btnSubmit2.disabled = false;
        elements.btnSubmit2.style.opacity = '1';
        elements.btnSubmit2.style.cursor = 'pointer';
      }

      if (detectedStudent) {
        elements.btnSubmit.innerHTML = '<span>🔄 Cập Nhật Ca Trực & Thông Tin</span>';
        if (elements.btnSubmit2) {
          elements.btnSubmit2.innerHTML = '<span>🔄 Cập Nhật Ca Trực & Thông Tin</span>';
        }
      } else {
        elements.btnSubmit.innerHTML = '<span>Gửi Đăng Ký Ca Trực</span>';
        if (elements.btnSubmit2) {
          elements.btnSubmit2.innerHTML = '<span>✓ Gửi Đăng Ký Ca Trực Ngay</span>';
        }
      }
    }
  }

  /**
   * Tự động nhận diện MSSV: kiểm tra xem đã đăng ký trước đó chưa
   */
  function handleMssvAutoDetect() {
    const rawInput = elements.inputStudentId ? elements.inputStudentId.value.trim() : '';
    if (!rawInput || rawInput.length < 2) {
      clearDetectedStudentState();
      return;
    }

    let students = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) students = JSON.parse(raw);
    } catch (err) {
      students = [];
    }

    const matched = students.find(s => s.studentId && s.studentId.toLowerCase() === rawInput.toLowerCase());

    if (matched) {
      detectedStudent = matched;
      renderMssvAlertBox(matched);
      populateStudentData(matched);
      updateSubmitButtonState();
    } else {
      clearDetectedStudentState();
    }
  }

  function populateStudentData(student) {
    if (elements.inputFullName && !elements.inputFullName.value) {
      elements.inputFullName.value = student.fullName || '';
    } else if (elements.inputFullName && elements.inputFullName.value !== student.fullName) {
      elements.inputFullName.value = student.fullName || '';
    }

    if (elements.inputPhone) {
      elements.inputPhone.value = student.phone || '';
    }

    // Role radio
    const roleRadio = document.querySelector(`input[name="studentRole"][value="${student.role}"]`);
    if (roleRadio) roleRadio.checked = true;

    // Checkboxes in shift matrix
    const shifts = student.availableShifts || [];
    elements.matrixCheckboxes.forEach(cb => {
      const isSelected = shifts.includes(cb.value);
      cb.checked = isSelected;
      updateCheckboxVisual(cb);
      const parent = cb.closest('.slot-toggle');
      if (parent) {
        if (isSelected) {
          parent.classList.add('pre-checked');
        } else {
          parent.classList.remove('pre-checked');
        }
      }
    });

    updateSelectedCount();

    if (elements.mssvLiveTag) {
      elements.mssvLiveTag.style.display = 'inline-block';
      elements.mssvLiveTag.className = 'badge-tag';
      elements.mssvLiveTag.style.background = '#2563eb';
      elements.mssvLiveTag.style.color = '#ffffff';
      elements.mssvLiveTag.style.fontSize = '0.75rem';
      elements.mssvLiveTag.style.padding = '2px 8px';
      elements.mssvLiveTag.style.borderRadius = '10px';
      elements.mssvLiveTag.textContent = '✓ Đã đăng ký';
    }

    if (elements.inputStudentId) {
      elements.inputStudentId.style.borderColor = '#3b82f6';
      elements.inputStudentId.style.backgroundColor = '#eff6ff';
    }
  }

  function renderMssvAlertBox(student) {
    if (!elements.mssvAlertBox) return;

    const shiftCount = (student.availableShifts || []).length;
    const roleText = student.role === 'old' ? '🎓 Người Cũ (Kinh nghiệm)' : '🌱 Người Mới (Tập sự)';
    const shiftsReadable = (student.availableShifts || []).map(sid => {
      const shift = SHIFT_MAP ? SHIFT_MAP[sid] : null;
      return shift ? `${shift.dayName} ${shift.period}` : sid;
    });

    elements.mssvAlertBox.style.display = 'block';
    elements.mssvAlertBox.innerHTML = `
      <div class="mssv-detected-card">
        <div class="mssv-detected-header">
          <span class="badge-registered">✓ ĐÃ HOÀN TẤT ĐĂNG KÝ TRƯỚC ĐÓ</span>
          <button type="button" class="btn-reset-form" id="btn-reset-mssv-form" title="Xóa form để đăng ký cho bạn khác">
            ✕ Đăng ký MSSV khác
          </button>
        </div>
        <div class="mssv-detected-headline">
          Hệ thống nhận diện MSSV <strong>${escapeHtml(student.studentId)}</strong> đã có trên hệ thống!
        </div>
        <p class="mssv-detected-desc">
          Bạn <strong>đã điền thông tin và đăng ký trước đó rồi nên không cần phải nhập lại từ đầu</strong>. Hệ thống đã tự động nạp lại thông tin cá nhân và <strong>đánh dấu sẵn ${shiftCount} ca bạn đã chọn</strong> ở bảng bên phải.
        </p>
        <div class="mssv-detected-data">
          <div class="mssv-data-item">Họ tên: <strong>${escapeHtml(student.fullName)}</strong></div>
          <div class="mssv-data-item">MSSV: <strong>${escapeHtml(student.studentId)}</strong></div>
          <div class="mssv-data-item">Phân loại: <strong>${roleText}</strong></div>
          <div class="mssv-data-item">Số ca rảnh đã lưu: <strong style="color: var(--primary);">${shiftCount} ca</strong></div>
        </div>
        <div>
          <div style="font-size: 0.78rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.25rem;">
            Các ca bạn đã tích chọn:
          </div>
          <div class="mssv-shift-chips">
            ${shiftsReadable.map(s => `<span class="shift-chip-registered">✓ ${s}</span>`).join('')}
          </div>
        </div>
        <div class="mssv-detected-actions">
          <span>
            ${isRegOpen ? '💡 <em>Cổng đăng ký đang mở: Bạn có thể chọn lại ca trên ma trận và bấm "Cập Nhật" nếu muốn thay đổi.</em>' : '🔒 <em>Cổng đăng ký đang đóng: Lịch rảnh của bạn đã được chốt và đưa vào xếp ca.</em>'}
          </span>
        </div>
      </div>
    `;

    document.getElementById('btn-reset-mssv-form')?.addEventListener('click', () => {
      clearStudentForm();
      showToast('Đã làm mới form để đăng ký cho sinh viên khác.', 'info');
    });
  }

  function clearDetectedStudentState() {
    detectedStudent = null;
    if (elements.mssvAlertBox) {
      elements.mssvAlertBox.style.display = 'none';
      elements.mssvAlertBox.innerHTML = '';
    }
    if (elements.mssvLiveTag) {
      elements.mssvLiveTag.style.display = 'none';
    }
    if (elements.inputStudentId) {
      elements.inputStudentId.style.borderColor = '';
      elements.inputStudentId.style.backgroundColor = '';
    }
    elements.matrixCheckboxes.forEach(cb => {
      const parent = cb.closest('.slot-toggle');
      if (parent) parent.classList.remove('pre-checked');
    });
    updateSubmitButtonState();
  }

  function clearStudentForm() {
    if (elements.inputFullName) elements.inputFullName.value = '';
    if (elements.inputStudentId) elements.inputStudentId.value = '';
    if (elements.inputPhone) elements.inputPhone.value = '';
    const newRoleRadio = document.querySelector('input[name="studentRole"][value="new"]');
    if (newRoleRadio) newRoleRadio.checked = true;

    elements.matrixCheckboxes.forEach(cb => {
      cb.checked = false;
      updateCheckboxVisual(cb);
      const parent = cb.closest('.slot-toggle');
      if (parent) parent.classList.remove('pre-checked');
    });

    updateSelectedCount();
    clearDetectedStudentState();
  }

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
    const selected = getSelectedShifts();
    if (elements.selectedCountDisplay) {
      elements.selectedCountDisplay.textContent = `${selected.length} ca đã chọn`;
    }
  }

  function getSelectedShifts() {
    const selected = [];
    elements.matrixCheckboxes.forEach(cb => {
      if (cb.checked) selected.push(cb.value);
    });
    return selected;
  }

  /**
   * Xử lý lưu đăng ký sinh viên
   */
  function processStudentRegistration() {
    if (!isRegOpen) {
      showToast('Cổng đăng ký ca trực hiện đang đóng, không thể gửi thông tin!', 'warning');
      return;
    }

    const fullName = elements.inputFullName ? elements.inputFullName.value.trim() : '';
    const studentId = elements.inputStudentId ? elements.inputStudentId.value.trim() : '';
    const phone = elements.inputPhone ? elements.inputPhone.value.trim() : '';
    const selectedRole = document.querySelector('input[name="studentRole"]:checked')?.value || 'new';
    const availableShifts = getSelectedShifts();

    if (!studentId) {
      showToast('Vui lòng nhập Mã số sinh viên (MSSV)!', 'error');
      elements.inputStudentId?.focus();
      return;
    }

    if (!fullName) {
      showToast('Vui lòng nhập Họ và Tên của bạn!', 'error');
      elements.inputFullName?.focus();
      return;
    }

    if (availableShifts.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 ca rảnh từ Thứ 2 đến Thứ 6!', 'error');
      return;
    }

    let students = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) students = JSON.parse(raw);
    } catch (err) {
      console.error(err);
      students = [];
    }

    const existingIndex = students.findIndex(s => s.studentId && s.studentId.toLowerCase() === studentId.toLowerCase());

    if (existingIndex !== -1) {
      students[existingIndex].fullName = fullName;
      students[existingIndex].phone = phone;
      students[existingIndex].role = selectedRole;
      students[existingIndex].availableShifts = availableShifts;
      students[existingIndex].updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));

      showSuccessBanner(`Cập nhật thành công! Đã lưu lại thông tin và <strong>${availableShifts.length} ca rảnh</strong> của bạn (${fullName} - MSSV: ${studentId}).`);
      showToast(`Đã cập nhật ${availableShifts.length} ca rảnh của bạn thành công!`, 'success');

      // Tự động làm mới thẻ thông báo đã đăng ký để sinh viên nhìn thấy ca vừa cập nhật
      handleMssvAutoDetect();
    } else {
      const newStudent = {
        id: 's_' + Date.now(),
        fullName,
        studentId,
        phone,
        role: selectedRole,
        availableShifts,
        createdAt: Date.now()
      };
      students.push(newStudent);
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));

      showSuccessBanner(`Đăng ký thành công! Chào mừng bạn <strong>${fullName}</strong> (${selectedRole === 'old' ? 'Người Cũ' : 'Người Mới'}). Bạn đã đăng ký <strong>${availableShifts.length} ca rảnh</strong> trong tuần.`);
      showToast('Đăng ký lịch trực thành công!', 'success');

      // Nhận diện ngay sinh viên vừa tạo và hiển thị trạng thái đã đăng ký
      handleMssvAutoDetect();
    }

    if (elements.inputLookupMssv) {
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
   */
  function renderCommonSchedule() {
    if (!elements.timetableGrid) return;

    let scheduleResult = null;
    try {
      const rawMonth = localStorage.getItem(STORAGE_KEYS.MONTH_SCHEDULE) || localStorage.getItem(STORAGE_KEYS.TWO_WEEK_SCHEDULE);
      if (rawMonth) {
        const month = JSON.parse(rawMonth);
        const wIdx = Math.min(Math.max(1, viewWeek), 4) - 1;
        scheduleResult = month.weeks?.[wIdx] || (viewWeek === 2 ? month.week2 : month.week1);
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
        if (raw) scheduleResult = JSON.parse(raw);
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
          <h3 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.35rem;">Ban Điều Hành Đang Thu Thập Đăng Ký</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted);">
            Vui lòng điền thông tin và chọn ca rảnh ở trên. Lịch trực chính thức sẽ được Admin công bố tại đây!
          </p>
        </div>
      `;
      if (elements.scheduleStatusBanner) {
        elements.scheduleStatusBanner.innerHTML = `<span class="badge" style="background: var(--warning-bg); color: var(--warning); border: 1px solid #fde68a;">Đang chờ xếp lịch</span>`;
      }
      return;
    }

    if (elements.scheduleStatusBanner) {
      elements.scheduleStatusBanner.innerHTML = `<span class="badge" style="background: var(--success-bg); color: var(--success); border: 1px solid #a7f3d0;">✓ Lịch trực Tuần ${viewWeek} đã công bố</span>`;
    }

    if (elements.scheduleUpdateTime && scheduleResult.timestamp) {
      const timeStr = new Date(scheduleResult.timestamp).toLocaleString('vi-VN');
      elements.scheduleUpdateTime.textContent = `Lịch Tuần ${viewWeek} (Cập nhật: ${timeStr})`;
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

  function renderReadOnlyShiftSlot(shiftId, slot) {
    if (!slot) {
      return `<div class="grid-cell shift-duty-slot"><div class="empty-state">Trống</div></div>`;
    }

    const oldMem = slot.oldMember;
    const newMem = slot.newMember;

    const oldCard = oldMem ? `
      <div class="duty-member-card role-old" style="cursor: default;" title="Người Cũ phụ trách">
        <div class="member-info">
          <span class="member-role-tag">🎓 Người Cũ</span>
          <span class="member-name">${oldMem.fullName}</span>
          <span class="member-mssv">MSSV: ${oldMem.studentId}</span>
        </div>
      </div>
    ` : `
      <div class="duty-member-card empty-member">
        <span>Đang xếp...</span>
      </div>
    `;

    const newCard = newMem ? `
      <div class="duty-member-card role-new" style="cursor: default;" title="Người Mới tập sự">
        <div class="member-info">
          <span class="member-role-tag">🌱 Người Mới</span>
          <span class="member-name">${newMem.fullName}</span>
          <span class="member-mssv">MSSV: ${newMem.studentId}</span>
        </div>
      </div>
    ` : `
      <div class="duty-member-card empty-member">
        <span>Đang xếp...</span>
      </div>
    `;

    return `
      <div class="grid-cell shift-duty-slot">
        <div class="shift-slot-header">
          <span>${slot.shiftInfo?.dayName || ''}</span>
          <span class="shift-status-pill ${slot.status === 'full' ? 'full' : 'warning'}">
            ${slot.status === 'full' ? '✓ Đủ 2 bạn' : 'Đang bố trí'}
          </span>
        </div>
        ${oldCard}
        ${newCard}
      </div>
    `;
  }

  /**
   * Tra cứu ca trực cá nhân (Tìm trong cả Tuần 1 và Tuần 2)
   */
  function handleLookupMySchedule() {
    const mssv = elements.inputLookupMssv ? elements.inputLookupMssv.value.trim().toLowerCase() : '';
    if (!mssv) {
      showToast('Vui lòng nhập MSSV để tra cứu!', 'warning');
      elements.inputLookupMssv?.focus();
      return;
    }

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

    if (weekTables.length === 0 || weekTables.every(t => !t || Object.keys(t).length === 0)) {
      elements.lookupResult.innerHTML = `
        <div style="padding: 1rem; background: var(--warning-bg); border: 1px solid #fde68a; border-radius: var(--radius-sm); font-size: 0.88rem; color: #92400e;">
          ⚠️ Ban điều hành chưa công bố lịch trực. Bạn vui lòng quay lại sau nhé!
        </div>
      `;
      elements.lookupResult.style.display = 'block';
      return;
    }

    const myShifts = [];

    function findInTable(table, weekNum) {
      if (!table) return;
      Object.values(table).forEach(slot => {
        const isOld = slot.oldMember?.studentId?.toLowerCase() === mssv;
        const isNew = slot.newMember?.studentId?.toLowerCase() === mssv;
        if (isOld || isNew) {
          const partner = isOld ? slot.newMember : slot.oldMember;
          myShifts.push({
            weekNum,
            shift: slot.shiftInfo,
            myRole: isOld ? 'Người Cũ (Kinh nghiệm)' : 'Người Mới (Tập sự)',
            partner: partner ? `${partner.fullName} (${partner.studentId})` : 'Chưa có bạn trực cùng'
          });
        }
      });
    }

    weekTables.forEach((table, idx) => {
      findInTable(table, idx + 1);
    });

    if (myShifts.length === 0) {
      elements.lookupResult.innerHTML = `
        <div style="padding: 1rem; background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.88rem; color: var(--text-muted);">
          ℹ️ Không tìm thấy lịch trực của MSSV <strong>${escapeHtml(elements.inputLookupMssv.value)}</strong> trong tháng này.
        </div>
      `;
    } else {
      elements.lookupResult.innerHTML = `
        <div style="padding: 1rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-sm);">
          <h4 style="color: #065f46; font-weight: 700; margin-bottom: 0.5rem;">
            🎉 Bạn có tổng cộng <strong>${myShifts.length} ca trực trong tháng</strong>:
          </h4>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            ${myShifts.map(s => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #d1fae5; font-size: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
                <div>
                  <span class="badge" style="background: #e0e7ff; color: #4338ca; margin-right: 0.3rem;">Tuần ${s.weekNum}</span>
                  <strong style="color: var(--primary);">${escapeHtml(s.shift.dayName)}</strong> (${escapeHtml(s.shift.period)}: ${escapeHtml(s.shift.time)})
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  Trực cùng: <strong style="color: var(--text-main);">${escapeHtml(s.partner)}</strong>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    elements.lookupResult.style.display = 'block';
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

  // Quản lý Chế độ Sáng / Tối (Dark / Light Theme Switcher)
  function initThemeToggle() {
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');
    const legacyBtn = document.getElementById('btn-theme-toggle');

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
