const { test, expect } = require('@playwright/test');
const fixtures = require('./fixtures');

async function seed(page, { local, session, testFlag = true, claim = null }) {
  await page.addInitScript(({ local, session, testFlag, claim }) => {
    if (testFlag) window.__TVTS_AUTH_TEST__ = true;
    Object.entries(local || {}).forEach(([key, value]) => localStorage.setItem(key, value));
    Object.entries(session || {}).forEach(([key, value]) => sessionStorage.setItem(key, value));
    if (claim) {
      localStorage.setItem('ts_scheduler_claim_requests_v1', JSON.stringify([claim]));
    }
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
