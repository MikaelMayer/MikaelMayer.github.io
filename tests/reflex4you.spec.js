const { test, expect } = require('@playwright/test');

const SIMPLE_FORMULA = 'Add(Const(1.0, 0.0), Const(0.0, 1.0))';

test('reflex4you updates formula query param after successful apply', async ({ page }) => {
  await page.goto('/apps/reflex4you/index.html');

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
  await page.goto(`/apps/reflex4you/index.html?formula=${encodeURIComponent(seededFormula)}`);

  const textarea = page.locator('#formula');
  await expect(textarea).toHaveValue(seededFormula);

  await expect(page.locator('#error')).toBeHidden();
});
