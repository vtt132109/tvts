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
      let fallbackCandidate = null;
      let fallbackScore = Infinity;

      // Ca đối lưu trong cùng ngày (Sáng <-> Chiều)
      const siblingShiftId = shift.id.endsWith('_S')
        ? `${shift.dayKey}_C`
        : `${shift.dayKey}_S`;

      for (const cand of candidates) {
        const currentCount = result.counts[cand.id] || 0;
        const histCount = safeHistCounts[cand.id] || 0;
        const totalSoFar = histCount + currentCount;
        const alreadySameDay = result.assignments[siblingShiftId]?.id === cand.id;

        // Trọng số tối ưu hoá (KHÔNG còn trộn phạt trùng ngày vào đây):
        // 1. Tổng số ca lũy kế cả tháng (5000) - bảo đảm cân bằng tổng
        // 2. Số ca trong tuần hiện tại (1000) - chia đều trong tuần
        // 3. Số ca rảnh của ứng viên (1) - tie-breaker
        const score = (totalSoFar * 5000) + (currentCount * 1000) + (cand.availableShifts?.length || 0);

        // ⚠️ RÀNG BUỘC CỨNG: một người không thể trực CẢ 2 ca (sáng + chiều)
        // trong cùng một ngày. Trước đây trùng ngày chỉ là phạt 400 điểm, nhỏ
        // hơn nhiều so với currentCount*1000, nên hành vi LUÔN thắng ->
        // đã xảy ra tình huống 1 Tập Sự phải trực 10 ca/tuần
        // (T2_S+T2_C, T3_S+T3_C, ... T6_S+T6_C) mà KHÔNG có cảnh báo.
        // Nay: ưu tiên tuyệt đối người CHƯA trực trong ngày; chỉ dùng
        // người đã trực khi thực sự không còn lựa chọn nào khác.
        if (!alreadySameDay) {
          if (score < minScore) {
            minScore = score;
            bestCandidate = cand;
          }
        } else if (score < fallbackScore) {
          fallbackScore = score;
          fallbackCandidate = cand;
        }
      }

      if (!bestCandidate) {
        bestCandidate = fallbackCandidate;
        if (bestCandidate) {
          result.warnings.push(
            `Ca ${shift.id}: không còn ứng viên nào rảnh khác — buộc phải xếp ` +
            `${bestCandidate.fullName || bestCandidate.id} dù đã có ca ${siblingShiftId} cùng ngày ` +
            `(trùng ngày). Hãy thêm CTV hoặc cập nhật ca rảnh.`);
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
   * Chuẩn hóa danh sách sinh viên đầu vào, bảo đảm tính toàn vẹn dữ liệu.
   * Ghi nhận các trường hợp dữ liệu bất thường vào `normalizeWarnings`
   * để người dùng biết thay vì âm thầm sửa dữ liệu.
   * @param {Array<object>} students
   * @param {string[]} normalizeWarnings - Mảng thu thập cảnh báo (nếu có)
   */
  function normalizeStudents(students, normalizeWarnings) {
    if (!Array.isArray(students)) return [];
    const seenIds = new Set();
    const warn = (msg) => { if (Array.isArray(normalizeWarnings)) normalizeWarnings.push(msg); };
    const badRoles = [];

    const normalized = students.filter(Boolean).map((s, idx) => {
      // id falsy (0, '', null) phải coi như THIẾU, không âm thầm rơi về stu_N
      // vì stu_N có thể trùng với id thật của sinh viên khác.
      const rawId = (s.id !== undefined && s.id !== null && s.id !== '')
        ? String(s.id)
        : (s.studentId !== undefined && s.studentId !== null && s.studentId !== ''
          ? String(s.studentId)
          : `stu_${idx + 1}`);

      let id = rawId;
      if (seenIds.has(id)) {
        // Vòng lặp: id mới có thể TRÙNG với một id đã tồn tại khác
        // (vd đã có cả "x_3"). Nếu chỉ thử 1 lần sẽ tạo 2 sinh viên cùng id,
        // khiến 2 người bị gộp làm 1 và ca bị gán ngoài ca đã đăng ký.
        let suffix = idx + 1;
        const base = rawId;
        while (seenIds.has(`${base}_${suffix}`)) suffix++;
        warn(`Mã định danh bị trùng "${rawId}" — đã tự động đổi thành "${base}_${suffix}".`);
        id = `${base}_${suffix}`;
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

      // Vai trò chỉ chấp nhận 'old' | 'new' (không phân biệt hoa thường, và chấp
      // nhận cả tên hiển thị tiếng Việt). Trước đây mọi giá trị lạ đều bị
      // âm thầm đổi thành 'old' (Chính Thức) — khiến một Tập sự gõ sai
      // "NEW" bị nâng quyền, đồng thời phá vỡ luật 1 Cũ + 1 Mới cho toàn danh sách.
      // Nay: chuẩn hoá + LUÔN ghi cảnh báo, kể cả khi thiếu hoàn toàn.
      let role = null;
      if (typeof s.role === 'string') {
        const r = s.role.trim().toLowerCase();
        if (r === 'old' || r === 'new') {
          role = r;
        } else if (r === 'chính thức' || r === 'chinh thuc' || r === 'ct' || r === 'veteran' || r === 'cu') {
          role = 'old';
        } else if (r === 'tập sự' || r === 'tập sư' || r === 'tap su' || r === 'ts' || r === 'newcomer') {
          role = 'new';
        }
      } else if (s.role === true || s.role === false) {
        role = s.role ? 'old' : 'new';
      }

      if (role === null) {
        const raw = s.role === undefined || s.role === null || s.role === ''
          ? '(thiếu)' : JSON.stringify(s.role);
        badRoles.push(`"${s.fullName || id}": ${raw}`);
        // Mặc định là 'new' (Tập sự) — KHÔNG tự nâng quyền lên Chính Thức.
        role = 'new';
      }

      return { ...s, id, role, availableShifts: avail };
    });

    if (badRoles.length > 0) {
      warn(`Phân loại vai trò không hợp lệ hoặc thiếu, đã tạm xếp là "Tập Sự" cho: ${badRoles.join(', ')}. `
        + 'Vui lòng sửa lại trong Bảng Quản Lý Sinh Viên.');
    }

    return normalized;
  }

  /**
   * Xếp lịch 1 tuần tiêu chuẩn (solveWeeklySchedule / runAutoSchedule)
   * Tuân thủ quy chuẩn: mỗi ca đúng 1 Người Cũ (7h30-11h30 / 13h00-16h30) + 1 Người Mới
   */
  function solveWeeklySchedule(allStudents, priorityStudentIds = [], historicalCounts = {}) {
    const normalizeWarnings = [];
    const safeStudents = normalizeStudents(allStudents, normalizeWarnings);
    const oldMembers = safeStudents.filter(s => s.role === 'old');
    const newMembers = safeStudents.filter(s => s.role === 'new');

    const warnings = [...normalizeWarnings];

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
        // Chỉ lưu mã định danh, không nhân bản lại toàn bộ hồ sơ sinh viên
        // (hồ sơ đầy đủ đã nằm sẵn trong mảng students đầu vào).
        studentId: s.id,
        fullName: s.fullName,
        role: s.role,
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

  function attachWeekAliases(target, weeks) {
    for (let w = 1; w <= 4; w++) {
      Object.defineProperty(target, `week${w}`, {
        value: weeks[w - 1] || null,
        enumerable: false,
        writable: true,
        configurable: true
      });
    }
    return target;
  }

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
    const normalizeWarnings = [];
    const safeStudents = normalizeStudents(allStudents, normalizeWarnings);
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
      const emptyResult = {
        success: true,
        timestamp: Date.now(),
        totalWeeks: numWeeks,
        year: parseInt(year, 10) || 2026,
        month: parseInt(month, 10) || 10,
        calendarWeeks,
        weeks: emptyWeeks,
        combinedStats: {},
        totalStudents: 0,
        uniqueAssignedCount: 0,
        totalShiftsInMonth: numWeeks * SHIFTS.length,
        unassignedMonthMembers: [],
        warnings: ['Danh sách sinh viên rỗng. Không có ca trực nào được phân bổ trong chu kỳ.']
      };
      attachWeekAliases(emptyResult, emptyWeeks);
      return emptyResult;
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
        // Không nhân bản hồ sơ sinh viên (đã có trong students đầu vào),
        // giữ payload đồng bộ gọn nhẹ hơn ~50%.
        studentId: s.id,
        fullName: s.fullName,
        role: s.role,
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

    const monthWarnings = [...normalizeWarnings];

    // ⚠️ THIẾU: gom cảnh báo của TỪNG TUẦN lên cấp tháng.
    // Trước đây monthWarnings chỉ nhận cảnh báo cấp tháng + normalize, còn
    // result.warnings của từng tuần (ví dụ "không còn ứng viên nào rảnh, buộc
    // phải xếp trùng ngày") bị bỏ rơi hoàn toàn. Giao diện chỉ đọc
    // result.warnings -> người dùng KHÔNG BAO GIỜ thấy những cảnh báo này,
    // dù dữ liệu lịch thực tế là bất khả thi.
    weeks.forEach(week => {
      (week.warnings || []).forEach(w => {
        // Gộp trùng lặp: 4 tuần có thể sinh cùng một cảnh báo.
        const msg = `Tuần ${week.weekNumber}: ${w}`;
        if (!monthWarnings.includes(msg)) monthWarnings.push(msg);
      });
    });

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

    const result = {
      success: true,
      timestamp: Date.now(),
      totalWeeks: numWeeks,
      year: parseInt(year, 10) || 2026,
      month: parseInt(month, 10) || 10,
      calendarWeeks,
      weeks,
      combinedStats,
      totalStudents: safeStudents.length,
      uniqueAssignedCount,
      totalShiftsInMonth: numWeeks * SHIFTS.length,
      unassignedMonthMembers,
      warnings: monthWarnings
    };

    // Bí danh week1..week4 giữ tương thích với mã cũ (result.week1...).
    // Đánh dấu non-enumerable để JSON.stringify KHÔNG serialize trùng lặp
    // cùng dữ liệu với weeks[] — giảm ~50% dung lượng lưu trữ & payload Cloud.
    attachWeekAliases(result, weeks);

    return result;
  }

  // Bí danh tương thích ngược
  /**
   * MonthCalendarHelper: Tiện ích tính lịch dương hành chính 4 tuần trong tháng.
   *
   * Bản canonical nằm trong js/month_calendar.js. Trước đây file này định nghĩa
   * MỘT BẢN SAO riêng và chúng đã phân kỳ: bản trong đây thiếu kiểm tra khoảng
   * `arg2` nên gọi 1 tham số biến ra năm 2194 — mà bản này lại là bản thật sự
   * chạy trên trình duyệt (month_calendar.js được nạp trước, scheduler.js ghi đè).
   * Vì vậy chỉ giữ MỘT định nghĩa, ở đây.
   *
   * Nguồn lấy theo thứ tự: window (trình duyệt và sandbox eval),
   * rồi require('./month_calendar.js') (Node). Không có thì ném lỗi rõ ràng
   * ngay lúc nạp, thay vì âm thầm tính sai ngày tháng.
   */
  // Bí danh tương thích ngược
  function runMonthSchedule(allStudents, year = 2026, month = 10) {
    return solveMultiWeekSchedule(allStudents, 4, year, month);
  }

  function runTwoWeekSchedule(allStudents, year = 2026, month = 10) {
    return solveMultiWeekSchedule(allStudents, 4, year, month);
  }
  function resolveMonthCalendarHelper() {
    if (typeof window !== 'undefined' && window.MonthCalendarHelper) {
      return window.MonthCalendarHelper;
    }
    try {
      // eslint-disable-next-line global-require
      return require('./month_calendar.js');
    } catch (e) {
      return null;
    }
  }

  const MonthCalendarHelper = resolveMonthCalendarHelper();

  if (!MonthCalendarHelper) {
    throw new Error(
      '[scheduler.js] MonthCalendarHelper chưa được nạp. Phải nạp js/month_calendar.js '
      + 'TRƯỚC js/scheduler.js (đúng như index.html và admin.html làm).'
    );
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
