// Routine scheduler. Checks every 30s whether any enabled routine is due and
// fires it against its bot (as a system-originated turn). Supports time/daily/
// weekly/monthly/interval triggers; webhook/email/github/slack triggers fire
// via the /api/triggers endpoint instead.
import { db } from './db.js';
import { bus } from './bus.js';
import { now, uid } from './util.js';
import { runTurn } from './engine/index.js';

function tzNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', hour12: false })
      .formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return { hm: `${get('hour')}:${get('minute')}`, weekday: get('weekday'), day: get('day') };
  } catch {
    const d = new Date();
    return { hm: d.toTimeString().slice(0, 5), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], day: String(d.getDate()).padStart(2, '0') };
  }
}

function due(routine, clock) {
  const tr = routine.trigger || {};
  const last = routine.lastRun || 0;
  const mins = (now() - last) / 60000;
  switch (tr.kind) {
    case 'interval': return mins >= (tr.minutes || 60);
    case 'time': case 'daily': return clock.hm === (tr.at || '09:00') && mins > 2;
    case 'weekly': return clock.hm === (tr.at || '09:00') && (tr.weekday || 'Mon').startsWith(clock.weekday) && mins > 2;
    case 'monthly': return clock.hm === (tr.at || '09:00') && String(tr.day || 1).padStart(2, '0') === clock.day && mins > 2;
    default: return false; // event-driven triggers handled elsewhere
  }
}

export function fireRoutine(routine, { manual = false, payload = null } = {}) {
  const bot = db.getBot(routine.botId);
  if (!bot) return;
  routine.lastRun = now();
  const run = { id: uid('run_'), ts: now(), manual, ok: true };
  routine.runs = (routine.runs || []).slice(-19).concat(run);
  db.putRoutine(routine);
  bus.emit('*', 'routine.run', { routineId: routine.id, run });

  let prompt = routine.prompt || '';
  if (routine.skillId) {
    const skill = db.skills().find((s) => s.id === routine.skillId);
    if (skill) prompt = `Run the "${skill.name}" skill. ${prompt}`.trim();
  }
  if (payload) prompt += `\n\nTrigger payload: ${JSON.stringify(payload).slice(0, 400)}`;
  const sys = { id: uid('m_'), role: 'user', botId: bot.id, type: 'routine', text: prompt,
    routine: { name: routine.name, trigger: routine.trigger }, ts: now() };
  db.addMessage(bot.id, sys);
  bus.emit(bot.id, 'message', sys);
  runTurn(bot, prompt);
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  const tick = () => {
    const tz = db.settings.timezone;
    const clock = tzNow(tz);
    for (const r of db.routines()) {
      if (r.enabled && due(r, clock)) fireRoutine(r);
    }
  };
  timer = setInterval(tick, 30000);
  tick();
}
export function stopScheduler() { clearInterval(timer); timer = null; }
