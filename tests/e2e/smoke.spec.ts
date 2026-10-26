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

  // Fixtures are relative to load time, so at least one row must still resolve to active. If a
  // clock change pushed every fixture into the future, this badge would disappear.
  await expect(page.locator('span', { hasText: /^ACTIVE$/ }).first()).toBeVisible();

  // The opposite regression: future advisories swallowed entirely would drop this badge.
  await expect(page.locator('span', { hasText: /^SCHEDULED$/ }).first()).toBeVisible();

  // Entering the map must not silently swap fixtures for the live dataset.
  await page.getByRole('link', { name: 'View Map' }).click();
  await expect(page).toHaveURL(/\/map\?source=fixtures$/);
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

test('filter pills correctly filter the dashboard cards', async ({ page }) => {
  await page.goto('/?source=fixtures');
  await expect(page.getByRole('article').first()).toBeVisible();

  // Click the Active filter. The server HTML is interactive only after hydration, and a click
  // that lands before it is silently lost, so retry until the URL reflects the filter.
  const activePill = page.getByRole('button', { name: /^Active/ });
  await expect(async () => {
    await activePill.click();
    await expect(page).toHaveURL(/status=active/);
  }).toPass({ timeout: 10_000 });

  // Every article card should have an ACTIVE badge
  const articles = page.getByRole('article');
  const count = await articles.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const card = articles.nth(i);
    await expect(card.locator('span', { hasText: /^ACTIVE$/ })).toBeVisible();
    await expect(card.locator('span', { hasText: /^SCHEDULED$/ })).toBeHidden();
  }

  // Click the Scheduled filter
  await page.getByRole('button', { name: /^Scheduled/ }).click();
  const countScheduled = await articles.count();
  expect(countScheduled).toBeGreaterThan(0);

  for (let i = 0; i < countScheduled; i += 1) {
    const card = articles.nth(i);
    await expect(card.locator('span', { hasText: /^SCHEDULED$/ })).toBeVisible();
    await expect(card.locator('span', { hasText: /^ACTIVE$/ })).toBeHidden();
  }
});

test('provider filter and URL state work together', async ({ page }) => {
  // 1. Load the dashboard (streamed content is not guaranteed to be painted when goto resolves)
  await page.goto('/?source=fixtures');
  await expect(page.getByRole('article').first()).toBeVisible();
  const articlesBefore = await page.getByRole('article').count();
  expect(articlesBefore).toBeGreaterThan(0);

  // 2. Click "Maynilad". Retried for the same hydration reason as the status pills.
  const mayniladPill = page.getByRole('button', { name: /^Maynilad$/ });
  await expect(async () => {
    await mayniladPill.click();
    await expect(page).toHaveURL(/provider=maynilad/);
  }).toPass({ timeout: 10_000 });

  // 4. Every remaining card should be Maynilad
  const mayniladArticles = page.getByRole('article');
  const mayniladCount = await mayniladArticles.count();
  expect(mayniladCount).toBeGreaterThan(0);
  for (let i = 0; i < mayniladCount; i += 1) {
    await expect(mayniladArticles.nth(i).locator('span', { hasText: /^Maynilad$/ })).toBeVisible();
    await expect(
      mayniladArticles.nth(i).locator('span', { hasText: /^Manila Water$/ }),
    ).toBeHidden();
  }

  // 5. Reload the page — state should persist from URL
  await page.reload();
  await expect(page.getByRole('button', { name: /^Maynilad$/ })).toHaveClass(/bg-white/);

  // 6. Click "Manila Water"
  await page.getByRole('button', { name: /^Manila Water$/ }).click();
  await expect(page).toHaveURL(/provider=manila-water/);

  // 7. Assert the cards actually changed to Manila Water
  const mwArticles = page.getByRole('article');
  // Wait for the DOM to swap before counting, or the snapshot can still hold the Maynilad card.
  await expect(
    mwArticles.first().locator('span', { hasText: /^Manila Water$/ }),
  ).toBeVisible();
  const mwCount = await mwArticles.count();
  expect(mwCount).toBeGreaterThan(0);

  for (let i = 0; i < mwCount; i += 1) {
    await expect(mwArticles.nth(i).locator('span', { hasText: /^Manila Water$/ })).toBeVisible();
    await expect(mwArticles.nth(i).locator('span', { hasText: /^Maynilad$/ })).toBeHidden();
  }

  // 8. Click "All Providers" — URL should clear the param
  await page.getByRole('button', { name: /^All Providers$/ }).click();
  await expect(page).not.toHaveURL(/provider=/);
});

test('status filter persists after reload', async ({ page }) => {
  // 1. Load with the status=active param already in the URL
  await page.goto('/?source=fixtures&status=active');

  // 2. The "Active" pill should be selected
  const activePill = page.getByRole('button', { name: /^Active/ });
  await expect(activePill).toHaveClass(/bg-white/);

  // 3. Every visible card should have an ACTIVE badge
  await expect(page.getByRole('article').first()).toBeVisible();
  const cards = page.getByRole('article');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    await expect(cards.nth(i).locator('span', { hasText: /^ACTIVE$/ })).toBeVisible();
    await expect(cards.nth(i).locator('span', { hasText: /^SCHEDULED$/ })).toBeHidden();
  }

  // 4. Reload and verify state persists — both the pill and the filtered cards
  await page.reload();
  await expect(activePill).toHaveClass(/bg-white/);
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.locator('article span', { hasText: /^SCHEDULED$/ })).toHaveCount(0);
});

test('search query persists after reload and filters cards', async ({ page }) => {
  // 1. Load with a search query
  await page.goto('/?source=fixtures&q=Kalusugan');

  // 2. The search input should have the value
  const searchInput = page.getByPlaceholder(/Search by city/);
  await expect(searchInput).toHaveValue('Kalusugan');

  // 3. Only cards containing Kalusugan should be visible
  await expect(page.getByRole('article').first()).toBeVisible();
  const cards = page.getByRole('article');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(4);

  // 4. Reload and verify persistence
  await page.reload();
  await expect(searchInput).toHaveValue('Kalusugan');
  const countAfter = await page.getByRole('article').count();
  expect(countAfter).toBe(count);
});

test('city heading opens the city page in the current data mode', async ({ page }) => {
  await page.goto('/?source=fixtures');
  await expect(page.getByRole('article').first()).toBeVisible();

  const cityLink = page.getByRole('heading', { level: 2 }).first().getByRole('link');
  await expect(cityLink).toBeVisible();
  const cityName = (await cityLink.innerText()).split('→')[0]?.trim();
  expect(cityName).toBeTruthy();

  await cityLink.click();

  await expect(page).toHaveURL(/\/city\/[a-z-]+\?source=fixtures$/);
  await expect(page).toHaveTitle(/Water Outages in .+ \| TubigWatch/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(cityName!);
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.getByText('Data mode: fixtures (not live)')).toBeVisible();

  await page.getByRole('link', { name: 'View on Map' }).click();
  await expect(page).toHaveURL(/\/map\?city=.+&source=fixtures$/);
  await expect(page.locator('.leaflet-container')).toBeVisible();

  // The slug drops the ñ; the heading must still come from the known city list.
  await page.goto('/city/las-pinas?source=fixtures');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Las Piñas');
});

test('map centers on city coordinates when hand-off is present', async ({ page }) => {
  // Quezon City coordinates from CITY_COORDS: [14.676, 121.0437]
  await page.goto('/map?city=Quezon%20City&source=fixtures');
  const mapContainer = page.locator('.leaflet-container');
  await expect(mapContainer).toBeVisible();

  // The reporter publishes the live Leaflet centre; poll until the view has settled.
  await expect
    .poll(async () => {
      const raw = await mapContainer.getAttribute('data-center');
      if (!raw) return false;
      const [lat, lng] = raw.split(',').map(Number);
      if (lat === undefined || lng === undefined) return false;
      return Math.abs(lat - 14.676) < 0.01 && Math.abs(lng - 121.0437) < 0.01;
    })
    .toBe(true);

  await expect(mapContainer).toHaveAttribute('data-zoom', '13');

  // The back link must not silently drop fixtures mode.
  await page.getByRole('link', { name: 'Back to Dashboard' }).click();
  await expect(page).toHaveURL(/\/\?source=fixtures$/);
});

test('barangay page and map hand-off resolve the right city', async ({ page }) => {
  await page.goto('/?source=fixtures');

  const barangayLink = page.getByRole('link', { name: /Kalusugan/ }).first();
  await expect(barangayLink).toBeVisible();
  await barangayLink.click();

  await expect(page).toHaveURL(/\/barangay\/kalusugan-quezon-city\?source=fixtures$/);
  await expect(page).toHaveTitle(/Water Outages in Kalusugan, Quezon City \| TubigWatch/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kalusugan');
  await expect(page.getByRole('article').first()).toBeVisible();

  await page.getByRole('link', { name: 'View on Map' }).click();
  await expect(page).toHaveURL(/\/map\?barangay=kalusugan-quezon-city&source=fixtures$/);

  const mapContainer = page.locator('.leaflet-container');
  await expect(mapContainer).toBeVisible();
  await expect(mapContainer).toHaveAttribute('data-highlighted-barangay', 'Kalusugan');
  await expect
    .poll(async () => {
      const raw = await mapContainer.getAttribute('data-center');
      if (!raw) return false;
      const [lat, lng] = raw.split(',').map(Number);
      if (lat === undefined || lng === undefined) return false;
      return Math.abs(lat - 14.676) < 0.01 && Math.abs(lng - 121.0437) < 0.01;
    })
    .toBe(true);
});
