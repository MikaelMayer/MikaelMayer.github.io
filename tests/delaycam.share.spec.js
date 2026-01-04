// @ts-check
const { test, expect } = require('@playwright/test');

// Grant permissions per test (aligns with existing spec)
test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL) {
    await context.grantPermissions(['camera'], { origin: baseURL });
  }
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
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(300);
  await page.locator('#liveVideo').click({ position: { x: 20, y: 700 } });
  await page.waitForTimeout(250);
}

// When share isn't available, SAVE should download and have a sane extension
test('SAVE triggers download with correct extension when share unsupported', async ({ page }) => {
  await goToDelayedMode(page);

  // Start and stop to get a blob ready to save
  await page.click('#recBtn');
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#recBtn'), // trigger save
  ]);

  const suggested = download.suggestedFilename();
  expect(/delayed-recording-\d+\.(webm|mp4)$/.test(suggested)).toBeTruthy();

  // Ensure UI resets
  await expect(page.locator('#recBtn')).toHaveText('REC');
});

// When share is available, SAVE should call navigator.share with a File
test('SAVE uses Web Share API when available and passes a File', async ({ page }) => {
  await goToDelayedMode(page);

  // Start and stop to get a blob ready to save
  await page.click('#recBtn');
  await page.waitForTimeout(700);
  await page.click('#recBtn'); // shows SAVE
  await expect(page.locator('#recBtn')).toHaveText('SAVE');

  // Stub share APIs in the page to capture the shared file
  await page.evaluate(() => {
    window.__shareCalled = false;
    window.__sharedFiles = [];
    const nav = navigator;
    // Simple canShare implementation: return true if files present
    nav.canShare = (data) => !!(data && data.files && data.files.length);
    nav.share = async (data) => {
      window.__shareCalled = true;
      window.__sharedFiles = (data && data.files) ? data.files : [];
      return;
    };
  });

  // Click SAVE; this should call navigator.share and NOT download
  await page.click('#recBtn');

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
