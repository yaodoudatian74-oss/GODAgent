import { defineConfig } from '@playwright/test';

// Tests for the standalone (serverless) build: the APK / offline app.
// Build first: VITE_STANDALONE=1 npx vite build --base=./ --outDir dist-standalone
export default defineConfig({
  testDir: './e2e-standalone',
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:8093',
    launchOptions: { executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] },
  },
  webServer: {
    command: 'python3 -m http.server 8093 --bind 127.0.0.1 --directory dist-standalone',
    url: 'http://127.0.0.1:8093/',
    reuseExistingServer: false,
    timeout: 20000,
  },
});
