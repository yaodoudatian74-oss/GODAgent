import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// isolated data dir per run
process.env.GODAGENT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'godagent-test-'));
process.env.PORT = '8799';

let base, server;
before(async () => {
  const mod = await import('../src/index.js');
  server = mod.server;
  base = 'http://127.0.0.1:8799';
  await new Promise((r) => setTimeout(r, 400));
});
after(() => { server?.close(); });

const J = { 'content-type': 'application/json' };
const get = (p) => fetch(base + p).then((r) => r.json());
const post = (p, b) => fetch(base + p, { method: 'POST', headers: J, body: JSON.stringify(b || {}) }).then((r) => r.json());

test('bootstrap returns seeded bots and catalog', async () => {
  const b = await get('/api/bootstrap');
  assert.ok(b.bots.length >= 6, 'has seeded bots');
  assert.equal(b.catalog.shapes.length, 12, '12 shapes');
  assert.equal(b.catalog.states.length, 6, '6 states');
  assert.ok(b.apps.length >= 8, 'has connectable apps');
  assert.ok(['simulation', 'claude'].includes(b.engine));
});

test('create, edit, and delete a bot', async () => {
  const created = await post('/api/bots', { name: 'Tester', shape: 'star', color: '#1183FF' });
  assert.equal(created.name, 'Tester');
  assert.equal(created.shape, 'star');
  const patched = await fetch(base + '/api/bots/' + created.id, { method: 'PATCH', headers: J, body: JSON.stringify({ title: 'QA' }) }).then((r) => r.json());
  assert.equal(patched.title, 'QA');
  const del = await fetch(base + '/api/bots/' + created.id, { method: 'DELETE' }).then((r) => r.json());
  assert.equal(del.ok, true);
});

test('a turn produces a streamed reply and persists messages', async () => {
  const b = await get('/api/bootstrap');
  const bot = b.bots.find((x) => x.name === 'Inbox Manager');
  await post(`/api/bots/${bot.id}/messages`, { text: 'hello there' });
  await new Promise((r) => setTimeout(r, 2500));
  const d = await get('/api/bots/' + bot.id);
  const botMsgs = d.messages.filter((m) => m.role === 'bot' && m.type === 'text');
  assert.ok(botMsgs.length >= 1, 'bot replied');
  assert.ok(botMsgs.at(-1).text.length > 0);
});

test('approval flow: card is raised and resolves', async () => {
  const b = await get('/api/bootstrap');
  const bot = b.bots.find((x) => x.name === 'Sales Outbound');
  await post(`/api/bots/${bot.id}/messages`, { text: 'send the update email to the team' });
  // wait for an approval card
  let appr = null;
  for (let i = 0; i < 40 && !appr; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const d = await get('/api/bots/' + bot.id);
    appr = d.messages.find((m) => m.type === 'approval' && m.approval.status === 'pending');
  }
  assert.ok(appr, 'approval card raised');
  const res = await post(`/api/approvals/${appr.approval.id}/resolve`, { effect: 'allow' });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 400));
  const d2 = await get('/api/bots/' + bot.id);
  const card = d2.messages.find((m) => m.id === appr.id);
  assert.equal(card.approval.status, 'allowed');
});

test('memory can be added and removed', async () => {
  const b = await get('/api/bootstrap');
  const bot = b.bots[0];
  const m = await post(`/api/bots/${bot.id}/memory`, { kind: 'preference', text: 'likes concise updates' });
  assert.ok(m.id);
  const del = await fetch(`${base}/api/bots/${bot.id}/memory/${m.id}`, { method: 'DELETE' }).then((r) => r.json());
  assert.equal(del.ok, true);
});

test('routine create and manual run', async () => {
  const b = await get('/api/bootstrap');
  const bot = b.bots[0];
  const r = await post('/api/routines', { botId: bot.id, name: 'Test routine', trigger: { kind: 'interval', minutes: 120 }, prompt: 'status check' });
  assert.ok(r.id);
  const run = await post(`/api/routines/${r.id}/run`, {});
  assert.equal(run.ok, true);
});

test('connections connect/disconnect', async () => {
  const c = await post('/api/connections/gmail/connect', {});
  assert.equal(c.status, 'connected');
  const d = await post('/api/connections/gmail/disconnect', {});
  assert.equal(d.ok, true);
});

test('avatar generate is deterministic from prompt', async () => {
  const a = await post('/api/avatar/generate', { prompt: 'a calm teal helper' });
  const b = await post('/api/avatar/generate', { prompt: 'a calm teal helper' });
  assert.equal(a.shape, b.shape);
  assert.equal(a.color, b.color);
});

test('computer status endpoint reports availability honestly', async () => {
  const c = await get('/api/computer');
  assert.ok(typeof c.available === 'boolean');
  assert.ok('status' in c);
});
