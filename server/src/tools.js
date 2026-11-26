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
      post(bot, { type: 'memory', memory: item, text: `Saved to memory: ${text}` });
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

    file(meta) { return post(bot, { type: 'file', file: meta }); },
    error(text) { return post(bot, { type: 'error', text }); },
    say(msg) { return post(bot, msg); },
    setState: (s) => setState(bot, s),
    done() { setState(bot, 'done'); setTimeout(() => setState(bot, 'idle'), 2600); },
  };
}

export { post, setState };
