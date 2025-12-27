// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

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
test('can record then save without error', async ({ page }) => {
  await navigateToDelayCam(page);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(300);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(200);
  await page.click('#recBtn'); // start
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // stop -> shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // SAVE triggers download
  ]);
  const path = await download.path();
  const size = (await fs.promises.stat(path)).size;
  expect(size).toBeGreaterThan(0);
  await expect(page.locator('#recBtn')).toHaveText('REC');
});

test('two consecutive recordings produce two distinct non-empty downloads', async ({ page }) => {
  await navigateToDelayCam(page);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(300);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(200);

  const paths = [];
  // First recording
  await page.click('#recBtn'); // start
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // stop -> SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // SAVE triggers download
  ]);
  const path1 = await download1.path();
  const size1 = (await fs.promises.stat(path1)).size;
  expect(size1).toBeGreaterThan(0);
  paths.push(path1);

  // Second recording
  await page.click('#recBtn'); // start
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // stop -> SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // SAVE triggers download
  ]);
  const path2 = await download2.path();
  const size2 = (await fs.promises.stat(path2)).size;
  expect(size2).toBeGreaterThan(0);
  paths.push(path2);

  expect(paths[0]).not.toBe(paths[1]);
});