// Tiny JSON-file persistence layer. Durable across restarts; no external DB needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GODAGENT_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });

const EMPTY = {
  version: 1,
  bots: {},          // id -> bot
  messages: {},      // botId -> [message]
  memory: {},        // botId -> [memoryItem]
  skills: {},        // id -> skill (account-level)
  routines: {},      // id -> routine
  connections: {},   // appId -> connection
  approvals: {},      // id -> approval record
  rules: [],         // custom approval rules
  files: {},         // id -> file meta
  settings: {
    appearance: 'system',     // light | dark | system
    accent: 'auto',
    language: 'ja',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    autoReview: true,
    primaryBotId: null,
    computerPermission: 'ask',  // ask | always | never
    user: { name: 'あなた', initials: 'YOU' },
  },
};

let state = load();

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed, settings: { ...EMPTY.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(EMPTY);
  }
}

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 40);
}

export function flush() {
  clearTimeout(writeTimer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const db = {
  get raw() { return state; },
  get settings() { return state.settings; },
  save: persist,

  // generic helpers --------------------------------------------------------
  listBots() {
    return Object.values(state.bots).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  },
  getBot(id) { return state.bots[id] || null; },
  putBot(bot) { state.bots[bot.id] = bot; persist(); return bot; },
  deleteBot(id) {
    delete state.bots[id];
    delete state.messages[id];
    delete state.memory[id];
    for (const r of Object.values(state.routines)) if (r.botId === id) delete state.routines[r.id];
    persist();
  },

  messages(id) { return state.messages[id] || (state.messages[id] = []); },
  addMessage(id, msg) { this.messages(id).push(msg); const b = state.bots[id]; if (b) b.updatedAt = Date.now(); persist(); return msg; },
  updateMessage(id, msgId, patch) {
    const arr = this.messages(id); const m = arr.find(x => x.id === msgId);
    if (m) Object.assign(m, patch); persist(); return m;
  },

  memory(id) { return state.memory[id] || (state.memory[id] = []); },
  addMemory(id, item) { this.memory(id).push(item); persist(); return item; },
  updateMemory(id, memId, patch) {
    const m = this.memory(id).find(x => x.id === memId); if (m) Object.assign(m, patch); persist(); return m;
  },
  deleteMemory(id, memId) { state.memory[id] = this.memory(id).filter(x => x.id !== memId); persist(); },

  skills() { return Object.values(state.skills); },
  putSkill(s) { state.skills[s.id] = s; persist(); return s; },
  deleteSkill(sid) { delete state.skills[sid]; persist(); },

  routines() { return Object.values(state.routines); },
  getRoutine(rid) { return state.routines[rid] || null; },
  putRoutine(r) { state.routines[r.id] = r; persist(); return r; },
  deleteRoutine(rid) { delete state.routines[rid]; persist(); },

  connections() { return state.connections; },
  putConnection(appId, conn) { state.connections[appId] = conn; persist(); return conn; },

  rules() { return state.rules; },
  addRule(rule) {
    state.rules.unshift(rule);
    // Grok Bot behaviour: cap at 20 Allow rules, evict oldest.
    const allow = state.rules.filter(r => r.effect === 'allow');
    if (allow.length > 20) {
      const oldest = allow[allow.length - 1];
      state.rules = state.rules.filter(r => r.id !== oldest.id);
    }
    persist(); return rule;
  },
  deleteRule(rid) { state.rules = state.rules.filter(r => r.id !== rid); persist(); },

  approvals() { return state.approvals; },
  putApproval(a) { state.approvals[a.id] = a; persist(); return a; },

  files() { return Object.values(state.files); },
  putFile(f) { state.files[f.id] = f; persist(); return f; },
  fileDir() { return path.join(DATA_DIR, 'files'); },

  setSettings(patch) { Object.assign(state.settings, patch); persist(); return state.settings; },
};

export function resetStore() { state = structuredClone(EMPTY); flush(); }
