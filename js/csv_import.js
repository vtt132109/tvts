/**
 * ==========================================================================
 * NHẬP CSV DANH SÁCH CTV & GOOGLE FORM (tách từ js/admin.js — #3.3)
 * ==========================================================================
 * Chỉ phân tích văn bản CSV thành danh sách ứng viên + báo cáo lỗi/cảnh báo;
 * KHÔNG đụng DOM hay localStorage. Phụ thuộc duy nhất vào admin là đối tượng
 * `state` (đọc `students`, `currentMonth`, `currentYear`) được truyền vào.
 *
 * Nạp SAU js/scheduler.js và js/month_calendar.js, TRƯỚC js/admin.js.
 */

(() => {
  'use strict';

  /**
   * @param {{state: {students?: Array, currentMonth?: number, currentYear?: number}}} deps
   */
  function create(deps) {
    const state = deps.state;
    const { SHIFTS } = window.SchedulerEngine || {};

    // Báo cáo gần nhất của parseStudentsCsv() — analyzeStudentsCsv() đọc lại
    // để trả về errors/warnings/stats mà không phải parse lần hai.
    let lastCsvReport = null;

    /**
     * Phân tích CSV danh sách CTV.
     *
     * VẪN trả về mảng candidates như hợp đồng cũ: scripts/khoi_phuc_58.js trích
     * thân hàm này và tìm đúng chuỗi `return candidates;`. Báo cáo chi tiết được
     * gắn vào lastCsvReport để analyzeStudentsCsv() đọc lại.
     */
    function parseStudentsCsv(csvText) {
      const candidates = [];
      const errors = [];
      const warnings = [];
      const stats = {
        totalRows: 0,
        validRows: 0,
        duplicateRows: 0,
        ignoredRows: 0,
        roleColumnFound: false
      };
      lastCsvReport = { candidates, errors, warnings, stats };

      if (!csvText || typeof csvText !== 'string') {
        errors.push('Nội dung CSV rỗng hoặc không phải văn bản.');
        return [];
      }
      const cleanText = csvText.replace(/^\uFEFF/, '');
      const lines = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      if (lines.length < 2) {
        errors.push('File CSV phải có dòng tiêu đề và ít nhất một dòng dữ liệu.');
        return [];
      }

      const validShiftIds = (SHIFTS || []).map(s => s.id);

      function parseCsvRow(lineStr) {
        const row = [];
        let inQuotes = false;
        let currentVal = '';
        for (let c = 0; c < lineStr.length; c++) {
          const ch = lineStr[c];
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
        return row.map(v => v.replace(/^"|"$/g, '').trim());
      }

      const headerRowFor = (lineStr) => {
        const idx = { fullName: -1, studentId: -1, phone: -1, role: -1, shifts: -1 };
        parseCsvRow(lineStr).forEach((col, i) => {
          const h = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          // Ô email không bao giờ là tiêu đề cột; bỏ qua để tránh chuỗi
          // "…ten@example.com" bị nhận nhầm thành cột "Tên".
          if (h.includes('@')) return;
          if (idx.fullName === -1 && (h.includes('ho ten') || h.includes('ho va ten') || h.includes('ten') || h.includes('fullname') || h.includes('name'))) {
            idx.fullName = i;
          } else if (idx.studentId === -1 && (h.includes('mssv') || h.includes('ma so sinh vien') || h.includes('ma sv') || h.includes('student id') || h.includes('studentid') || h === 'id')) {
            idx.studentId = i;
          } else if (idx.phone === -1 && (h.includes('sdt') || h.includes('dien thoai') || h.includes('phone') || h.includes('so dien thoai') || h.includes('mobile'))) {
            idx.phone = i;
          } else if (idx.role === -1 && (h.includes('vai tro') || h.includes('phan loai') || h.includes('doi tuong') || h.includes('loai') || h.includes('role'))) {
            idx.role = i;
          } else if (idx.shifts === -1 && (h.includes('ca') || h.includes('shift') || h.includes('dang ky'))) {
            idx.shifts = i;
          }
        });
        return idx;
      };

      // Dòng tiêu đề KHÔNG nhất thiết nằm ở dòng 1: file xuất Google Sheets
      // thường có dòng tiêu đề lớn ("DANH SÁCH CTV TVTS") + dòng trống phía trên.
      // Quét tối đa 10 dòng không trống đầu tiên để tìm dòng có cột Họ tên/MSSV.
      let headerLineIndex = -1;
      let colIdx = { fullName: -1, studentId: -1, phone: -1, role: -1, shifts: -1 };
      let scannedRows = 0;
      for (let r = 0; r < lines.length && scannedRows < 10; r++) {
        const ln = lines[r].trim();
        if (!ln) continue;
        scannedRows++;
        const detected = headerRowFor(ln);
        const score = (detected.fullName !== -1 ? 1 : 0) + (detected.studentId !== -1 ? 1 : 0);
        if (score === 2) {
          headerLineIndex = r;
          colIdx = detected;
          break;
        }
        if (score === 1 && headerLineIndex === -1) {
          headerLineIndex = r;
          colIdx = detected;
        }
      }

      // Không nhận ra cả cột Họ tên lẫn MSSV -> chỉ còn cách đoán theo VỊ TRÍ.
      // Việc đoán này chỉ hợp lý khi dữ liệu thật sự trông giống [Họ tên, MSSV].
      const positionalMode = headerLineIndex === -1;
      let startIndex = 0;
      if (positionalMode) {
        const firstDataLine = lines.findIndex(ln => ln.trim());
        const baseIndex = firstDataLine >= 0 ? firstDataLine : 0;
        const firstRow = parseCsvRow(lines[baseIndex] || '');
        colIdx = { fullName: 0, studentId: 1, phone: 2, role: -1, shifts: 4 };
        const looksLikeData = /^\d{5,15}$/.test(firstRow[1] || '') || /^\d{5,15}$/.test(firstRow[0] || '');
        startIndex = looksLikeData ? baseIndex : baseIndex + 1;
      } else {
        if (colIdx.fullName === -1) colIdx.fullName = 0;
        if (colIdx.studentId === -1) colIdx.studentId = 1;
        if (colIdx.phone === -1) colIdx.phone = 2;
        if (colIdx.role === -1) colIdx.role = -1;
        if (colIdx.shifts === -1) colIdx.shifts = -1;
        startIndex = headerLineIndex + 1;
      }

      // ⚠️ NẾU TIÊU ĐỀ CỘT VAI TRÒ TRỐNG, PHẢI ĐOÁN THEO NỘI DUNG CHỨ KHÔNG
      // ĐOÁN THEO VỊ TRÍ.
      //
      // File CSV thật của Ban: "STT,Họ và tên,MSSV,Email," — cột thứ 5 KHÔNG
      // CÓ tên tiêu đề, chỉ chứa giá trị "CTV cũ" / "CTV mới".
      // Trước đây khi không tìm thấy cột vai trò theo tiêu đề, code đoán cứng
      // là cột index 3 — cột đó trong file này là EMAIL. Kết quả đo thật:
      //   58/58 người bị nhận thành Tập Sự (0 Chính Thức)
      // vì địa chỉ email không chứa từ khoá "cũ", và luật 1 Chính Thức +
      // 1 Tập Sự vì thế không thể xếp ca nào.
      if (colIdx.role === -1) {
        // Quét các dòng dữ liệu, tìm cột có giá trị trông như vai trò
        const deGiaiDau = [];
        for (let r = startIndex; r < lines.length && deGiaiDau.length < 12; r++) {
          const ln = lines[r].trim();
          if (!ln) continue;
          deGiaiDau.push(parseCsvRow(ln));
        }

        const laVaiTro = (v) => {
          const s = String(v || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (!s) return false;
          return /^(ctv\s*)?(cu|moi|chinh thuc|tap su|tap su|old|new|nguoi cu|nguoi moi)$/
            .test(s.replace(/\s+/g, ' '));
        };

        const soCot = Math.max(...deGiaiDau.map(r => r.length), 0);
        for (let c = 0; c < soCot; c++) {
          // Bỏ qua cột đã gán cho tên/MSSV/SĐT và cột có dạng email
          if (c === colIdx.fullName || c === colIdx.studentId || c === colIdx.phone) continue;
          const gia = deGiaiDau.map(r => r[c]);
          const khop = gia.filter(laVaiTro).length;
          // Cần phần lớn các dòng khớp mới coi là cột vai trò
          if (khop >= Math.max(2, Math.ceil(gia.length * 0.6))) {
            colIdx.role = c;
            break;
          }
        }
      }
      stats.roleColumnFound = colIdx.role !== -1;

      const seenStudentIds = new Set();
      const unknownShiftTokens = new Set();
      const ignoredLineNumbers = [];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = parseCsvRow(line);
        // Excel/Google Sheets hay để lại hàng trăm dòng ",,,,,,," ở cuối file.
        // Đó không phải dòng dữ liệu lỗi — bỏ qua hẳn, không tính ignoredRows.
        if (row.every(cell => !cell)) continue;
        stats.totalRows++;

        let fullName = (row[colIdx.fullName] || '').trim();
        let studentId = (row[colIdx.studentId] || '').trim();
        const phone = (row[colIdx.phone] || '').trim();
        const roleRaw = (row[colIdx.role] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const shiftsRaw = (row[colIdx.shifts] || '').trim();

        if (/^\d{6,10}$/.test(fullName) && !/^\d{6,10}$/.test(studentId)) {
          const tmp = fullName;
          fullName = studentId;
          studentId = tmp;
        }

        if (!fullName || !studentId) {
          stats.ignoredRows++;
          if (ignoredLineNumbers.length < 8) ignoredLineNumbers.push(i + 1);
          continue;
        }

        // Chế độ đoán theo vị trí chỉ đáng tin khi MSSV trông như MSSV thật và
        // cột 1 không phải email/số điện thoại.
        if (positionalMode && (!/^\d{5,15}$/.test(studentId) || /@/.test(fullName))) {
          stats.ignoredRows++;
          if (ignoredLineNumbers.length < 8) ignoredLineNumbers.push(i + 1);
          continue;
        }

        const idKey = studentId.toLowerCase();
        if (seenStudentIds.has(idKey)) {
          stats.duplicateRows++;
          errors.push(`MSSV "${studentId}" bị trùng trong file (dòng ${i + 1}); dòng trùng đã bị bỏ qua.`);
          continue;
        }
        seenStudentIds.add(idKey);

        // So khớp CẢ GIÁ TRỊ, không dùng includes() rời.
        // Trước đây `roleRaw.includes('cu')` khớp trúng bất kỳ chuỗi nào có
        // chữ "cu" — ví dụ email "nguyencuong@..." hoặc tên "Đặng Thị Cúc"
        // sẽ bị nhận nhầm là Chính Thức.
        const roleText = roleRaw.replace(/\s+/g, ' ');
        const isOld = /^(ctv\s*)?(cu|nguoi cu|chinh thuc|old|kinh nghiem|vet|ct)$/.test(roleText);
        const role = isOld ? 'old' : 'new';

        const availableShifts = [];
        const shiftTokens = shiftsRaw.split(/[,;\s]+/).map(t => t.trim().toUpperCase().replace('-', '_'));

        shiftTokens.forEach(token => {
          if (!token) return;
          if (validShiftIds.includes(token)) {
            if (!availableShifts.includes(token)) availableShifts.push(token);
          } else if (colIdx.shifts !== -1) {
            unknownShiftTokens.add(token);
          }
        });

        const isExisting = (state.students || []).some(s => s.studentId && s.studentId.toLowerCase() === studentId.toLowerCase());

        candidates.push({
          fullName,
          studentId,
          phone,
          role,
          availableShifts,
          isExisting
        });
      }

      if (!stats.roleColumnFound && candidates.length > 0) {
        warnings.push('Không tìm thấy cột vai trò — hệ thống không dùng vai trò để xếp ca, mọi CTV được xếp như nhau.');
      }
      if (stats.ignoredRows > 0) {
        const shown = ignoredLineNumbers.join(', ');
        const more = stats.ignoredRows > ignoredLineNumbers.length ? '…' : '';
        warnings.push(`Đã bỏ qua ${stats.ignoredRows} dòng thiếu Họ tên hoặc MSSV (dòng ${shown}${more}).`);
      }
      if (unknownShiftTokens.size > 0) {
        const tokens = [...unknownShiftTokens];
        warnings.push(`Có ${tokens.length} mã ca không nhận diện được và đã bị bỏ qua: ${tokens.slice(0, 8).join(', ')}${tokens.length > 8 ? '…' : ''}.`);
      }

      if (candidates.length === 0) {
        if (positionalMode) {
          errors.push('Không nhận diện được cột Họ tên/MSSV trong dòng tiêu đề và cũng không có dữ liệu vị trí hợp lệ (cột 1 = Họ tên, cột 2 = MSSV) để nhập.');
        } else {
          errors.push('Không đọc được dòng dữ liệu sinh viên hợp lệ nào từ file.');
        }
      }

      stats.validRows = candidates.length;
      return candidates;
    }

    /**
     * Phân tích CSV kèm báo cáo lỗi/cảnh báo/thống kê theo hợp đồng 11D.
     * @returns {{candidates: Array, errors: string[], warnings: string[], stats: Object}}
     */
    function analyzeStudentsCsv(csvText) {
      const candidates = parseStudentsCsv(csvText);
      const report = lastCsvReport || {
        errors: [],
        warnings: [],
        stats: { totalRows: 0, validRows: 0, duplicateRows: 0, ignoredRows: 0, roleColumnFound: false }
      };
      return {
        candidates,
        errors: report.errors.slice(),
        warnings: report.warnings.slice(),
        stats: Object.assign({}, report.stats)
      };
    }

    /**
     * Đọc một dòng CSV (hỗ trợ ô trong ngoặc kép). Tách riêng khỏi
     * parseStudentsCsv vì scripts/khoi_phuc_58.js trích nguyên thân hàm đó.
     */
    function parseCsvRowSimple(lineStr) {
      const row = [];
      let inQuotes = false;
      let currentVal = '';
      for (let c = 0; c < lineStr.length; c++) {
        const ch = lineStr[c];
        if (ch === '"') {
          if (inQuotes && lineStr[c + 1] === '"') {
            currentVal += '"';
            c++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          row.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += ch;
        }
      }
      row.push(currentVal.trim());
      return row.map(v => v.replace(/^"|"$/g, '').trim());
    }

    function normalizeCsvText(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    /** Đọc mốc thời gian Google Form: "2026/10/16 9:50:18 CH GMT+7". */
    function parseGoogleFormTimestamp(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(SA|CH|AM|PM)?/i);
      if (!m) return 0;
      let hour = parseInt(m[4], 10);
      const marker = (m[7] || '').toUpperCase();
      if (marker === 'CH' || marker === 'PM') {
        if (hour < 12) hour += 12;
      } else if (marker === 'SA' || marker === 'AM') {
        if (hour === 12) hour = 0;
      }
      const date = new Date(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        hour, parseInt(m[5], 10), parseInt(m[6] || 0, 10)
      );
      return date.getTime() || 0;
    }

    /** File CSV phản hồi Google Form có 4 cột "Ngày … — Chọn các buổi". */
    function isGoogleFormResponseCsv(csvText) {
      if (!csvText || typeof csvText !== 'string') return false;
      const lines = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split('\n').filter(l => l.trim()).slice(0, 12);
      return lines.some(line => {
        const headers = parseCsvRowSimple(line).map(normalizeCsvText);
        const hasName = headers.some(h => h.includes('ho va ten') || h.includes('ho ten') || h === 'ten' || h.includes('fullname'));
        const hasId = headers.some(h => h.includes('ma so sinh vien') || h.includes('mssv') || h.includes('ma sv'));
        const hasWeek = headers.some(h => h.includes('chon cac buoi') || (h.startsWith('ngay ') && h.includes('/')));
        return hasName && hasId && hasWeek;
      });
    }

    /**
     * Nhập phản hồi Google Form cho ĐÚNG tháng đang mở.
     * Mỗi lựa chọn "dd/mm (Thứ X) — Sáng/Chiều" được ánh xạ vào tuần chứa ngày
     * đó (MonthCalendarHelper) và mã ca T2_S..T6_C; ngày của tháng khác bị bỏ qua.
     */
    function analyzeGoogleFormCsv(csvText, options) {
      const targetMonth = parseInt(options && options.month, 10) || state.currentMonth || 10;
      const targetYear = parseInt(options && options.year, 10) || state.currentYear || 2026;
      const report = {
        candidates: [],
        errors: [],
        warnings: [],
        mode: 'google_form',
        stats: {
          totalRows: 0,
          validRows: 0,
          duplicateRows: 0,
          ignoredRows: 0,
          unmatchedRows: 0,
          outOfMonthSelections: 0,
          invalidSelections: 0,
          skippedNewerRows: 0,
          noShiftsRows: 0,
          roleColumnFound: true
        }
      };

      if (!csvText || typeof csvText !== 'string') {
        report.errors.push('Nội dung CSV rỗng hoặc không phải văn bản.');
        lastCsvReport = report;
        return report;
      }

      const lines = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      let header = null;
      for (let r = 0; r < lines.length && r < 15; r++) {
        if (!lines[r].trim()) continue;
        const cols = parseCsvRowSimple(lines[r]);
        const norms = cols.map(normalizeCsvText);
        const nameIdx = norms.findIndex(h =>
          h.includes('ho va ten') || h.includes('ho ten') || h === 'ten' || h.includes('fullname'));
        const idIdx = norms.findIndex(h =>
          h.includes('ma so sinh vien') || h.includes('mssv') || h.includes('ma sv'));
        const weekIdxs = norms
          .map((h, i) => (h.includes('chon cac buoi') || (h.startsWith('ngay ') && h.includes('/')) ? i : -1))
          .filter(i => i >= 0);
        const tsIdx = norms.findIndex(h => h.includes('dau thoi gian') || h.includes('timestamp'));
        if (nameIdx >= 0 && idIdx >= 0 && weekIdxs.length > 0) {
          header = { row: r, nameIdx, idIdx, weekIdxs, tsIdx };
          break;
        }
      }
      if (!header) {
        report.errors.push('Không nhận diện được file phản hồi Google Form (cần cột Họ và tên, Mã số sinh viên và các cột "Ngày … — Chọn các buổi").');
        lastCsvReport = report;
        return report;
      }

      const helper = window.MonthCalendarHelper
        || (window.SchedulerEngine && window.SchedulerEngine.MonthCalendarHelper);
      const dateMap = {};
      if (helper && typeof helper.getMonthWeeks === 'function') {
        helper.getMonthWeeks(targetMonth, targetYear).forEach(week => {
          Object.values(week.days || {}).forEach(day => {
            if (day && day.fullDate) {
              dateMap[day.fullDate] = { week: week.weekNumber, dayKey: day.dayKey };
            }
          });
        });
      }
      if (Object.keys(dateMap).length === 0) {
        report.errors.push(`Không dựng được lịch tháng ${targetMonth}/${targetYear} để ánh xạ ngày.`);
        lastCsvReport = report;
        return report;
      }

      const pad2 = n => String(n).padStart(2, '0');
      const byMssv = new Map();

      for (let r = header.row + 1; r < lines.length; r++) {
        if (!lines[r].trim()) continue;
        const cols = parseCsvRowSimple(lines[r]);
        if (cols.every(c => !c)) continue;
        report.stats.totalRows++;

        const fullName = (cols[header.nameIdx] || '').trim();
        const studentId = (cols[header.idIdx] || '').trim();
        if (!fullName || !studentId) {
          report.stats.ignoredRows++;
          continue;
        }

        const tsRaw = header.tsIdx >= 0 ? (cols[header.tsIdx] || '').trim() : '';
        const weekly = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };

        header.weekIdxs.forEach(ci => {
          const cell = cols[ci] || '';
          cell.split(';').forEach(part => {
            const token = part.trim();
            if (!token) return;
            const normToken = normalizeCsvText(token);
            const match = normToken.match(
              /(\d{1,2})\s*\/\s*(\d{1,2})[^0-9]*?(?:—|-|–)\s*(sang|chieu)/i
            );
            if (!match) {
              report.stats.invalidSelections++;
              return;
            }
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10);
            if (month !== targetMonth) {
              report.stats.outOfMonthSelections++;
              return;
            }
            const dateKey = `${targetYear}-${pad2(month)}-${pad2(day)}`;
            const info = dateMap[dateKey];
            if (!info) {
              report.stats.invalidSelections++;
              return;
            }
            const period = match[3].toLowerCase() === 'sang' ? 'S' : 'C';
            weekly[info.week].add(`${info.dayKey}_${period}`);
          });
        });

        const stamp = parseGoogleFormTimestamp(tsRaw);
        const existed = byMssv.get(studentId);
        if (existed) {
          report.stats.duplicateRows++;
          if (stamp >= existed.stamp) {
            byMssv.set(studentId, { fullName, studentId, stamp, tsRaw, weekly });
          }
          continue;
        }
        byMssv.set(studentId, { fullName, studentId, stamp, tsRaw, weekly });
      }

      const unmatched = [];
      const noShifts = [];

      byMssv.forEach(entry => {
        const student = (state.students || []).find(
          s => s.studentId && s.studentId.toLowerCase() === entry.studentId.toLowerCase()
        );
        if (!student) {
          report.stats.unmatchedRows++;
          unmatched.push(entry.studentId);
          return;
        }

        const monthly = { 1: [], 2: [], 3: [], 4: [] };
        const union = [];
        [1, 2, 3, 4].forEach(week => {
          monthly[week] = Array.from(entry.weekly[week]);
          monthly[week].forEach(shiftId => {
            if (!union.includes(shiftId)) union.push(shiftId);
          });
        });
        if (union.length === 0) {
          report.stats.noShiftsRows++;
          noShifts.push(entry.studentId);
          return;
        }

        // Admin chủ động nhập file mới: file phải thắng dữ liệu ca rảnh đang có.
        // Trước đây phản hồi cũ hơn updatedAt bị bỏ qua, khiến nhập file mới
        // nhưng 13 CTV không được cập nhật và F5 trông như "quay về như cũ".
        report.candidates.push({
          fullName: entry.fullName,
          studentId: entry.studentId,
          phone: student.phone || '',
          role: student.role || '',
          monthlyAvailableShifts: monthly,
          availableShifts: union,
          isExisting: true,
          formSubmittedAt: entry.tsRaw
        });
      });

      report.stats.validRows = report.candidates.length;
      if (report.stats.outOfMonthSelections > 0) {
        report.warnings.push(`Đã bỏ qua ${report.stats.outOfMonthSelections} lựa chọn không thuộc tháng ${targetMonth}/${targetYear}.`);
      }
      if (report.stats.invalidSelections > 0) {
        report.warnings.push(`Có ${report.stats.invalidSelections} lựa chọn không đọc được ngày/ca và đã bị bỏ qua.`);
      }
      if (report.stats.duplicateRows > 0) {
        report.warnings.push(`Có ${report.stats.duplicateRows} phản hồi trùng MSSV; đã dùng phản hồi mới nhất.`);
      }
      if (unmatched.length > 0) {
        report.warnings.push(`Bỏ qua ${unmatched.length} MSSV không có trong danh sách CTV: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '…' : ''}.`);
      }
      if (noShifts.length > 0) {
        report.warnings.push(`Bỏ qua ${noShifts.length} người không chọn ca nào trong tháng ${targetMonth}/${targetYear}.`);
      }
      if (report.candidates.length === 0) {
        report.errors.push(`Không có CTV nào có ca rảnh trong tháng ${targetMonth}/${targetYear} để nhập.`);
      }

      lastCsvReport = report;
      return report;
    }

    return {
      parseStudentsCsv,
      analyzeStudentsCsv,
      isGoogleFormResponseCsv,
      analyzeGoogleFormCsv
    };
  }

  window.CsvImport = { create };
})();
