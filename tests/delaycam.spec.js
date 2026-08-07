// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.beforeEach(async ({ context, baseURL, page }) => {
  if (baseURL) {
    await context.grantPermissions(['camera'], { origin: baseURL });
  }
  // Use a short delay for faster tests
  await page.addInitScript(() => {
    localStorage.setItem('videodelay_seconds', '1');
  });
});

async function navigateToDelayCam(page) {
  const firstPath = '/apps/videodelay/index.html';
  const secondPath = '/apps/videodelay.html';
  let res = await page.goto(firstPath);
  if (!res || !res.ok()) {
    await page.goto(secondPath);
  }
}

async function waitForDelayedReady(page) {
  await page.locator('#delayedVideo').waitFor({ state: 'visible', timeout: 10000 });
}

async function switchToDelayedMain(page) {
  await page.locator('#delayedVideo').click({ force: true });
  await page.waitForTimeout(200);
}

async function clickRec(page) {
  await page.locator('#recBtn').click({ force: true });
}

test('loads with auto delay and shows delayed video after countdown', async ({ page }) => {
  await navigateToDelayCam(page);
  await expect(page.locator('#liveVideo')).toBeVisible();
  await expect(page.locator('#versionLabel')).toHaveText(/\d+\.\d+\.\d+/);
  await expect(page.locator('#delayLabel')).toBeVisible();
  // Wait for delayed stream to become available in the thumbnail
  await waitForDelayedReady(page);
  await expect(page.locator('#delayedVideo')).toBeVisible();
  // Click thumbnail to switch delayed to main view
  await switchToDelayedMain(page);
  await expect(page.locator('#recBtn')).toBeVisible();
});

test('can record then save without error', async ({ page }) => {
  await navigateToDelayCam(page);
  await waitForDelayedReady(page);
  await switchToDelayedMain(page);
  await expect(page.locator('#recBtn')).toBeVisible({ timeout: 5000 });
  await clickRec(page); // start
  await page.waitForTimeout(700);
  await clickRec(page); // stop -> shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickRec(page), // SAVE triggers download
  ]);
  const path = await download.path();
  const size = (await fs.promises.stat(path)).size;
  expect(size).toBeGreaterThan(0);
  await expect(page.locator('#recBtn')).toHaveText('REC');
});

test('two consecutive recordings produce two distinct non-empty downloads', async ({ page }) => {
  await navigateToDelayCam(page);
  await waitForDelayedReady(page);
  await switchToDelayedMain(page);

  const paths = [];
  // First recording
  await clickRec(page); // start
  await page.waitForTimeout(700);
  await clickRec(page); // stop -> SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    clickRec(page), // SAVE triggers download
  ]);
  const path1 = await download1.path();
  const size1 = (await fs.promises.stat(path1)).size;
  expect(size1).toBeGreaterThan(0);
  paths.push(path1);

  // Second recording
  await clickRec(page); // start
  await page.waitForTimeout(700);
  await clickRec(page); // stop -> SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    clickRec(page), // SAVE triggers download
  ]);
  const path2 = await download2.path();
  const size2 = (await fs.promises.stat(path2)).size;
  expect(size2).toBeGreaterThan(0);
  paths.push(path2);

  expect(paths[0]).not.toBe(paths[1]);
});
