/**
 * ==========================================================================
 * MONTH CALENDAR HELPER - HỆ THỐNG XẾP LỊCH BAN TUYỂN SINH HCM-UTE
 * ==========================================================================
 * Hỗ trợ tính toán ngày dương lịch 4 tuần hành chính trong tháng (T2 - T6),
 * sinh nhãn hiển thị chi tiết cho từng ca trực, hợp nhất ca rảnh cả tháng
 * và hỗ trợ sao chép ca 1 tuần ra cả 4 tuần (Clone week to month).
 * Tuân thủ nghiêm ngặt Section 9 trong .antigravity/memory/api-contracts.md.
 */

(() => {
  'use strict';

  const MonthCalendarHelper = {
    /**
     * Tìm ngày Thứ 2 đầu tiên của một tháng hành chính
     * @param {number} year - Năm (vd: 2026)
     * @param {number} month - Tháng từ 1 đến 12 (vd: 10)
     * @returns {Date} Đối tượng Date ứng với Thứ 2 đầu tiên
     */
    getFirstMonday(year, month) {
      const { month: m, year: y } = this.parseMonthYear ? this.parseMonthYear(year, month) : { month: month || 10, year: year || 2026 };
      const d = new Date(y, m - 1, 1);
      const day = d.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
      let diff = 0;
      if (day === 1) {
        diff = 0;
      } else if (day === 0) {
        diff = 1;
      } else {
        diff = (8 - day) % 7;
      }
      return new Date(y, m - 1, 1 + diff);
    },

    /**
     * Bí danh getFirstMondayOfMonth tương thích với getFirstMonday
     */
    getFirstMondayOfMonth(year, month) {
      return this.getFirstMonday(year, month);
    },

    /**
     * Tra cứu ngày cụ thể của một ca trực theo tuần và thứ
     * @param {number|string} arg1 - Năm (vd: 2026) hoặc Tháng (vd: 10)
     * @param {number} [arg2] - Tháng (vd: 10) hoặc Năm (vd: 2026)
     * @param {number} weekNumber - Tuần số (1 - 4)
     * @param {string} dayKey - Khóa thứ ('T2' .. 'T6' hoặc mã ca 'T2_S')
     * @returns {object} Thông tin chi tiết ngày cụ thể
     */
    getShiftDate(arg1 = 2026, arg2 = 10, weekNumber = 1, dayKey = 'T2') {
      const { month, year } = this.parseMonthYear(arg1, arg2);
      const cleanKey = String(dayKey || 'T2').split('_')[0].toUpperCase();
      const weekIdx = Math.max(0, Math.min(3, (parseInt(weekNumber, 10) || 1) - 1));
      const weeks = this.getMonthWeeks(month, year);
      const week = weeks[weekIdx];
      if (!week || !week.days || !week.days[cleanKey]) {
        return null;
      }
      return week.days[cleanKey];
    },

    /**
     * Chuẩn hóa tham số đầu vào năm và tháng (hỗ trợ chuỗi '2026-10', '10/2026', hoặc số)
     * @param {string|number} arg1 - Tháng hoặc chuỗi khóa tháng
     * @param {number} [arg2] - Năm (khi arg1 là tháng)
     * @returns {{ month: number, year: number }}
     */
    parseMonthYear(arg1 = 10, arg2 = 2026) {
      let month = 10;
      let year = 2026;

      if (typeof arg1 === 'string') {
        const ym = arg1.match(/^(\d{4})[-/](\d{1,2})$/);
        const my = arg1.match(/^(\d{1,2})[-/](\d{4})$/);
        if (ym) {
          year = parseInt(ym[1], 10);
          month = parseInt(ym[2], 10);
        } else if (my) {
          month = parseInt(my[1], 10);
          year = parseInt(my[2], 10);
        }
      } else if (typeof arg1 === 'number') {
        if (arg1 > 100) {
          year = arg1;
          month = typeof arg2 === 'number' ? arg2 : 10;
        } else {
          month = arg1;
          year = typeof arg2 === 'number' && arg2 > 100 ? arg2 : 2026;
        }
      }
      return { month, year };
    },

    /**
     * Tính toán chi tiết 4 tuần hành chính trong tháng (Thứ 2 đến Thứ 6)
     * Trả về mảng 4 MonthWeekInfo theo đúng đặc tả Section 9B
     * @param {string|number} [arg1=10]
     * @param {number} [arg2=2026]
     * @returns {Array<object>} Danh sách 4 tuần với đầy đủ ngày và ca trực
     */
    getMonthWeeks(arg1 = 10, arg2 = 2026) {
      const { month, year } = this.parseMonthYear(arg1, arg2);
      const firstMonday = this.getFirstMonday(year, month);

      const pad = n => String(n).padStart(2, '0');
      const dayKeys = ['T2', 'T3', 'T4', 'T5', 'T6'];
      const dayNames = {
        T2: 'Thứ 2',
        T3: 'Thứ 3',
        T4: 'Thứ 4',
        T5: 'Thứ 5',
        T6: 'Thứ 6'
      };

      const weeks = [];
      for (let w = 1; w <= 4; w++) {
        const weekMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + (w - 1) * 7);
        const weekFriday = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + 4);

        const startDay = pad(weekMonday.getDate());
        const startMonth = pad(weekMonday.getMonth() + 1);
        const startDateStr = `${startDay}/${startMonth}`;

        const endDay = pad(weekFriday.getDate());
        const endMonth = pad(weekFriday.getMonth() + 1);
        const endDateStr = `${endDay}/${endMonth}`;

        const label = `Tuần ${w} (${startDateStr} - ${endDateStr}/${year})`;

        const days = {};
        dayKeys.forEach((key, idx) => {
          const curDate = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + idx);
          const dStr = `${pad(curDate.getDate())}/${pad(curDate.getMonth() + 1)}`;
          const fDate = `${curDate.getFullYear()}-${pad(curDate.getMonth() + 1)}-${pad(curDate.getDate())}`;
          const dName = dayNames[key];

          days[key] = {
            dayKey: key,
            dayName: dName,
            dateStr: dStr,
            fullDate: fDate,
            shifts: {
              S: {
                id: `${key}_S`,
                name: 'Sáng',
                time: '07:30 - 11:30',
                fullLabel: `${dName} (${dStr}) - Sáng`
              },
              C: {
                id: `${key}_C`,
                name: 'Chiều',
                time: '13:00 - 16:30',
                fullLabel: `${dName} (${dStr}) - Chiều`
              }
            }
          };
        });

        weeks.push({
          weekNumber: w,
          label,
          startDateStr,
          endDateStr,
          days
        });
      }

      return weeks;
    },

    /**
     * Hợp nhất (Union) toàn bộ ca rảnh trong tháng từ cấu trúc monthlyAvailableShifts
     * Khử trùng lặp và giữ nguyên định dạng mảng
     * @param {object} monthlyAvailableShifts - { 1: ['T2_S'], 2: ['T3_C'], ... }
     * @returns {string[]} Mảng ca rảnh hợp nhất
     */
    mergeMonthlyShifts(monthlyAvailableShifts) {
      if (!monthlyAvailableShifts || typeof monthlyAvailableShifts !== 'object') {
        return [];
      }
      const set = new Set();
      // Duyệt qua tất cả các tuần có trong object
      Object.keys(monthlyAvailableShifts).forEach(wKey => {
        const shifts = monthlyAvailableShifts[wKey];
        if (Array.isArray(shifts)) {
          shifts.forEach(shiftId => {
            if (shiftId && typeof shiftId === 'string') {
              set.add(shiftId.trim());
            }
          });
        }
      });
      return Array.from(set);
    },

    /**
     * Sao chép ca 1 tuần ra cả 4 tuần (clone week to month)
     * Bảo đảm Deep Copy, không bị đột biến tham chiếu giữa các tuần
     * @param {string[]} sourceWeekShifts - Mảng mã ca nguồn (vd: ['T2_S', 'T4_C'])
     * @param {number} [totalWeeks=4] - Số tuần cần clone (mặc định: 4)
     * @returns {object} { 1: [...], 2: [...], 3: [...], 4: [...] }
     */
    cloneWeekToMonth(sourceWeekShifts, totalWeeks = 4) {
      const safeShifts = Array.isArray(sourceWeekShifts)
        ? sourceWeekShifts.filter(s => typeof s === 'string' && s.trim().length > 0)
        : [];
      const result = {};
      const weeks = Math.max(1, parseInt(totalWeeks, 10) || 4);
      for (let w = 1; w <= weeks; w++) {
        result[w] = [...safeShifts];
      }
      return result;
    },

    /**
     * Chuẩn hóa hồ sơ đăng ký của sinh viên theo chuẩn Section 9A:
     * - Tự động tính availableShifts = Union(monthlyAvailableShifts) nếu có
     * - Tự động clone availableShifts thành monthlyAvailableShifts nếu sinh viên kiểu cũ
     * @param {object} studentInput
     * @returns {object} Đối tượng Student hoàn chỉnh
     */
    prepareStudentRegistration(studentInput) {
      if (!studentInput || typeof studentInput !== 'object') {
        throw new Error('Dữ liệu sinh viên đăng ký không hợp lệ');
      }
      const student = { ...studentInput };

      if (student.monthlyAvailableShifts && typeof student.monthlyAvailableShifts === 'object') {
        student.availableShifts = this.mergeMonthlyShifts(student.monthlyAvailableShifts);
      } else if (Array.isArray(student.availableShifts)) {
        student.monthlyAvailableShifts = this.cloneWeekToMonth(student.availableShifts, 4);
      } else {
        student.availableShifts = [];
        student.monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
      }

      if (!student.registrationMonth) {
        student.registrationMonth = '2026-10';
      }

      return student;
    }
  };

  // Xuất ra môi trường Browser (window) và Node.js (module.exports)
  if (typeof window !== 'undefined') {
    window.MonthCalendarHelper = MonthCalendarHelper;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonthCalendarHelper;
  }
})();
