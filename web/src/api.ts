// Thin REST + SSE client for the GODAgent server.
const J = { 'content-type': 'application/json' };
async function req(path: string, opts?: RequestInit) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

export const api = {
  bootstrap: () => req('/api/bootstrap'),
  bot: (id: string) => req(`/api/bots/${id}`),
  createBot: (b: any) => req('/api/bots', { method: 'POST', headers: J, body: JSON.stringify(b) }),
  patchBot: (id: string, p: any) => req(`/api/bots/${id}`, { method: 'PATCH', headers: J, body: JSON.stringify(p) }),
  deleteBot: (id: string) => req(`/api/bots/${id}`, { method: 'DELETE' }),
  send: (id: string, text: string, files?: any[]) => req(`/api/bots/${id}/messages`, { method: 'POST', headers: J, body: JSON.stringify({ text, files }) }),
  stop: (id: string) => req(`/api/bots/${id}/stop`, { method: 'POST' }),

  approve: (id: string, effect: 'allow' | 'deny', always = false) => req(`/api/approvals/${id}/resolve`, { method: 'POST', headers: J, body: JSON.stringify({ effect, always }) }),
  answer: (id: string, value: string) => req(`/api/questions/${id}/answer`, { method: 'POST', headers: J, body: JSON.stringify({ value }) }),

  addMemory: (id: string, kind: string, text: string) => req(`/api/bots/${id}/memory`, { method: 'POST', headers: J, body: JSON.stringify({ kind, text }) }),
  editMemory: (id: string, mid: string, text: string) => req(`/api/bots/${id}/memory/${mid}`, { method: 'PATCH', headers: J, body: JSON.stringify({ text }) }),
  delMemory: (id: string, mid: string) => req(`/api/bots/${id}/memory/${mid}`, { method: 'DELETE' }),

  skills: () => req('/api/skills'),
  createSkill: (s: any) => req('/api/skills', { method: 'POST', headers: J, body: JSON.stringify(s) }),
  patchSkill: (id: string, p: any) => req(`/api/skills/${id}`, { method: 'PATCH', headers: J, body: JSON.stringify(p) }),
  delSkill: (id: string) => req(`/api/skills/${id}`, { method: 'DELETE' }),

  createRoutine: (r: any) => req('/api/routines', { method: 'POST', headers: J, body: JSON.stringify(r) }),
  patchRoutine: (id: string, p: any) => req(`/api/routines/${id}`, { method: 'PATCH', headers: J, body: JSON.stringify(p) }),
  delRoutine: (id: string) => req(`/api/routines/${id}`, { method: 'DELETE' }),
  runRoutine: (id: string) => req(`/api/routines/${id}/run`, { method: 'POST' }),

  connect: (appId: string) => req(`/api/connections/${appId}/connect`, { method: 'POST', headers: J, body: '{}' }),
  disconnect: (appId: string) => req(`/api/connections/${appId}/disconnect`, { method: 'POST' }),

  settings: (p: any) => req('/api/settings', { method: 'PATCH', headers: J, body: JSON.stringify(p) }),

  computer: () => req('/api/computer'),
  computerOpen: (target: string, botId?: string) => req('/api/computer/open', { method: 'POST', headers: J, body: JSON.stringify({ target, botId }) }),
  computerAct: (kind: string, arg: any, botId?: string) => req('/api/computer/act', { method: 'POST', headers: J, body: JSON.stringify({ kind, arg, botId }) }),
  takeover: (on: boolean, botId?: string) => req('/api/computer/takeover', { method: 'POST', headers: J, body: JSON.stringify({ on, botId }) }),

  uploadFile: (name: string, mime: string, dataUrl: string) => req('/api/files', { method: 'POST', headers: J, body: JSON.stringify({ name, mime, dataUrl }) }),
  genAvatar: (prompt: string) => req('/api/avatar/generate', { method: 'POST', headers: J, body: JSON.stringify({ prompt }) }),
};

export type StreamHandler = (event: string, data: any) => void;
export function openStream(botId: string | '*', onEvent: StreamHandler) {
  const es = new EventSource(`/api/stream?botId=${encodeURIComponent(botId)}`);
  const names = ['hello', 'message', 'message.delta', 'message.done', 'message.update', 'state', 'bot',
    'bots', 'settings', 'routines', 'skills', 'connections', 'memory', 'computer', 'routine.run'];
  for (const n of names) es.addEventListener(n, (e: MessageEvent) => { try { onEvent(n, JSON.parse(e.data)); } catch {} });
  return () => es.close();
}
