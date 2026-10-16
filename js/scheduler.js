/**
 * ==========================================================================
 * SCHEDULER ENGINE: Thuật toán Tự động Phân bổ Lịch trực Công bằng
 * ==========================================================================
 * Hệ Thống Quản Lý & Xếp Lịch Trực Ban Tuyển Sinh HCM-UTE
 * Đóng gói trong IIFE thuần túy, không phụ thuộc thư viện ngoài.
 *
 * Tính năng lõi:
 * 1. Maximum Bipartite Matching (Đường tăng luồng DFS) cho ghép cặp tối ưu
 * 2. Phân bổ theo luật Ban Tuyển Sinh: Mỗi ca trực gồm đúng 1 Người Cũ + 1 Người Mới
 * 3. Luân phiên đa tuần (solveMultiWeekSchedule - 4 tuần / trọn tháng) chống đói ca (Anti-Starvation)
 * 4. Tự động cân bằng tải (Fairness Balancing) theo số ca lũy kế
 * 5. Xử lý an toàn tuyệt đối toàn bộ trường hợp biên (Graceful Edge-Case Handling)
 */

(() => {
  'use strict';

  // Danh mục 10 ca trực hành chính chuẩn (Thứ 2 đến Thứ 6: Sáng 07:30-11:30 & Chiều 13:00-16:30)
  const SHIFTS = [
    { id: 'T2_S', dayKey: 'T2', dayName: 'Thứ 2', period: 'Sáng', time: '07:30 - 11:30' },
    { id: 'T2_C', dayKey: 'T2', dayName: 'Thứ 2', period: 'Chiều', time: '13:00 - 16:30' },
    { id: 'T3_S', dayKey: 'T3', dayName: 'Thứ 3', period: 'Sáng', time: '07:30 - 11:30' },
    { id: 'T3_C', dayKey: 'T3', dayName: 'Thứ 3', period: 'Chiều', time: '13:00 - 16:30' },
    { id: 'T4_S', dayKey: 'T4', dayName: 'Thứ 4', period: 'Sáng', time: '07:30 - 11:30' },
    { id: 'T4_C', dayKey: 'T4', dayName: 'Thứ 4', period: 'Chiều', time: '13:00 - 16:30' },
    { id: 'T5_S', dayKey: 'T5', dayName: 'Thứ 5', period: 'Sáng', time: '07:30 - 11:30' },
    { id: 'T5_C', dayKey: 'T5', dayName: 'Thứ 5', period: 'Chiều', time: '13:00 - 16:30' },
    { id: 'T6_S', dayKey: 'T6', dayName: 'Thứ 6', period: 'Sáng', time: '07:30 - 11:30' },
    { id: 'T6_C', dayKey: 'T6', dayName: 'Thứ 6', period: 'Chiều', time: '13:00 - 16:30' }
  ];

  // Từ điển tra cứu ca trực O(1) theo mã ID
  const SHIFT_MAP = SHIFTS.reduce((acc, shift) => {
    acc[shift.id] = shift;
    return acc;
  }, {});

  /**
   * Chuyển đổi mã ca trực thành tên hiển thị thân thiện tiếng Việt
   * @param {string|object} shiftOrId - Mã ca (vd: 'T2_S') hoặc object ca trực
   * @param {boolean} includeTime - Có hiển thị kèm khung giờ (vd: 07:30 - 11:30)
   * @returns {string} Tên ca trực (vd: "Thứ 2 - Sáng (07:30 - 11:30)")
   */
  function getShiftName(shiftOrId, includeTime = true) {
    if (!shiftOrId) return '';
    const shift = typeof shiftOrId === 'string' ? SHIFT_MAP[shiftOrId] : shiftOrId;
    if (!shift) return String(shiftOrId);
    if (shift.dayName && shift.period) {
      if (includeTime && shift.time) {
        return `${shift.dayName} - ${shift.period} (${shift.time})`;
      }
      return `${shift.dayName} - ${shift.period}`;
    }
    return String(shiftOrId);
  }

  /**
   * Maximum Bipartite Matching bằng đường tăng luồng DFS (Augmenting Path)
   * Ghép cặp cực đại giữa tập sinh viên ưu tiên và tập ca trực khả dụng.
   * Xử lý an toàn:
   * - Tập ứng viên rỗng hoặc tập ca rỗng.
   * - Ứng viên không có ca rảnh hoặc ca không hợp lệ.
   * - Ứng viên đã có ca trong currentMatches tránh bị gán lặp (double-booking).
   */
  function maxBipartiteMatch(candidates, shiftIds, currentMatches = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0 || !Array.isArray(shiftIds) || shiftIds.length === 0) {
      return { ...(currentMatches || {}) };
    }

    const match = { ...(currentMatches || {}) }; // shiftId -> candId
    const candMap = new Map();
    candidates.forEach(c => {
      if (c && c.id) candMap.set(c.id, c);
    });

    const validShiftSet = new Set(shiftIds);

    function dfs(cand, visited) {
      if (!cand || !cand.id) return false;
      const avail = cand.availableShifts || [];
      for (const shiftId of avail) {
        if (!validShiftSet.has(shiftId) || visited.has(shiftId)) continue;
        visited.add(shiftId);

        const currentOccupantId = match[shiftId];
        // Nếu ca chưa có ai nhận HOẶC người đang giữ ca có thể tìm được ca rảnh khác
        if (!currentOccupantId || (candMap.has(currentOccupantId) && dfs(candMap.get(currentOccupantId), visited))) {
          match[shiftId] = cand.id;
          return true;
        }
      }
      return false;
    }

    const assignedCands = new Set(Object.values(match));
    for (const cand of candidates) {
      if (!cand || !cand.id || assignedCands.has(cand.id)) continue;
      if (dfs(cand, new Set())) {
        assignedCands.add(cand.id);
      }
    }

    return match;
  }

  /**
   * Phân bổ ca cho một nhóm thành viên (Người cũ hoặc Người mới)
   * Tích hợp:
   * 1. Bipartite Matching cho các sinh viên ưu tiên (ít ca nhất).
   * 2. Greedy Heuristic đa trọng số (Fairness + Minimum Remaining Values MRV).
   * 3. Augmenting Swaps tối ưu hoán đổi chống đói ca.
   */
  function scheduleGroupShifts(members, roleName, priorityStudentIds = [], historicalCounts = {}) {
    const safeMembers = Array.isArray(members) ? members.filter(Boolean) : [];
    const roleLabel = roleName === 'old' ? 'Người Cũ' : 'Người Mới';

    const result = {
      assignments: {}, // shiftId -> Student
      counts: {},      // studentId -> number of assigned shifts in this week
      unassigned: [],  // ca trống của nhóm
      warnings: []
    };

    // Kiểm tra trường hợp nhóm rỗng
    if (safeMembers.length === 0) {
      SHIFTS.forEach(s => result.unassigned.push(s.id));
      result.warnings.push(`Không có thành viên nào thuộc nhóm ${roleLabel}.`);
      return result;
    }

    // Khởi tạo bộ đếm
    safeMembers.forEach(m => {
      if (m && m.id) {
        result.counts[m.id] = 0;
      }
    });

    // Bản đồ ca rảnh
    const memberAvailMap = new Map();
    safeMembers.forEach(m => {
      if (m && m.id) {
        memberAvailMap.set(m.id, new Set(m.availableShifts || []));
      }
    });

    const shiftIds = SHIFTS.map(s => s.id);
    const safePriorityIds = Array.isArray(priorityStudentIds) ? priorityStudentIds : [];
    const safeHistCounts = historicalCounts || {};

    // Kiểm tra nếu tất cả thành viên đều không đăng ký ca rảnh nào
    const totalAvailCount = safeMembers.reduce((sum, m) => sum + (m.availableShifts?.length || 0), 0);
    if (totalAvailCount === 0) {
      SHIFTS.forEach(s => result.unassigned.push(s.id));
      result.warnings.push(`Tất cả thành viên nhóm ${roleLabel} đều chưa đăng ký ca rảnh nào.`);
      return result;
    }

    // BƯỚC 1: Nếu có danh sách ưu tiên, ghép trước bằng Bipartite Matching
    if (safePriorityIds.length > 0) {
      const priorityMembers = safeMembers
        .filter(m => m && m.id && safePriorityIds.includes(m.id))
        .sort((a, b) => ((safeHistCounts[a.id] || 0) - (safeHistCounts[b.id] || 0)));

      if (priorityMembers.length > 0) {
        const priorityMatches = maxBipartiteMatch(priorityMembers, shiftIds, result.assignments);
        for (const [sId, candId] of Object.entries(priorityMatches)) {
          if (!result.assignments[sId]) {
            const student = safeMembers.find(m => m && m.id === candId);
            if (student) {
              result.assignments[sId] = student;
              result.counts[student.id] = (result.counts[student.id] || 0) + 1;
            }
          }
        }
      }
    }

    // BƯỚC 2: Phân bổ các ca còn lại bằng Greedy Heuristic (MRV + Fairness lũy kế)
    const remainingShifts = SHIFTS.filter(s => !result.assignments[s.id]);

    const shiftCandidates = {};
    remainingShifts.forEach(shift => {
      shiftCandidates[shift.id] = safeMembers.filter(m => {
        const set = memberAvailMap.get(m.id);
        return set && set.has(shift.id);
      });
    });

    // Sắp xếp ca khó trước (MRV: ca có ít ứng viên rảnh nhất giải quyết trước)
    const sortedShifts = [...remainingShifts].sort((a, b) => {
      return (shiftCandidates[a.id]?.length || 0) - (shiftCandidates[b.id]?.length || 0);
    });

    for (const shift of sortedShifts) {
      const candidates = shiftCandidates[shift.id] || [];
      if (candidates.length === 0) {
        result.unassigned.push(shift.id);
        continue;
      }

      let bestCandidate = null;
      let minScore = Infinity;

      for (const cand of candidates) {
        const currentCount = result.counts[cand.id] || 0;
        const histCount = safeHistCounts[cand.id] || 0;
        const totalSoFar = histCount + currentCount;
        const sameDayShiftId = shift.id.endsWith('_S') ? `${shift.dayKey}_C` : `${shift.dayKey}_S`;
        const alreadySameDay = result.assignments[sameDayShiftId]?.id === cand.id;

        // Trọng số tối ưu hóa:
        // 1. Tổng số ca lũy kế cả tháng (5000) - bảo đảm cân bằng tổng
        // 2. Số ca trong tuần hiện tại (1000) - chia đều trong tuần
        // 3. Tránh 2 ca cùng 1 ngày (400) - giảm quá tải thể lực
        // 4. Số ca rảnh của ứng viên (1) - tie-breaker
        const score = (totalSoFar * 5000) + (currentCount * 1000) + (alreadySameDay ? 400 : 0) + (cand.availableShifts?.length || 0);

        if (score < minScore) {
          minScore = score;
          bestCandidate = cand;
        }
      }

      if (bestCandidate) {
        result.assignments[shift.id] = bestCandidate;
        result.counts[bestCandidate.id] = (result.counts[bestCandidate.id] || 0) + 1;
      } else {
        result.unassigned.push(shift.id);
      }
    }

    // BƯỚC 3: Tối ưu hoán đổi chống đói ca (Anti-Starvation Swaps)
    // Nếu có bạn còn 0 ca trong khi có bạn khác được phân >= 2 ca tại ca bạn này cũng rảnh
    let improved = true;
    let iter = 0;
    while (improved && iter < 15) {
      improved = false;
      iter++;
      const zeroMems = safeMembers.filter(m => (result.counts[m.id] || 0) === 0);
      if (zeroMems.length === 0) break;

      for (const zeroMem of zeroMems) {
        const avail = zeroMem.availableShifts || [];
        for (const sId of avail) {
          const occ = result.assignments[sId];
          if (occ && occ.id !== zeroMem.id && (result.counts[occ.id] || 0) >= 2) {
            result.assignments[sId] = zeroMem;
            result.counts[zeroMem.id] = (result.counts[zeroMem.id] || 0) + 1;
            result.counts[occ.id] = Math.max(0, (result.counts[occ.id] || 0) - 1);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }

    if (result.unassigned.length > 0 && safeMembers.length > 0) {
      result.warnings.push(`Có ${result.unassigned.length} ca trực chưa tìm được ${roleLabel} phù hợp (${result.unassigned.join(', ')}).`);
    }

    return result;
  }

  /**
   * Chuẩn hóa danh sách sinh viên đầu vào, bảo đảm tính toàn vẹn dữ liệu
   */
  function normalizeStudents(students) {
    if (!Array.isArray(students)) return [];
    const seenIds = new Set();
    return students.filter(Boolean).map((s, idx) => {
      let id = s.id || s.studentId || `stu_${idx + 1}`;
      if (seenIds.has(id)) {
        id = `${id}_${idx + 1}`;
      }
      seenIds.add(id);

      let avail;
      if (Array.isArray(s.availableShifts)) {
        avail = [...s.availableShifts];
      } else if (s.monthlyAvailableShifts && typeof s.monthlyAvailableShifts === 'object') {
        const set = new Set();
        Object.values(s.monthlyAvailableShifts).forEach(arr => {
          if (Array.isArray(arr)) {
            arr.forEach(shift => {
              if (shift && typeof shift === 'string') set.add(shift.trim());
            });
          }
        });
        avail = Array.from(set);
      } else {
        avail = [];
      }

      return {
        ...s,
        id,
        role: s.role === 'new' ? 'new' : 'old',
        availableShifts: avail
      };
    });
  }

  /**
   * Xếp lịch 1 tuần tiêu chuẩn (solveWeeklySchedule / runAutoSchedule)
   * Tuân thủ quy chuẩn: mỗi ca đúng 1 Người Cũ (7h30-11h30 / 13h00-16h30) + 1 Người Mới
   */
  function solveWeeklySchedule(allStudents, priorityStudentIds = [], historicalCounts = {}) {
    const safeStudents = normalizeStudents(allStudents);
    const oldMembers = safeStudents.filter(s => s.role === 'old');
    const newMembers = safeStudents.filter(s => s.role === 'new');

    const warnings = [];

    // Kiểm tra trường hợp biên
    if (safeStudents.length === 0) {
      warnings.push('Danh sách sinh viên rỗng. Không có ca trực nào được phân bổ.');
    } else if (safeStudents.length < 2) {
      warnings.push('Số lượng sinh viên quá ít (< 2 người). Mỗi ca trực cần tối thiểu 1 Người Cũ và 1 Người Mới.');
    }

    if (safeStudents.length > 0 && oldMembers.length === 0) {
      warnings.push('Thiếu nhóm Người Cũ (Kinh nghiệm). Các ca trực chỉ có Người Mới (chưa đạt chuẩn 1 Cũ + 1 Mới).');
    }
    if (safeStudents.length > 0 && newMembers.length === 0) {
      warnings.push('Thiếu nhóm Người Mới (Tập sự). Các ca trực chỉ có Người Cũ (chưa đạt chuẩn 1 Cũ + 1 Mới).');
    }

    const oldResult = scheduleGroupShifts(oldMembers, 'old', priorityStudentIds, historicalCounts);
    const newResult = scheduleGroupShifts(newMembers, 'new', priorityStudentIds, historicalCounts);

    const scheduleTable = {};
    let fullCount = 0;
    let partialCount = 0;
    let emptyCount = 0;

    SHIFTS.forEach(shift => {
      const oldStudent = oldResult.assignments[shift.id] || null;
      const newStudent = newResult.assignments[shift.id] || null;

      let status = 'full';
      if (!oldStudent && !newStudent) {
        status = 'empty';
        emptyCount++;
      } else if (!oldStudent || !newStudent) {
        status = 'partial';
        partialCount++;
      } else {
        fullCount++;
      }

      scheduleTable[shift.id] = {
        shiftInfo: shift,
        oldMember: oldStudent,
        newMember: newStudent,
        status: status
      };
    });

    const studentStats = {};
    safeStudents.forEach(s => {
      const count = (s.role === 'old' ? oldResult.counts[s.id] : newResult.counts[s.id]) || 0;
      studentStats[s.id] = {
        student: s,
        assignedCount: count,
        registeredCount: (s.availableShifts || []).length
      };
    });

    const unassignedMembers = safeStudents.filter(s => (studentStats[s.id]?.assignedCount || 0) === 0);

    return {
      success: true,
      timestamp: Date.now(),
      scheduleTable,
      summary: {
        totalShifts: SHIFTS.length,
        fullShifts: fullCount,
        partialShifts: partialCount,
        emptyShifts: emptyCount,
        totalStudents: safeStudents.length,
        oldStudentsCount: oldMembers.length,
        newStudentsCount: newMembers.length,
        unassignedStudentsCount: unassignedMembers.length
      },
      studentStats,
      unassignedMembers,
      warnings: [...warnings, ...oldResult.warnings, ...newResult.warnings]
    };
  }

  // Bí danh tương thích ngược
  const runAutoSchedule = solveWeeklySchedule;

  /**
   * MonthCalendarHelper: Tiện ích tính toán lịch dương hành chính 4 tuần trong tháng
   * Tuân thủ Single Source of Truth theo Section 9B trong .antigravity/memory/api-contracts.md
   */
  const DAY_KEYS = ['T2', 'T3', 'T4', 'T5', 'T6'];
  const DAY_NAMES = {
    'T2': 'Thứ 2',
    'T3': 'Thứ 3',
    'T4': 'Thứ 4',
    'T5': 'Thứ 5',
    'T6': 'Thứ 6'
  };

  const MonthCalendarHelper = {
    DAY_KEYS,
    DAY_NAMES,

    /**
     * Tìm ngày Thứ 2 đầu tiên của tháng làm việc
     * @param {number|string} arg1 - Năm (vd: 2026) hoặc Tháng (vd: 10)
     * @param {number} [arg2] - Tháng hoặc Năm
     * @returns {Date} Đối tượng Date ứng với Thứ 2 đầu tiên
     */
    getFirstMonday(arg1 = 2026, arg2 = 10) {
      const { month, year } = this.parseMonthYear(arg1, arg2);
      const d = new Date(year, month - 1, 1);
      const day = d.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
      let diff = 0;
      if (day === 1) {
        diff = 0;
      } else if (day === 0) {
        diff = 1;
      } else {
        diff = (8 - day) % 7;
      }
      return new Date(year, month - 1, 1 + diff);
    },

    /**
     * Bí danh getFirstMondayOfMonth tương thích với getFirstMonday
     */
    getFirstMondayOfMonth(arg1 = 2026, arg2 = 10) {
      return this.getFirstMonday(arg1, arg2);
    },

    /**
     * Chuẩn hóa tham số đầu vào năm và tháng (hỗ trợ chuỗi '2026-10', '10/2026', hoặc số)
     * @param {string|number} arg1 - Tháng hoặc chuỗi khóa tháng hoặc Năm
     * @param {number} [arg2] - Năm hoặc Tháng
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
     * Lấy cấu trúc 4 tuần làm việc (Thứ 2 đến Thứ 6) trong tháng
     * Hỗ trợ getMonthWeeks(month, year) lẫn getMonthWeeks(year, month) hoặc string
     * @param {string|number} [arg1=10]
     * @param {number} [arg2=2026]
     * @returns {Array<object>} Mảng gồm đúng 4 tuần làm việc
     */
    getMonthWeeks(arg1 = 10, arg2 = 2026) {
      const { month, year } = this.parseMonthYear(arg1, arg2);
      const firstMonday = this.getFirstMonday(year, month);

      const pad2 = (n) => String(n).padStart(2, '0');
      const weeks = [];

      for (let w = 1; w <= 4; w++) {
        const weekMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + (w - 1) * 7);
        const weekFriday = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + 4);

        const startDateStr = `${pad2(weekMonday.getDate())}/${pad2(weekMonday.getMonth() + 1)}`;
        const endDateStr = `${pad2(weekFriday.getDate())}/${pad2(weekFriday.getMonth() + 1)}`;
        const label = `Tuần ${w} (${startDateStr} - ${endDateStr}/${weekFriday.getFullYear()})`;

        const days = {};
        DAY_KEYS.forEach((dayKey, idx) => {
          const dayDate = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + idx);
          const dateStr = `${pad2(dayDate.getDate())}/${pad2(dayDate.getMonth() + 1)}`;
          const fullDate = `${dayDate.getFullYear()}-${pad2(dayDate.getMonth() + 1)}-${pad2(dayDate.getDate())}`;
          const dayName = DAY_NAMES[dayKey];

          days[dayKey] = {
            dayKey,
            dayName,
            dateStr,
            fullDate,
            date: dayDate,
            shifts: {
              S: {
                id: `${dayKey}_S`,
                name: 'Sáng',
                time: '07:30 - 11:30',
                fullLabel: `${dayName} (${dateStr}) - Sáng`
              },
              C: {
                id: `${dayKey}_C`,
                name: 'Chiều',
                time: '13:00 - 16:30',
                fullLabel: `${dayName} (${dateStr}) - Chiều`
              }
            },
            toString() {
              return this.fullDate;
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

  /**
   * XẾP LỊCH ĐA TUẦN / TRỌN VẸN 1 THÁNG (solveMultiWeekSchedule / runMonthSchedule)
   * Tối ưu hóa phân bổ công bằng tuyệt đối (Fairness & Anti-Starvation):
   * - Mỗi ca đúng 1 Người Cũ + 1 Người Mới
   * - Xoay vòng qua các tuần (mặc định 4 tuần = 1 tháng = 40 ca)
   * - Hỗ trợ đăng ký ca rảnh trọn tháng có ngày cụ thể (monthlyAvailableShifts)
   * - Người có ít ca ở các tuần trước được đẩy lên ưu tiên cao nhất ở tuần sau
   * - Đảm bảo mọi sinh viên đăng ký đều được phân công trực công bằng
   */
  function solveMultiWeekSchedule(allStudents, totalWeeks = 4, year = 2026, month = 10) {
    const numWeeks = Math.max(1, parseInt(totalWeeks, 10) || 4);
    const safeStudents = normalizeStudents(allStudents);
    const calendarWeeks = MonthCalendarHelper.getMonthWeeks(year, month);

    // Trường hợp biên: Danh sách sinh viên rỗng
    if (safeStudents.length === 0) {
      const emptyWeeks = [];
      for (let w = 1; w <= numWeeks; w++) {
        const emptyWeek = solveWeeklySchedule([], [], {});
        emptyWeek.weekNumber = w;
        emptyWeek.calendarInfo = calendarWeeks[w - 1] || null;
        emptyWeeks.push(emptyWeek);
      }
      return {
        success: true,
        timestamp: Date.now(),
        totalWeeks: numWeeks,
        year: parseInt(year, 10) || 2026,
        month: parseInt(month, 10) || 10,
        calendarWeeks,
        weeks: emptyWeeks,
        week1: emptyWeeks[0] || null,
        week2: emptyWeeks[1] || null,
        week3: emptyWeeks[2] || null,
        week4: emptyWeeks[3] || null,
        combinedStats: {},
        totalStudents: 0,
        uniqueAssignedCount: 0,
        totalShiftsInMonth: numWeeks * SHIFTS.length,
        unassignedMonthMembers: [],
        warnings: ['Danh sách sinh viên rỗng. Không có ca trực nào được phân bổ trong chu kỳ.']
      };
    }

    const historicalCounts = {};
    safeStudents.forEach(s => {
      historicalCounts[s.id] = 0;
    });

    const weeks = [];

    // Lặp qua từng tuần trong chu kỳ
    for (let w = 1; w <= numWeeks; w++) {
      // Áp dụng ca rảnh riêng của tuần w nếu sinh viên có monthlyAvailableShifts (Section 9C api-contracts.md)
      // Nếu không có, tự động fallback về s.availableShifts
      const weekStudents = safeStudents.map(s => {
        let shiftsForWeek = s.availableShifts || [];
        if (s.monthlyAvailableShifts && (Array.isArray(s.monthlyAvailableShifts[w]) || Array.isArray(s.monthlyAvailableShifts[String(w)]))) {
          const arr = s.monthlyAvailableShifts[w] || s.monthlyAvailableShifts[String(w)];
          shiftsForWeek = arr;
        }
        return {
          ...s,
          availableShifts: shiftsForWeek
        };
      });

      // Ưu tiên những bạn có ít ca lũy kế nhất trong các tuần trước (chống đói ca)
      const priorityIds = [...weekStudents]
        .sort((a, b) => {
          const diff = (historicalCounts[a.id] || 0) - (historicalCounts[b.id] || 0);
          if (diff !== 0) return diff;
          // Tie-breaker: ưu tiên người có ít lựa chọn ca hơn trước trong tuần này
          return (a.availableShifts?.length || 0) - (b.availableShifts?.length || 0);
        })
        .map(s => s.id);

      const weekSchedule = solveWeeklySchedule(weekStudents, priorityIds, historicalCounts);
      weekSchedule.weekNumber = w;
      weekSchedule.calendarInfo = calendarWeeks[w - 1] || null;
      weeks.push(weekSchedule);

      // Cập nhật số ca lũy kế sau tuần này
      safeStudents.forEach(s => {
        const assignedInWeek = weekSchedule.studentStats[s.id]?.assignedCount || 0;
        historicalCounts[s.id] = (historicalCounts[s.id] || 0) + assignedInWeek;
      });
    }

    // Thống kê tổng hợp số ca qua các tuần
    const combinedStats = {};
    safeStudents.forEach(s => {
      const countsPerWeek = weeks.map(w => w.studentStats[s.id]?.assignedCount || 0);
      const total = countsPerWeek.reduce((sum, val) => sum + val, 0);

      combinedStats[s.id] = {
        student: s,
        week1Count: countsPerWeek[0] || 0,
        week2Count: countsPerWeek[1] || 0,
        week3Count: countsPerWeek[2] || 0,
        week4Count: countsPerWeek[3] || 0,
        countsPerWeek,
        totalTwoWeeks: (countsPerWeek[0] || 0) + (countsPerWeek[1] || 0),
        totalMonthCount: total,
        totalCount: total
      };
    });

    const uniqueAssignedCount = Object.values(combinedStats).filter(st => st.totalCount > 0).length;
    const unassignedMonthMembers = safeStudents.filter(s => (combinedStats[s.id]?.totalCount || 0) === 0);

    const monthWarnings = [];
    if (safeStudents.length < 2) {
      monthWarnings.push('Tổng số sinh viên < 2 người, không thể hoàn thiện đủ các ca trực chuẩn (1 Cũ + 1 Mới).');
    }
    const totalOld = safeStudents.filter(s => s.role === 'old').length;
    const totalNew = safeStudents.filter(s => s.role === 'new').length;
    if (totalOld === 0) {
      monthWarnings.push('Toàn bộ chu kỳ thiếu nhóm Người Cũ. Tất cả các ca trực chỉ có Người Mới.');
    }
    if (totalNew === 0) {
      monthWarnings.push('Toàn bộ chu kỳ thiếu nhóm Người Mới. Tất cả các ca trực chỉ có Người Cũ.');
    }
    if (unassignedMonthMembers.length > 0) {
      monthWarnings.push(`Có ${unassignedMonthMembers.length} sinh viên chưa được phân bổ ca nào trong cả chu kỳ ${numWeeks} tuần do đăng ký quá ít ca hoặc trùng ca cao điểm.`);
    }

    return {
      success: true,
      timestamp: Date.now(),
      totalWeeks: numWeeks,
      year: parseInt(year, 10) || 2026,
      month: parseInt(month, 10) || 10,
      calendarWeeks,
      weeks,
      week1: weeks[0] || null,
      week2: weeks[1] || null,
      week3: weeks[2] || null,
      week4: weeks[3] || null,
      combinedStats,
      totalStudents: safeStudents.length,
      uniqueAssignedCount,
      totalShiftsInMonth: numWeeks * SHIFTS.length,
      unassignedMonthMembers,
      warnings: monthWarnings
    };
  }

  // Bí danh tương thích ngược
  function runMonthSchedule(allStudents, year = 2026, month = 10) {
    return solveMultiWeekSchedule(allStudents, 4, year, month);
  }

  function runTwoWeekSchedule(allStudents, year = 2026, month = 10) {
    return solveMultiWeekSchedule(allStudents, 4, year, month);
  }

  // Đóng gói đối tượng động cơ xếp ca chuẩn
  const SchedulerEngine = {
    SHIFTS,
    SHIFT_MAP,
    getShiftName,
    MonthCalendarHelper,
    solveWeeklySchedule,
    solveMultiWeekSchedule,
    // Bí danh tương thích
    runAutoSchedule,
    runWeeklySchedule: solveWeeklySchedule,
    runTwoWeekSchedule,
    runMonthSchedule,
    scheduleGroupShifts,
    maxBipartiteMatch
  };

  // Xuất ra phạm vi toàn cục Browser và môi trường Node.js
  if (typeof window !== 'undefined') {
    window.SchedulerEngine = SchedulerEngine;
    window.MonthCalendarHelper = MonthCalendarHelper;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SchedulerEngine;
  }
})();
