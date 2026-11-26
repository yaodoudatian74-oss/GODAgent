import { db } from './db.js';
import { uid, now } from './util.js';

function bot(partial) {
  const t = now();
  return {
    id: uid('bot_'),
    kind: 'bot',          // 'bot' | 'group'
    name: 'New Bot',
    title: '',
    shape: 'blob',
    color: '#777777',
    avatarImage: null,     // data URL when uploaded/generated
    state: 'idle',
    pinned: false,
    hidden: false,
    members: [],           // for groups: [botId]
    apps: [],              // connected app ids this bot uses
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

const SEED_BOTS = [
  { name: 'Chief', title: 'Primary Bot', shape: 'circle', color: '#01C971', pinned: true,
    last: 'booked the venue and sent the confirmations.' },
  { name: 'Sales Outbound', title: 'Pipeline & outbound', shape: 'capsule', color: '#F4B400',
    last: 'Done.' },
  { name: 'Inbox Manager', title: 'Email triage', shape: 'blob', color: '#7C5CFF',
    last: 'sent, inbox at zero, 5 drafts parked for you.' },
  { name: 'Account Manager', title: 'Customer success', shape: 'circle', color: '#8E44AD',
    last: "invite's out to Vicky, Globex note added." },
  { name: 'Talent Scout', title: 'Recruiting', shape: 'teardrop', color: '#1183FF',
    last: '3 intros drafted in your voice, held for review.' },
  { name: 'Expense Manager', title: 'Finance ops', shape: 'circle', color: '#FF6702',
    last: 'report filed. 9 receipts, nothing out of policy.' },
];

export function ensureSeed() {
  if (db.listBots().length > 0) return;

  const created = SEED_BOTS.map((s) => {
    const b = db.putBot(bot({ name: s.name, title: s.title, shape: s.shape, color: s.color, pinned: !!s.pinned }));
    db.addMessage(b.id, {
      id: uid('m_'), role: 'bot', type: 'text', text: greeting(s.name),
      ts: now() - 86400000 + Math.random() * 3600000,
    });
    db.addMessage(b.id, {
      id: uid('m_'), role: 'bot', type: 'text', text: s.last,
      ts: now() - Math.floor(Math.random() * 7200000),
    });
    // a little seed memory
    db.addMemory(b.id, { id: uid('mem_'), kind: 'instruction', text: `${s.title}. Keep replies short and report back when done.`, ts: now() });
    return b;
  });

  // a group chat ("Offsite crew") with 3 members
  const group = db.putBot(bot({
    kind: 'group', name: 'Offsite crew', title: 'Group', shape: 'flower', color: '#93643A',
    members: created.slice(0, 3).map(b => b.id),
  }));
  db.addMessage(group.id, { id: uid('m_'), role: 'bot', botId: created[0].id, type: 'text',
    text: 'that leaves the pipeline. I’d spin up a focused Bot for the follow-ups.', ts: now() - 3600000 });

  // primary bot = Chief
  db.setSettings({ primaryBotId: created[0].id });

  // one account-level skill
  db.putSkill({
    id: uid('skill_'), name: 'Weekly status digest',
    description: 'Summarise the week’s progress across projects and post a digest.',
    steps: ['Collect updates from connected apps', 'Group by project', 'Draft a short digest', 'Ask for approval before posting'],
    inputs: ['week'], scope: 'account', ts: now(),
  });

  // one routine on the primary bot
  db.putRoutine({
    id: uid('rtn_'), botId: created[0].id, name: 'Morning briefing',
    trigger: { kind: 'daily', at: '08:30' }, skillId: null,
    prompt: 'Give me a short morning briefing: calendar, top 3 priorities, anything blocked.',
    enabled: true, lastRun: null, runs: [], ts: now(),
  });
}

function greeting(name) {
  return `Hi — I’m ${name}. Tell me what you want me to own and I’ll keep working on it between chats. What should I pick up first?`;
}
