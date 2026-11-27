import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// End-to-end test of "download a Hugging Face model in the app and chat with
// it on the device". huggingface.co is intercepted in the browser and answered
// with a tiny but real ONNX model (e2e/fixtures/tiny-model), so the whole path
// runs offline: Hub search -> size inspect -> download with progress -> browser
// cache -> transformers.js + bundled ONNX Runtime WASM -> streamed reply.
// The jsDelivr CDN is blocked to prove the bundled WASM is used.

const MODEL_ID = 'godagent-test/Tiny-Bigram';
const FIX = path.join(process.cwd(), 'e2e', 'fixtures', 'tiny-model');
const EXPECTED = 'こんにちは、テストです。';

async function mockHub(page: Page, log: { cdn: string[]; wasm: string[]; files: string[] }, offline = false) {
  await page.route('https://cdn.jsdelivr.net/**', (r) => { log.cdn.push(r.request().url()); r.abort(); });
  await page.route('https://huggingface.co/**', async (r) => {
    if (offline) return r.abort();
    const u = new URL(r.request().url());
    if (u.pathname === '/api/models') {
      return r.fulfill({ json: [{ id: MODEL_ID, downloads: 1, likes: 0 }] });
    }
    if (u.pathname === `/api/models/${MODEL_ID}/tree/main/onnx`) {
      const size = fs.statSync(path.join(FIX, 'onnx', 'model_q4.onnx')).size;
      return r.fulfill({ json: [{ type: 'file', path: 'onnx/model_q4.onnx', size }] });
    }
    if (u.pathname.startsWith('/api/models/')) return r.fulfill({ status: 404, json: { error: 'not found' } });
    const prefix = `/${MODEL_ID}/resolve/main/`;
    if (u.pathname.startsWith(prefix)) {
      const rel = decodeURIComponent(u.pathname.slice(prefix.length));
      const file = path.join(FIX, rel);
      if (fs.existsSync(file)) { log.files.push(rel); return r.fulfill({ body: fs.readFileSync(file), headers: { 'access-control-allow-origin': '*' } }); }
      return r.fulfill({ status: 404, body: 'not found' });
    }
    return r.fulfill({ status: 404, body: 'not found' });
  });
  page.on('request', (req) => { if (req.url().endsWith('.wasm')) log.wasm.push(req.url()); });
}

async function lastBotText(page: Page) {
  return (await page.locator('.bubble.bot').last().textContent()) || '';
}

test('download a Hugging Face model and chat with it on-device, then offline', async ({ page }) => {
  test.setTimeout(120000);
  const log = { cdn: [] as string[], wasm: [] as string[], files: [] as string[] };
  await mockHub(page, log);
  await page.goto('/');
  await expect(page.locator('.bot-row').first()).toBeVisible();

  // Settings -> モデル -> search -> size shown -> download
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.getByRole('button', { name: 'モデル', exact: true }).click();
  await page.getByPlaceholder(/Qwen/).fill('tiny');
  await page.getByRole('button', { name: '検索' }).click();
  const row = page.locator('.list-item', { hasText: MODEL_ID });
  await expect(row).toContainText('（q4）', { timeout: 15000 });
  await row.getByRole('button', { name: 'ダウンロード' }).click();
  await expect(row.locator('.pill-badge', { hasText: 'ダウンロード済み' })).toBeVisible({ timeout: 60000 });

  // make it the default model
  await page.locator('.modal select').first().selectOption('hf:' + MODEL_ID);
  await page.locator('.scrim').click({ position: { x: 5, y: 5 } });

  // chat: the reply must come from the model
  await page.locator('.bot-row', { hasText: 'チーフ' }).click();
  await expect(page.locator('.chat-header .subtitle')).toContainText('Tiny-Bigram');
  await page.locator('.composer textarea').fill('こんにちは');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(() => lastBotText(page), { timeout: 60000 }).toContain(EXPECTED);

  expect(log.files).toContain('onnx/model_q4.onnx');
  expect(log.cdn, 'no CDN requests').toEqual([]);
  expect(log.wasm.length).toBeGreaterThan(0);
  for (const w of log.wasm) expect(w.startsWith('http://127.0.0.1')).toBeTruthy();

  // offline: Hugging Face unreachable -> still answers from the on-device cache
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const log2 = { cdn: [] as string[], wasm: [] as string[], files: [] as string[] };
  await mockHub(page, log2, true);
  await page.reload();
  await page.locator('.bot-row', { hasText: 'チーフ' }).click();
  const before = await page.locator('.bubble.bot').count();
  await page.locator('.composer textarea').fill('もう一度');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(() => page.locator('.bubble.bot').count(), { timeout: 60000 }).toBeGreaterThan(before);
  await expect.poll(() => lastBotText(page), { timeout: 60000 }).toContain(EXPECTED);
  expect(log2.files, 'nothing re-downloaded offline').toEqual([]);
});

test('Hub unreachable: the model screen shows a clear error, the app keeps working', async ({ page }) => {
  await page.route('https://huggingface.co/**', (r) => r.abort());
  await page.goto('/');
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.getByRole('button', { name: 'モデル', exact: true }).click();
  await page.getByRole('button', { name: '検索' }).click();
  await expect(page.locator('.modal')).toContainText('Hugging Face に接続できません');
  await page.locator('.scrim').click({ position: { x: 5, y: 5 } });
  await page.locator('.composer textarea').fill('こんにちは');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(() => page.locator('.bubble.bot').count()).toBeGreaterThan(2);
});

// Simulates the APK: the Android activity answers https://godagent.local/* from
// assets/www (the single-file build + the ONNX Runtime .wasm). Same here.
test('APK build (https://godagent.local): download + on-device chat + offline', async ({ page }) => {
  test.setTimeout(120000);
  const DIST = path.join(process.cwd(), 'dist-artifact');
  const mime = (p: string) => p.endsWith('.html') ? 'text/html' : p.endsWith('.wasm') ? 'application/wasm' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream';
  await page.route('https://godagent.local/**', (r) => {
    let rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)) || 'index.html';
    const f = path.join(DIST, rel);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 200, body: '' });
    return r.fulfill({ body: fs.readFileSync(f), contentType: mime(rel) });
  });
  const log = { cdn: [] as string[], wasm: [] as string[], files: [] as string[] };
  await mockHub(page, log);
  await page.goto('https://godagent.local/index.html');
  await expect(page.locator('.bot-row').first()).toBeVisible();
  expect(await page.evaluate(() => isSecureContext && typeof caches !== 'undefined')).toBeTruthy();

  await page.locator('.sidebar-foot .icon-btn').click();
  await page.getByRole('button', { name: 'モデル', exact: true }).click();
  await page.getByRole('button', { name: '検索' }).click();
  const row = page.locator('.list-item', { hasText: MODEL_ID });
  await expect(row).toContainText('（q4）', { timeout: 15000 });
  await row.getByRole('button', { name: 'ダウンロード' }).click();
  await expect(row.locator('.pill-badge', { hasText: 'ダウンロード済み' })).toBeVisible({ timeout: 60000 });
  await page.locator('.modal select').first().selectOption('hf:' + MODEL_ID);
  await page.locator('.scrim').click({ position: { x: 5, y: 5 } });
  await page.locator('.composer textarea').fill('こんにちは');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(() => lastBotText(page), { timeout: 60000 }).toContain(EXPECTED);
  expect(log.cdn).toEqual([]);
  expect(log.wasm.some((w) => w.startsWith('https://godagent.local/'))).toBeTruthy();

  // offline restart: Hub unreachable, model still answers from the device
  await page.unroute('https://huggingface.co/**');
  await page.route('https://huggingface.co/**', (r) => r.abort());
  await page.reload();
  const before = await page.locator('.bubble.bot').count();
  await page.locator('.composer textarea').fill('もう一度');
  await page.locator('.composer textarea').press('Enter');
  await expect.poll(() => page.locator('.bubble.bot').count(), { timeout: 60000 }).toBeGreaterThan(before);
  await expect.poll(() => lastBotText(page), { timeout: 60000 }).toContain(EXPECTED);
});
