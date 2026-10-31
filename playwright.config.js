const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8137',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/e2e/server.js',
    url: 'http://127.0.0.1:8137/index.html',
    reuseExistingServer: true,
    timeout: 15000
  }
});
