import { runSimTurn } from './sim.js';
import { runClaudeTurn } from './claude.js';
import { db } from '../db.js';
import { bus } from '../bus.js';
import { uid, now } from '../util.js';

export const hasApiKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const engineMode = () => (hasApiKey() ? 'claude' : 'simulation');

const active = new Map(); // botId -> AbortController

export function isBusy(botId) { return active.has(botId); }

export function stopTurn(botId) {
  const c = active.get(botId);
  if (c) { c.abort(); active.delete(botId); }
}

// Persist the user's message, then run a turn in the background.
export async function sendUserMessage(botId, text, { files } = {}) {
  const bot = db.getBot(botId);
  if (!bot) throw new Error('no bot');
  const msg = { id: uid('m_'), role: 'user', botId, type: 'text', text, files: files || [], ts: now() };
  db.addMessage(botId, msg);
  bus.emit(botId, 'message', msg);
  runTurn(bot, text);
  return msg;
}

export function runTurn(bot, text) {
  if (active.has(bot.id)) return;
  const ctrl = new AbortController();
  active.set(bot.id, ctrl);
  const runner = hasApiKey() ? runClaudeTurn : runSimTurn;
  Promise.resolve()
    .then(() => runner(bot, text, { signal: ctrl.signal }))
    .catch((e) => {
      const fresh = db.getBot(bot.id);
      if (fresh) { fresh.state = 'blocked'; db.putBot(fresh); bus.emit(bot.id, 'state', { botId: bot.id, state: 'blocked' }); }
      bus.emit(bot.id, 'message', { id: uid('m_'), role: 'bot', botId: bot.id, type: 'error', text: String(e.message || e), ts: now() });
    })
    .finally(() => active.delete(bot.id));
}
