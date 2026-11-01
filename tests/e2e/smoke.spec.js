const { test, expect } = require('@playwright/test');
const fixtures = require('./fixtures');

async function seed(page, { local, session, testFlag = true, claim = null }) {
  await page.addInitScript(({ local, session, testFlag, claim }) => {
    if (testFlag) window.__TVTS_AUTH_TEST__ = true;
    // Chỉ seed một lần cho mỗi tab. Nếu seed lại ở mỗi reload, các bài test
    // kiểm tra lưu/xoá sẽ luôn thấy dữ liệu fixture cũ và không bắt được lỗi.
    if (sessionStorage.getItem('tvts_e2e_seeded') === '1') return;
    Object.entries(local || {}).forEach(([key, value]) => localStorage.setItem(key, value));
    Object.entries(session || {}).forEach(([key, value]) => sessionStorage.setItem(key, value));
    if (claim) {
      localStorage.setItem('ts_scheduler_claim_requests_v1', JSON.stringify([claim]));
    }
    sessionStorage.setItem('tvts_e2e_seeded', '1');
  }, { local, session, testFlag, claim });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:8137') || url.startsWith('data:')) {
      return route.continue();
    }
    return route.abort();
  });
});

test('admin: cờ sessionStorage giả không mở được dashboard', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession,
    testFlag: false
  });
  await page.goto('/admin.html');
  await page.waitForTimeout(2400);
  await expect(page.locator('#admin-auth-screen')).toBeVisible();
  await expect(page.locator('#admin-dashboard-container')).toBeHidden();
  const token = await page.evaluate(() => sessionStorage.getItem('ts_admin_authenticated'));
  expect(token).toBeNull();
});

test('admin: duyệt yêu cầu MSSV mới thêm CTV và ẩn hàng chờ', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession,
    claim: fixtures.pendingClaim
  });
  await page.goto('/admin.html');
  await expect(page.locator('#admin-dashboard-container')).toBeVisible();
  await page.click('#btn-tab-students');
  await expect(page.locator('#student-registration-summary')).toContainText('6 / 6 CTV');
  await expect(page.locator('#pending-claim-box')).toContainText('Người Mới Chờ Duyệt');
  await page.click('#pending-claim-box button[data-claim-action="approve"]');
  await expect(page.locator('#pending-claim-box')).toBeHidden();
  await expect(page.locator('#student-registration-summary')).toContainText('7 / 7 CTV');
});

test('admin: đổi nhanh 1 người/ca lưu đúng cấu hình tháng', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await expect(page.locator('#month-capacity-control')).toBeVisible();
  await page.click('#btn-month-capacity-1');
  await expect(page.locator('#btn-month-capacity-1')).toHaveClass(/active/);
  const config = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_scheduler_shift_capacity_v1') || '{}'));
  expect(config['2026-10'] && config['2026-10'].peoplePerShift).toBe(1);
});

test('admin: xóa người khỏi ca và giữ trống sau reload', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  const before = await page.evaluate(() =>
    window.adminTestHelper.getState().monthSchedule.weeks[0].scheduleTable.T2_S.oldMember?.fullName
  );
  expect(before).toBeTruthy();

  await page.evaluate(() => window.adminOpenReassignModal('T2_S', 'old', 1));
  await page.evaluate(() => {
    document.getElementById('modal-candidate-select').value = '';
    document.getElementById('btn-save-modal').click();
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() =>
    window.adminTestHelper.getState().monthSchedule.weeks[0].scheduleTable.T2_S.oldMember
  )).toBeNull();

  await page.reload();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() =>
    window.adminTestHelper.getState().monthSchedule.weeks[0].scheduleTable.T2_S.oldMember
  )).toBeNull();
});

test('admin: nhập CSV tự lưu và giữ ca rảnh sau reload', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  // Mô phỏng khoá tháng ca rảnh còn cũ trước khi nhập file.
  await page.evaluate(() => {
    localStorage.setItem('ts_scheduler_availability_month_v1', '2026-09');
  });
  await page.click('#btn-tab-students');
  await page.click('#btn-open-import-modal');
  const csv = [
    'Họ và Tên,Mã Số Sinh Viên,Số Điện Thoại,Các Ca Rảnh (cách nhau bởi dấu phẩy)',
    'Nguyễn Văn An,2102001,0901000001,"T2_S, T3_S"'
  ].join('\n');
  await page.setInputFiles('#input-import-file', {
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });
  await page.waitForTimeout(500);
  await page.click('#btn-confirm-import');
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForTimeout(700);
  const weekly = await page.evaluate(() => {
    const student = window.adminTestHelper.getState().students
      .find(s => s.studentId === '2102001');
    return student && student.monthlyAvailableShifts && student.monthlyAvailableShifts[1];
  });
  expect(weekly).toEqual(['T2_S', 'T3_S']);
});

test('admin: khoá tháng dạng JSON không xoá ca rảnh khi tải lại', async ({ page }) => {
  await seed(page, {
    local: {
      ...fixtures.adminLocal,
      ts_scheduler_availability_month_v1: '"2026-10"'
    },
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.click('#btn-tab-students');
  await page.locator('#admin-student-table-body button', { hasText: 'Sửa' }).first().click();
  await expect(page.locator('#admin-cb-w1-T2_S')).toBeChecked();
  await expect(page.locator('#admin-cb-w2-T2_S')).toBeChecked();
  const key = await page.evaluate(() =>
    localStorage.getItem('ts_scheduler_availability_month_v1'));
  expect(key).toBe('2026-10');
});

test('admin: sửa ca rảnh theo tuần và giữ thay đổi sau reload', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.click('#btn-tab-students');
  await page.locator('#admin-student-table-body button', { hasText: 'Sửa' }).first().click();
  await expect(page.locator('#weekly-availability-editor .admin-slot-cb')).toHaveCount(40);

  const layout = await page.evaluate(() => {
    const host = document.getElementById('weekly-availability-editor');
    const body = document.querySelector('#student-form-modal .modal-body');
    return {
      bodyOverflowX: body.scrollWidth - body.clientWidth,
      tablesClipped: [...host.children].some(card => {
        const table = card.querySelector('table');
        return table.getBoundingClientRect().right > card.getBoundingClientRect().right + 1;
      }),
      visibleDaysPerWeek: [...host.children].map(card =>
        [...card.querySelectorAll('thead th')].map(th => th.textContent.trim()).join(',')
      )
    };
  });
  expect(layout.bodyOverflowX).toBeLessThanOrEqual(1);
  expect(layout.tablesClipped).toBe(false);
  layout.visibleDaysPerWeek.forEach(headers => expect(headers).toBe('Ca,T2,T3,T4,T5,T6'));

  const week1 = page.locator('#admin-cb-w1-T2_S');
  const week2 = page.locator('#admin-cb-w2-T2_S');
  await expect(week1).toBeChecked();
  await expect(week2).toBeChecked();
  await week1.uncheck();
  await page.click('#btn-save-student-modal');
  await page.waitForTimeout(500);

  await page.reload();
  await page.waitForTimeout(700);
  await page.click('#btn-tab-students');
  await page.locator('#admin-student-table-body button', { hasText: 'Sửa' }).first().click();
  await expect(page.locator('#admin-cb-w1-T2_S')).not.toBeChecked();
  await expect(page.locator('#admin-cb-w2-T2_S')).toBeChecked();
});

test('student mobile: tải được trang, không tràn ngang', async ({ page }) => {
  await seed(page, {
    local: fixtures.studentLocal,
    session: {},
    testFlag: false
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await expect(page.locator('h1')).toContainText('Văn Phòng Tư Vấn Tuyển Sinh');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test('admin: chọn chế độ xếp lịch, giữ số người/ca và lựa chọn sau reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await seed(page, { local: fixtures.adminLocal, session: fixtures.adminSession });
  await page.goto('/admin.html');
  const mode = page.getByLabel('Chế độ xếp lịch của tháng');
  const run = page.locator('#btn-admin-auto-schedule');
  const slots = () => page.evaluate(() => window.adminTestHelper.getState()
    .monthSchedule.weeks.flatMap(w => Object.values(w.scheduleTable)));

  await expect(mode).toHaveValue('balanced');
  await run.click();
  await expect(run).toBeEnabled();
  // Fixture toàn người Mới: chế độ cặp phải để trống vị trí Cũ.
  for (const slot of await slots()) {
    expect(slot.oldMember).toBeNull();
    expect(slot.newMember.role).toBe('new');
    expect(slot.status).toBe('partial');
  }

  for (const value of ['any-role', 'random']) {
    await mode.selectOption(value);
    await run.click();
    await expect(run).toBeEnabled();
    for (const slot of await slots()) {
      expect(slot.capacity).toBe(2);
      expect(slot.oldMember.role).toBe('new');
      expect(slot.newMember.role).toBe('new');
      expect(slot.status).toBe('full');
    }
  }
  await page.click('#btn-month-capacity-1');
  await expect(mode).toHaveValue('random');
  for (const slot of await slots()) {
    expect(slot.capacity).toBe(1);
    expect(slot.oldMember).toBeTruthy();
    expect(slot.newMember).toBeNull();
  }
  await page.reload();
  await expect(mode).toHaveValue('random');
  await expect(page.locator('#btn-month-capacity-1')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await mode.scrollIntoViewIfNeeded();
  const bounds = await mode.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/scheduling-mode-mobile.png', fullPage: false });
  expect(errors).toEqual([]);
});

test('admin: 1 người/ca ưu tiên mỗi người Mới một ca trong tháng, còn lại người Cũ', async ({ page }) => {
  const students = fixtures.students.map((s, i) => ({ ...s, role: i < 2 ? 'new' : 'old' }));
  await seed(page, {
    local: { ...fixtures.adminLocal, ts_scheduler_students: JSON.stringify(students) },
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.click('#btn-month-capacity-1');
  const mode = page.getByLabel('Chế độ xếp lịch của tháng');
  await expect(mode).toHaveValue('any-role');
  await mode.selectOption('new-first');
  await page.click('#btn-admin-auto-schedule');
  await expect(page.locator('#btn-admin-auto-schedule')).toBeEnabled();
  const roles = await page.evaluate(() => window.adminTestHelper.getState().monthSchedule.weeks
    .flatMap(w => Object.values(w.scheduleTable).map(s => s.oldMember?.role)));
  expect(roles.filter(role => role === 'new')).toHaveLength(2);
  expect(roles.filter(role => role === 'old')).toHaveLength(38);
  await page.reload();
  await expect(mode).toHaveValue('new-first');
  await mode.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/scheduling-mode-desktop.png', fullPage: false });
  await page.click('#btn-month-capacity-2');
  await expect(mode).toHaveValue('balanced');
  const paired = await page.evaluate(() => window.adminTestHelper.getState().monthSchedule.weeks
    .every(w => Object.values(w.scheduleTable).every(s => s.oldMember?.role === 'old' && s.newMember?.role === 'new')));
  expect(paired).toBe(true);
});

test('admin: lọc ca đăng ký đúng tháng, kết hợp tìm kiếm và bỏ lọc', async ({ page }) => {
  const students = fixtures.students.map(s => ({ ...s }));
  students[0].monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: [] };
  students[1].monthlyAvailableShifts = { 1: [], 2: [], 3: [], 4: ['T6_C'] };
  students[1].availableShifts = [];
  await seed(page, {
    local: { ...fixtures.adminLocal, ts_scheduler_students: JSON.stringify(students) },
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.click('#btn-tab-students');
  const filters = page.getByRole('group', { name: 'Lọc theo đăng ký ca' });
  const registered = filters.getByRole('button', { name: 'Đã đăng ký ca' });
  const unregistered = filters.getByRole('button', { name: 'Chưa đăng ký ca' });
  const rows = page.locator('#admin-student-table-body tr').filter({ has: page.locator('.cb-student-row') });
  const search = page.locator('#input-search-student');
  await expect(registered).toContainText('(5)');
  await expect(unregistered).toContainText('(1)');
  await unregistered.click();
  await expect(unregistered).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(students[0].studentId);
  await search.fill('khongkhop');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#admin-student-table-body')).toContainText('Không tìm thấy CTV');
  await search.clear();
  await registered.click();
  await expect(rows).toHaveCount(5);
  await search.fill(students[1].studentId);
  await expect(rows).toHaveCount(1);
  await filters.getByRole('button', { name: 'Tất cả' }).click();
  await search.clear();
  await expect(rows).toHaveCount(6);
  await page.evaluate(() => {
    localStorage.setItem('ts_scheduler_availability_month_v1', '2026-09');
    window.adminTestHelper.renderStudentTable();
  });
  await expect(registered).toContainText('(0)');
  await registered.click();
  await expect(rows).toHaveCount(0);
  await unregistered.click();
  await expect(rows).toHaveCount(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await filters.scrollIntoViewIfNeeded();
  const bounds = await filters.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/registration-filter-mobile.png' });
});

test('admin: mọi chế độ chỉ xếp đúng ca rảnh từng tuần khi Cloud trả null/thiếu tuần', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const students = fixtures.students.map((s, i) => ({
    ...s, role: i % 2 ? 'new' : 'old',
    availableShifts: ['T4_S', 'T4_C'],
    monthlyAvailableShifts: i === 0
      ? { 1: ['T4_C'], 2: ['T4_C'], 3: ['T4_C'], 4: ['T4_C'] }
      : [null, null, ['T4_S']]
  }));
  await seed(page, {
    local: { ...fixtures.adminLocal, ts_scheduler_students: JSON.stringify(students) },
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  const mode = page.getByLabel('Chế độ xếp lịch của tháng');
  for (const [capacity, modes] of [[2, ['balanced', 'any-role', 'random']], [1, ['any-role', 'new-first', 'random']]]) {
    await page.click(`#btn-month-capacity-${capacity}`);
    for (const value of modes) {
      await mode.selectOption(value);
      await page.click('#btn-admin-auto-schedule');
      await expect(page.locator('#btn-admin-auto-schedule')).toBeEnabled();
      const invalid = await page.evaluate(() => {
        const state = window.adminTestHelper.getState();
        return state.monthSchedule.weeks.flatMap((week, i) =>
          Object.entries(week.scheduleTable).flatMap(([shift, slot]) =>
            [slot.oldMember, slot.newMember, slot.thirdMember].filter(Boolean).filter(member => {
              const student = state.students.find(s => s.id === member.id);
              return !(student.monthlyAvailableShifts[i + 1] || []).includes(shift);
            }).map(member => ({ week: i + 1, shift, id: member.id }))));
      });
      expect(invalid, `Sai ca ở ${capacity} người/ca, chế độ ${value}`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test('admin: hồ sơ tháng cũ giữ danh sách đăng ký và số ca từng người sau chuyển tháng/reload', async ({ page }) => {
  const students = fixtures.students.map((s, i) => ({ ...s,
    monthlyAvailableShifts: { 1: i === 0 ? ['T4_C'] : [], 2: [], 3: [], 4: [] },
    availableShifts: i === 0 ? ['T4_C'] : []
  }));
  await seed(page, {
    local: { ...fixtures.adminLocal, ts_scheduler_students: JSON.stringify(students) },
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.evaluate(() => window.adminSwitchMonth(11, 2026, false));
  const archive = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_scheduler_all_months_v1'))['2026-10']);
  expect(archive.monthSnapshot.students).toEqual(students);
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('ts_scheduler_students'));
    list.splice(1, 1);
    list[0].fullName = 'Đổi tên tháng mới';
    localStorage.setItem('ts_scheduler_students', JSON.stringify(list));
    window.adminTestHelper.loadData();
  });
  await page.reload();
  await page.evaluate(() => window.adminSwitchMonth(10, 2026, false));
  await page.click('#btn-month-snapshot');
  const dialog = page.locator('#modal-month-snapshot');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Đã đăng ký ca: 1');
  await expect(dialog).toContainText('Chưa đăng ký ca: 5');
  await expect(dialog.locator('tbody tr')).toHaveCount(6);
  for (const student of students) {
    const assigned = fixtures.schedule.weeks.reduce((sum, w) => sum + Object.values(w.scheduleTable)
      .filter(s => [s.oldMember, s.newMember, s.thirdMember].some(m => m?.id === student.id)).length, 0);
    const row = dialog.locator(`tr[data-student-id="${student.id}"]`);
    await expect(row).toContainText(student.fullName);
    await expect(row.locator('[data-assigned-count]')).toHaveText(String(assigned));
  }
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('ts_scheduler_students')));
  expect(current).toHaveLength(5);
  expect(current[0].fullName).toBe('Đổi tên tháng mới');
  await expect(page.locator('#admin-standby-box')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/month-snapshot-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.locator('.modal-content').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/month-snapshot-mobile.png' });
});

test('admin: tag vai trò ở quản lý/thống kê CTV, kết quả ưu tiên báo đúng người Mới và giới hạn chỗ', async ({ page }) => {
  const students = Array.from({ length: 58 }, (_, i) => {
    const shifts = i < 14 || (i >= 28 && i < 56) ? fixtures.allShifts : [];
    return { id: `s_${i + 1}`, studentId: `29${String(i).padStart(6, '0')}`, fullName: `CTV ${i + 1}`,
      role: i < 28 ? 'old' : 'new', availableShifts: shifts,
      monthlyAvailableShifts: { 1: shifts, 2: shifts, 3: shifts, 4: shifts } };
  });
  await seed(page, { local: { ...fixtures.adminLocal,
    ts_scheduler_students: JSON.stringify(students),
    ts_scheduler_shift_capacity_v1: JSON.stringify({ '2026-10': { peoplePerShift: 1, schedulingMode: 'new-first' } })
  }, session: fixtures.adminSession });
  await page.goto('/admin.html');
  await page.click('#btn-admin-auto-schedule');
  await expect(page.locator('#btn-admin-auto-schedule')).toBeEnabled();
  const summary = page.locator('#schedule-coverage-summary');
  await expect(summary).toContainText('Mới: 28/28');
  await expect(summary).toContainText('40 chỗ trực cơ bản cho 42 người đăng ký');
  await expect(summary).toContainText('Đã xếp đủ người Mới có đăng ký');
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/priority-coverage-summary.png' });
  await expect(page.locator('#admin-timetable-grid .student-role-badge')).toHaveCount(0);
  await expect(page.locator('#fairness-list-old [data-student-role="old"]')).toHaveCount(28);
  await expect(page.locator('#fairness-list-old [data-student-role="new"]')).toHaveCount(30);
  await page.locator('#fairness-list-old .student-role-badge').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/fairness-role-tags-desktop.png' });
  await page.click('#btn-tab-students');
  await expect(page.locator('#admin-student-table-body [data-student-role="old"]')).toHaveCount(28);
  await expect(page.locator('#admin-student-table-body [data-student-role="new"]')).toHaveCount(30);
  const studentTags = page.locator('#admin-student-table-body .student-role-badge');
  await studentTags.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/admin-role-tags-desktop.png' });
  await page.emulateMedia({ media: 'print' });
  await expect(studentTags.first()).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  await studentTags.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/admin-role-tags-mobile.png' });
});

test('admin: chưa xếp đủ Mới thì kết quả cảnh báo rõ người còn thiếu', async ({ page }) => {
  const students = fixtures.students.slice(0, 3).map(s => ({ ...s,
    availableShifts: ['T4_S'], monthlyAvailableShifts: { 1: ['T4_S'], 2: [], 3: [], 4: [] }
  }));
  await seed(page, { local: { ...fixtures.adminLocal,
    ts_scheduler_students: JSON.stringify(students),
    ts_scheduler_shift_capacity_v1: JSON.stringify({ '2026-10': { peoplePerShift: 1, schedulingMode: 'new-first' } })
  }, session: fixtures.adminSession });
  await page.goto('/admin.html');
  await page.click('#btn-admin-auto-schedule');
  await expect(page.locator('#btn-admin-auto-schedule')).toBeEnabled();
  await expect(page.locator('#schedule-coverage-summary')).toContainText('Mới: 1/3');
  await expect(page.locator('#schedule-coverage-summary')).toContainText('Chưa xếp đủ người Mới có đăng ký');
  await expect(page.locator('#toast-container')).toContainText('Chưa xếp đủ người Mới: 1/3');
});

test('admin: bộ phân tích CSV tách module nạp được trong trình duyệt và đọc đúng 6 CTV mẫu', async ({ page }) => {
  const csv = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'fixtures', 'roster_sample.csv'), 'utf8');
  await seed(page, { local: fixtures.adminLocal, session: fixtures.adminSession });
  await page.goto('/admin.html');
  await page.waitForTimeout(1500);
  const result = await page.evaluate(text => ({
    hasModule: !!(window.CsvImport && typeof window.CsvImport.create === 'function'),
    report: (() => {
      const r = window.csvImportTestHelper.analyzeStudentsCsv(text);
      return { count: r.candidates.length, errors: r.errors.length };
    })()
  }), csv);
  expect(result.hasModule).toBe(true);
  expect(result.report).toEqual({ count: 6, errors: 0 });
});
