// @ts-check
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL) {
    await context.grantPermissions(['camera'], { origin: baseURL });
  }
});

// Smoke test: page loads and UI elements exist
async function navigateToDelayCam(page) {
  // Prefer the PWA path; fallback to top-level html
  const firstPath = '/apps/videodelay/index.html';
  const secondPath = '/apps/videodelay.html';
  let res = await page.goto(firstPath);
  if (!res || !res.ok()) {
    await page.goto(secondPath);
  }
}

test('loads and can tap to set delay', async ({ page }) => {
  await navigateToDelayCam(page);
  await expect(page.locator('#liveVideo')).toBeVisible();
  await expect(page.locator('#versionLabel')).toHaveText(/\d+\.\d+\.\d+/);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } }); // start stopwatch
  await page.waitForTimeout(500);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } }); // freeze delay and switch UI
  await page.waitForTimeout(200); // allow UI to switch
  await expect(page.locator('#delayedVideo')).toBeVisible();
  await expect(page.locator('#miniLive')).toBeVisible();
  await expect(page.locator('#recBtn')).toBeVisible();
});

// Optional quick record/stop smoke: just toggles without verifying file integrity
// (fake media will not produce real frames)
test('can toggle recording without error', async ({ page }) => {
  await navigateToDelayCam(page);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(300);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(200);
  await page.click('#recBtn');
  await page.waitForTimeout(700);
  await page.click('#recBtn');
  // If no error, pass. Download prompt is auto-accepted.
  await expect(page.locator('#recBtn')).toHaveText('REC');
});

test('two consecutive recordings produce two distinct downloads', async ({ page }) => {
  await navigateToDelayCam(page);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(300);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(200);

  const paths = [];
  // First recording
  await page.click('#recBtn'); // start
  await page.waitForTimeout(700);
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // stop triggers download
  ]);
  const path1 = await download1.path();
  paths.push(path1);

  // Second recording
  await page.click('#recBtn'); // start
  await page.waitForTimeout(700);
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // stop triggers download
  ]);
  const path2 = await download2.path();
  paths.push(path2);

  expect(paths[0]).not.toBe(paths[1]);
});
