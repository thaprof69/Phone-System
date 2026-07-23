import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    {
      name: 'admin-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.ADMIN_WEB_URL ?? 'http://127.0.0.1:3000',
      },
      testMatch: /admin\.spec\.ts/,
    },
    {
      name: 'customer-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CUSTOMER_WEB_URL ?? 'http://127.0.0.1:3001',
      },
      testMatch: /customer\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @quantum-parks/admin-web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @quantum-parks/customer-web dev',
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
