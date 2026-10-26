import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Freeze the clock to Oct 16, 2026, 08:00 AM (Philippine Time)
  // This ensures the test fixtures never expire and always render as active.
  await page.clock.setFixedTime(new Date('2026-10-16T08:00:00+08:00'));
});

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

test('map popup view details button has visible text', async ({ page }) => {
  await page.goto('/map?source=fixtures');

  // Barangay boundaries replace the old city pins, so the popup is reached by clicking the map
  // rather than a marker icon.
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  // Attached, not visible: some rendered paths are degenerate (d="M0 0") and never visible.
  await page.waitForSelector('.leaflet-interactive', { state: 'attached' });

  // The map starts below the fold, and a raw mouse click would land off-screen.
  await map.scrollIntoViewIfNeeded();
  await map.click();

  const viewDetailsLink = page.getByRole('link', { name: 'View Details' });
  await expect(viewDetailsLink).toBeVisible();

  const color = await viewDetailsLink.evaluate((el) => window.getComputedStyle(el).color);
  expect(color).toBe('rgb(255, 255, 255)');
});

test('no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('/?source=fixtures');
  let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  await page.goto('/map?source=fixtures');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('clicking a map pin navigates to the filtered dashboard', async ({ page }) => {
  // 1. Load the map in fixtures mode
  await page.goto('/map?source=fixtures');

  // 2. Wait for the map and a pin to load
  const pin = page.locator('.custom-city-pin [data-city]').first();
  await expect(pin).toBeVisible();

  // 3. Read the city name off the pin itself, independent of the popup/tooltip wording.
  const expectedCity = await pin.getAttribute('data-city');
  expect(expectedCity).toBeTruthy();

  // 4. Click the pin to open the popup
  await pin.click();

  // 5. Click the "View Details" link in the popup
  const viewDetailsLink = page.getByRole('link', { name: 'View Details' });
  await expect(viewDetailsLink).toBeVisible();
  await viewDetailsLink.click();

  // 6. Verify we are on the dashboard with the correct URL
  await expect(page).toHaveURL(/\/\?city=.*&source=fixtures/);

  // 7. Verify the dashboard is filtered by the EXACT city we clicked
  const cityHeading = page.locator('h2').first();
  await expect(cityHeading).toContainText(expectedCity!);
});

test('every city with affected barangays gets a pin', async ({ page }) => {
  await page.goto('/map?source=fixtures');
  await expect(page.locator('.leaflet-container')).toBeVisible();

  // The text list proves the map has something to show; a pin should exist for it too.
  const affectedHeading = page.getByRole('heading', { name: /Affected Barangays \(\d+\)/ });
  await expect(affectedHeading).toBeVisible();

  const pinCount = await page.locator('.custom-city-pin').count();
  expect(pinCount).toBeGreaterThanOrEqual(1);

  // Every rendered pin must carry a city name the navigation link can use.
  const pins = page.locator('.custom-city-pin [data-city]');
  const labelledPinCount = await pins.count();
  for (let i = 0; i < labelledPinCount; i += 1) {
    const city = await pins.nth(i).getAttribute('data-city');
    expect(city).toBeTruthy();
  }

  const pinCities = new Set(
    await pins.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-city')).filter((city): city is string => !!city),
    ),
  );

  // The list renders each entry as "<barangay>, <city>", so the trailing segment is the city.
  const listedCities = (
    await page
      .getByRole('region', { name: /Affected Barangays/ })
      .getByRole('listitem')
      .allTextContents()
  ).map((entry) => entry.split(',').pop()?.trim() ?? '');

  expect(listedCities.length).toBeGreaterThan(0);
  for (const city of listedCities) {
    expect(pinCities.has(city)).toBe(true);
  }
});
