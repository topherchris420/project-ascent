import { defineConfig } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3040',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
      headless: true,
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3040',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Ordinary browser acceptance is isolated from any real connection in .env.local.
    env:
      process.env.ASCENT_VERIFY_CACHED_LIVE === 'true'
        ? undefined
        : {
            DATABASE_URL: '',
            SQLITE_PATH: `.data/e2e-${randomUUID()}.sqlite`,
            APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
            APP_ORIGIN: 'http://localhost:3040',
            GROQ_API_KEY: '',
            OPENAI_API_KEY: '',
            RENTCAST_API_KEY: '',
            RESEND_API_KEY: '',
            PROPERTY_PROVIDER_ENABLED: 'false',
          },
  },
});
