import { defineConfig } from '@playwright/test';

// E2E runs against the server, which serves the built SPA. Build the web app
// and start the server before running: `npm --prefix web run build` then this.
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8788',
    launchOptions: { executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] },
  },
  webServer: {
    command: 'PORT=8788 GODAGENT_DATA_DIR=.e2e-data node ../server/src/index.js',
    url: 'http://127.0.0.1:8788/api/health',
    reuseExistingServer: false,
    timeout: 20000,
  },
});
