const { test, expect } = require('@playwright/test');

const SIMPLE_FORMULA = 'Add(Const(1.0, 0.0), Const(0.0, 1.0))';
const DYNAMIC_SET_FORMULA = 'set c = sin(z $ D1) in (1 - c + c * z) / (c + (1 - c) * z)';
const FIXED_SET_FORMULA = 'set c = sin(z + F1) in (z - c) * (z + c)';

test('reflex4you updates formula query param after successful apply', async ({ page }) => {
  await page.goto('/index.html');

  const textarea = page.locator('#formula');
  await expect(textarea).toBeVisible();

  await textarea.fill(SIMPLE_FORMULA);
  await page.getByRole('button', { name: 'Apply' }).click();

  const url = new URL(page.url());
  const formulaInQuery = url.searchParams.get('formula');
  expect(formulaInQuery).toBe(SIMPLE_FORMULA);

  await expect(page.locator('#error')).toBeHidden();
});

test('reflex4you loads formulas from query string on startup', async ({ page }) => {
  const seededFormula = 'Const(2.0, -1.5)';
  await page.goto(`/index.html?formula=${encodeURIComponent(seededFormula)}`);

  const textarea = page.locator('#formula');
  await expect(textarea).toHaveValue(seededFormula);

  await expect(page.locator('#error')).toBeHidden();
});

test('shows D1 indicator when dynamic finger only appears inside set binding', async ({ page }) => {
  await page.goto(`/index.html?formula=${encodeURIComponent(DYNAMIC_SET_FORMULA)}`);

  const d1Indicator = page.locator('[data-finger="D1"]');
  await expect(d1Indicator).toBeVisible();
  await expect(d1Indicator).toHaveText(/D1 =/);

  const fIndicators = page.locator('[data-finger^="F"]');
  await expect(fIndicators).toHaveCount(0);
});

test('shows F1 indicator when fixed finger only appears inside set binding', async ({ page }) => {
  await page.goto(`/index.html?formula=${encodeURIComponent(FIXED_SET_FORMULA)}`);

  const f1Indicator = page.locator('[data-finger="F1"]');
  await expect(f1Indicator).toBeVisible();
  await expect(f1Indicator).toHaveText(/F1 =/);

  const dIndicators = page.locator('[data-finger^="D"]');
  await expect(dIndicators).toHaveCount(0);
});
