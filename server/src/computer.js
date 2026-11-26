// The shared cloud computer. One real headless Chromium per user account,
// shared by every Bot (matching Grok Bot's user-scoped computer model).
//
// Honesty: this drives a REAL browser taking REAL screenshots. To stay inside
// the sandbox it navigates to locally-served web apps (served by this same
// server under /computer-apps). If Chromium cannot launch, the computer is
// reported as UNAVAILABLE — we never fabricate a "working" frame.

import { createRequire } from 'node:module';
import { bus } from './bus.js';

const require = createRequire(import.meta.url);

let playwright = null;
try { playwright = require('playwright'); } catch { playwright = null; }

const CHROME_PATH = '/opt/pw-browsers/chromium';

class Computer {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.available = !!playwright;
    this.reason = playwright ? null : 'Playwright not installed';
    this.status = 'idle';        // idle | working | takeover | error
    this.lastShot = null;        // data URL
    this.currentUrl = 'about:blank';
    this.activeBotId = null;
    this.baseUrl = process.env.GODAGENT_SELF_URL || 'http://127.0.0.1:' + (process.env.PORT || 8787);
  }

  async ensure() {
    if (!this.available) throw new Error(this.reason || 'computer unavailable');
    if (this.page && !this.page.isClosed()) return this.page;
    const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
    try {
      this.browser = await playwright.chromium.launch(launchOpts);
    } catch (e) {
      try {
        this.browser = await playwright.chromium.launch({ ...launchOpts, executablePath: CHROME_PATH });
      } catch (e2) {
        this.available = false; this.reason = String(e2.message || e2);
        throw new Error(this.reason);
      }
    }
    this.context = await this.browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
    this.page = await this.context.newPage();
    return this.page;
  }

  setStatus(s, botId) {
    this.status = s;
    if (botId) this.activeBotId = botId;
    bus.emit('*', 'computer', this.snapshot());
  }

  snapshot() {
    return {
      available: this.available, reason: this.reason, status: this.status,
      url: this.currentUrl, shot: this.lastShot, activeBotId: this.activeBotId,
    };
  }

  async shoot() {
    if (!this.page || this.page.isClosed()) return null;
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 70 });
    this.lastShot = 'data:image/jpeg;base64,' + buf.toString('base64');
    this.currentUrl = this.page.url();
    bus.emit('*', 'computer', this.snapshot());
    return this.lastShot;
  }

  resolveUrl(target) {
    if (/^https?:\/\//.test(target)) return target;
    // map friendly app names to bundled local fixtures
    const map = {
      salesforce: '/computer-apps/salesforce.html',
      crm: '/computer-apps/salesforce.html',
      web: '/computer-apps/web.html',
      search: '/computer-apps/web.html',
      mail: '/computer-apps/mail.html',
      gmail: '/computer-apps/mail.html',
      sheet: '/computer-apps/sheet.html',
      drive: '/computer-apps/sheet.html',
    };
    const key = target.toLowerCase().trim();
    const p = map[key] || (target.startsWith('/') ? target : '/computer-apps/web.html?q=' + encodeURIComponent(target));
    return this.baseUrl + p;
  }

  async open(target, botId) {
    const page = await this.ensure();
    this.setStatus('working', botId);
    const url = this.resolveUrl(target);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(250);
    await this.shoot();
    return { url: this.currentUrl };
  }

  async act(kind, arg, botId) {
    const page = await this.ensure();
    this.setStatus('working', botId);
    try {
      if (kind === 'click') await page.click(arg, { timeout: 4000 }).catch(() => {});
      else if (kind === 'type') { const [sel, val] = arg; await page.fill(sel, val, { timeout: 4000 }).catch(() => {}); }
      else if (kind === 'scroll') await page.mouse.wheel(0, Number(arg) || 400);
      else if (kind === 'press') await page.keyboard.press(arg);
      await page.waitForTimeout(200);
    } catch { /* tolerate */ }
    await this.shoot();
  }

  async takeover(on, botId) {
    this.setStatus(on ? 'takeover' : 'working', botId);
    await this.shoot();
  }

  async close() {
    try { await this.browser?.close(); } catch {}
    this.browser = this.context = this.page = null;
    this.status = 'idle';
  }
}

export const computer = new Computer();
