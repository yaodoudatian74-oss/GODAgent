// Shared tool executor used by both the simulation and the real-Claude engine.
// Each tool persists a chat message/card and streams live events over the bus.
import { db } from './db.js';
import { bus } from './bus.js';
import { uid, now, sleep } from './util.js';
import { pending } from './pending.js';
import { computer } from './computer.js';

function setState(bot, state) {
  bot.state = state; bot.updatedAt = now(); db.putBot(bot);
  bus.emit(bot.id, 'state', { botId: bot.id, state });
}

function post(bot, msg) {
  const full = { id: uid('m_'), role: 'bot', botId: bot.id, ts: now(), ...msg };
  db.addMessage(bot.id, full);
  bus.emit(bot.id, 'message', full);
  return full;
}

// Stream a text reply token-by-token.
async function streamText(bot, text, { signal } = {}) {
  setState(bot, 'thinking');
  await sleep(220);
  const id = uid('m_');
  const base = { id, role: 'bot', botId: bot.id, type: 'text', text: '', ts: now(), streaming: true };
  db.addMessage(bot.id, base);
  bus.emit(bot.id, 'message', base);
  setState(bot, 'working');
  const words = text.split(/(\s+)/);
  let acc = '';
  for (const w of words) {
    if (signal?.aborted) break;
    acc += w;
    db.updateMessage(bot.id, id, { text: acc });
    bus.emit(bot.id, 'message.delta', { id, text: acc });
    await sleep(14 + Math.random() * 26);
  }
  db.updateMessage(bot.id, id, { text: acc, streaming: false });
  bus.emit(bot.id, 'message.done', { id, text: acc });
  return acc;
}

// Decide an action against saved rules. Returns 'allow' | 'ask'.
function evaluateRules(action) {
  const rules = db.rules();
  for (const r of rules) {
    if (action.toLowerCase().includes(r.match.toLowerCase())) return r.effect === 'allow' ? 'allow' : 'ask';
  }
  return 'ask';
}

export function makeTools(bot) {
  return {
    async reply(text, opts) { return streamText(bot, text, opts); },

    async saveMemory(kind, text) {
      const item = { id: uid('mem_'), kind, text, ts: now() };
      db.addMemory(bot.id, item);
      post(bot, { type: 'memory', memory: item, text: `メモリに保存: ${text}` });
      return item;
    },

    async draftEmail({ to, subject, body }) {
      return post(bot, { type: 'email', email: { to, subject, body, sent: false } });
    },

    // Request approval; blocks until the user (or an auto-rule) decides.
    async requestApproval({ action, detail, risk = 'normal', autoReviewable = true }) {
      const auto = db.settings.autoReview && autoReviewable ? evaluateRules(action) : 'ask';
      const id = uid('appr_');
      const hasRule = evaluateRules(action) !== 'ask';
      const card = post(bot, {
        type: 'approval',
        approval: { id, action, detail, risk, status: auto === 'allow' ? 'allowed' : 'pending', hasRule, auto: auto === 'allow' },
      });
      if (auto === 'allow') return { decision: 'allow', card };
      setState(bot, 'waiting');
      const decision = await pending.create(id, { botId: bot.id, action });
      // decision: { effect:'allow'|'deny', always?:bool }
      if (decision.always && decision.effect === 'allow') {
        db.addRule({ id: uid('rule_'), match: action, effect: 'allow', ts: now(), source: 'always_allow' });
      }
      db.updateMessage(bot.id, card.id, { approval: { ...card.approval, status: decision.effect === 'allow' ? 'allowed' : 'denied' } });
      bus.emit(bot.id, 'message.update', { id: card.id, patch: { approval: { ...card.approval, status: decision.effect === 'allow' ? 'allowed' : 'denied' } } });
      return { decision: decision.effect, card };
    },

    // Ask the user a question (free text) or offer choices; blocks for the answer.
    async askQuestion({ question, options }) {
      const id = uid('q_');
      const card = post(bot, { type: 'question', question: { id, prompt: question, options: options || null, answer: null } });
      setState(bot, 'waiting');
      const ans = await pending.create(id, { botId: bot.id, question });
      db.updateMessage(bot.id, card.id, { question: { id, prompt: question, options: options || null, answer: ans.value } });
      bus.emit(bot.id, 'message.update', { id: card.id, patch: { question: { id, prompt: question, options: options || null, answer: ans.value } } });
      return ans.value;
    },

    // Drive the real browser. Emits a computer card that the Preview panel mirrors.
    async computerOpen(target, note) {
      const card = post(bot, { type: 'computer', computer: { note: note || `Opening ${target}`, status: 'working' } });
      if (!computer.available) {
        const patch = { note: `Computer unavailable: ${computer.reason}. I can't operate the browser here.`, status: 'error' };
        db.updateMessage(bot.id, card.id, { computer: patch });
        bus.emit(bot.id, 'message.update', { id: card.id, patch: { computer: patch } });
        return { ok: false };
      }
      try {
        const r = await computer.open(target, bot.id);
        const patch = { note: note || `Opened ${r.url}`, status: 'done', url: r.url, shot: computer.lastShot };
        db.updateMessage(bot.id, card.id, { computer: patch });
        bus.emit(bot.id, 'message.update', { id: card.id, patch: { computer: patch } });
        computer.setStatus('idle', bot.id);
        return { ok: true, card, url: r.url };
      } catch (e) {
        const patch = { note: `Computer error: ${e.message}`, status: 'error' };
        db.updateMessage(bot.id, card.id, { computer: patch });
        bus.emit(bot.id, 'message.update', { id: card.id, patch: { computer: patch } });
        return { ok: false };
      }
    },

    async computerAct(kind, arg) {
      if (!computer.available) return;
      await computer.act(kind, arg, bot.id);
      computer.setStatus('idle', bot.id);
    },

    // Group handoff: another member bot picks up a task.
    async handoff(toBotId, task) {
      const to = db.getBot(toBotId);
      if (!to) return;
      post(bot, { type: 'handoff', handoff: { toBotId, toName: to.name, task } });
      return to;
    },

    async genImage(prompt, caption) {
      const svg = makeImage(prompt);
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      return post(bot, { type: 'image', img: { dataUrl, caption: caption || prompt } });
    },

    file(meta) { return post(bot, { type: 'file', file: meta }); },
    error(text) { return post(bot, { type: 'error', text }); },
    say(msg) { return post(bot, msg); },
    setState: (s) => setState(bot, s),
    done() { setState(bot, 'done'); setTimeout(() => setState(bot, 'idle'), 2600); },
  };
}

// Generate an ORIGINAL abstract key-visual (SVG) from a prompt — gradients and
// geometric shapes only; never depicts any real or copyrighted character.
function makeImage(prompt) {
  let h = 2166136261 >>> 0;
  for (const c of String(prompt)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const hue = Math.floor(rnd() * 360), hue2 = (hue + 60 + Math.floor(rnd() * 180)) % 360;
  const W = 640, Hh = 400;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">`;
  s += `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${hue2},70%,45%)"/></linearGradient>`;
  s += `<radialGradient id="r" cx="0.3" cy="0.3" r="0.9"><stop offset="0" stop-color="rgba(255,255,255,0.35)"/><stop offset="1" stop-color="rgba(0,0,0,0.25)"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${Hh}" fill="url(#g)"/>`;
  const n = 5 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const cx = rnd() * W, cy = rnd() * Hh, rr = 30 + rnd() * 140, op = (0.08 + rnd() * 0.22).toFixed(2);
    const col = `hsl(${(hue + Math.floor(rnd() * 120)) % 360},80%,${50 + Math.floor(rnd() * 30)}%)`;
    if (rnd() < 0.5) s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="${col}" opacity="${op}"/>`;
    else { const w = rr, hgt = rr * (0.4 + rnd()); s += `<rect x="${(cx - w / 2).toFixed(0)}" y="${(cy - hgt / 2).toFixed(0)}" width="${w.toFixed(0)}" height="${hgt.toFixed(0)}" rx="${(rr * 0.3).toFixed(0)}" fill="${col}" opacity="${op}" transform="rotate(${(rnd() * 90 - 45).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`; }
  }
  s += `<rect width="${W}" height="${Hh}" fill="url(#r)"/>`;
  const label = String(prompt || 'GODAgent').slice(0, 28).replace(/[<>&]/g, '');
  s += `<text x="${W / 2}" y="${Hh - 28}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.95)">${label}</text></svg>`;
  return s;
}

export { post, setState };
