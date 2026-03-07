// @ts-check
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context, baseURL, page }) => {
  if (baseURL) {
    await context.grantPermissions(['camera'], { origin: baseURL });
  }
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

async function goToDelayedMode(page) {
  await navigateToDelayCam(page);
  await page.locator('#delayedVideo').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#delayedVideo').click({ force: true });
  await page.waitForTimeout(200);
}

async function clickRec(page) {
  await page.locator('#recBtn').click({ force: true });
}

// When share isn't available, SAVE should download and have a sane extension
test('SAVE triggers download with correct extension when share unsupported', async ({ page }) => {
  await goToDelayedMode(page);
  await expect(page.locator('#recBtn')).toBeVisible({ timeout: 5000 });

  await clickRec(page);
  await page.waitForTimeout(700);
  await clickRec(page); // shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    clickRec(page), // trigger save
  ]);

  const suggested = download.suggestedFilename();
  expect(/delayed-recording-\d+\.(webm|mp4)$/.test(suggested)).toBeTruthy();

  // Ensure UI resets
  await expect(page.locator('#recBtn')).toHaveText('REC');
});

// When share is available, SAVE should call navigator.share with a File
test('SAVE uses Web Share API when available and passes a File', async ({ page }) => {
  await goToDelayedMode(page);
  await expect(page.locator('#recBtn')).toBeVisible({ timeout: 5000 });

  await clickRec(page);
  await page.waitForTimeout(700);
  await clickRec(page); // shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');

  // Stub share APIs in the page to capture the shared file
  await page.evaluate(() => {
    window.__shareCalled = false;
    window.__sharedFiles = [];
    const nav = navigator;
    nav.canShare = (data) => !!(data && data.files && data.files.length);
    nav.share = async (data) => {
      window.__shareCalled = true;
      window.__sharedFiles = (data && data.files) ? data.files : [];
      return;
    };
  });

  // Click SAVE; this should call navigator.share and NOT download
  await clickRec(page);

  // Give the promise chain a moment to resolve
  await page.waitForTimeout(250);

  const { called, names } = await page.evaluate(() => ({
    called: !!window.__shareCalled,
    names: (window.__sharedFiles || []).map(f => f && f.name)
  }));

  expect(called).toBeTruthy();
  expect(names.length).toBe(1);
  expect(/delayed-recording-\d+\.(webm|mp4)$/.test(names[0])).toBeTruthy();

  // Ensure UI resets
  await expect(page.locator('#recBtn')).toHaveText('REC');
});
