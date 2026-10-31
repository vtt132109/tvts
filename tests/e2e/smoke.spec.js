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

test('admin: sửa ca rảnh theo tuần và giữ thay đổi sau reload', async ({ page }) => {
  await seed(page, {
    local: fixtures.adminLocal,
    session: fixtures.adminSession
  });
  await page.goto('/admin.html');
  await page.click('#btn-tab-students');
  await page.locator('#admin-student-table-body button', { hasText: 'Sửa' }).first().click();
  await expect(page.locator('#weekly-availability-editor .admin-slot-cb')).toHaveCount(40);
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
