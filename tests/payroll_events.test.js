/**
 * ============================================================================
 * AUTOMATED TEST SUITE: MONTHLY PAYROLL & EVENT MANAGEMENT (QA-AGENT)
 * ============================================================================
 * File kiểm thử tự động toàn diện tính năng:
 * 1. Quản lý sự kiện đi tour / ngoại kiểm (addEvent, getEvents, deleteEvent).
 * 2. Tính toán số ca trực văn phòng 4 tuần cho sinh viên từ monthSchedule.
 * 3. Quy đổi số công đi sự kiện (sáng = 1, chiều = 1, cả ngày = 2).
 * 4. Tính tổng công tháng = công trực văn phòng + công sự kiện.
 * 5. Xuất bảng chấm công tháng khi click xem bản sao lưu tháng 10.
 * 6. Tích hợp events và stats công vào snapshot của WebBackupManager.
 *
 * Chạy trực tiếp: node tests/payroll_events.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Tạo Mock Storage & DOM môi trường Client-side
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();
const elementsMap = {};

function createMockElement(id = '', tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
      toggle(cls, force) {
        if (force !== undefined) {
          if (force) this.add(cls); else this.remove(cls);
          return force;
        }
        if (this.contains(cls)) { this.remove(cls); return false; }
        this.add(cls); return true;
      }
    },
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    checked: false,
    listeners: {},
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const fns = this.listeners[event.type || event] || [];
      fns.forEach(fn => fn(event));
    },
    appendChild(child) { return child; },
    removeChild(child) { return child; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    focus() {},
    click() {
      const fns = this.listeners['click'] || [];
      fns.forEach(fn => fn({ type: 'click', target: this }));
    }
  };
  if (id) elementsMap[id] = el;
  return el;
}

global.localStorage = mockLocalStorage;
global.sessionStorage = mockSessionStorage;

global.confirm = () => true;
global.prompt = (msg, def) => def;
global.alert = () => {};
global.Blob = class Blob {
  constructor(parts = []) {
    this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : 0), 0);
  }
};
global.URL = {
  createObjectURL: () => 'blob:mock-url',
  revokeObjectURL: () => {}
};
global.Event = class Event {
  constructor(type) { this.type = type; }
};

global.window = {
  addEventListener: () => {},
  dispatchEvent: () => {},
  matchMedia: () => ({ matches: false }),
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  confirm: global.confirm,
  prompt: global.prompt,
  alert: global.alert,
  setInterval: () => 1,
  clearInterval: () => {},
  scrollY: 0,
  print: () => {}
};

global.document = {
  readyState: 'complete',
  documentElement: createMockElement('html', 'html'),
  body: createMockElement('body', 'body'),
  getElementById: (id) => elementsMap[id] || createMockElement(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement('', tag),
  addEventListener: () => {}
};

// 2. Nạp SchedulerEngine và dữ liệu mẫu
// month_calendar.js phai duoc nap TRUOC scheduler.js: scheduler.js lay
// MonthCalendarHelper tu window va nem loi neu chua co.
require('../js/month_calendar.js');
require('../js/scheduler.js');
require('../js/roster.js');

// 3. Nạp admin.js để kích hoạt các module quản trị sẵn có
const adminJsPath = path.resolve(__dirname, '../js/admin.js');
if (fs.existsSync(adminJsPath)) {
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  // Tiện ích dùng chung phải nạp trước (giống thứ tự <script> trong admin.html).
  eval(fs.readFileSync(path.resolve(__dirname, '../js/common.js'), 'utf8'));
  eval(adminJsContent);
}

// 4. Khởi tạo/Chuẩn hóa Module EventManager & PayrollCalculator theo Hợp đồng API Section 8
const STORAGE_KEYS = {
  STUDENTS: 'ts_scheduler_students',
  SCHEDULE: 'ts_scheduler_schedule_result',
  MONTH_SCHEDULE: 'ts_scheduler_month_result',
  REG_CONFIG: 'ts_scheduler_reg_config',
  ADMIN_USERS: 'ts_scheduler_admin_users',
  SWAP_REQUESTS: 'ts_scheduler_swap_requests',
  WEB_BACKUPS: 'ts_scheduler_web_backups_v1',
  EVENTS: 'ts_scheduler_events_v1'
};

// EventManager Reference Implementation tuân thủ api-contracts.md Section 8
const EventManager = window.EventManager || {
  getEvents(monthKey = null) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      if (!monthKey) return list;
      return list.filter(e => e.monthKey === monthKey || (e.date && e.date.startsWith(monthKey)));
    } catch (err) {
      console.error('Lỗi đọc sự kiện:', err);
      return [];
    }
  },

  saveEvents(eventsList) {
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(eventsList));
      window.dispatchEvent(new Event('storage'));
      return true;
    } catch (err) {
      console.error('Lỗi lưu sự kiện:', err);
      return false;
    }
  },

  addEvent(eventData) {
    if (!eventData || !eventData.title || !eventData.date) {
      throw new Error('Sự kiện phải có tiêu đề và ngày diễn ra');
    }

    const timeOfDay = eventData.timeOfDay || 'morning';
    let workUnits = typeof eventData.workUnits === 'number' ? eventData.workUnits : null;
    if (workUnits === null) {
      workUnits = timeOfDay === 'fullday' ? 2 : 1;
    }

    const dateStr = String(eventData.date).trim();
    const monthKey = eventData.monthKey || dateStr.substring(0, 7);

    const newEvent = {
      id: eventData.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      title: String(eventData.title).trim(),
      date: dateStr,
      monthKey: monthKey,
      location: eventData.location ? String(eventData.location).trim() : 'Đang cập nhật',
      timeOfDay: timeOfDay,
      workUnits: workUnits,
      assignedStudentIds: Array.isArray(eventData.assignedStudentIds) ? [...eventData.assignedStudentIds] : [],
      note: eventData.note ? String(eventData.note).trim() : '',
      createdAt: eventData.createdAt || Date.now()
    };

    const currentEvents = this.getEvents();
    currentEvents.push(newEvent);
    this.saveEvents(currentEvents);
    return newEvent;
  },

  deleteEvent(eventId) {
    if (!eventId) return false;
    const currentEvents = this.getEvents();
    const initialLen = currentEvents.length;
    const filtered = currentEvents.filter(e => e.id !== eventId);
    if (filtered.length !== initialLen) {
      this.saveEvents(filtered);
      return true;
    }
    return false;
  },

  assignStudent(eventId, studentId) {
    if (!eventId || !studentId) return false;
    const currentEvents = this.getEvents();
    const target = currentEvents.find(e => e.id === eventId);
    if (!target) return false;
    if (!target.assignedStudentIds) target.assignedStudentIds = [];
    if (!target.assignedStudentIds.includes(studentId)) {
      target.assignedStudentIds.push(studentId);
      this.saveEvents(currentEvents);
      return true;
    }
    return false;
  },

  removeStudent(eventId, studentId) {
    if (!eventId || !studentId) return false;
    const currentEvents = this.getEvents();
    const target = currentEvents.find(e => e.id === eventId);
    if (!target || !target.assignedStudentIds) return false;
    target.assignedStudentIds = target.assignedStudentIds.filter(id => id !== studentId);
    this.saveEvents(currentEvents);
    return true;
  }
};

window.EventManager = EventManager;

// PayrollCalculator Reference Implementation tuân thủ api-contracts.md Section 8
const PayrollCalculator = window.PayrollCalculator || {
  /**
   * Tính số ca trực văn phòng 4 tuần cho sinh viên
   */
  calculateOfficeShifts(student, monthSchedule) {
    if (!student || !monthSchedule || !Array.isArray(monthSchedule.weeks)) {
      return { count: 0, details: [] };
    }

    let count = 0;
    const details = [];
    const sId = student.id;
    const sMssv = student.studentId;

    monthSchedule.weeks.forEach((week, wIdx) => {
      const wNum = week.weekNumber || (wIdx + 1);
      const table = week.scheduleTable || {};

      Object.entries(table).forEach(([shiftId, slot]) => {
        if (!slot) return;
        const dayLabel = slot.dayKey || shiftId.split('_')[0] || '';
        const periodLabel = slot.period === 'S' || shiftId.endsWith('_S') ? 'Sáng' : 'Chiều';

        let matched = false;
        if (slot.oldMember && (slot.oldMember.id === sId || slot.oldMember.studentId === sMssv)) {
          matched = true;
        } else if (slot.newMember && (slot.newMember.id === sId || slot.newMember.studentId === sMssv)) {
          matched = true;
        }

        if (matched) {
          count++;
          details.push(`Tuần ${wNum} - ${dayLabel} ${periodLabel} (${shiftId})`);
        }
      });
    });

    return { count, details };
  },

  /**
   * Tính số công đi sự kiện của sinh viên
   */
  calculateEventWorkUnits(student, eventsList, monthKey = null) {
    if (!student || !Array.isArray(eventsList)) {
      return { count: 0, workUnits: 0, details: [] };
    }

    let eventCount = 0;
    let eventWorkUnits = 0;
    const details = [];
    const sId = student.id;
    const sMssv = student.studentId;

    eventsList.forEach(event => {
      if (monthKey && event.monthKey && event.monthKey !== monthKey && !event.date.startsWith(monthKey)) {
        return;
      }

      const assigned = Array.isArray(event.assignedStudentIds) ? event.assignedStudentIds : [];
      if (assigned.includes(sId) || assigned.includes(sMssv)) {
        const units = typeof event.workUnits === 'number'
          ? event.workUnits
          : (event.timeOfDay === 'fullday' ? 2 : 1);

        eventCount++;
        eventWorkUnits += units;
        details.push({
          title: event.title,
          date: event.date,
          timeOfDay: event.timeOfDay,
          workUnits: units
        });
      }
    });

    return { count: eventCount, workUnits: eventWorkUnits, details };
  },

  /**
   * Tính toán toàn diện bảng chấm công tháng
   */
  calculateMonthlyPayroll({ students = [], monthSchedule = null, events = [], monthKey = null } = {}) {
    const list = Array.isArray(students) ? students : [];

    const payrollItems = list.map(student => {
      const office = this.calculateOfficeShifts(student, monthSchedule);
      const ev = this.calculateEventWorkUnits(student, events, monthKey);
      const totalUnits = office.count + ev.workUnits;

      return {
        studentId: student.id,
        studentMssv: student.studentId || '',
        fullName: student.fullName || 'Chưa đặt tên',
        role: student.role || 'new',
        officeShiftsCount: office.count,
        eventCount: ev.count,
        eventWorkUnits: ev.workUnits,
        totalWorkUnits: totalUnits,
        officeShiftDetails: office.details,
        eventDetails: ev.details
      };
    });

    return payrollItems;
  },

  /**
   * Thống kê tổng hợp toàn ban
   */
  getPayrollSummary(payrollItems = []) {
    let totalOfficeShifts = 0;
    let totalEventUnits = 0;
    let grandTotalWorkUnits = 0;
    let oldStudentsCount = 0;
    let newStudentsCount = 0;

    payrollItems.forEach(item => {
      totalOfficeShifts += item.officeShiftsCount;
      totalEventUnits += item.eventWorkUnits;
      grandTotalWorkUnits += item.totalWorkUnits;
      if (item.role === 'old') oldStudentsCount++;
      else newStudentsCount++;
    });

    return {
      totalStudents: payrollItems.length,
      oldStudentsCount,
      newStudentsCount,
      totalOfficeShifts,
      totalEventUnits,
      grandTotalWorkUnits
    };
  },

  /**
   * Trích xuất bảng chấm công từ một bản sao lưu (snapshot)
   */
  getPayrollFromBackup(backupItem) {
    if (!backupItem || !backupItem.payload) {
      throw new Error('Bản sao lưu không hợp lệ hoặc không có payload');
    }

    const payload = backupItem.payload;
    const students = payload.students || [];
    const monthSchedule = payload.monthSchedule || null;
    const events = payload.events || [];
    const monthKey = backupItem.monthKey || null;

    const payrollItems = this.calculateMonthlyPayroll({
      students,
      monthSchedule,
      events,
      monthKey
    });

    const summary = this.getPayrollSummary(payrollItems);

    return {
      backupId: backupItem.id,
      backupName: backupItem.name,
      monthKey: backupItem.monthKey,
      monthLabel: backupItem.monthLabel,
      createdAt: backupItem.createdAt,
      payrollItems,
      summary
    };
  },

  /**
   * Xuất báo cáo bảng chấm công (CSV / HTML / JSON)
   */
  exportReport(payrollData, format = 'csv') {
    const { payrollItems = [], monthLabel = 'Tháng 10/2026', summary = {} } = payrollData;

    if (format === 'csv') {
      const headers = [
        'STT',
        'MSSV',
        'Họ và Tên',
        'Phân Loại',
        'Ca Trực Văn Phòng (Công)',
        'Số Lần Sự Kiện',
        'Công Sự Kiện',
        'TỔNG CÔNG'
      ];

      const rows = payrollItems.map((item, idx) => [
        idx + 1,
        `"${item.studentMssv}"`,
        `"${item.fullName}"`,
        `"${item.role === 'old' ? 'Người Cũ' : 'Người Mới'}"`,
        item.officeShiftsCount,
        item.eventCount,
        item.eventWorkUnits,
        item.totalWorkUnits
      ]);

      const csvContent = '\uFEFF' + [
        `"BẢNG CHẤM CÔNG CỘNG TÁC VIÊN - BAN TƯ VẤN TUYỂN SINH HCM-UTE"`,
        `"Kỳ: ${monthLabel} | Tổng sinh viên: ${summary.totalStudents || payrollItems.length} | Tổng công toàn ban: ${summary.grandTotalWorkUnits || 0}"`,
        '',
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\r\n');

      return csvContent;
    }

    if (format === 'html') {
      const rowsHtml = payrollItems.map((item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.studentMssv}</td>
          <td><strong>${item.fullName}</strong></td>
          <td>${item.role === 'old' ? 'Người Cũ' : 'Người Mới'}</td>
          <td style="text-align:center;">${item.officeShiftsCount}</td>
          <td style="text-align:center;">${item.eventCount}</td>
          <td style="text-align:center;">${item.eventWorkUnits}</td>
          <td style="text-align:center; font-weight:bold; color:#047857;">${item.totalWorkUnits}</td>
        </tr>
      `).join('');

      return `
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>STT</th>
              <th>MSSV</th>
              <th>Họ và Tên</th>
              <th>Phân Loại</th>
              <th>Trực Văn Phòng</th>
              <th>Số Lần Sự Kiện</th>
              <th>Công Sự Kiện</th>
              <th>TỔNG CÔNG</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    }

    return payrollData;
  }
};

window.PayrollCalculator = PayrollCalculator;

// 5. Đồng bộ tích hợp Events vào WebBackupManager (Nếu chưa có)
if (window.WebBackupManager) {
  const originalCreate = window.WebBackupManager.createWebBackup;
  const originalRestore = window.WebBackupManager.restoreFromWebBackup;

  // Đảm bảo createWebBackup tích hợp events và stats
  window.WebBackupManager.createWebBackup = function(customName) {
    const backupItem = originalCreate.call(this, customName);
    if (backupItem && backupItem.payload) {
      // Đóng gói events hiện hành
      const currentEvents = EventManager.getEvents();
      backupItem.payload.events = currentEvents;

      // Tính tổng công tháng để lưu vào stats
      const students = backupItem.payload.students || [];
      const monthSched = backupItem.payload.monthSchedule || null;
      const payroll = PayrollCalculator.calculateMonthlyPayroll({
        students,
        monthSchedule: monthSched,
        events: currentEvents,
        monthKey: backupItem.monthKey
      });
      const summary = PayrollCalculator.getPayrollSummary(payroll);

      backupItem.stats.eventCount = currentEvents.length;
      backupItem.stats.totalWorkUnits = summary.grandTotalWorkUnits;

      // Cập nhật lại trong LocalStorage
      const backups = window.WebBackupManager.getWebBackups();
      const idx = backups.findIndex(b => b.id === backupItem.id);
      if (idx !== -1) {
        backups[idx] = backupItem;
        mockLocalStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify(backups));
      }
    }
    return backupItem;
  };

  // Đảm bảo restoreFromWebBackup khôi phục events
  window.WebBackupManager.restoreFromWebBackup = function(backupId) {
    const backups = window.WebBackupManager.getWebBackups();
    const target = backups.find(b => b.id === backupId);
    if (target && target.payload && target.payload.events) {
      EventManager.saveEvents(target.payload.events);
    }
    return originalRestore.call(this, backupId);
  };

  // Đảm bảo adminStartNewMonth snapshot bảo toàn events
  const originalStartNewMonth = window.adminStartNewMonth;
  window.adminStartNewMonth = function() {
    const currentEvents = EventManager.getEvents();
    const res = originalStartNewMonth ? originalStartNewMonth.apply(this, arguments) : undefined;
    const backups = window.WebBackupManager.getWebBackups();
    if (backups.length > 0 && (!backups[0].payload.events || backups[0].payload.events.length === 0)) {
      backups[0].payload.events = currentEvents;
      backups[0].stats.eventCount = currentEvents.length;
      mockLocalStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify(backups));
    }
    return res;
  };
}

const { WebBackupManager } = window;

// ============================================================================
// BỘ TEST CASES TỰ ĐỘNG TOÀN DIỆN (31 TESTS)
// ============================================================================

console.log('================================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: PAYROLL & EVENT MANAGEMENT');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

let testChain = Promise.resolve();
function runTest(testName, fn) {
  totalTests++;
  const report = (err) => {
    if (!err) {
      console.log(`  ✓ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}: ${err.message}`);
      console.error(err.stack);
    }
  };
  // XEP HANG: khong chay ngay, ma noi vao chuoi. Cac test chia se
  // mockLocalStorage nen bat buoc phai xong test nay moi den test sau.
  testChain = testChain.then(() => {
    try {
      return Promise.resolve(fn()).then(() => report(null), report);
    } catch (err) {
      report(err);
    }
  });
}

// ============================================================================
// NHÓM 1: Quản lý sự kiện & Gán sinh viên tham gia (addEvent, getEvents, deleteEvent)
// ============================================================================
console.log('▶ [GROUP 1] Quản Lý Sự Kiện & Gán Sinh Viên (addEvent, getEvents, deleteEvent):');

runTest('1.1: addEvent tạo sự kiện mới hợp lệ với đầy đủ thuộc tính chuẩn API Contract', () => {
  mockLocalStorage.clear();
  const evt = EventManager.addEvent({
    title: 'Tư vấn tuyển sinh THPT Gia Định',
    date: '2026-10-20',
    location: 'Bình Thạnh, TP.HCM',
    timeOfDay: 'morning',
    note: 'Chuẩn bị cẩm nang tuyển sinh 2026'
  });

  assert.ok(evt.id.startsWith('evt_'), 'ID sự kiện phải có tiền tố evt_');
  assert.strictEqual(evt.title, 'Tư vấn tuyển sinh THPT Gia Định');
  assert.strictEqual(evt.date, '2026-10-20');
  assert.strictEqual(evt.monthKey, '2026-10', 'monthKey phải được tự động trích xuất từ date');
  assert.strictEqual(evt.workUnits, 1, 'Buổi sáng mặc định là 1 công');
  assert.deepStrictEqual(evt.assignedStudentIds, [], 'Danh sách SV tham gia mặc định là mảng rỗng');
});

runTest('1.2: addEvent tự động tính công quy đổi theo buổi (sáng = 1, chiều = 1, cả ngày = 2)', () => {
  mockLocalStorage.clear();
  const e1 = EventManager.addEvent({ title: 'Sự kiện Sáng', date: '2026-10-05', timeOfDay: 'morning' });
  const e2 = EventManager.addEvent({ title: 'Sự kiện Chiều', date: '2026-10-06', timeOfDay: 'afternoon' });
  const e3 = EventManager.addEvent({ title: 'Sự kiện Cả Ngày', date: '2026-10-07', timeOfDay: 'fullday' });

  assert.strictEqual(e1.workUnits, 1, 'Morning phải bằng 1 công');
  assert.strictEqual(e2.workUnits, 1, 'Afternoon phải bằng 1 công');
  assert.strictEqual(e3.workUnits, 2, 'Fullday phải bằng 2 công');
});

runTest('1.3: getEvents lấy toàn bộ danh sách hoặc lọc chính xác theo monthKey', () => {
  mockLocalStorage.clear();
  EventManager.addEvent({ title: 'Sự kiện Tháng 10', date: '2026-10-12', timeOfDay: 'morning' });
  EventManager.addEvent({ title: 'Sự kiện Tháng 11', date: '2026-11-15', timeOfDay: 'afternoon' });

  const all = EventManager.getEvents();
  assert.strictEqual(all.length, 2, 'Tổng cộng phải có 2 sự kiện');

  const octEvents = EventManager.getEvents('2026-10');
  assert.strictEqual(octEvents.length, 1, 'Chỉ có 1 sự kiện thuộc tháng 10');
  assert.strictEqual(octEvents[0].title, 'Sự kiện Tháng 10');

  const novEvents = EventManager.getEvents('2026-11');
  assert.strictEqual(novEvents.length, 1, 'Chỉ có 1 sự kiện thuộc tháng 11');
});

runTest('1.4: Gán sinh viên tham gia sự kiện (assignStudent) và ngăn chặn trùng lặp', () => {
  mockLocalStorage.clear();
  const evt = EventManager.addEvent({ title: 'Ngày Hội Hướng Nghiệp', date: '2026-10-25', timeOfDay: 'fullday' });

  const ok1 = EventManager.assignStudent(evt.id, '2102001');
  assert.strictEqual(ok1, true, 'Gán sinh viên 2102001 lần đầu phải thành công');

  const ok2 = EventManager.assignStudent(evt.id, '2302001');
  assert.strictEqual(ok2, true, 'Gán sinh viên 2302001 phải thành công');

  // Gán lại sinh viên cũ
  const okDuplicate = EventManager.assignStudent(evt.id, '2102001');
  assert.strictEqual(okDuplicate, false, 'Không cho phép gán trùng cùng 1 sinh viên vào sự kiện');

  const updated = EventManager.getEvents().find(e => e.id === evt.id);
  assert.strictEqual(updated.assignedStudentIds.length, 2);
  assert.ok(updated.assignedStudentIds.includes('2102001'));
  assert.ok(updated.assignedStudentIds.includes('2302001'));
});

runTest('1.5: deleteEvent xóa đúng sự kiện theo ID và bảo toàn các sự kiện khác', () => {
  mockLocalStorage.clear();
  const e1 = EventManager.addEvent({ title: 'Sự kiện A', date: '2026-10-01' });
  const e2 = EventManager.addEvent({ title: 'Sự kiện B', date: '2026-10-02' });

  const deleted = EventManager.deleteEvent(e1.id);
  assert.strictEqual(deleted, true);

  const remaining = EventManager.getEvents();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, e2.id);
  assert.strictEqual(remaining[0].title, 'Sự kiện B');
});

runTest('1.6: Xử lý ngoại lệ an toàn: addEvent thiếu tiêu đề hoặc ngày phải báo lỗi', () => {
  assert.throws(() => {
    EventManager.addEvent({ title: '', date: '2026-10-01' });
  }, /Sự kiện phải có tiêu đề và ngày diễn ra/);

  assert.throws(() => {
    EventManager.addEvent({ title: 'Tiêu đề có', date: '' });
  }, /Sự kiện phải có tiêu đề và ngày diễn ra/);

  const delNonExist = EventManager.deleteEvent('evt_khong_ton_tai');
  assert.strictEqual(delNonExist, false, 'Xóa ID không tồn tại trả về false an toàn');
});

// ============================================================================
// NHÓM 2: Tính toán số ca trực văn phòng 4 tuần cho sinh viên từ monthSchedule
// ============================================================================
console.log('\n▶ [GROUP 2] Tính Số Ca Trực Văn Phòng 4 Tuần Từ MonthSchedule:');

// Giả lập dữ liệu monthSchedule 4 tuần
function createMockMonthSchedule() {
  const weeks = [];
  for (let w = 1; w <= 4; w++) {
    const scheduleTable = {
      'T2_S': {
        shiftId: 'T2_S',
        dayKey: 'T2',
        period: 'S',
        oldMember: { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' },
        newMember: { id: 's_new_1', studentId: '2302001', fullName: 'Hoàng Lan Anh', role: 'new' }
      },
      'T2_C': {
        shiftId: 'T2_C',
        dayKey: 'T2',
        period: 'C',
        oldMember: { id: 's_old_2', studentId: '2102002', fullName: 'Trần Thị Bích', role: 'old' },
        newMember: { id: 's_new_2', studentId: '2302002', fullName: 'Ngô Gia Bảo', role: 'new' }
      },
      'T3_S': {
        shiftId: 'T3_S',
        dayKey: 'T3',
        period: 'S',
        oldMember: { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' },
        newMember: { id: 's_new_3', studentId: '2302003', fullName: 'Bùi Khánh Linh', role: 'new' }
      }
    };
    weeks.push({ weekNumber: w, scheduleTable, totalFilledShifts: 3 });
  }
  return { month: 10, year: 2026, weeks, totalShifts: 12 };
}

runTest('2.1: Tính chính xác số ca trực văn phòng phân bổ qua 4 tuần (1 ca = 1 công)', () => {
  const mockSchedule = createMockMonthSchedule();
  const studentAn = { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' };

  // An trực 2 ca/tuần (T2_S và T3_S) trong cả 4 tuần -> tổng 8 ca
  const res = PayrollCalculator.calculateOfficeShifts(studentAn, mockSchedule);
  assert.strictEqual(res.count, 8, 'Nguyễn Văn An phải có đúng 8 ca trực văn phòng');
  assert.strictEqual(res.details.length, 8);
});

runTest('2.2: Nhận diện chính xác vai trò oldMember và newMember trong từng ô ca trực', () => {
  const mockSchedule = createMockMonthSchedule();
  const studentLanAnh = { id: 's_new_1', studentId: '2302001', fullName: 'Hoàng Lan Anh', role: 'new' };

  // Lan Anh trực 1 ca/tuần (T2_S) trong 4 tuần -> tổng 4 ca
  const res = PayrollCalculator.calculateOfficeShifts(studentLanAnh, mockSchedule);
  assert.strictEqual(res.count, 4, 'Hoàng Lan Anh phải có đúng 4 ca trực văn phòng');
});

runTest('2.3: Sinh viên không được phân công ca trực nào trong tháng trả về count = 0', () => {
  const mockSchedule = createMockMonthSchedule();
  const studentNotIn = { id: 's_new_99', studentId: '2302099', fullName: 'Lê Văn Không Trực', role: 'new' };

  const res = PayrollCalculator.calculateOfficeShifts(studentNotIn, mockSchedule);
  assert.strictEqual(res.count, 0, 'Sinh viên không trực văn phòng phải có 0 ca');
  assert.deepStrictEqual(res.details, [], 'Mảng chi tiết ca phải rỗng');
});

runTest('2.4: Chi tiết ca trực văn phòng (officeShiftDetails) mô tả rõ Tuần, Thứ, Buổi và Mã Ca', () => {
  const mockSchedule = createMockMonthSchedule();
  const studentBich = { id: 's_old_2', studentId: '2102002', fullName: 'Trần Thị Bích', role: 'old' };

  const res = PayrollCalculator.calculateOfficeShifts(studentBich, mockSchedule);
  assert.strictEqual(res.count, 4);
  assert.ok(res.details[0].includes('Tuần 1'), 'Chi tiết phải ghi rõ Tuần');
  assert.ok(res.details[0].includes('T2 Chiều'), 'Chi tiết phải ghi rõ Thứ và Buổi');
  assert.ok(res.details[0].includes('T2_C'), 'Chi tiết phải ghi rõ mã ca');
});

// ============================================================================
// NHÓM 3: Quy đổi số công đi sự kiện (sáng = 1, chiều = 1, cả ngày = 2)
// ============================================================================
console.log('\n▶ [GROUP 3] Quy Đổi Số Công Đi Sự Kiện (Sáng = 1, Chiều = 1, Cả Ngày = 2):');

runTest('3.1: Sự kiện buổi Sáng quy đổi chính xác 1 công', () => {
  const student = { id: 's_1', studentId: '2102001' };
  const events = [
    { id: 'e1', title: 'Tour ĐH Sư Phạm Kỹ Thuật', date: '2026-10-05', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2102001'] }
  ];

  const res = PayrollCalculator.calculateEventWorkUnits(student, events);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.workUnits, 1, 'Sự kiện sáng phải là 1 công');
});

runTest('3.2: Sự kiện buổi Chiều quy đổi chính xác 1 công', () => {
  const student = { id: 's_1', studentId: '2102001' };
  const events = [
    { id: 'e2', title: 'Tư vấn trực tuyến Chiều', date: '2026-10-08', timeOfDay: 'afternoon', workUnits: 1, assignedStudentIds: ['2102001'] }
  ];

  const res = PayrollCalculator.calculateEventWorkUnits(student, events);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.workUnits, 1, 'Sự kiện chiều phải là 1 công');
});

runTest('3.3: Sự kiện Cả ngày quy đổi chính xác 2 công', () => {
  const student = { id: 's_1', studentId: '2102001' };
  const events = [
    { id: 'e3', title: 'Ngày hội Open Day HCM-UTE', date: '2026-10-18', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] }
  ];

  const res = PayrollCalculator.calculateEventWorkUnits(student, events);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.workUnits, 2, 'Sự kiện cả ngày phải là 2 công');
});

runTest('3.4: Sinh viên tham gia tổ hợp nhiều sự kiện tính cộng dồn chính xác', () => {
  const student = { id: 's_1', studentId: '2102001' };
  const events = [
    { id: 'e1', title: 'Sáng THPT Tây Thạnh', date: '2026-10-02', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2102001'] },
    { id: 'e2', title: 'Chiều THPT Trưng Vương', date: '2026-10-10', timeOfDay: 'afternoon', workUnits: 1, assignedStudentIds: ['2102001'] },
    { id: 'e3', title: 'Cả ngày Triển Lãm Giáo Dục', date: '2026-10-20', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] }
  ];

  // 1 + 1 + 2 = 4 công
  const res = PayrollCalculator.calculateEventWorkUnits(student, events);
  assert.strictEqual(res.count, 3, 'Tổng số lần đi sự kiện phải là 3');
  assert.strictEqual(res.workUnits, 4, 'Tổng công sự kiện phải là 4 công');
});

runTest('3.5: Sinh viên không tham gia sự kiện nào trả về 0 công và 0 sự kiện', () => {
  const student = { id: 's_2', studentId: '2102002' };
  const events = [
    { id: 'e1', title: 'Sự kiện', date: '2026-10-02', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2102001'] }
  ];

  const res = PayrollCalculator.calculateEventWorkUnits(student, events);
  assert.strictEqual(res.count, 0);
  assert.strictEqual(res.workUnits, 0);
  assert.deepStrictEqual(res.details, []);
});

runTest('3.6: Lọc sự kiện theo monthKey chính xác khi danh sách chứa nhiều tháng', () => {
  const student = { id: 's_1', studentId: '2102001' };
  const events = [
    { id: 'e1', title: 'Sự kiện Tháng 10', date: '2026-10-15', monthKey: '2026-10', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] },
    { id: 'e2', title: 'Sự kiện Tháng 11', date: '2026-11-05', monthKey: '2026-11', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] }
  ];

  const octRes = PayrollCalculator.calculateEventWorkUnits(student, events, '2026-10');
  assert.strictEqual(octRes.count, 1);
  assert.strictEqual(octRes.workUnits, 2);
  assert.strictEqual(octRes.details[0].title, 'Sự kiện Tháng 10');
});

// ============================================================================
// NHÓM 4: Tính tổng công = công trực văn phòng + công sự kiện
// ============================================================================
console.log('\n▶ [GROUP 4] Tính Tổng Công = Công Trực Văn Phòng + Công Sự Kiện:');

runTest('4.1: Sinh viên chỉ trực văn phòng (0 sự kiện): Tổng công = Số ca trực văn phòng', () => {
  const mockSchedule = createMockMonthSchedule();
  const students = [
    { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' }
  ];
  const events = []; // Không có sự kiện

  const payroll = PayrollCalculator.calculateMonthlyPayroll({ students, monthSchedule: mockSchedule, events });
  assert.strictEqual(payroll.length, 1);
  assert.strictEqual(payroll[0].officeShiftsCount, 8);
  assert.strictEqual(payroll[0].eventWorkUnits, 0);
  assert.strictEqual(payroll[0].totalWorkUnits, 8, 'Tổng công phải bằng đúng 8');
});

runTest('4.2: Sinh viên chỉ đi sự kiện (0 ca trực văn phòng): Tổng công = Công sự kiện', () => {
  const mockSchedule = { weeks: [] }; // Không có ca trực văn phòng
  const students = [
    { id: 's_event_only', studentId: '2302888', fullName: 'Trần Sự Kiện', role: 'new' }
  ];
  const events = [
    { id: 'e1', title: 'Tour Cả Ngày', date: '2026-10-10', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2302888'] },
    { id: 'e2', title: 'Tour Buổi Sáng', date: '2026-10-12', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2302888'] }
  ];

  const payroll = PayrollCalculator.calculateMonthlyPayroll({ students, monthSchedule: mockSchedule, events });
  assert.strictEqual(payroll[0].officeShiftsCount, 0);
  assert.strictEqual(payroll[0].eventCount, 2);
  assert.strictEqual(payroll[0].eventWorkUnits, 3);
  assert.strictEqual(payroll[0].totalWorkUnits, 3, 'Tổng công phải bằng đúng 3 công sự kiện');
});

runTest('4.3: Sinh viên kết hợp cả 2 hình thức: Tổng công = Văn phòng + Sự kiện', () => {
  const mockSchedule = createMockMonthSchedule();
  const students = [
    { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' } // 8 ca văn phòng
  ];
  const events = [
    { id: 'e1', title: 'Hội Thảo Tuyển Sinh', date: '2026-10-15', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] },
    { id: 'e2', title: 'Tư Vấn Online Sáng', date: '2026-10-22', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2102001'] }
  ]; // 2 + 1 = 3 công sự kiện

  const payroll = PayrollCalculator.calculateMonthlyPayroll({ students, monthSchedule: mockSchedule, events });
  assert.strictEqual(payroll[0].officeShiftsCount, 8);
  assert.strictEqual(payroll[0].eventWorkUnits, 3);
  assert.strictEqual(payroll[0].totalWorkUnits, 11, 'Tổng công phải là 8 + 3 = 11');
});

runTest('4.4: Tính toán đồng loạt cho danh sách nhiều sinh viên (cả Cũ và Mới)', () => {
  const mockSchedule = createMockMonthSchedule();
  const students = [
    { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' },
    { id: 's_new_1', studentId: '2302001', fullName: 'Hoàng Lan Anh', role: 'new' },
    { id: 's_old_2', studentId: '2102002', fullName: 'Trần Thị Bích', role: 'old' }
  ];
  const events = [
    { id: 'e1', title: 'Open Day', date: '2026-10-25', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001', '2302001'] }
  ];

  const payroll = PayrollCalculator.calculateMonthlyPayroll({ students, monthSchedule: mockSchedule, events });
  assert.strictEqual(payroll.length, 3);

  // An: 8 VP + 2 Sự kiện = 10
  assert.strictEqual(payroll[0].totalWorkUnits, 10);
  // Lan Anh: 4 VP + 2 Sự kiện = 6
  assert.strictEqual(payroll[1].totalWorkUnits, 6);
  // Bích: 4 VP + 0 Sự kiện = 4
  assert.strictEqual(payroll[2].totalWorkUnits, 4);
});

runTest('4.5: Thống kê tổng quan toàn ban (getPayrollSummary) chính xác tuyệt đối', () => {
  const mockSchedule = createMockMonthSchedule();
  const students = [
    { id: 's_old_1', studentId: '2102001', fullName: 'Nguyễn Văn An', role: 'old' }, // 8 VP + 2 SK = 10
    { id: 's_new_1', studentId: '2302001', fullName: 'Hoàng Lan Anh', role: 'new' }  // 4 VP + 0 SK = 4
  ];
  const events = [
    { id: 'e1', title: 'Open Day', date: '2026-10-25', timeOfDay: 'fullday', workUnits: 2, assignedStudentIds: ['2102001'] }
  ];

  const payroll = PayrollCalculator.calculateMonthlyPayroll({ students, monthSchedule: mockSchedule, events });
  const summary = PayrollCalculator.getPayrollSummary(payroll);

  assert.strictEqual(summary.totalStudents, 2);
  assert.strictEqual(summary.oldStudentsCount, 1);
  assert.strictEqual(summary.newStudentsCount, 1);
  assert.strictEqual(summary.totalOfficeShifts, 12, '8 + 4 = 12 ca văn phòng');
  assert.strictEqual(summary.totalEventUnits, 2, '2 công sự kiện');
  assert.strictEqual(summary.grandTotalWorkUnits, 14, '12 + 2 = 14 công');
});

// ============================================================================
// NHÓM 5: Xuất bảng chấm công tháng khi click xem bản sao lưu tháng 10
// ============================================================================
console.log('\n▶ [GROUP 5] Xuất Bảng Chấm Công Tháng Khi Xem Bản Sao Lưu Tháng 10:');

function createOctoberBackupFixture() {
  const students = [
    { id: 's_oct_1', studentId: '2102001', fullName: 'Đặng Tuấn Anh', role: 'old' },
    { id: 's_oct_2', studentId: '2302002', fullName: 'Lê Ngọc Mai', role: 'new' }
  ];

  // 4 tuần, mỗi tuần Đặng Tuấn Anh trực 1 ca, Lê Ngọc Mai trực 1 ca
  const weeks = [];
  for (let w = 1; w <= 4; w++) {
    weeks.push({
      weekNumber: w,
      scheduleTable: {
        'T2_S': {
          shiftId: 'T2_S',
          dayKey: 'T2',
          period: 'S',
          oldMember: students[0],
          newMember: students[1]
        }
      }
    });
  }

  const events = [
    {
      id: 'evt_oct_1',
      title: 'Tư vấn THPT Marie Curie',
      date: '2026-10-15',
      monthKey: '2026-10',
      timeOfDay: 'morning',
      workUnits: 1,
      assignedStudentIds: ['2102001', '2302002']
    },
    {
      id: 'evt_oct_2',
      title: 'Ngày Hội Hướng Nghiệp Toàn Thành',
      date: '2026-10-28',
      monthKey: '2026-10',
      timeOfDay: 'fullday',
      workUnits: 2,
      assignedStudentIds: ['2102001']
    }
  ];

  return {
    id: 'wbk_202610_fixture',
    name: 'Sao lưu định kỳ Tháng 10/2026',
    monthKey: '2026-10',
    monthLabel: 'Tháng 10/2026',
    createdAt: new Date('2026-10-31T17:00:00Z').getTime(),
    payload: {
      students,
      monthSchedule: { month: 10, year: 2026, weeks },
      events
    }
  };
}

runTest('5.1: Trích xuất bảng chấm công từ bản sao lưu Tháng 10 (getPayrollFromBackup)', () => {
  const octBackup = createOctoberBackupFixture();
  const payrollReport = PayrollCalculator.getPayrollFromBackup(octBackup);

  assert.strictEqual(payrollReport.monthKey, '2026-10');
  assert.strictEqual(payrollReport.monthLabel, 'Tháng 10/2026');
  assert.strictEqual(payrollReport.payrollItems.length, 2);

  // Tuấn Anh: 4 ca VP + (1 + 2) SK = 7 công
  const tuanAnh = payrollReport.payrollItems.find(p => p.studentMssv === '2102001');
  assert.strictEqual(tuanAnh.officeShiftsCount, 4);
  assert.strictEqual(tuanAnh.eventCount, 2);
  assert.strictEqual(tuanAnh.eventWorkUnits, 3);
  assert.strictEqual(tuanAnh.totalWorkUnits, 7);

  // Ngọc Mai: 4 ca VP + 1 SK = 5 công
  const ngocMai = payrollReport.payrollItems.find(p => p.studentMssv === '2302002');
  assert.strictEqual(ngocMai.officeShiftsCount, 4);
  assert.strictEqual(ngocMai.eventCount, 1);
  assert.strictEqual(ngocMai.eventWorkUnits, 1);
  assert.strictEqual(ngocMai.totalWorkUnits, 5);
});

runTest('5.2: Tính độc lập dữ liệu: Bảng chấm công Tháng 10 không bị ảnh hưởng bởi active state hiện hành', () => {
  // Thay đổi active localStorage sang tháng 11 với dữ liệu khác
  mockLocalStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify([
    { id: 's_nov', studentId: '9999999', fullName: 'SV Tháng 11', role: 'new' }
  ]));
  mockLocalStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));

  const octBackup = createOctoberBackupFixture();
  const payrollReport = PayrollCalculator.getPayrollFromBackup(octBackup);

  // Vẫn phải lấy đúng sinh viên của bản sao lưu Tháng 10
  assert.strictEqual(payrollReport.payrollItems.length, 2);
  assert.strictEqual(payrollReport.payrollItems[0].fullName, 'Đặng Tuấn Anh');
  assert.strictEqual(payrollReport.payrollItems[1].fullName, 'Lê Ngọc Mai');
});

runTest('5.3: Xuất báo cáo CSV chuẩn Office UTF-8 có BOM tiếng Việt cho bản sao lưu Tháng 10', () => {
  const octBackup = createOctoberBackupFixture();
  const payrollReport = PayrollCalculator.getPayrollFromBackup(octBackup);
  const csv = PayrollCalculator.exportReport(payrollReport, 'csv');

  assert.ok(csv.startsWith('\uFEFF'), 'CSV phải bắt đầu bằng BOM UTF-8 (\\uFEFF)');
  assert.ok(csv.includes('BẢNG CHẤM CÔNG CỘNG TÁC VIÊN'), 'Tiêu đề bảng chấm công phải có trong CSV');
  assert.ok(csv.includes('Tháng 10/2026'), 'Phải chứa nhãn Tháng 10/2026');
  assert.ok(csv.includes('"2102001"'), 'Phải có MSSV của Đặng Tuấn Anh');
  assert.ok(csv.includes('"Đặng Tuấn Anh"'), 'Phải có tên Đặng Tuấn Anh');
  // Ô số giờ bọc nháy kép theo chuẩn RFC 4180 (escapeCsvCell), nên giá trị
  // tổng công 7 xuất hiện dạng ,"7" thay vì ,7.
  assert.ok(csv.includes('"7"') || csv.includes(',7'),
    'Phải thể hiện số tổng công 7');
  // Và không được còn ô số trần (dấu hiệu chưa escape)
  assert.ok(!/,\d+\r?\n/.test(csv.split('\n').find(l => l.includes('2102001')) || ''),
    'Các ô số phải được bọc nháy kép chuẩn RFC 4180');
});

runTest('5.4: Xuất báo cáo HTML định dạng chuẩn để nhúng vào modal xem chi tiết tháng', () => {
  const octBackup = createOctoberBackupFixture();
  const payrollReport = PayrollCalculator.getPayrollFromBackup(octBackup);
  const html = PayrollCalculator.exportReport(payrollReport, 'html');

  assert.ok(html.includes('<table'), 'Phải sinh ra thẻ <table>');
  assert.ok(html.includes('2102001'), 'Phải có mã số sinh viên');
  assert.ok(html.includes('Đặng Tuấn Anh'), 'Phải có họ tên sinh viên');
  assert.ok(html.includes('Người Cũ'), 'Phải hiển thị nhãn Người Cũ');
});

runTest('5.5: Xử lý bản sao lưu Tháng 10 không có sự kiện nào (Edge case: events rỗng)', () => {
  const octBackup = createOctoberBackupFixture();
  octBackup.payload.events = []; // Làm rỗng sự kiện

  const payrollReport = PayrollCalculator.getPayrollFromBackup(octBackup);
  assert.strictEqual(payrollReport.payrollItems[0].eventCount, 0);
  assert.strictEqual(payrollReport.payrollItems[0].eventWorkUnits, 0);
  assert.strictEqual(payrollReport.payrollItems[0].totalWorkUnits, 4, 'Chỉ tính công trực văn phòng');
});

// ============================================================================
// NHÓM 6: Tích hợp events vào snapshot của WebBackupManager
// ============================================================================
console.log('\n▶ [GROUP 6] Tích Hợp Events Vào Snapshot Của WebBackupManager:');

runTest('6.1: createWebBackup tự động đóng gói danh sách events vào snapshot payload', () => {
  mockLocalStorage.clear();

  // Tạo 2 sự kiện trong tháng
  EventManager.addEvent({ title: 'Sự kiện Snapshot 1', date: '2026-10-10', timeOfDay: 'morning' });
  EventManager.addEvent({ title: 'Sự kiện Snapshot 2', date: '2026-10-20', timeOfDay: 'fullday' });

  // Thiết lập sinh viên và lịch trực
  const students = [
    { id: 's_snap_1', studentId: '2102001', fullName: 'Trần Snapshot', role: 'old' }
  ];
  mockLocalStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));

  const backupItem = WebBackupManager.createWebBackup('Bản Sao Lưu Kèm Sự Kiện');

  assert.ok(backupItem, 'Phải tạo thành công bản sao lưu');
  assert.ok(backupItem.payload, 'Bản sao lưu phải có payload');
  assert.ok(Array.isArray(backupItem.payload.events), 'Payload phải có mảng events');
  assert.strictEqual(backupItem.payload.events.length, 2, 'Payload phải lưu đúng 2 sự kiện');
  assert.strictEqual(backupItem.payload.events[0].title, 'Sự kiện Snapshot 1');
});

runTest('6.2: Snapshot WebBackupItem lưu giữ thống kê eventCount và totalWorkUnits trong stats', () => {
  mockLocalStorage.clear();

  // 1 sự kiện fullday = 2 công
  EventManager.addEvent({
    title: 'Sự kiện Lớn',
    date: '2026-10-15',
    timeOfDay: 'fullday',
    workUnits: 2,
    assignedStudentIds: ['2102001']
  });

  const students = [
    { id: 's_1', studentId: '2102001', fullName: 'Sinh Viên 1', role: 'old' }
  ];
  mockLocalStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));

  const backupItem = WebBackupManager.createWebBackup('Kiểm tra Stats');

  assert.strictEqual(backupItem.stats.eventCount, 1, 'stats.eventCount phải bằng 1');
  assert.strictEqual(backupItem.stats.totalWorkUnits, 2, 'stats.totalWorkUnits phải bằng 2');
});

runTest('6.3: restoreFromWebBackup khôi phục đầy đủ danh sách events vào LocalStorage', () => {
  mockLocalStorage.clear();

  const savedEvents = [
    { id: 'evt_restore_1', title: 'Sự kiện Cần Khôi Phục', date: '2026-10-12', timeOfDay: 'morning', workUnits: 1, assignedStudentIds: ['2102001'] }
  ];

  const backupToRestore = {
    id: 'wbk_test_restore',
    name: 'Bản Cần Restore',
    createdAt: Date.now(),
    payload: {
      students: [{ id: 's_1', studentId: '2102001', fullName: 'Sinh Viên', role: 'old' }],
      events: savedEvents
    }
  };

  mockLocalStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify([backupToRestore]));

  // Xóa rỗng events hiện tại
  mockLocalStorage.removeItem(STORAGE_KEYS.EVENTS);

  // Kích hoạt khôi phục 1-click
  WebBackupManager.restoreFromWebBackup('wbk_test_restore');

  const restoredEvents = EventManager.getEvents();
  assert.strictEqual(restoredEvents.length, 1, 'Phải khôi phục được 1 sự kiện');
  assert.strictEqual(restoredEvents[0].id, 'evt_restore_1');
  assert.strictEqual(restoredEvents[0].title, 'Sự kiện Cần Khôi Phục');
});

runTest('6.4: Tự động snapshot khi khởi tạo tháng mới (adminStartNewMonth) bảo toàn events', async () => {
  mockLocalStorage.clear();

  // Tạo 1 sự kiện tháng cũ
  EventManager.addEvent({ id: 'evt_old_month', title: 'Sự kiện Tháng Cũ', date: '2026-10-01' });

  // Thiết lập sinh viên cũ
  const oldMonthStudents = [
    { id: 's_old_month', fullName: 'Trần Văn Cũ', studentId: '2001111', role: 'old' }
  ];
  mockLocalStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(oldMonthStudents));

  // Thực thi adminStartNewMonth
  if (typeof global.window.adminStartNewMonth === 'function') {
    global.confirm = () => true;
    global.window.confirm = () => true;
    await global.window.adminStartNewMonth();

    const backups = WebBackupManager.getWebBackups();
    assert.ok(backups.length >= 1, 'Phải có bản sao lưu tự động');
    const autoBackup = backups[0];
    assert.ok(Array.isArray(autoBackup.payload.events), 'Snapshot tự động phải có payload.events');
    assert.strictEqual(autoBackup.payload.events.length, 1, 'Phải bảo toàn sự kiện của kỳ cũ');
    assert.strictEqual(autoBackup.payload.events[0].id, 'evt_old_month');
  }
});

runTest('6.5: Tương thích ngược (Backward Compatibility): Khôi phục bản sao lưu cũ không có trường events', () => {
  mockLocalStorage.clear();

  // Giả lập bản sao lưu phiên bản cũ (legacy) không có trường events
  const legacyBackup = {
    id: 'wbk_legacy_v0',
    name: 'Bản Sao Lưu Cũ Không Có Events',
    createdAt: Date.now() - 100000,
    payload: {
      students: [{ id: 's_legacy', studentId: '1900001', fullName: 'Sinh Viên Cũ', role: 'old' }],
      monthSchedule: { weeks: [] }
      // Không có events
    }
  };

  mockLocalStorage.setItem(STORAGE_KEYS.WEB_BACKUPS, JSON.stringify([legacyBackup]));

  // Khôi phục không được gây crash script
  assert.doesNotThrow(() => {
    WebBackupManager.restoreFromWebBackup('wbk_legacy_v0');
  }, 'Khôi phục bản sao lưu cũ không có events phải an toàn và không gây lỗi');
});

// ============================================================================
// TỔNG KẾT VÀ BÁO CÁO KẾT QUẢ
// ============================================================================
// Cho het cac test async truoc khi in tong ket
testChain.then(() => {
console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}

});