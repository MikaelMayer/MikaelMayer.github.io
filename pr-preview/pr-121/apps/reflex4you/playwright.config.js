// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    acceptDownloads: true,
    // Prevent SW caching / controllerchange reload loops in tests.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--no-sandbox',
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            // Ensure WebGL2 is available in headless CI.
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--use-gl=swiftshader',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npx http-server -p 5173 -c-1 .',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000
  }
});
