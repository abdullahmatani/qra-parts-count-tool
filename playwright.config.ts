import { defineConfig, devices } from '@playwright/test';
import type { AppFixture } from './e2e/fixtures';

const PORT = 4173;

// Allows running against a preinstalled Chromium when the Playwright-managed
// browser is not installed (e.g. PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

type WorkerOptions = { offlineMode: boolean };
void (null as unknown as AppFixture);

export default defineConfig<object, WorkerOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
    {
      // NFR-01: the same workflow tests with the network disabled after first load.
      name: 'chromium-offline',
      testIgnore: [/offline\.spec\.ts/, /perf\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
        offlineMode: true,
      },
    },
    {
      // NFR-02 timings: run after the functional tests, one at a time, so that
      // parallel tests do not compete for the CPU. `--no-deps` runs it alone.
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['chromium', 'chromium-offline'],
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
  ],
  // E2E runs against the production build so the service worker and CSP are real.
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
