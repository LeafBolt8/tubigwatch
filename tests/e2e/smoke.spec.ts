import { expect, test } from '@playwright/test';

test('home page renders the TubigWatch heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TubigWatch' })).toBeVisible();
});
