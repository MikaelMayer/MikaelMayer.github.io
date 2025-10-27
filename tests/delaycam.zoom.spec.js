// @ts-check
const { test, expect } = require('@playwright/test');

// Ensure camera permission and stub PTZ to force CSS zoom path
test.beforeEach(async ({ context, baseURL, page }) => {
  if (baseURL) {
    await context.grantPermissions(['camera'], { origin: baseURL });
  }
  // Disable PTZ so CSS transform path is used in tests
  await page.addInitScript(() => {
    try {
      Object.defineProperty(MediaStreamTrack.prototype, 'getCapabilities', {
        configurable: true,
        writable: true,
        value: function () { return {}; }
      });
    } catch (_) {}
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

function zoomButtonsLocator(page) {
  return page.locator('#zoomControls .zoomBtn');
}

function zoomButtonByLabel(page, label) {
  return page.locator('#zoomControls .zoomBtn', { hasText: label });
}

// UI presence and default selection
test('zoom controls visible with 5 buttons and default 1x selected', async ({ page }) => {
  await navigateToDelayCam(page);
  await expect(page.locator('#zoomControls')).toBeVisible();
  const btns = zoomButtonsLocator(page);
  await expect(btns).toHaveCount(5);
  const labels = await btns.allTextContents();
  expect(labels).toEqual(['1x', '1.2x', '1.4x', '1.7x', '2x']);
  await expect(page.locator('#zoomControls .zoomBtn.selected')).toHaveText('1x');
});

// Clicking a zoom button selects it and applies CSS transform (PTZ off)
test('clicking 2x selects it and applies display zoom', async ({ page }) => {
  await navigateToDelayCam(page);
  await zoomButtonByLabel(page, '2x').click();
  await expect(page.locator('#zoomControls .zoomBtn.selected')).toHaveText('2x');
  const liveTransform = await page.evaluate(() => document.getElementById('liveVideo').style.transform || '');
  expect(liveTransform).toContain('scale(2)');
});

// Controls persist in delayed mode and apply to delayedVideo as well
test('zoom controls persist in delayed mode and affect delayedVideo', async ({ page }) => {
  await navigateToDelayCam(page);
  await zoomButtonByLabel(page, '1.7x').click();
  // Enter delayed mode
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(200);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(250);
  await expect(page.locator('#delayedVideo')).toBeVisible();
  await expect(page.locator('#zoomControls')).toBeVisible();
  const delayedTransform = await page.evaluate(() => document.getElementById('delayedVideo').style.transform || '');
  expect(delayedTransform).toContain('scale(1.7)');
});

// Basic record flow after zoom to ensure pipeline still works
// (We do not assert visual zoom inside recorded file here.)
const fs = require('fs');

test('recording still works after applying zoom', async ({ page }) => {
  await navigateToDelayCam(page);
  await zoomButtonByLabel(page, '1.4x').click();
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(250);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(250);

  await page.click('#recBtn');
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // stop -> SAVE
  await expect(page.locator('#recBtn')).toHaveText(/SAVE|SHARE/);

  // If SAVE, expect a download; if SHARE, stub to force download fallback
  const hasShare = await page.evaluate(() => {
    try {
      const f = new File([new Blob(['x'], { type: 'video/webm' })], 'x.webm', { type: 'video/webm' });
      return !!(navigator && navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
    } catch (_) { return false; }
  });

  if (hasShare) {
    // Replace share with save to get a download artifact we can assert
    await page.evaluate(() => {
      const nav = navigator;
      nav.canShare = undefined;
      nav.share = undefined;
    });
    await page.locator('#recBtn').click(); // now SAVE path
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#recBtn').click(),
  ]);
  const path = await download.path();
  const size = (await fs.promises.stat(path)).size;
  expect(size).toBeGreaterThan(0);
});
