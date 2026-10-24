import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // The HTML report bundles the retained traces, and it is what CI uploads on failure.
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    port: 3000,
    // `next start` honours an ambient PORT (this shell has PORT=0, which makes
    // the OS pick a random port). Pin it so the server matches `port` above and
    // the spec's baseURL.
    env: { PORT: '3000' },
    reuseExistingServer: !process.env.CI,
  },
});
