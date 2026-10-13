import { defineConfig, devices } from '@playwright/test'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Variables may come from the shell instead.
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ...(process.env as Record<string, string>), FACE_PROVIDER: 'fake', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
  },
})
