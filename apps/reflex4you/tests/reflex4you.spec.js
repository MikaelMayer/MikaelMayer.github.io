const { test, expect } = require('@playwright/test');
const zlib = require('zlib');

function bufferToBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padding);
  return Buffer.from(padded, 'base64');
}

function encodeFormulaToFormulab64(formula) {
  const compressed = zlib.gzipSync(Buffer.from(formula, 'utf8'));
  return bufferToBase64Url(compressed);
}

function decodeFormulab64(value) {
  const compressed = base64UrlToBuffer(value);
  return zlib.gunzipSync(compressed).toString('utf8');
}

async function waitForReflexReady(page) {
  await page.waitForFunction(() => typeof window.__reflexReady !== 'undefined');
  await page.evaluate(() => window.__reflexReady);
}

async function detectCompressionCapability(page) {
  await page.goto('/index.html');
  await waitForReflexReady(page);
  const enabled = await page.evaluate(() => Boolean(window.__reflexCompressionEnabled));
  await page.evaluate(() => localStorage.clear());
  return enabled;
}

async function expectNoRendererError(page) {
  const error = page.locator('#error');
  const severity = await error.getAttribute('data-error-severity');
  if (severity === 'fatal') {
    return;
  }
  await expect(error).toBeHidden();
}

const SIMPLE_FORMULA = '(z - 1) * (z + 1)';
const SEEDED_FORMULA = 'z + 2';
const DYNAMIC_SET_FORMULA = 'set c = sin(z $ D1) in (1 - c + c * z) / (c + (1 - c) * z)';
const FIXED_SET_FORMULA = 'set c = sin(z + F1) in (z - c) * (z + c)';

test('reflex4you updates formula query param after successful apply', async ({ page }) => {
  await page.goto('/index.html');
  await waitForReflexReady(page);
  const supportsCompression = await page.evaluate(() => Boolean(window.__reflexCompressionEnabled));

  const textarea = page.locator('#formula');
  await expect(textarea).toBeVisible();

  await textarea.fill(SIMPLE_FORMULA);
  await expectNoRendererError(page);
  if (supportsCompression) {
    await expect.poll(async () => {
      const href = await page.evaluate(() => window.location.href);
      const url = new URL(href);
      return url.searchParams.get('formulab64');
    }).not.toBeNull();

    const params = await page.evaluate(() => {
      const url = new URL(window.location.href);
      return {
        base64: url.searchParams.get('formulab64'),
        legacy: url.searchParams.get('formula'),
      };
    });
    expect(params.legacy).toBeNull();
    expect(params.base64).not.toBeNull();
    expect(decodeFormulab64(params.base64)).toBe(SIMPLE_FORMULA);
  } else {
    await expect.poll(async () => {
      const href = await page.evaluate(() => window.location.href);
      const url = new URL(href);
      return url.searchParams.get('formula');
    }).toBe(SIMPLE_FORMULA);
  }

  await expect(textarea).toHaveValue(SIMPLE_FORMULA);
});

test('reflex4you loads formulas from query string on startup', async ({ page }) => {
  const supportsCompression = await detectCompressionCapability(page);
  const targetUrl = supportsCompression
    ? `/index.html?formulab64=${encodeURIComponent(encodeFormulaToFormulab64(SEEDED_FORMULA))}`
    : `/index.html?formula=${encodeURIComponent(SEEDED_FORMULA)}`;
  await page.goto(targetUrl);
  await waitForReflexReady(page);

  const textarea = page.locator('#formula');
  await expect(textarea).toHaveValue(SEEDED_FORMULA);
  await expectNoRendererError(page);
});

test('reflex4you upgrades legacy formula query param to formulab64', async ({ page }) => {
  const supportsCompression = await detectCompressionCapability(page);
  await page.goto(`/index.html?formula=${encodeURIComponent(SEEDED_FORMULA)}`);
  await waitForReflexReady(page);

  const textarea = page.locator('#formula');
  await expect(textarea).toHaveValue(SEEDED_FORMULA);

  if (supportsCompression) {
    await expect.poll(async () => {
      const href = await page.evaluate(() => window.location.href);
      const url = new URL(href);
      return url.searchParams.get('formulab64');
    }).not.toBeNull();

    const params = await page.evaluate(() => {
      const url = new URL(window.location.href);
      return {
        base64: url.searchParams.get('formulab64'),
        legacy: url.searchParams.get('formula'),
      };
    });

    expect(params.legacy).toBeNull();
    expect(decodeFormulab64(params.base64)).toBe(SEEDED_FORMULA);
  } else {
    const legacyParam = await page.evaluate(() => {
      const url = new URL(window.location.href);
      return url.searchParams.get('formula');
    });
    expect(legacyParam).toBe(SEEDED_FORMULA);
  }
});

test('shows D1 indicator when dynamic finger only appears inside set binding', async ({ page }) => {
  const supportsCompression = await detectCompressionCapability(page);
  const targetUrl = supportsCompression
    ? `/index.html?formulab64=${encodeURIComponent(encodeFormulaToFormulab64(DYNAMIC_SET_FORMULA))}`
    : `/index.html?formula=${encodeURIComponent(DYNAMIC_SET_FORMULA)}`;
  await page.goto(targetUrl);
  await waitForReflexReady(page);

  const d1Indicator = page.locator('[data-finger="D1"]');
  await expect(d1Indicator).toBeVisible();
  await expect(d1Indicator).toHaveText(/D1 =/);

  const fIndicators = page.locator('[data-finger^="F"]');
  await expect(fIndicators).toHaveCount(0);
});

test('shows F1 indicator when fixed finger only appears inside set binding', async ({ page }) => {
  const supportsCompression = await detectCompressionCapability(page);
  const targetUrl = supportsCompression
    ? `/index.html?formulab64=${encodeURIComponent(encodeFormulaToFormulab64(FIXED_SET_FORMULA))}`
    : `/index.html?formula=${encodeURIComponent(FIXED_SET_FORMULA)}`;
  await page.goto(targetUrl);
  await waitForReflexReady(page);

  const f1Indicator = page.locator('[data-finger="F1"]');
  await expect(f1Indicator).toBeVisible();
  await expect(f1Indicator).toHaveText(/F1 =/);

  const dIndicators = page.locator('[data-finger^="D"]');
  await expect(dIndicators).toHaveCount(0);
});

test('opens the burger menu dropdown when clicked', async ({ page }) => {
  await page.goto('/index.html');
  await waitForReflexReady(page);

  const dropdown = page.locator('#menu-dropdown');
  await expect(dropdown).not.toBeVisible();

  await page.click('#menu-button');

  await expect(dropdown).toBeVisible();
});

test('re-runs parse/desugar pipeline when D1 changes for $$ repeat counts', async ({ page }) => {
  await page.goto('/index.html');
  await waitForReflexReady(page);

  const hasRenderer = await page.evaluate(() => Boolean(window.__reflexCore));
  test.skip(!hasRenderer, 'Renderer unavailable (no WebGL2 in this browser environment)');

  const textarea = page.locator('#formula');
  await expect(textarea).toBeVisible();

  await textarea.fill('sin $$ D1.x.abs.floor');
  await expectNoRendererError(page);

  // Force D1.x to change the repeat count: floor(abs(x)) = 1 -> 2.
  await page.evaluate(() => window.__reflexCore.setFingerValue('D1', 1.2, 0));
  const shaderAtOne = await page.evaluate(() => window.__reflexCore.lastFragmentSource);
  expect(typeof shaderAtOne).toBe('string');

  await page.evaluate(() => window.__reflexCore.setFingerValue('D1', 2.2, 0));
  await expect.poll(async () => {
    return await page.evaluate(() => window.__reflexCore.lastFragmentSource);
  }).not.toBe(shaderAtOne);
});

test('dragging D1 stays continuous when formula uses $$', async ({ page }) => {
  await page.goto('/index.html');
  await waitForReflexReady(page);

  const hasRenderer = await page.evaluate(() => Boolean(window.__reflexCore));
  test.skip(!hasRenderer, 'Renderer unavailable (no WebGL2 in this browser environment)');

  const textarea = page.locator('#formula');
  await expect(textarea).toBeVisible();
  await textarea.fill('sin $$ D1.x.abs.floor');
  await expectNoRendererError(page);
  // `fill()` focuses the textarea, which expands the overlay and can cover the
  // canvas. Blur it so pointer events reach the canvas (mirrors normal usage).
  await textarea.blur();

  const canvas = page.locator('#glcanvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const cx = box.x + box.width / 2;
  // Aim away from the bottom formula overlay.
  const cy = box.y + box.height * 0.25;

  const readD1 = async () =>
    await page.evaluate(() => window.__reflexCore.getFingerValue('D1'));

  const start = await readD1();

  // Hold mouse down and move twice. If pointer capture is released mid-drag,
  // only the first move updates D1 and the second move has no effect.
  await page.mouse.move(cx, cy);
  await page.mouse.down();

  await page.mouse.move(cx + 20, cy);
  await expect.poll(readD1).not.toEqual(start);

  const afterFirst = await readD1();
  await page.mouse.move(cx + 60, cy);
  await expect.poll(readD1).not.toEqual(afterFirst);

  await page.mouse.up();
});
