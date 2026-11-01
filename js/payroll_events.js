/**
 * ==========================================================================
 * SỰ KIỆN NGOẠI KHOÁ & BẢNG CÔNG THÁNG (tách từ js/admin.js — #3.2)
 * ==========================================================================
 * EventManager: đọc/ghi danh sách sự kiện trong localStorage.
 * PayrollCalculator: tính công văn phòng + công sự kiện, xuất CSV/HTML.
 *
 * Phụ thuộc vào admin được truyền qua `deps` (không dùng biến toàn cục):
 *   state, STORAGE_KEYS, escapeHtml, escapeCsvCell, showToast.
 * `escapeHtml` cố ý giữ MỘT bản trong admin.js (test XSS đọc thân hàm đó).
 *
 * Nạp TRƯỚC js/admin.js.
 */

(() => {
  'use strict';

  function create(deps) {
    const { state, STORAGE_KEYS, escapeHtml, escapeCsvCell, showToast } = deps;

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

            if (isMatch(slot.oldMember) || isMatch(slot.newMember) || isMatch(slot.thirdMember)) {
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
            '"STT","MSSV","Họ và Tên","Số Ca Trực VP","Số Sự Kiện","Công Sự Kiện","Tổng Công Quy Đổi"'
          ];

          items.forEach((item, idx) => {
            rows.push([
            escapeCsvCell(idx + 1),
            escapeCsvCell(item.studentMssv),
            escapeCsvCell(item.fullName),
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
            return `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(item.studentMssv)}</td>
                <td>${escapeHtml(item.fullName)}</td>
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

    return { EventManager, PayrollCalculator };
  }

  window.PayrollEvents = { create };
})();
