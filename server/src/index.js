import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, flush } from './db.js';
import { ensureSeed } from './seed.js';
import { bus } from './bus.js';
import { uid, now, sse } from './util.js';
import { pending } from './pending.js';
import { computer } from './computer.js';
import { SHAPES, PALETTE, APPS, APP_BY_ID, STATES, TRIGGER_KINDS } from './catalog.js';
import { sendUserMessage, stopTurn, isBusy, engineMode, runTurn } from './engine/index.js';
import { startScheduler, fireRoutine } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

ensureSeed();
startScheduler();

// ----- bootstrap --------------------------------------------------------
app.get('/api/bootstrap', (req, res) => {
  res.json({
    bots: db.listBots(),
    settings: db.settings,
    skills: db.skills(),
    routines: db.routines(),
    connections: db.connections(),
    apps: APPS,
    catalog: { shapes: SHAPES, palette: PALETTE, states: STATES, triggerKinds: TRIGGER_KINDS },
    engine: engineMode(),
    computer: computer.snapshot(),
  });
});

// ----- bots -------------------------------------------------------------
app.get('/api/bots/:id', (req, res) => {
  const bot = db.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not found' });
  res.json({ bot, messages: db.messages(bot.id), memory: db.memory(bot.id), busy: isBusy(bot.id),
    routines: db.routines().filter((r) => r.botId === bot.id) });
});

app.post('/api/bots', (req, res) => {
  const t = now();
  const b = {
    id: uid('bot_'), kind: req.body.kind === 'group' ? 'group' : 'bot',
    name: (req.body.name || '新しいBot').slice(0, 60), title: (req.body.title || '').slice(0, 80),
    shape: SHAPES.includes(req.body.shape) ? req.body.shape : 'blob',
    color: /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : PALETTE[Math.floor(Math.random() * PALETTE.length)],
    avatarImage: req.body.avatarImage || null, state: 'idle', pinned: false, hidden: false,
    members: Array.isArray(req.body.members) ? req.body.members : [], apps: [], createdAt: t, updatedAt: t,
  };
  db.putBot(b);
  db.addMessage(b.id, { id: uid('m_'), role: 'bot', botId: b.id, type: 'text',
    text: `はじめまして、${b.name}です。任せたい役割を教えてください。会話の合間も作業を続けます。`, ts: t });
  bus.emit('*', 'bots', db.listBots());
  res.json(b);
});

app.patch('/api/bots/:id', (req, res) => {
  const bot = db.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not found' });
  const allow = ['name', 'title', 'shape', 'color', 'avatarImage', 'pinned', 'hidden', 'members', 'apps'];
  for (const k of allow) if (k in req.body) bot[k] = req.body[k];
  bot.updatedAt = now();
  db.putBot(bot);
  bus.emit('*', 'bots', db.listBots());
  bus.emit(bot.id, 'bot', bot);
  res.json(bot);
});

app.delete('/api/bots/:id', (req, res) => {
  db.deleteBot(req.params.id);
  if (db.settings.primaryBotId === req.params.id) db.setSettings({ primaryBotId: db.listBots()[0]?.id || null });
  bus.emit('*', 'bots', db.listBots());
  res.json({ ok: true });
});

// ----- messages / turns -------------------------------------------------
app.post('/api/bots/:id/messages', async (req, res) => {
  const bot = db.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not found' });
  const msg = await sendUserMessage(bot.id, String(req.body.text || '').slice(0, 8000), { files: req.body.files });
  res.json(msg);
});

app.post('/api/bots/:id/stop', (req, res) => { stopTurn(req.params.id); res.json({ ok: true }); });

// ----- decisions --------------------------------------------------------
app.post('/api/approvals/:id/resolve', (req, res) => {
  const ok = pending.resolve(req.params.id, { effect: req.body.effect === 'allow' ? 'allow' : 'deny', always: !!req.body.always });
  res.json({ ok });
});
app.post('/api/questions/:id/answer', (req, res) => {
  const ok = pending.resolve(req.params.id, { value: String(req.body.value || '') });
  res.json({ ok });
});

// ----- memory -----------------------------------------------------------
app.post('/api/bots/:id/memory', (req, res) => {
  const item = { id: uid('mem_'), kind: req.body.kind || 'fact', text: String(req.body.text || '').slice(0, 500), ts: now() };
  db.addMemory(req.params.id, item); bus.emit(req.params.id, 'memory', db.memory(req.params.id)); res.json(item);
});
app.patch('/api/bots/:id/memory/:mid', (req, res) => {
  db.updateMemory(req.params.id, req.params.mid, { text: req.body.text }); bus.emit(req.params.id, 'memory', db.memory(req.params.id)); res.json({ ok: true });
});
app.delete('/api/bots/:id/memory/:mid', (req, res) => {
  db.deleteMemory(req.params.id, req.params.mid); bus.emit(req.params.id, 'memory', db.memory(req.params.id)); res.json({ ok: true });
});

// ----- skills -----------------------------------------------------------
app.get('/api/skills', (req, res) => res.json(db.skills()));
app.post('/api/skills', (req, res) => {
  const s = { id: uid('skill_'), name: req.body.name || 'New skill', description: req.body.description || '',
    steps: req.body.steps || [], inputs: req.body.inputs || [], scope: req.body.scope || 'account', botId: req.body.botId || null, ts: now() };
  db.putSkill(s); bus.emit('*', 'skills', db.skills()); res.json(s);
});
app.patch('/api/skills/:id', (req, res) => {
  const s = db.skills().find((x) => x.id === req.params.id); if (!s) return res.status(404).json({});
  Object.assign(s, req.body); db.putSkill(s); bus.emit('*', 'skills', db.skills()); res.json(s);
});
app.delete('/api/skills/:id', (req, res) => { db.deleteSkill(req.params.id); bus.emit('*', 'skills', db.skills()); res.json({ ok: true }); });

// ----- routines ---------------------------------------------------------
app.get('/api/routines', (req, res) => res.json(db.routines()));
app.post('/api/routines', (req, res) => {
  const r = { id: uid('rtn_'), botId: req.body.botId, name: req.body.name || 'New routine',
    trigger: req.body.trigger || { kind: 'daily', at: '09:00' }, skillId: req.body.skillId || null,
    prompt: req.body.prompt || '', enabled: req.body.enabled !== false, lastRun: null, runs: [], ts: now() };
  db.putRoutine(r); bus.emit('*', 'routines', db.routines()); res.json(r);
});
app.patch('/api/routines/:id', (req, res) => {
  const r = db.getRoutine(req.params.id); if (!r) return res.status(404).json({});
  Object.assign(r, req.body); db.putRoutine(r); bus.emit('*', 'routines', db.routines()); res.json(r);
});
app.delete('/api/routines/:id', (req, res) => { db.deleteRoutine(req.params.id); bus.emit('*', 'routines', db.routines()); res.json({ ok: true }); });
app.post('/api/routines/:id/run', (req, res) => {
  const r = db.getRoutine(req.params.id); if (!r) return res.status(404).json({});
  fireRoutine(r, { manual: true }); res.json({ ok: true });
});

// ----- connections ------------------------------------------------------
app.post('/api/connections/:appId/connect', (req, res) => {
  const app0 = APP_BY_ID[req.params.appId]; if (!app0) return res.status(404).json({});
  const conn = db.putConnection(app0.id, { appId: app0.id, status: 'connected', since: now(), account: req.body.account || 'you@company.example' });
  bus.emit('*', 'connections', db.connections()); res.json(conn);
});
app.post('/api/connections/:appId/disconnect', (req, res) => {
  db.putConnection(req.params.appId, { appId: req.params.appId, status: 'disconnected', since: now() });
  bus.emit('*', 'connections', db.connections()); res.json({ ok: true });
});

// ----- settings ---------------------------------------------------------
app.get('/api/settings', (req, res) => res.json(db.settings));
app.patch('/api/settings', (req, res) => {
  const s = db.setSettings(req.body || {}); bus.emit('*', 'settings', s); res.json(s);
});

// ----- computer ---------------------------------------------------------
app.get('/api/computer', (req, res) => res.json(computer.snapshot()));
app.post('/api/computer/open', async (req, res) => {
  const r = await computer.open(req.body.target || 'web', req.body.botId).catch((e) => ({ error: e.message }));
  res.json(computer.snapshot());
});
app.post('/api/computer/act', async (req, res) => {
  await computer.act(req.body.kind, req.body.arg, req.body.botId).catch(() => {});
  res.json(computer.snapshot());
});
app.post('/api/computer/takeover', async (req, res) => {
  await computer.takeover(!!req.body.on, req.body.botId).catch(() => {});
  res.json(computer.snapshot());
});

// ----- files ------------------------------------------------------------
app.post('/api/files', (req, res) => {
  const { name, mime, dataUrl } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'no data' });
  const b64 = dataUrl.split(',')[1] || '';
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'over 25MB limit' });
  const id = uid('file_');
  fs.writeFileSync(path.join(db.fileDir(), id), buf);
  const meta = { id, name: name || 'file', mime: mime || 'application/octet-stream', size: buf.length, ts: now() };
  db.putFile(meta);
  res.json(meta);
});
app.get('/api/files/:id', (req, res) => {
  const meta = db.files().find((f) => f.id === req.params.id); if (!meta) return res.status(404).end();
  res.setHeader('Content-Type', meta.mime);
  res.sendFile(path.join(db.fileDir(), meta.id));
});

// ----- avatar generate (deterministic, no external image model) ---------
app.post('/api/avatar/generate', (req, res) => {
  const prompt = String(req.body.prompt || '');
  let h = 0; for (const c of prompt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const shape = SHAPES[h % SHAPES.length];
  const color = PALETTE[(h >> 5) % PALETTE.length];
  res.json({ shape, color, note: '説明から生成しました（形状＋色）。画像生成は本ビルドでは未対応です。' });
});

// ----- event triggers (webhook / email / github / slack) ----------------
app.post('/api/triggers/:kind', (req, res) => {
  const kind = req.params.kind;
  const fired = [];
  for (const r of db.routines()) {
    if (r.enabled && r.trigger?.kind === kind) { fireRoutine(r, { payload: req.body }); fired.push(r.id); }
  }
  res.json({ fired });
});

// ----- live stream (SSE) ------------------------------------------------
app.get('/api/stream', (req, res) => {
  const ch = req.query.botId || '*';
  const { send, close } = sse(res);
  send('hello', { engine: engineMode(), computer: computer.snapshot() });
  const off1 = bus.on(String(ch), (e) => send(e.event, e.payload));
  const off2 = ch === '*' ? null : bus.on('*', (e) => { if (['bots', 'settings', 'routines', 'skills', 'connections', 'computer', 'routine.run'].includes(e.event)) send(e.event, e.payload); });
  req.on('close', () => { off1(); off2 && off2(); close(); });
});

// ----- static -----------------------------------------------------------
app.use('/computer-apps', express.static(path.join(__dirname, '..', 'public', 'computer-apps')));
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|computer-apps).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.get('/api/health', (req, res) => res.json({ ok: true, engine: engineMode(), computer: computer.available }));

const server = app.listen(PORT, () => {
  process.env.GODAGENT_SELF_URL = `http://127.0.0.1:${PORT}`;
  console.log(`GODAgent server on :${PORT}  (engine: ${engineMode()}, computer: ${computer.available ? 'ready' : 'unavailable'})`);
});

process.on('SIGINT', () => { flush(); computer.close().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { flush(); computer.close().finally(() => process.exit(0)); });

export { app, server };
