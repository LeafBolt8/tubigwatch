import { expect, test } from '@playwright/test';

test('home page renders the TubigWatch heading', async ({ page }) => {
  await page.goto('/?source=fixtures');
  await page.waitForURL(/\/.*\?source=fixtures/);
  await page.waitForSelector('role=heading[name="TubigWatch"]', { state: 'attached' });
  await expect(page.getByRole('heading', { name: 'TubigWatch' })).toBeVisible();
});

test('fixtures mode renders the outage summary and at least one card', async ({ page }) => {
  await page.goto('/?source=fixtures');
  await page.waitForSelector('role=article', { state: 'attached' });
  await expect(page.getByRole('button', { name: /^All\s+\d+$/ })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('city pin button is focusable and has a visible focus ring', async ({ page }) => {
  await page.goto('/?source=fixtures');

  const pinButton = page.getByRole('button', { name: /Pin .* city/i }).first();
  await expect(pinButton).toBeVisible();

  // Tab instead of calling focus(): script focus does not match :focus-visible, so it would
  // bypass the keyboard-only ring this test exists to protect.
  let reachedByKeyboard = false;
  for (let press = 0; press < 60; press += 1) {
    await page.keyboard.press('Tab');
    if (await pinButton.evaluate((el) => el === document.activeElement)) {
      reachedByKeyboard = true;
      break;
    }
  }

  expect(reachedByKeyboard).toBe(true);
  await expect(pinButton).toBeFocused();

  const focusRing = await pinButton.evaluate((el) => ({
    focusVisible: el.matches(':focus-visible'),
    boxShadow: window.getComputedStyle(el).boxShadow,
  }));

  expect(focusRing.focusVisible).toBe(true);
  expect(focusRing.boxShadow).not.toBe('none');
});



