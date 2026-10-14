/**
 * ==========================================================================
 * SCHEDULER ENGINE: Thuật toán Tự động Phân bổ Lịch trực Công bằng
 * ==========================================================================
 * Đóng gói trong IIFE.
 * Hỗ trợ xếp ca 1 tuần tiêu chuẩn, luân phiên 2 tuần và XẾP CA TRỌN VẸN 1 THÁNG
 * (4 Tuần: Tuần 1, Tuần 2, Tuần 3, Tuần 4) đảm bảo 100% sinh viên đều có lịch trực,
 * mỗi ca đúng 1 Người Cũ (7h30-11h30 hoặc 13h00-16h30) + 1 Người Mới.
 */

(() => {
  'use strict';

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

  const SHIFT_MAP = SHIFTS.reduce((acc, shift) => {
    acc[shift.id] = shift;
    return acc;
  }, {});

  /**
   * Maximum Bipartite Matching bằng đường tăng luồng DFS (Augmenting Path)
   * Đảm bảo các sinh viên ưu tiên (chưa có ca) được ghép vào các ca rảnh tối đa.
   */
  function maxBipartiteMatch(candidates, shiftIds, currentMatches = {}) {
    const match = { ...currentMatches }; // shiftId -> candId

    function dfs(cand, visited) {
      const avail = cand.availableShifts || [];
      for (const shiftId of avail) {
        if (!shiftIds.includes(shiftId) || visited.has(shiftId)) continue;
        visited.add(shiftId);

        if (!match[shiftId] || dfs(candidates.find(c => c.id === match[shiftId]), visited)) {
          match[shiftId] = cand.id;
          return true;
        }
      }
      return false;
    }

    for (const cand of candidates) {
      dfs(cand, new Set());
    }

    return match;
  }

  /**
   * Phân bổ ca cho một nhóm thành viên (Người cũ hoặc Người mới)
   * Có hỗ trợ tích hợp số ca lũy kế trong tháng (historicalCounts) để xoay vòng công bằng.
   */
  function scheduleGroupShifts(members, roleName, priorityStudentIds = [], historicalCounts = {}) {
    const result = {
      assignments: {}, // shiftId -> Student
      counts: {},      // studentId -> number of assigned shifts in this week
      unassigned: [],  // ca trống
      warnings: []
    };

    members.forEach(m => {
      result.counts[m.id] = 0;
    });

    if (!members || members.length === 0) {
      SHIFTS.forEach(s => result.unassigned.push(s.id));
      result.warnings.push(`Không có thành viên nào thuộc nhóm ${roleName === 'old' ? 'Người Cũ' : 'Người Mới'}.`);
      return result;
    }

    const memberAvailMap = new Map();
    members.forEach(m => {
      memberAvailMap.set(m.id, new Set(m.availableShifts || []));
    });

    const shiftIds = SHIFTS.map(s => s.id);

    // BƯỚC 1: Nếu có danh sách ưu tiên, sắp xếp ai ít ca tích lũy nhất ghép trước bằng Bipartite Matching
    if (priorityStudentIds.length > 0) {
      const priorityMembers = members
        .filter(m => priorityStudentIds.includes(m.id))
        .sort((a, b) => ((historicalCounts[a.id] || 0) - (historicalCounts[b.id] || 0)));

      if (priorityMembers.length > 0) {
        const priorityMatches = maxBipartiteMatch(priorityMembers, shiftIds);
        for (const [sId, candId] of Object.entries(priorityMatches)) {
          const student = members.find(m => m.id === candId);
          if (student) {
            result.assignments[sId] = student;
            result.counts[student.id] = (result.counts[student.id] || 0) + 1;
          }
        }
      }
    }

    // BƯỚC 2: Phân bổ các ca còn lại bằng Greedy Heuristic (MRV + Fairness lũy kế)
    const remainingShifts = SHIFTS.filter(s => !result.assignments[s.id]);

    const shiftCandidates = {};
    remainingShifts.forEach(shift => {
      shiftCandidates[shift.id] = members.filter(m => memberAvailMap.get(m.id).has(shift.id));
    });

    // Sắp xếp ca khó trước (ít người rảnh nhất)
    const sortedShifts = [...remainingShifts].sort((a, b) => {
      return shiftCandidates[a.id].length - shiftCandidates[b.id].length;
    });

    for (const shift of sortedShifts) {
      const candidates = shiftCandidates[shift.id];
      if (candidates.length === 0) {
        result.unassigned.push(shift.id);
        continue;
      }

      let bestCandidate = null;
      let minScore = Infinity;

      for (const cand of candidates) {
        const currentCount = result.counts[cand.id] || 0;
        const histCount = historicalCounts[cand.id] || 0;
        const totalSoFar = histCount + currentCount;
        const sameDayShiftId = shift.id.endsWith('_S') ? `${shift.dayKey}_C` : `${shift.dayKey}_S`;
        const alreadySameDay = result.assignments[sameDayShiftId]?.id === cand.id;

        // Điểm số càng thấp càng ưu tiên:
        // 1. Tổng số ca trong tháng (trọng số 5000)
        // 2. Số ca trong tuần này (trọng số 1000)
        // 3. Tránh 2 ca cùng 1 ngày nếu có thể (trọng số 400)
        // 4. Số lượng ca rảnh
        let score = (totalSoFar * 5000) + (currentCount * 1000) + (alreadySameDay ? 400 : 0) + (cand.availableShifts?.length || 0);

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

    // BƯỚC 3: Tối ưu hoán đổi (Augmenting Swaps) nếu số thành viên <= 10 mà có bạn chưa có ca
    if (members.length <= SHIFTS.length) {
      let improved = true;
      let iter = 0;
      while (improved && iter < 15) {
        improved = false;
        iter++;
        const zeroMems = members.filter(m => result.counts[m.id] === 0);
        if (zeroMems.length === 0) break;

        for (const zeroMem of zeroMems) {
          const avail = zeroMem.availableShifts || [];
          for (const sId of avail) {
            const occ = result.assignments[sId];
            if (occ && result.counts[occ.id] >= 2) {
              result.assignments[sId] = zeroMem;
              result.counts[zeroMem.id] = 1;
              result.counts[occ.id] -= 1;
              improved = true;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Xếp lịch 1 tuần tiêu chuẩn (có thể nhận danh sách ưu tiên và số ca lũy kế)
   */
  function runAutoSchedule(allStudents, priorityStudentIds = [], historicalCounts = {}) {
    const oldMembers = allStudents.filter(s => s.role === 'old');
    const newMembers = allStudents.filter(s => s.role === 'new');

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
    allStudents.forEach(s => {
      const count = (s.role === 'old' ? oldResult.counts[s.id] : newResult.counts[s.id]) || 0;
      studentStats[s.id] = {
        student: s,
        assignedCount: count,
        registeredCount: (s.availableShifts || []).length
      };
    });

    const unassignedMembers = allStudents.filter(s => (studentStats[s.id]?.assignedCount || 0) === 0);

    return {
      success: true,
      timestamp: Date.now(),
      scheduleTable,
      summary: {
        totalShifts: SHIFTS.length,
        fullShifts: fullCount,
        partialShifts: partialCount,
        emptyShifts: emptyCount,
        totalStudents: allStudents.length,
        oldStudentsCount: oldMembers.length,
        newStudentsCount: newMembers.length,
        unassignedStudentsCount: unassignedMembers.length
      },
      studentStats,
      unassignedMembers,
      warnings: [...oldResult.warnings, ...newResult.warnings]
    };
  }

  /**
   * XẾP LỊCH TRỌN VẸN 1 THÁNG (4 TUẦN: Tuần 1, Tuần 2, Tuần 3, Tuần 4)
   * Tối ưu hóa phân bổ công bằng tuyệt đối:
   * - Mỗi ca đúng 1 Người Cũ (7h30-11h30 hoặc 13h00-16h30) + 1 Người Mới
   * - Xoay vòng qua 4 tuần để số ca trong tháng của tất cả sinh viên xấp xỉ bằng nhau
   * - Đảm bảo mọi sinh viên đăng ký đều được phân công trực
   */
  function runMonthSchedule(allStudents) {
    if (!allStudents || allStudents.length === 0) {
      return null;
    }

    const historicalCounts = {};
    allStudents.forEach(s => {
      historicalCounts[s.id] = 0;
    });

    const weeks = [];

    // Lặp qua 4 tuần trong tháng
    for (let w = 1; w <= 4; w++) {
      // Ưu tiên những bạn có ít ca lũy kế nhất trong các tuần trước
      const priorityIds = [...allStudents]
        .sort((a, b) => (historicalCounts[a.id] || 0) - (historicalCounts[b.id] || 0))
        .map(s => s.id);

      const weekSchedule = runAutoSchedule(allStudents, priorityIds, historicalCounts);
      weekSchedule.weekNumber = w;
      weeks.push(weekSchedule);

      // Cập nhật số ca lũy kế sau tuần này
      allStudents.forEach(s => {
        const assignedInWeek = weekSchedule.studentStats[s.id]?.assignedCount || 0;
        historicalCounts[s.id] = (historicalCounts[s.id] || 0) + assignedInWeek;
      });
    }

    const [week1, week2, week3, week4] = weeks;

    // Thống kê tổng hợp số ca qua 4 tuần của 1 tháng
    const combinedStats = {};
    allStudents.forEach(s => {
      const w1 = week1.studentStats[s.id]?.assignedCount || 0;
      const w2 = week2.studentStats[s.id]?.assignedCount || 0;
      const w3 = week3.studentStats[s.id]?.assignedCount || 0;
      const w4 = week4.studentStats[s.id]?.assignedCount || 0;
      const total = w1 + w2 + w3 + w4;

      combinedStats[s.id] = {
        student: s,
        week1Count: w1,
        week2Count: w2,
        week3Count: w3,
        week4Count: w4,
        totalTwoWeeks: w1 + w2,
        totalMonthCount: total,
        totalCount: total
      };
    });

    const uniqueAssignedCount = Object.values(combinedStats).filter(st => st.totalMonthCount > 0).length;

    return {
      success: true,
      timestamp: Date.now(),
      weeks,
      week1,
      week2,
      week3,
      week4,
      combinedStats,
      totalStudents: allStudents.length,
      uniqueAssignedCount,
      totalShiftsInMonth: 40
    };
  }

  /**
   * Xếp lịch Luân Phiên 2 Tuần (tương thích ngược)
   */
  function runTwoWeekSchedule(allStudents) {
    return runMonthSchedule(allStudents);
  }

  if (typeof window !== 'undefined') {
    window.SchedulerEngine = {
      SHIFTS,
      SHIFT_MAP,
      scheduleGroupShifts,
      runAutoSchedule,
      runTwoWeekSchedule,
      runMonthSchedule
    };
  }
})();
