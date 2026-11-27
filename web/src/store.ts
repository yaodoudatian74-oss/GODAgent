import { useSyncExternalStore } from 'react';
import { api, openStream } from './api';

export interface Bot { id: string; kind: 'bot' | 'group'; name: string; title: string; shape: string; color: string; avatarImage: string | null; state: string; pinned: boolean; hidden: boolean; members: string[]; apps: string[]; model?: string; createdAt: number; updatedAt: number; }
export interface Msg { id: string; role: 'user' | 'bot'; botId?: string; type: string; text?: string; ts: number; streaming?: boolean; [k: string]: any; }

interface State {
  ready: boolean;
  engine: string;
  bots: Bot[];
  settings: any;
  skills: any[];
  routines: any[];
  connections: Record<string, any>;
  apps: any[];
  catalog: { shapes: string[]; palette: string[]; states: string[]; triggerKinds: string[] };
  computer: any;
  activeId: string | null;
  messages: Record<string, Msg[]>;   // botId -> msgs
  memory: Record<string, any[]>;
  busy: Record<string, boolean>;
  modal: { kind: string; data?: any } | null;
  mobilePane: 'list' | 'chat';
}

let state: State = {
  ready: false, engine: 'simulation', bots: [], settings: {}, skills: [], routines: [], connections: {}, apps: [],
  catalog: { shapes: [], palette: [], states: [], triggerKinds: [] }, computer: { available: false },
  activeId: null, messages: {}, memory: {}, busy: {}, modal: null, mobilePane: 'list',
};

const listeners = new Set<() => void>();
function set(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach((l) => l()); }
function emit() { listeners.forEach((l) => l()); }
export function getState() { return state; }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => sel(state), () => sel(state));
}

// ---- actions -----------------------------------------------------------
export const actions = {
  async boot() {
    const b = await api.bootstrap();
    set({ ready: true, engine: b.engine, bots: b.bots, settings: b.settings, skills: b.skills, routines: b.routines,
      connections: b.connections, apps: b.apps, catalog: b.catalog, computer: b.computer });
    applyTheme(b.settings.appearance);
    openStream('*', onEvent);
    const first = b.settings.primaryBotId && b.bots.find((x: Bot) => x.id === b.settings.primaryBotId) ? b.settings.primaryBotId : b.bots[0]?.id;
    if (first) actions.select(first, { mobileOpen: false });
  },

  async select(id: string, opts?: { mobileOpen?: boolean }) {
    const mobileOpen = opts?.mobileOpen !== false;
    set({ activeId: id, mobilePane: mobileOpen ? 'chat' : state.mobilePane });
    if (!state.messages[id]) {
      const d = await api.bot(id);
      state.messages[id] = d.messages; state.memory[id] = d.memory; state.busy[id] = d.busy; emit();
    }
  },

  async send(text: string, files?: any[]) {
    const id = state.activeId!; if (!id || !text.trim()) return;
    await api.send(id, text, files);
  },

  setModal(kind: string | null, data?: any) { set({ modal: kind ? { kind, data } : null }); },
  setMobilePane(p: 'list' | 'chat') { set({ mobilePane: p }); },

  async refreshBots() { const b = await api.bootstrap(); set({ bots: b.bots, settings: b.settings, routines: b.routines, skills: b.skills, connections: b.connections }); },
};

function upsertMsg(botId: string, msg: Msg) {
  const arr = state.messages[botId] ? [...state.messages[botId]] : [];
  const i = arr.findIndex((m) => m.id === msg.id);
  if (i >= 0) arr[i] = { ...arr[i], ...msg }; else arr.push(msg);
  state.messages = { ...state.messages, [botId]: arr };
}

function onEvent(event: string, data: any) {
  switch (event) {
    case 'hello': state.computer = data.computer; emit(); break;
    case 'message': {
      const botId = data.botId || (data.channel);
      if (botId) { upsertMsg(botId, data); bumpBot(botId); emit(); }
      break;
    }
    case 'message.delta': { patchMsgEverywhere(data.id, { text: data.text, streaming: true }); emit(); break; }
    case 'message.done': { patchMsgEverywhere(data.id, { text: data.text, streaming: false }); emit(); break; }
    case 'message.update': { patchMsgEverywhere(data.id, data.patch); emit(); break; }
    case 'state': { const b = state.bots.find((x) => x.id === data.botId); if (b) { b.state = data.state; state.bots = [...state.bots]; emit(); } break; }
    case 'bot': { const i = state.bots.findIndex((x) => x.id === data.id); if (i >= 0) { state.bots[i] = data; state.bots = [...state.bots]; emit(); } break; }
    case 'bots': set({ bots: data }); break;
    case 'settings': set({ settings: data }); applyTheme(data.appearance); break;
    case 'routines': set({ routines: data }); break;
    case 'skills': set({ skills: data }); break;
    case 'connections': set({ connections: data }); break;
    case 'memory': { const botId = state.activeId; if (botId) { state.memory = { ...state.memory, [botId]: data }; emit(); } break; }
    case 'computer': set({ computer: data }); break;
    case 'routine.run': emit(); break;
  }
}

function patchMsgEverywhere(id: string, patch: any) {
  for (const botId of Object.keys(state.messages)) {
    const arr = state.messages[botId]; const i = arr.findIndex((m) => m.id === id);
    if (i >= 0) { const next = [...arr]; next[i] = { ...next[i], ...patch }; state.messages = { ...state.messages, [botId]: next }; return; }
  }
}
function bumpBot(botId: string) { const b = state.bots.find((x) => x.id === botId); if (b) { b.updatedAt = Date.now(); state.bots = [...state.bots].sort((a, z) => (Number(z.pinned) - Number(a.pinned)) || (z.updatedAt - a.updatedAt)); } }

export function applyTheme(mode: string) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
