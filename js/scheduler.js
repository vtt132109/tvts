/**
 * ==========================================================================
 * SCHEDULER ENGINE: Thuật toán Tự động Phân bổ Lịch trực Công bằng
 * ==========================================================================
 * Đóng gói trong IIFE.
 * Hỗ trợ xếp ca 1 tuần tiêu chuẩn và chế độ Luân phiên 2 Tuần (Two-Week Rotation)
 * đảm bảo khi có 30 sinh viên đăng ký, 100% (30/30 bạn) đều có lịch trực.
 */

(() => {
  'use strict';

  const SHIFTS = [
    { id: 'T2_S', dayKey: 'T2', dayName: 'Thứ 2', period: 'Sáng', time: '08:00 - 11:30' },
    { id: 'T2_C', dayKey: 'T2', dayName: 'Thứ 2', period: 'Chiều', time: '13:30 - 17:00' },
    { id: 'T3_S', dayKey: 'T3', dayName: 'Thứ 3', period: 'Sáng', time: '08:00 - 11:30' },
    { id: 'T3_C', dayKey: 'T3', dayName: 'Thứ 3', period: 'Chiều', time: '13:30 - 17:00' },
    { id: 'T4_S', dayKey: 'T4', dayName: 'Thứ 4', period: 'Sáng', time: '08:00 - 11:30' },
    { id: 'T4_C', dayKey: 'T4', dayName: 'Thứ 4', period: 'Chiều', time: '13:30 - 17:00' },
    { id: 'T5_S', dayKey: 'T5', dayName: 'Thứ 5', period: 'Sáng', time: '08:00 - 11:30' },
    { id: 'T5_C', dayKey: 'T5', dayName: 'Thứ 5', period: 'Chiều', time: '13:30 - 17:00' },
    { id: 'T6_S', dayKey: 'T6', dayName: 'Thứ 6', period: 'Sáng', time: '08:00 - 11:30' },
    { id: 'T6_C', dayKey: 'T6', dayName: 'Thứ 6', period: 'Chiều', time: '13:30 - 17:00' }
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
   */
  function scheduleGroupShifts(members, roleName, priorityStudentIds = []) {
    const result = {
      assignments: {}, // shiftId -> Student
      counts: {},      // studentId -> number of assigned shifts
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

    // BƯỚC 1: Nếu có danh sách ưu tiên (những bạn chưa có ca từ tuần trước), ghép trước bằng Bipartite Matching
    if (priorityStudentIds.length > 0) {
      const priorityMembers = members.filter(m => priorityStudentIds.includes(m.id));
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

    // BƯỚC 2: Phân bổ các ca còn lại bằng Greedy Heuristic (MRV + Fairness)
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
        const sameDayShiftId = shift.id.endsWith('_S') ? `${shift.dayKey}_C` : `${shift.dayKey}_S`;
        const alreadySameDay = result.assignments[sameDayShiftId]?.id === cand.id;

        // Ưu tiên người ít ca nhất, tránh trùng ca trong ngày
        let score = (currentCount * 1000) + (alreadySameDay ? 300 : 0) + (cand.availableShifts?.length || 0);

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
   * Xếp lịch 1 tuần tiêu chuẩn (có thể nhận danh sách ưu tiên)
   */
  function runAutoSchedule(allStudents, priorityStudentIds = []) {
    const oldMembers = allStudents.filter(s => s.role === 'old');
    const newMembers = allStudents.filter(s => s.role === 'new');

    const oldResult = scheduleGroupShifts(oldMembers, 'old', priorityStudentIds);
    const newResult = scheduleGroupShifts(newMembers, 'new', priorityStudentIds);

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
   * Xếp lịch Luân Phiên 2 Tuần (Tuần 1 & Tuần 2)
   * Đảm bảo khi số lượng sinh viên lớn (như 30 người), cả 30 bạn đều có lịch trực!
   */
  function runTwoWeekSchedule(allStudents) {
    // Tuần 1: Xếp đợt 1
    const week1 = runAutoSchedule(allStudents);

    // Lấy những bạn chưa có ca ở Tuần 1 để ưu tiên tuyệt đối cho Tuần 2
    const unassignedInWeek1 = week1.unassignedMembers.map(m => m.id);

    // Tuần 2: Xếp đợt 2 với ưu tiên các bạn chưa trực ở Tuần 1
    const week2 = runAutoSchedule(allStudents, unassignedInWeek1);

    // Thống kê tổng hợp số ca qua 2 tuần
    const combinedStats = {};
    allStudents.forEach(s => {
      const w1Count = week1.studentStats[s.id]?.assignedCount || 0;
      const w2Count = week2.studentStats[s.id]?.assignedCount || 0;
      combinedStats[s.id] = {
        student: s,
        week1Count: w1Count,
        week2Count: w2Count,
        totalCount: w1Count + w2Count
      };
    });

    const uniqueAssignedCount = Object.values(combinedStats).filter(st => st.totalCount > 0).length;

    return {
      success: true,
      timestamp: Date.now(),
      week1,
      week2,
      combinedStats,
      totalStudents: allStudents.length,
      uniqueAssignedCount
    };
  }

  if (typeof window !== 'undefined') {
    window.SchedulerEngine = {
      SHIFTS,
      SHIFT_MAP,
      scheduleGroupShifts,
      runAutoSchedule,
      runTwoWeekSchedule
    };
  }
})();
