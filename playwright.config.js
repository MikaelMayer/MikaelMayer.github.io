// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // Root suite: only the top-level web app tests (DelayCam, etc.).
  // Reflex4You has its own Playwright config under `apps/reflex4you/`.
  testDir: './tests',
  testMatch: ['**/*.spec.js'],
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    acceptDownloads: true,
    launchOptions: {
      args: [
        '--no-sandbox',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream'
      ]
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx http-server -p 5173 -c-1 .',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000
  }
});