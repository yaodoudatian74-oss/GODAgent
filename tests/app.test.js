// ブラウザ版アプリの自動テスト（Playwright 使用）
// 実行: node tests/app.test.js
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const APP_URL = "file://" + path.join(__dirname, "..", "app", "index.html");
const KEY = "godagent.state.v1";

async function run(name, fn) {
  try {
    await fn();
    console.log("PASS " + name);
    return true;
  } catch (e) {
    console.log("FAIL " + name + "\n  " + e.message);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const newPage = async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(APP_URL);
    return { context, page };
  };

  results.push(await run("初期表示にAI社員が3名表示される", async () => {
    const { context, page } = await newPage();
    const count = await page.locator(".bot-item").count();
    assert.strictEqual(count, 3);
    await context.close();
  }));

  results.push(await run("メッセージ送信で応答が表示される", async () => {
    const { context, page } = await newPage();
    await page.fill("#input", "テスト依頼です");
    await page.click("#sendBtn");
    const msgs = await page.locator(".msg").allTextContents();
    assert.ok(msgs.some((t) => t.includes("テスト依頼です")), "送信内容が表示されていない");
    assert.ok(msgs.some((t) => t.includes("未接続")), "未接続の案内が表示されていない");
    await context.close();
  }));

  results.push(await run("再読み込み後も会話履歴が復元される", async () => {
    const { context, page } = await newPage();
    await page.fill("#input", "保存確認");
    await page.click("#sendBtn");
    await page.reload();
    const msgs = await page.locator(".msg").allTextContents();
    assert.ok(msgs.some((t) => t.includes("保存確認")), "再読み込み後に履歴が残っていない");
    await context.close();
  }));

  results.push(await run("Enterで送信、Shift+Enterは改行", async () => {
    const { context, page } = await newPage();
    await page.fill("#input", "改行テスト");
    await page.press("#input", "Shift+Enter");
    assert.strictEqual(await page.locator(".msg.user").count(), 0, "Shift+Enterで送信された");
    await page.press("#input", "Enter");
    assert.strictEqual(await page.locator(".msg.user").count(), 1, "Enterで送信されなかった");
    await context.close();
  }));

  results.push(await run("AI社員の切り替えで会話が分かれる", async () => {
    const { context, page } = await newPage();
    await page.fill("#input", "副社長への依頼");
    await page.click("#sendBtn");
    await page.locator(".bot-item").nth(1).click();
    assert.strictEqual(await page.locator(".msg").count(), 0, "別のAI社員に会話が混ざっている");
    await context.close();
  }));

  results.push(await run("1分ごとのオートセーブで選択中のAI社員が保存される", async () => {
    const { context, page } = await newPage();
    await page.locator(".bot-item").nth(2).click();
    // 送信による保存を経由させず、オートセーブ（60秒）だけで保存されることを確認
    await page.waitForFunction((k) => {
      try {
        const raw = window.localStorage.getItem(k);
        return raw && JSON.parse(raw).activeBotId === "qa";
      } catch (e) { return false; }
    }, KEY, { timeout: 75000, polling: 1000 });
    await context.close();
  }));

  results.push(await run("テーマ切替ボタンでdata-themeが変わる", async () => {
    const { context, page } = await newPage();
    const before = await page.getAttribute("html", "data-theme");
    await page.click("#themeBtn");
    const after = await page.getAttribute("html", "data-theme");
    assert.notStrictEqual(before, after);
    await context.close();
  }));

  results.push(await run("狭い画面（390px）で横スクロールが発生しない", async () => {
    const { context, page } = await newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.strictEqual(overflow, false, "ページ全体が横にはみ出している");
    await context.close();
  }));

  await browser.close();
  const passed = results.filter(Boolean).length;
  console.log("\n" + passed + " / " + results.length + " passed");
  process.exit(passed === results.length ? 0 : 1);
})();
