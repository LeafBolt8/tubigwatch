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


