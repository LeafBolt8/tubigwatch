import { expect, test, type Page } from '@playwright/test';

// Prove React is hydrated before typing: the aria-pressed flip can only happen if
// onClick is wired, so this is an auto-waiting hydration barrier, not a timeout.
async function waitForHydration(page: Page) {
  const quiet = page.getByRole('button', { name: /^quiet$/i });
  await quiet.click();
  await expect(quiet).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^all$/i }).click();
  await expect(page.getByRole('button', { name: /^all$/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test('/cities?source=fixtures renders the directory heading and a quiet Caloocan row', async ({
  page,
}) => {
  await page.goto('/cities?source=fixtures');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/cities/i);

  const caloocanLink = page.getByRole('link', { name: /caloocan/i });
  await expect(caloocanLink).toBeVisible();
  await expect(caloocanLink).toHaveAttribute(
    'href',
    /\/city\/caloocan\?source=fixtures$/,
  );

  // Caloocan's only fixture is the restored pipe-burst row, so the row must not claim an active
  // or scheduled advisory.
  const caloocanRow = page.getByRole('listitem').filter({ has: caloocanLink });
  await expect(caloocanRow.getByText('Quiet', { exact: true })).toBeVisible();
});

test('search filters the city directory by name', async ({ page }) => {
  await page.goto('/cities?source=fixtures');
  await waitForHydration(page);

  const searchInput = page.getByRole('searchbox');
  await expect(searchInput).toBeVisible();

  await searchInput.fill('caloocan');
  await expect(page.getByRole('link', { name: /caloocan/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /quezon city/i })).toHaveCount(0);

  await searchInput.fill('');
  await expect(page.getByRole('link', { name: /quezon city/i })).toBeVisible();
});

test('search is accent-tolerant', async ({ page }) => {
  await page.goto('/cities?source=fixtures');
  await waitForHydration(page);

  const searchInput = page.getByRole('searchbox');
  const hasLasPinas = await page.getByRole('link', { name: /las piñas/i }).isVisible().catch(() => false);

  test.skip(!hasLasPinas, 'fixture has no accented city');

  await searchInput.fill('las pinas');
  await expect(page.getByRole('link', { name: /las piñas/i })).toBeVisible();
});

test('status filter narrows rows by active/scheduled/quiet', async ({ page }) => {
  await page.goto('/cities?source=fixtures');

  const filterGroup = page.getByRole('group', { name: /filter by status/i });
  await expect(filterGroup).toBeVisible();

  await filterGroup.getByRole('button', { name: /^active$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^active$/i })).toHaveAttribute('aria-pressed', 'true');

  await expect(page.getByRole('link', { name: /quezon city/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /makati/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /caloocan/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /taguig/i })).toHaveCount(0);

  await filterGroup.getByRole('button', { name: /^scheduled$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^scheduled$/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /taguig/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /pasig/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /caloocan/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /quezon city/i })).toHaveCount(0);

  await filterGroup.getByRole('button', { name: /^quiet$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^quiet$/i })).toHaveAttribute('aria-pressed', 'true');

  await expect(page.getByRole('link', { name: /caloocan/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /quezon city/i })).toHaveCount(0);

  await filterGroup.getByRole('button', { name: /^all$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /caloocan/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /quezon city/i })).toBeVisible();

});

test('search and filter combine, and links keep ?source=fixtures', async ({ page }) => {
  await page.goto('/cities?source=fixtures');
  await waitForHydration(page);

  const filterGroup = page.getByRole('group', { name: /filter by status/i });
  await filterGroup.getByRole('button', { name: /^quiet$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^quiet$/i })).toHaveAttribute('aria-pressed', 'true');

  const caloocanLink = page.getByRole('link', { name: /caloocan/i });

  await expect(caloocanLink).toHaveAttribute('href', /\/city\/caloocan\?source=fixtures$/);

  await filterGroup.getByRole('button', { name: /^all$/i }).click();
  await expect(filterGroup.getByRole('button', { name: /^all$/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const searchInput = page.getByRole('searchbox');
  await searchInput.fill('pasig');

  // Positive case first: 'pasig' must narrow the list to the Pasig row. A count-0-only
  // assertion would also pass if search matched nothing at all.
  const pasigLink = page.getByRole('link', { name: /^pasig$/i });
  await expect(pasigLink).toHaveCount(1);
  await expect(pasigLink).toBeVisible();
  await expect(page.getByRole('link', { name: /caloocan/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /quezon city/i })).toHaveCount(0);

  await searchInput.fill('');
  await expect(page.getByRole('link', { name: /caloocan/i })).toBeVisible();
});

test('dashboard exposes Browse all cities and preserves fixtures mode', async ({ page }) => {
  await page.goto('/?source=fixtures');

  const browseLink = page.getByRole('link', { name: 'Browse all cities' });
  await expect(browseLink).toBeVisible();
  await expect(browseLink).toHaveAttribute('href', '/cities?source=fixtures');

  await browseLink.click();
  await page.waitForURL(
    (url) => url.pathname === '/cities' && url.search === '?source=fixtures',
  );

  expect(new URL(page.url()).pathname).toBe('/cities');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/cities/i);
});

test('no-match search shows an empty state with a clear action', async ({ page }) => {
  await page.goto('/cities?source=fixtures');
  await waitForHydration(page);

  const searchInput = page.getByRole('searchbox');
  await searchInput.fill('zzzzz');

  await expect(page.getByText(/no cities match/i)).toBeVisible();

  const clearButton = page.getByRole('button', { name: /clear/i });
  await expect(clearButton).toBeVisible();
  await clearButton.click();

  await expect(page.getByRole('link', { name: /caloocan/i })).toBeVisible();
  await expect(searchInput).toHaveValue('');
});
