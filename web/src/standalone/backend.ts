// Standalone (serverless) backend. Runs entirely in the browser so the app
// works offline inside the APK / as an installed PWA, with no server. It mirrors
// the Node server's behaviour: JSON state in localStorage, a simulation engine,
// the same tools (approvals, memory, handoff), and an iframe-based computer
// (a real WebView render of the bundled fixture pages — not a fake screenshot).
//
// Exposes the same `api` surface and `openStream` as the real client, so the
// rest of the app is unchanged.

import { generate as hfGenerate, installed as hfInstalled } from '../localai/hf';
import { TEAMS, TeamKind, memberShape, memberColor, DEPARTMENTS } from './employees';
import { makeGame, pickGenre, recordVideo } from './deliverables';

type Fn = (...a: any[]) => any;

const LS_KEY = 'godagent.store.v1';
const uid = (p = '') => p + Math.random().toString(36).slice(2, 11);
const now = () => Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// When the app is in the background (another app in front / screen off), slow the
// team's work down so it is gentle on the device — less CPU and battery. Work keeps
// advancing, just more slowly; it speeds back up when the app is in front again.
const bgFactor = () => (typeof document !== 'undefined' && document.hidden ? 6 : 1);
const pace = (ms: number) => sleep(ms * bgFactor());

const SHAPES = ['blob', 'circle', 'capsule', 'triangle', 'teardrop', 'flower', 'square', 'sparkle', 'clover', 'heart', 'house', 'star'];
const PALETTE = ['#777777', '#1183FF', '#FF6702', '#111111', '#01C971', '#93643A', '#7C5CFF', '#E0245E', '#00B5C9', '#F4B400', '#8E44AD', '#2E7D32'];
const STATES = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'];
const TRIGGER_KINDS = ['time', 'daily', 'weekly', 'monthly', 'interval', 'webhook', 'email', 'github', 'slack'];
const APPS = [
  { id: 'gmail', name: 'Gmail', category: 'Email', desc: 'Read, draft, and send email; search threads and manage labels.', tools: ['search_mail', 'draft_email', 'send_email'] },
  { id: 'outlook', name: 'Outlook', category: 'Email', desc: 'Microsoft 365 mail and calendar.', tools: ['search_mail', 'draft_email', 'send_email'] },
  { id: 'gdrive', name: 'Google Drive', category: 'Files', desc: 'Browse, read, and create documents and files.', tools: ['list_files', 'read_file', 'create_doc'] },
  { id: 'slack', name: 'Slack', category: 'Messaging', desc: 'Read channels and send messages on your behalf.', tools: ['read_channel', 'post_message'] },
  { id: 'github', name: 'GitHub', category: 'Dev', desc: 'Issues, pull requests, and repository files.', tools: ['list_issues', 'open_pr', 'read_repo'] },
  { id: 'linear', name: 'Linear', category: 'Dev', desc: 'Create and update issues and projects.', tools: ['list_issues', 'create_issue'] },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', desc: 'Accounts, contacts, and opportunities.', tools: ['query_accounts', 'update_record'] },
  { id: 'notion', name: 'Notion', category: 'Docs', desc: 'Pages and databases.', tools: ['search_pages', 'create_page'] },
  { id: 'gcal', name: 'Google Calendar', category: 'Calendar', desc: 'Read and create events; send invites.', tools: ['list_events', 'create_event'] },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', desc: 'Contacts, deals, and marketing.', tools: ['query_contacts', 'update_deal'] },
];
const APP_BY_ID: Record<string, any> = Object.fromEntries(APPS.map((a) => [a.id, a]));

interface Store { bots: Record<string, any>; messages: Record<string, any[]>; memory: Record<string, any[]>; skills: Record<string, any>; routines: Record<string, any>; connections: Record<string, any>; rules: any[]; files: Record<string, any>; projects: Record<string, any>; teamGroups?: Record<string, string>; deptRosters?: Record<string, string[]>; settings: any; }

function emptyStore(): Store {
  return { bots: {}, messages: {}, memory: {}, skills: {}, routines: {}, connections: {}, rules: [], files: {}, projects: {},
    settings: { appearance: 'system', accent: 'auto', language: 'ja', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', autoReview: true, primaryBotId: null, computerPermission: 'ask', defaultModel: 'sim', user: { name: 'あなた', initials: 'YOU' } } };
}

let S: Store = load();
function load(): Store { try { const r = localStorage.getItem(LS_KEY); if (r) { const p = JSON.parse(r); return { ...emptyStore(), ...p, settings: { ...emptyStore().settings, ...p.settings } }; } } catch {} return emptyStore(); }
// Throttled (not debounced) persistence: a change is written within 60 ms even
// while other changes keep coming, and everything is flushed when the app is
// hidden or closed (e.g. swiped away on Android), so nothing is lost.
let saveTimer: any = null;
function flushNow() {
  clearTimeout(saveTimer); saveTimer = null;
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); return; } catch (e) { console.error('[store] save failed', e); }
  // Over quota (large attachments): keep everything except attachment payloads.
  try {
    const lite = { ...S, files: Object.fromEntries(Object.entries(S.files).map(([k, f]: any) => [k, { ...f, dataUrl: undefined }])) };
    localStorage.setItem(LS_KEY, JSON.stringify(lite));
  } catch (e) { console.error('[store] save failed (lite)', e); }
}
function save() { if (!saveTimer) saveTimer = setTimeout(flushNow, 60); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
}

// ---- event bus ----------------------------------------------------------
const subs = new Set<Fn>();
function emit(event: string, payload: any) { for (const fn of subs) try { fn(event, payload); } catch {} }

export function openStream(_ch: string, onEvent: Fn) { subs.add(onEvent); onEvent('hello', { engine: 'simulation', computer: computerSnap() }); return () => subs.delete(onEvent); }

// ---- seed ---------------------------------------------------------------
function bot(p: any) { const t = now(); return { id: uid('bot_'), kind: 'bot', name: '新しいBot', title: '', shape: 'blob', color: '#777777', avatarImage: null, state: 'idle', pinned: false, hidden: false, members: [], apps: [], createdAt: t, updatedAt: t, ...p }; }
function ensureSeed() {
  if (Object.keys(S.bots).length) return;
  const seed = [
    { name: 'チーフ', title: 'プライマリBot', shape: 'circle', color: '#01C971', pinned: true, last: '会場を予約し、確認メールを送信しました。' },
    { name: '営業アウトバウンド', title: 'パイプライン＆アウトバウンド', shape: 'capsule', color: '#F4B400', last: '完了です。' },
    { name: '受信トレイ管理', title: 'メール整理', shape: 'blob', color: '#7C5CFF', last: '送信済み。受信トレイはゼロ、下書き5件を保留中です。' },
    { name: 'アカウント管理', title: 'カスタマーサクセス', shape: 'circle', color: '#8E44AD', last: 'Vicky に招待を送付、Globex のメモを追加しました。' },
    { name: '採用スカウト', title: '採用', shape: 'teardrop', color: '#1183FF', last: 'あなたの文体で紹介文を3件下書きし、確認用に保留しています。' },
    { name: '経費管理', title: '財務オペ', shape: 'circle', color: '#FF6702', last: 'レポートを提出。領収書9件、規定外はありません。' },
    { name: 'ゲーム制作チーム', title: 'ゲーム開発', shape: 'star', color: '#7C5CFF', last: '企画書と操作仕様をまとめました。プロトタイプに進めます。' },
    { name: '動画制作チーム', title: '動画編集・生成', shape: 'sparkle', color: '#E0245E', last: '絵コンテ6カットを用意しました。ナレーション案も添えています。' },
    { name: '画像制作', title: '画像生成', shape: 'flower', color: '#00B5C9', last: 'キービジュアル案を生成しました。バリエーションも出せます。' },
    { name: 'アプリ制作チーム', title: 'アプリ開発', shape: 'square', color: '#1183FF', last: '要件と画面構成をまとめ、リポジトリ準備まで完了です。' },
    { name: 'ディープリサーチ', title: 'DeepResearch', shape: 'clover', color: '#2E7D32', last: '5件の情報源を横断し、要点と出典をまとめました。' },
  ];
  const created = seed.map((s) => {
    const b = bot({ name: s.name, title: s.title, shape: s.shape, color: s.color, pinned: !!s.pinned });
    S.bots[b.id] = b; S.messages[b.id] = [
      { id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: `はじめまして、${s.name}です。任せたい役割を教えてください。会話の合間も作業を続けます。まず何から着手しましょうか？`, ts: now() - 86400000 },
      { id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: s.last, ts: now() - 3600000 },
    ];
    S.memory[b.id] = [{ id: uid('mem_'), kind: 'instruction', text: `${s.title}。返信は短く、完了したら報告すること。`, ts: now() }];
    return b;
  });
  const g = bot({ kind: 'group', name: '合宿チーム', title: 'グループ', shape: 'flower', color: '#93643A', members: created.slice(0, 3).map((b) => b.id) });
  S.bots[g.id] = g; S.messages[g.id] = [{ id: uid('m_'), role: 'bot', botId: created[0].id, type: 'text', text: '残るはパイプラインですね。フォローアップ用に専任のBotを立ち上げます。', ts: now() - 3600000 }];
  S.settings.primaryBotId = created[0].id;
  seedEmployees();
  const skills = [
    { name: '週次ステータスまとめ', description: '各プロジェクトの今週の進捗をまとめ、ダイジェストを投稿する。', steps: ['接続済みアプリから更新を収集', 'プロジェクトごとに分類', '短いダイジェストを下書き', '投稿前に承認を仰ぐ'] },
    { name: 'DeepResearch', description: '複数の情報源を横断し、出典つきで要点をまとめる深掘り調査。', steps: ['問いを分解', 'Webで複数ソースを収集', '相互に照合・検証', '出典つきの要約を作成'] },
    { name: 'ゲーム企画', description: 'コンセプト・コアループ・操作仕様をまとめ、プロトタイプ方針を決める。', steps: ['テーマ決め', 'コアループ設計', '操作・UI仕様', 'プロト範囲の切り出し'] },
    { name: '画像生成', description: '説明からオリジナルのキービジュアルを生成し、バリエーションを出す。', steps: ['要件の確認', '構図・配色の決定', '画像を生成', 'バリエーション展開'] },
    { name: 'アプリ要件定義', description: '要件・画面構成・技術選定をまとめ、開発に着手できる状態にする。', steps: ['要件ヒアリング', '画面構成', '技術選定', 'リポジトリ準備'] },
  ];
  for (const s of skills) S.skills[uid('skill_')] = { id: uid('skill_'), scope: 'account', inputs: [], ts: now(), ...s };
  const r = { id: uid('rtn_'), botId: created[0].id, name: '朝のブリーフィング', trigger: { kind: 'daily', at: '08:30' }, skillId: null, prompt: '短い朝のブリーフィングをください。', enabled: true, lastRun: null, runs: [], ts: now() };
  S.routines[r.id] = r;
  save();
}

// ---- 37 AI employees + 4 team groups ------------------------------------
function seedEmployees() {
  let ci = 0;
  for (const team of TEAMS) {
    const memberIds: string[] = [];
    team.members.forEach((m, i) => {
      const b = bot({ name: m.name, title: m.role, shape: memberShape(ci), color: memberColor(ci), hidden: true, team: team.kind, role: m.role, leader: !!m.leader });
      ci++;
      S.bots[b.id] = b;
      S.messages[b.id] = [{ id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: `社長、${m.role}の${m.name}です。${m.skill}を担当します。何なりとお申し付けください。`, ts: now() - 86400000 }];
      S.memory[b.id] = [{ id: uid('mem_'), kind: 'instruction', text: `${m.role}。${m.persona} 専門：${m.skill}。社長には丁寧に報告する。` , ts: now() }];
      memberIds.push(b.id);
    });
    const g = bot({ kind: 'group', name: team.name, title: `チーム・${team.members.length}人`, shape: team.shape, color: team.color, members: memberIds, teamKind: team.kind });
    S.bots[g.id] = g;
    const leader = S.bots[memberIds[0]];
    S.messages[g.id] = [{ id: uid('m_'), role: 'bot', botId: leader.id, type: 'text', text: `社長、${team.name}です。ご依頼をいただければ、メンバーで分担して制作し、完成物をご確認いただけます。`, ts: now() - 3600000 }];
    S.teamGroups ||= {}; S.teamGroups[team.kind] = g.id;
  }
  // GODAgent ULTIMATE: seed the wider company (63 more employees → 100 total).
  // Roster members with individual chat; the heavy per-department "studios" are
  // not faked — only the four creative teams above run the real production flow.
  S.deptRosters ||= {};
  let empNo = 38; // existing 37 are 1–37
  for (const dept of DEPARTMENTS) {
    const ids: string[] = [];
    dept.members.forEach((m) => {
      const b = bot({
        name: m.name, title: m.role, shape: memberShape(ci), color: memberColor(ci),
        hidden: true, dept: dept.key, deptName: dept.name, role: m.role, leader: !!m.leader,
        empNo, level: 1, exp: 0, specialty: m.skill,
      });
      ci++; empNo++;
      S.bots[b.id] = b;
      S.messages[b.id] = [{ id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: `社長、${dept.name}の${m.role}、${m.name}です。${m.skill}を担当いたします。`, ts: now() - 86400000 }];
      S.memory[b.id] = [{ id: uid('mem_'), kind: 'instruction', text: `${dept.name}・${m.role}。${m.persona} 専門：${m.skill}。社長には丁寧に報告する。`, ts: now() }];
      ids.push(b.id);
    });
    S.deptRosters[dept.key] = ids;
  }
  // 高度思考ルーム：副社長＋マネージャー＋主要リーダーが熟考・討論する会議体。
  const r = S.deptRosters;
  const thinkMembers = [
    ...(r['exec'] || []),
    ...(r['manager'] || []),
    (r['code'] || [])[0], (r['qa'] || [])[0], (r['search'] || [])[0], (r['model'] || [])[0],
  ].filter(Boolean) as string[];
  if (thinkMembers.length) {
    const tg = bot({ kind: 'group', name: '高度思考ルーム', title: `熟考・討論・${thinkMembers.length}人`, shape: 'heart', color: '#8E44AD', members: thinkMembers, teamKind: 'think' });
    S.bots[tg.id] = tg;
    S.messages[tg.id] = [{ id: uid('m_'), role: 'bot', botId: thinkMembers[0], type: 'text', text: '社長、高度思考ルームです。むずかしい判断や設計は、ここで複数の社員が案を出し合い、相互に検証して結論をご提案します。', ts: now() - 3600000 }];
    S.teamGroups ||= {}; S.teamGroups['think'] = tg.id;
  }
}
const teamGroupId = (kind: string) => (S.teamGroups || {})[kind];

// ---- helpers ------------------------------------------------------------
const listBots = () => Object.values(S.bots).sort((a: any, b: any) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
function setState(b: any, st: string) { b.state = st; b.updatedAt = now(); save(); emit('state', { botId: b.id, state: st }); }
function post(b: any, msg: any) { const full = { id: uid('m_'), role: 'bot', botId: b.id, ts: now(), ...msg }; (S.messages[b.id] ||= []).push(full); b.updatedAt = now(); save(); emit('message', full); return full; }

// ---- computer (iframe) --------------------------------------------------
const computer = { available: true, mode: 'iframe', status: 'idle', url: 'about:blank', shot: null as any, activeBotId: null as any, reason: null as any };
const computerSnap = () => ({ ...computer });
// Use absolute paths on the web; relative paths inside the APK (file:// origin).
const CA = (typeof location !== 'undefined' && location.protocol === 'file:') ? 'computer-apps/' : '/computer-apps/';
function fixtureUrl(target: string) {
  const map: Record<string, string> = { salesforce: CA + 'salesforce.html', crm: CA + 'salesforce.html', web: CA + 'web.html', search: CA + 'web.html', mail: CA + 'mail.html', gmail: CA + 'mail.html', sheet: CA + 'sheet.html', drive: CA + 'sheet.html' };
  const k = (target || 'web').toLowerCase().trim();
  return map[k] || (target.startsWith('/') ? target : CA + 'web.html?q=' + encodeURIComponent(target));
}
function computerOpenLocal(target: string, botId: string) {
  computer.status = 'working'; computer.url = fixtureUrl(target); computer.activeBotId = botId; emit('computer', computerSnap());
  setTimeout(() => { computer.status = 'idle'; emit('computer', computerSnap()); }, 500);
}

// ---- pending decisions --------------------------------------------------
const waiters = new Map<string, Fn>();
const pendingCreate = (id: string) => new Promise((res) => waiters.set(id, res));
const pendingResolve = (id: string, v: any) => { const w = waiters.get(id); if (w) { waiters.delete(id); w(v); return true; } return false; };

function evaluateRules(action: string) { for (const r of S.rules) if (action.toLowerCase().includes(r.match.toLowerCase())) return r.effect === 'allow' ? 'allow' : 'ask'; return 'ask'; }

// ---- tools --------------------------------------------------------------
function tools(b: any) {
  return {
    async reply(text: string) {
      setState(b, 'thinking'); await pace(200);
      const id = uid('m_'); const base = { id, role: 'bot', botId: b.id, type: 'text', text: '', ts: now(), streaming: true };
      (S.messages[b.id] ||= []).push(base); emit('message', base); setState(b, 'working');
      const words = text.split(/(\s+)/); let acc = '';
      for (const w of words) { acc += w; const m = S.messages[b.id].find((x) => x.id === id); if (m) m.text = acc; emit('message.delta', { id, text: acc }); await pace(14 + Math.random() * 24); }
      const m = S.messages[b.id].find((x) => x.id === id); if (m) { m.text = acc; m.streaming = false; } save(); emit('message.done', { id, text: acc }); return acc;
    },
    async saveMemory(kind: string, text: string) { const item = { id: uid('mem_'), kind, text, ts: now() }; (S.memory[b.id] ||= []).push(item); save(); post(b, { type: 'memory', memory: item, text: `メモリに保存: ${text}` }); return item; },
    async draftEmail(e: any) { return post(b, { type: 'email', email: { ...e, sent: false } }); },
    async requestApproval({ action, detail, risk = 'normal', autoReviewable = true }: any) {
      const auto = S.settings.autoReview && autoReviewable ? evaluateRules(action) : 'ask';
      const id = uid('appr_'); const hasRule = evaluateRules(action) !== 'ask';
      const card = post(b, { type: 'approval', approval: { id, action, detail, risk, status: auto === 'allow' ? 'allowed' : 'pending', hasRule, auto: auto === 'allow' } });
      if (auto === 'allow') return { decision: 'allow', card };
      setState(b, 'waiting');
      const d: any = await pendingCreate(id);
      if (d.always && d.effect === 'allow') { S.rules.unshift({ id: uid('rule_'), match: action, effect: 'allow', ts: now(), source: 'always_allow' }); if (S.rules.filter((r) => r.effect === 'allow').length > 20) S.rules.pop(); }
      const status = d.effect === 'allow' ? 'allowed' : 'denied';
      const m = S.messages[b.id].find((x) => x.id === card.id); if (m) m.approval = { ...card.approval, status }; save();
      emit('message.update', { id: card.id, patch: { approval: { ...card.approval, status } } });
      return { decision: d.effect, card };
    },
    async askQuestion({ question, options }: any) {
      const id = uid('q_'); const card = post(b, { type: 'question', question: { id, prompt: question, options: options || null, answer: null } });
      setState(b, 'waiting'); const ans: any = await pendingCreate(id);
      const m = S.messages[b.id].find((x) => x.id === card.id); if (m) m.question = { id, prompt: question, options: options || null, answer: ans.value }; save();
      emit('message.update', { id: card.id, patch: { question: { id, prompt: question, options: options || null, answer: ans.value } } });
      return ans.value;
    },
    async computerOpen(target: string, note?: string) {
      const card = post(b, { type: 'computer', computer: { note: note || `Opening ${target}`, status: 'working' } });
      computerOpenLocal(target, b.id);
      await pace(600);
      const patch = { note: note || `Opened ${computer.url}`, status: 'done', url: computer.url, iframe: true };
      const m = S.messages[b.id].find((x) => x.id === card.id); if (m) m.computer = patch; save();
      emit('message.update', { id: card.id, patch: { computer: patch } });
      return { ok: true, url: computer.url };
    },
    async handoff(toBotId: string, task: string) { const to = S.bots[toBotId]; if (!to) return; post(b, { type: 'handoff', handoff: { toBotId, toName: to.name, task } }); return to; },
    async genImage(prompt: string, caption?: string) {
      const svg = makeImage(prompt);
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      return post(b, { type: 'image', img: { dataUrl, caption: caption || prompt } });
    },
    done() { setState(b, 'done'); setTimeout(() => setState(b, 'idle'), 2600); },
  };
}

// Generate an ORIGINAL abstract key-visual (SVG) from a prompt. Deterministic
// from the text; never depicts any real or copyrighted character.
function makeImage(prompt: string): string {
  let h = 2166136261 >>> 0;
  for (const c of prompt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const hue = Math.floor(rnd() * 360), hue2 = (hue + 60 + Math.floor(rnd() * 180)) % 360;
  const W = 640, Hh = 400;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">`;
  s += `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`;
  s += `<stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${hue2},70%,45%)"/></linearGradient>`;
  s += `<radialGradient id="r" cx="0.3" cy="0.3" r="0.9"><stop offset="0" stop-color="rgba(255,255,255,0.35)"/><stop offset="1" stop-color="rgba(0,0,0,0.25)"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${Hh}" fill="url(#g)"/>`;
  const n = 5 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const cx = rnd() * W, cy = rnd() * Hh, rr = 30 + rnd() * 140;
    const op = (0.08 + rnd() * 0.22).toFixed(2);
    const col = `hsl(${(hue + Math.floor(rnd() * 120)) % 360},80%,${50 + Math.floor(rnd() * 30)}%)`;
    if (rnd() < 0.5) s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="${col}" opacity="${op}"/>`;
    else { const w = rr, hgt = rr * (0.4 + rnd()); s += `<rect x="${(cx - w / 2).toFixed(0)}" y="${(cy - hgt / 2).toFixed(0)}" width="${w.toFixed(0)}" height="${hgt.toFixed(0)}" rx="${(rr * 0.3).toFixed(0)}" fill="${col}" opacity="${op}" transform="rotate(${(rnd() * 90 - 45).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`; }
  }
  s += `<rect width="${W}" height="${Hh}" fill="url(#r)"/>`;
  const label = (prompt || 'GODAgent').slice(0, 28).replace(/[<>&]/g, '');
  s += `<text x="${W / 2}" y="${Hh - 28}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.95)">${label}</text>`;
  s += `</svg>`;
  return s;
}

// ---- simulation engine (port of server sim) -----------------------------
const has = (t: string, ...k: string[]) => k.some((w) => t.includes(w));
const active = new Set<string>();
async function runTurn(b: any, userText: string) {
  if (active.has(b.id)) return; active.add(b.id);
  try { await plan(b, userText); } catch {} finally { active.delete(b.id); }
}
async function plan(b: any, userText: string) {
  const modelId: string = b.model || S.settings.defaultModel || 'sim';
  if (modelId.startsWith('hf:') && b.kind !== 'group') { if (await hfTurn(b, modelId.slice(3), userText)) return; }
  const T = tools(b); const t = userText.toLowerCase();
  // 制作チームのグループに依頼 → 自律プロジェクトを起動
  if (b.kind === 'group' && b.teamKind === 'think') { startThink(userText, 5); setState(b, 'idle'); return; }
  if (b.kind === 'group' && b.teamKind) { startProject(b.teamKind, userText); setState(b, 'idle'); return; }
  if (has(t, 'remember', 'always', 'from now on', '覚え', '今後', 'いつも')) { await T.saveMemory('instruction', userText.replace(/^(remember|always|覚えて|今後は?)[:,、\s]*/i, '').trim()); await T.reply('承知しました。今後はそのようにいたします。'); return T.done(); }
  if (has(t, 'which', 'should i', 'option', 'choose', 'どっち', 'どちら', 'どれ', 'べき') && b.kind !== 'group') { const a = await T.askQuestion({ question: '進め方がいくつか考えられます。どれがよろしいですか？', options: ['まず動いて、必要なら後で調整', 'すべて下書きしてから確認を仰ぐ', '最も効果の大きい項目だけ'] }); await T.reply(`承知しました。「${a}」で進めます。開始いたします。`); return T.done(); }
  if (b.kind === 'group') {
    const members = (b.members || []).map((id: string) => S.bots[id]).filter(Boolean);
    await T.reply('承知しました。適任のメンバーに引き継ぎます。');
    if (members[1]) { await T.handoff(members[1].id, userText.slice(0, 120)); await pace(400); const sub = tools(members[1]); await sub.reply(`引き継ぎました。「${userText.slice(0, 60)}」を担当し、完了後にご報告します。`); sub.done(); }
    return T.done();
  }
  // --- 画像制作 ---
  if (has(t, '画像', 'image', 'イラスト', 'ロゴ', 'ビジュアル', 'アイコン', 'icon', '壁紙')) {
    await T.reply('承知しました。要件に合わせてオリジナルのキービジュアルを生成します。');
    await T.genImage(userText.slice(0, 40), userText.slice(0, 40));
    await T.reply('生成しました。配色違いや構図違いのバリエーションも出せます。方向性はいかがですか？');
    return T.done();
  }
  // --- 動画制作 ---
  if (has(t, '動画', 'video', 'ビデオ', '映像', 'ムービー')) {
    await T.reply('承知しました。まず絵コンテとナレーション案を用意します。');
    await T.computerOpen('web', '参考となる映像表現をリサーチします。');
    await T.reply('絵コンテ（6カット）\n1. タイトルロゴ（フェードイン）\n2. 課題の提示\n3. 解決の提案\n4. 主要機能のデモ\n5. 利用シーン\n6. CTA・締め\n\nナレーション案も添えました。尺は30秒想定です。実際の書き出しエンジンは本ビルドでは未接続のため、構成案までを提供します。この方向で進めますか？');
    return T.done();
  }
  // --- ゲーム制作 ---
  if (has(t, 'ゲーム', 'game')) {
    await T.reply('承知しました。企画からプロトタイプ方針までまとめます。');
    await T.genImage('game key visual ' + userText.slice(0, 24), 'コンセプトアート（自動生成）');
    await T.reply('企画概要\n・コンセプト：ご依頼の世界観をベースにした短時間で遊べる作品\n・コアループ：操作→挑戦→報酬→強化の反復\n・操作：タッチ主体、片手で完結\n・プロト範囲：1ステージ＋基本操作\n\nオリジナル要素のみで構成し、既存作品のキャラクター・名称・ロゴは使いません。プロトタイプに進めてよろしいですか？');
    return T.done();
  }
  // --- アプリ制作 ---
  if (has(t, 'アプリ', 'app', 'アプリ制作', 'webアプリ')) {
    await T.reply('承知しました。要件と画面構成をまとめ、開発に着手できる状態にします。');
    await T.computerOpen('web', '類似サービスと技術選定をリサーチします。');
    await T.reply('要件サマリ\n・目的：ご依頼の課題を解決するアプリ\n・主要画面：一覧／詳細／作成／設定\n・技術：React + TypeScript（Web）、必要に応じてPWA/APK化\n・データ：まずは端末内保存、拡張でクラウド\n\nリポジトリ準備まで想定しています。要件の優先順位を決めて着手しますか？');
    return T.done();
  }
  // --- DeepResearch（深掘り調査）---
  if (has(t, 'ディープ', 'deep research', 'deepresearch', '徹底的', '詳しく調べ', '深掘り', '徹底調査', '調査して')) {
    await T.reply('DeepResearch を開始します。複数の情報源を横断し、出典つきで要点をまとめます。');
    await T.computerOpen('web', '一次情報と信頼できる情報源を収集します。');
    await T.computerOpen('web', '異なる情報源を照合・検証します。');
    await T.reply(`調査レポート：${userText.slice(0, 40)}\n\n要点\n1. 全体像：主要な論点を3点に整理しました。\n2. 根拠：複数の情報源で裏付けの取れた事実を優先。\n3. 相違点：情報源間で食い違う箇所は注記しました。\n\n出典（例）\n・acme-research.example\n・marketpulse.example\n・contextwire.example\n\n※本ビルドはサンドボックスのため実際の外部Web取得は行わず、調査フローを再現しています。さらに深掘りする論点を指定いただければ続けます。`);
    return T.done();
  }
  if (has(t, 'sign in', 'log in', 'login', 'salesforce', 'crm', 'accounts', 'サインイン', 'ログイン', '顧客')) { await T.reply('接続状況を確認します。Hex・Gmail・LinkedIn はサインイン済みですが、Salesforce は未サインインです。'); await T.computerOpen('salesforce', '担当アカウントを確認するため、Salesforce にサインインします。'); await T.reply('サインインしました。担当アカウントが6件あります。アウトリーチの下書きを始めますか？'); return T.done(); }
  if (has(t, 'research', 'prospect', 'pipeline', 'outbound', 'outreach', 'web', 'search', 'リサーチ', '調べ', '営業', 'パイプライン')) {
    await T.reply('開始します。対象の見込み客を抽出し、Webで背景を収集して、あなたの文体で下書きします。');
    await T.computerOpen('sheet', 'シートから対象の見込み客を読み込みます。');
    await T.computerOpen('web', '連絡先とアカウントの背景情報を収集します。');
    await T.draftEmail({ to: 'vicky@globex.example', subject: 'ご挨拶と次のステップ', body: 'Vicky 様\n\n先日の件のフォローです。今週20分ほどお時間をいただけませんか。木曜はいかがでしょう。\n\nよろしくお願いいたします。' });
    const d = await T.requestApproval({ action: 'メールを送信', detail: 'vicky@globex.example 宛に下書き1通を送信', risk: 'high' });
    await T.reply(d.decision === 'allow' ? '送信しました。残りは下書きとして保存しておきます。完了です。' : '送信は保留しました。すべて下書きとして保存しています。');
    return T.done();
  }
  if (has(t, 'send', 'post', 'email', 'メール', '送信', '投稿')) { await T.reply('下書きしました。外部への送信になるため、送信前に確認します。'); await T.draftEmail({ to: 'team@company.example', subject: 'ご連絡', body: userText.slice(0, 200) }); const d = await T.requestApproval({ action: 'メールを送信', detail: userText.slice(0, 120), risk: 'high' }); await T.reply(d.decision === 'allow' ? '送信しました。完了です。' : '下書きとして保存しました。'); return T.done(); }
  if (has(t, 'delete', 'remove', 'purchase', 'buy', 'pay', '削除', '購入', '支払')) { await T.reply('影響の大きい操作のため、先に確認いたします。'); const d = await T.requestApproval({ action: '重要な操作', detail: userText.slice(0, 140), risk: 'high', autoReviewable: false }); await T.reply(d.decision === 'allow' ? '実行しました。' : '中止しました。変更はありません。'); return T.done(); }
  const role = (b.title || '').toLowerCase(); let reply;
  if (role.includes('recruit') || role.includes('採用') || b.name.includes('Talent') || b.name.includes('採用')) reply = '候補者の探索、あなたの文体での紹介文の下書き、各やり取りのフォローまで対応できます。探索を始めましょうか？';
  else if (role.includes('finance') || role.includes('経費') || b.name.includes('Expense') || b.name.includes('経費')) reply = '経費の申請を管理し、規定外のものがあれば指摘します。領収書をお預けいただければ、こちらで進めます。';
  else if (role.includes('email') || role.includes('メール') || b.name.includes('Inbox') || b.name.includes('受信')) reply = '受信トレイをゼロにし、返信を下書きし、要対応のものは保留できます。いま一巡しましょうか？';
  else if (b.name.includes('ゲーム')) reply = 'ゲーム制作チームです。企画・コアループ設計・操作仕様・プロトタイプまで対応します。作りたいゲームのジャンルやテーマを教えてください（すべてオリジナルで制作します）。';
  else if (b.name.includes('動画')) reply = '動画制作チームです。絵コンテ・ナレーション案・構成までまとめます。尺・用途・雰囲気を教えてください。';
  else if (b.name.includes('画像')) reply = '画像制作です。説明からオリジナルのキービジュアルを生成します。作りたい画像の内容・配色・用途を教えてください。';
  else if (b.name.includes('アプリ')) reply = 'アプリ制作チームです。要件定義・画面構成・技術選定・リポジトリ準備まで対応します。作りたいアプリの概要を教えてください。';
  else if (role.includes('deepresearch') || b.name.includes('リサーチ')) reply = 'DeepResearch です。複数の情報源を横断し、出典つきで要点をまとめます。調べたいテーマを教えてください。';
  else reply = 'はじめまして。どのような役割でお役に立てばよいでしょう。具体的なご依頼でも、全般的なサポートでも対応します。';
  await T.reply(reply); T.done();
}


// ---- Hugging Face model turn (runs on the device) ------------------------
async function hfTurn(b: any, id: string, userText: string): Promise<boolean> {
  const T = tools(b);
  if (has(userText.toLowerCase(), '覚え', 'remember', '今後', 'いつも')) await T.saveMemory('instruction', userText);
  setState(b, 'thinking');
  const mid = uid('m_');
  const base: any = { id: mid, role: 'bot', botId: b.id, type: 'text', text: '', ts: now(), streaming: true, model: id };
  (S.messages[b.id] ||= []).push(base); emit('message', base);
  const mem = (S.memory[b.id] || []).map((m: any) => '- ' + m.text).join('\n') || '- なし';
  const system = `あなたは「${b.name}」${b.title ? `（${b.title}）` : ''}というAIチームメイトです。日本語で、簡潔かつ丁寧に答えてください。\n覚えていること:\n${mem}`;
  // history: text only, starting from a user turn, consecutive roles merged
  const hist: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of (S.messages[b.id] || []).filter((x: any) => x.type === 'text' && x.text && x.id !== mid).slice(-10)) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    if (!hist.length && role !== 'user') continue;
    if (hist.length && hist[hist.length - 1].role === role) hist[hist.length - 1].content += '\n' + m.text;
    else hist.push({ role, content: m.text });
  }
  if (!hist.length) hist.push({ role: 'user', content: userText });
  let started = false;
  const set = (text: string) => { base.text = text; emit('message.delta', { id: mid, text }); };
  try {
    const final = await hfGenerate(id, [{ role: 'system', content: system }, ...hist],
      (txt) => { if (!started) { started = true; setState(b, 'working'); } set(txt); },
      { onProgress: (p) => { if (!started) set(`モデルを読み込み中… ${p.pct}%`); } });
    base.text = final || '（応答が空でした）'; base.streaming = false; save();
    emit('message.done', { id: mid, text: base.text });
    T.done();
    return true;
  } catch (e: any) {
    console.error('[hf] generation failed', e);
    const msg = `モデル「${id}」で応答できませんでした（${e?.message || e}）。内蔵シミュレーションで応答します。`;
    Object.assign(base, { type: 'error', text: msg, streaming: false }); save();
    emit('message.update', { id: mid, patch: { type: 'error', text: msg, streaming: false } });
    return false;
  }
}

// ---- autonomous project engine (37 employees) ---------------------------
const projActive = new Set<string>();

function emitProjects() { emit('projects', Object.values(S.projects).sort((a: any, b: any) => b.createdAt - a.createdAt)); }
function saveProj(p: any) { p.updatedAt = now(); S.projects[p.id] = p; save(); emit('project', p); emitProjects(); }
function projLog(p: any, fromId: string, text: string) { p.log.push({ ts: now(), fromId, from: S.bots[fromId]?.name || '', text }); }
// Group messages route to the GROUP's conversation (botId = groupId); `speaker`
// records which employee spoke, and text is prefixed with their name so the
// team chat reads like a real meeting.
function gpost(groupId: string, memberId: string, msg: any) {
  const name = S.bots[memberId]?.name || '';
  const m = { ...msg };
  if (m.type === 'text' && m.text && name) m.text = `${name}：${m.text}`;
  const full = { id: uid('m_'), role: 'bot', botId: groupId, speaker: memberId, ts: now(), ...m };
  (S.messages[groupId] ||= []).push(full); const g = S.bots[groupId]; if (g) g.updatedAt = now(); save(); emit('message', full); return full;
}
async function gstream(groupId: string, memberId: string, text: string) {
  const name = S.bots[memberId]?.name || '';
  const id = uid('m_'); const base: any = { id, role: 'bot', botId: groupId, speaker: memberId, type: 'text', text: '', ts: now(), streaming: true };
  (S.messages[groupId] ||= []).push(base); emit('message', base);
  const full = name ? `${name}：${text}` : text;
  const words = full.split(/(\s+)/); let acc = '';
  for (const w of words) { acc += w; base.text = acc; emit('message.delta', { id, text: acc }); await pace(10 + Math.random() * 18); }
  base.streaming = false; save(); emit('message.done', { id, text: acc });
}

export function startProject(teamKind: TeamKind, request: string, existing?: string) {
  const groupId = teamGroupId(teamKind); if (!groupId) return null;
  const team = TEAMS.find((t) => t.kind === teamKind)!;
  const members = team.members.map((m, i) => ({ id: (S.bots[groupId].members || [])[i], role: m.role, name: m.name, leader: !!m.leader }));
  let p: any;
  if (existing && S.projects[existing]) { p = S.projects[existing]; p.request = request; p.status = 'planning'; p.progress = 0; p.round = (p.round || 1) + 1; }
  else p = { id: uid('prj_'), title: request.slice(0, 40), request, teamKind, teamName: team.name, groupId, status: 'planning', progress: 0, round: 1, tasks: [], deliverables: [], log: [], createdAt: now(), updatedAt: now() };
  const lastUser = [...(S.messages[groupId] || [])].reverse().find((m: any) => m.role === 'user');
  p.inputFiles = lastUser?.files || [];
  S.projects[p.id] = p; saveProj(p);
  if (projActive.has(p.id)) return p.id;
  projActive.add(p.id);
  runProject(p, members).catch((e) => { projLog(p, members[0].id, 'エラー: ' + (e?.message || e)); p.status = 'error'; saveProj(p); }).finally(() => projActive.delete(p.id));
  return p.id;
}
const stopped = (p: any) => p.status === 'stopped';

// Phase 12 — training: completing real work grants experience; level = 1 + exp/100
// (capped at 100). Levels are shown in the org view, so growth is tied to actual work.
function awardExp(memberIds: string[], amount: number) {
  for (const id of memberIds) {
    const b = S.bots[id]; if (!b) continue;
    b.exp = (b.exp || 0) + amount;
    b.level = Math.max(1, Math.min(100, 1 + Math.floor(b.exp / 100)));
  }
  save();
}

async function runProject(p: any, members: any[]) {
  const leader = members[0];
  const set = (status: string, progress: number) => { p.status = status; p.progress = progress; saveProj(p); };
  // 1) 受領・分析
  await gstream(p.groupId, leader.id, `社長、ご依頼を承りました。「${p.request.slice(0, 40)}」の制作を開始いたします。まずチームで方針を確認します。`);
  if (stopped(p)) return;
  set('working', 8);
  // 2) 会議（複数社員が発言）
  const talk = members.slice(1, Math.min(members.length, 5));
  for (const m of talk) { if (stopped(p)) return; await gstream(p.groupId, m.id, meetingLine(p.teamKind, m.role)); }
  // 3) 計画（担当割り）
  p.tasks = members.map((m) => ({ memberId: m.id, name: m.name, role: m.role, status: 'pending', note: '' }));
  saveProj(p);
  await gstream(p.groupId, leader.id, '役割を割り当てました。各担当、制作を進めてください。');
  // 4) 制作（各担当が実作業：ここで本物の成果物を生成）
  await produce(p, members, set);
  if (stopped(p)) return;
  // 5) リーダー品質確認 → 社長へ提出
  set('review', 100);
  p.tasks.forEach((t: any) => (t.status = 'done'));
  await gstream(p.groupId, leader.id, '社長、各担当の制作とチーム内の相互確認が完了いたしました。成果物が完成いたしましたので、ご確認をお願いいたします。問題なければ「承認」、修正点があれば「修正指示」をお願いします。');
  saveProj(p);
}

// Resume any project that was still in progress when the app was last closed.
// The app (a WebView) can't run while fully closed, so work pauses; on reopen we
// pick unfinished projects back up and run them to completion ("続きから再開").
function resumeProjects() {
  for (const p of Object.values(S.projects) as any[]) {
    if ((p.status !== 'planning' && p.status !== 'working') || projActive.has(p.id)) continue;
    const team = TEAMS.find((t) => t.kind === p.teamKind); if (!team) continue;
    const groupId = p.groupId; if (!S.bots[groupId]) continue;
    const members = team.members.map((m, i) => ({ id: (S.bots[groupId].members || [])[i], role: m.role, name: m.name, leader: !!m.leader }));
    projActive.add(p.id);
    gpost(groupId, members[0].id, { type: 'text', text: '社長、アプリが再開しました。中断していた制作を続きから進めます。' });
    runProject(p, members).catch((e) => { projLog(p, members[0].id, 'エラー: ' + (e?.message || e)); p.status = 'error'; saveProj(p); }).finally(() => projActive.delete(p.id));
  }
}

// ---- 高度思考（熟考・社員協力） フェーズ4 --------------------------------
// 複数の社員が案を出し合い、相互評価・矛盾チェックを行って結論をまとめる。
// 導入済みモデルがあれば実推論を使い、無ければ構造化した簡易整理を正直に明示する。
function installedModelId(): string | null {
  try {
    const d = S.settings?.defaultModel;
    if (typeof d === 'string' && d.startsWith('hf:')) return d.slice(3);
    const list = hfInstalled(); return list[0]?.id || null;
  } catch { return null; }
}
async function modelSay(prompt: string, max = 96): Promise<string> {
  const id = installedModelId(); if (!id) return '';
  try { let out = ''; await hfGenerate(id, [{ role: 'user', content: prompt }], (t: string) => { out = t; }, { maxNewTokens: max }); return (out || '').trim(); } catch { return ''; }
}
const thinkActive = new Set<string>();
const THINK_LEVELS: Record<number, { name: string; approaches: number; critic: boolean; rounds: number }> = {
  1: { name: '高速', approaches: 1, critic: false, rounds: 1 },
  2: { name: '通常', approaches: 1, critic: false, rounds: 1 },
  3: { name: '専門', approaches: 1, critic: true, rounds: 1 },
  4: { name: '高度思考', approaches: 2, critic: true, rounds: 1 },
  5: { name: '深度思考', approaches: 3, critic: true, rounds: 1 },
  6: { name: '超深度思考', approaches: 3, critic: true, rounds: 2 },
};
export function startThink(question: string, level: number) {
  const groupId = teamGroupId('think'); if (!groupId || !question.trim()) return null;
  const members = (S.bots[groupId]?.members || []) as string[];
  const lv = THINK_LEVELS[level] ? level : 5;
  const id = uid('think_'); thinkActive.add(id);
  runThink(groupId, members, question.trim(), lv).catch(() => {}).finally(() => thinkActive.delete(id));
  return { groupId };
}
async function runThink(groupId: string, members: string[], question: string, level: number) {
  const L = THINK_LEVELS[level];
  const nameOf = (mid: string) => S.bots[mid]?.name || '';
  const vp = members[0];
  const modelId = installedModelId();
  const used = !!modelId;
  const tag = used ? `モデル使用（${modelId}）` : 'モデル未使用の簡易整理';
  await gstream(groupId, vp, `社長、ご依頼を受けました。高度思考（${L.name}モード）を開始します。まず目的を確認します。`);
  let goal = await modelSay(`次の依頼の目的を一文で日本語に要約してください：「${question}」`, 64);
  if (!goal) goal = `「${question}」を達成すること`;
  await gstream(groupId, vp, `目的の理解：${goal}`);
  const angles = ['最小構成でまず試す案', '品質を重視して段階的に進める案', '既存の機能・資産を活用する案'];
  const approaches: { by: string; angle: string; text: string }[] = [];
  for (let i = 0; i < L.approaches; i++) {
    const m = members[(i + 1) % members.length] || vp;
    let text = await modelSay(`依頼「${question}」への解決アプローチを1つ、日本語2文以内で提案してください（${angles[i]}の観点）。`, 80);
    if (!text) text = `${question} を、${angles[i].replace('案', '')}方針で進めます。`;
    approaches.push({ by: nameOf(m), angle: angles[i], text });
    await gstream(groupId, m, `案${i + 1}（${angles[i]}）：${text}`);
  }
  let critique = '';
  if (L.critic && approaches.length) {
    const c = members[Math.min(2, members.length - 1)] || vp;
    critique = await modelSay(`次の案を比較し、矛盾点と最も良い案を日本語2文以内で述べてください：${approaches.map((a, i) => `案${i + 1}:${a.text}`).join(' / ')}`, 96);
    if (!critique) critique = approaches.length > 1 ? `各案に大きな矛盾はありません。確実性の高い「${approaches[0].angle}」を軸に、他案の良い点を取り入れるのが妥当です。` : '案に矛盾はありません。この方針で問題ありません。';
    await gstream(groupId, c, `相互評価・矛盾チェック：${critique}`);
  }
  if (L.rounds > 1) await gstream(groupId, vp, '超深度モードのため結論を再検証しました。重大な見落としは確認されませんでした。');
  let conclusion = await modelSay(`依頼「${question}」について、検討（${approaches.map((a) => a.text).join(' / ')}${critique ? ' / 評価:' + critique : ''}）を踏まえ、結論と次の一手を日本語3文以内でまとめてください。`, 128);
  if (!conclusion) conclusion = `${approaches[0]?.angle || '確実な方針'}を採用します。まず小さく実装して動作を確認し、問題がなければ段階的に拡張します。`;
  const agree = approaches.length >= 2 ? '複数案が同方向' : '単一案';
  let conf = 45 + level * 6 + (used ? 10 : 0) + (approaches.length >= 2 ? 10 : 0);
  conf = Math.max(30, Math.min(88, conf));
  const basis = `根拠：${L.name}モード／案${approaches.length}件（${agree}）／担当${members.length}人／${tag}`;
  gpost(groupId, vp, { type: 'think', think: { question, levelName: L.name, goal, approaches, critique, conclusion, confidence: conf, basis, modelUsed: used } });
  awardExp(members, 15);
  await gstream(groupId, vp, `社長、結論をまとめました。上のカードをご確認ください。信頼度は${conf}%です（正確性の保証値ではなく、根拠と併せた目安です）。`);
}

// Minimal, working starter snippet per language (used when no model is installed).
function starterCode(lang: string, req: string): string {
  const t = (req || 'GODAgent').replace(/[`$]/g, '');
  switch (lang) {
    case 'html': return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<style>body{font-family:sans-serif;margin:24px;line-height:1.7}</style></head>\n<body>\n  <h1>${t}</h1>\n  <p>GODAgent コードスタジオで作成しました。</p>\n  <button onclick="alert('動きました')">クリック</button>\n</body></html>`;
    case 'javascript': return `// ${t}\nfunction main() {\n  console.log("Hello from GODAgent");\n}\nmain();`;
    case 'typescript': return `// ${t}\nfunction greet(name: string): string {\n  return \`Hello, \${name}\`;\n}\nconsole.log(greet("社長"));`;
    case 'python': return `# ${t}\ndef main():\n    print("Hello from GODAgent")\n\nif __name__ == "__main__":\n    main()`;
    case 'java': return `// ${t}\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from GODAgent");\n  }\n}`;
    case 'kotlin': return `// ${t}\nfun main() {\n  println("Hello from GODAgent")\n}`;
    case 'c': return `/* ${t} */\n#include <stdio.h>\nint main(void){ printf("Hello from GODAgent\\n"); return 0; }`;
    case 'cpp': return `// ${t}\n#include <iostream>\nint main(){ std::cout << "Hello from GODAgent\\n"; return 0; }`;
    case 'csharp': return `// ${t}\nusing System;\nclass Program { static void Main(){ Console.WriteLine("Hello from GODAgent"); } }`;
    case 'rust': return `// ${t}\nfn main() {\n    println!("Hello from GODAgent");\n}`;
    case 'sql': return `-- ${t}\nSELECT 'Hello from GODAgent' AS message;`;
    case 'glsl': return `// ${t}\nprecision mediump float;\nvoid main(){ gl_FragColor = vec4(0.49,0.36,1.0,1.0); }`;
    default: return `// ${t}\n// GODAgent code studio`;
  }
}

function meetingLine(kind: string, role: string) {
  const base: Record<string, string[]> = {
    game: ['コアループはシンプルに、最初の30秒で楽しさが伝わる形にしましょう。', '操作は片手でも遊べるようにします。', '世界観は依頼の雰囲気に合わせます。', '当たり判定と難易度は後で調整します。'],
    image: ['構図は主役を中央に、視線誘導を意識します。', '配色は依頼のトーンに合わせます。', 'バリエーションも用意します。'],
    videomake: ['台本は要点を3〜5シーンに分けます。', 'テロップで要点を補強します。', '尺は短めでテンポよく。'],
    videoedit: ['不要部分と無音を先に整理します。', 'テロップとBGMで見やすくします。', '最後に書き出し設定を確認します。'],
  };
  const arr = base[kind] || ['承知しました。担当分を進めます。'];
  return `${role}として、` + arr[Math.floor(Math.random() * arr.length)];
}

async function produce(p: any, members: any[], set: (s: string, n: number) => void) {
  const leader = members[0];
  const markWorking = (i: number) => { if (p.tasks[i]) { p.tasks[i].status = 'working'; saveProj(p); } };
  const markDone = (i: number, note: string) => { if (p.tasks[i]) { p.tasks[i].status = 'done'; p.tasks[i].note = note; } p.progress = Math.min(95, 10 + Math.round(((i + 1) / p.tasks.length) * 85)); saveProj(p); };

  if (p.teamKind === 'game') {
    // 画像チームと連携：キービジュアルを本当に生成
    for (let i = 0; i < members.length; i++) {
      if (stopped(p)) return; markWorking(i); await pace(250);
      const r = members[i].role;
      if (r.includes('キャラクター') || r.includes('マップ')) { gpost(p.groupId, members[i].id, { type: 'image', img: { dataUrl: imgUrl(r + ' ' + p.request), caption: `${r}：自動生成` } }); markDone(i, '素材を生成'); }
      else markDone(i, '担当分を反映');
    }
    const idea = await modelSay(`ゲームのコンセプトを日本語一文で提案してください：${p.request}`, 60);
    if (idea) await gstream(p.groupId, leader.id, `アイデア（AIモデル）：${idea}`);
    const genre = pickGenre(idea || p.request);
    const spec = { title: p.title || 'GODAgent Game', theme: (idea || p.request).slice(0, 40), color: TEAMS.find((t) => t.kind === 'game')!.color, genre };
    const html = makeGame(spec);
    p.deliverables = [{ kind: 'game', title: spec.title, genre, html }];
    gpost(p.groupId, leader.id, { type: 'game', game: { title: spec.title, genre, html } });
  } else if (p.teamKind === 'image') {
    const kinds = ['キービジュアル', 'キャラクター', '背景', 'サムネイル'];
    const prompt = await modelSay(`画像生成プロンプトを日本語一文で提案してください：${p.request}`, 60);
    if (prompt) await gstream(p.groupId, leader.id, `画像プロンプト（AIモデル）：${prompt}`);
    const seed = prompt || p.request;
    p.deliverables = [];
    for (let i = 0; i < members.length; i++) {
      if (stopped(p)) return; markWorking(i);
      if (members[i].role.includes('生成') || members[i].role.includes('合成') || members[i].role.includes('構図')) {
        const k = kinds[i % kinds.length]; const url = imgUrl(k + ' ' + seed);
        p.deliverables.push({ kind: 'image', caption: k, dataUrl: url });
        gpost(p.groupId, members[i].id, { type: 'image', img: { dataUrl: url, caption: `${k}（自動生成）` } });
      }
      await pace(200); markDone(i, '完了');
    }
  } else if (p.teamKind === 'videomake') {
    for (let i = 0; i < members.length - 1; i++) { if (stopped(p)) return; markWorking(i); await pace(250); markDone(i, '完了'); }
    const scriptLine = await modelSay(`動画の見どころ・導入を日本語一文で：${p.request}`, 60);
    if (scriptLine) await gstream(p.groupId, leader.id, `台本の種（AIモデル）：${scriptLine}`);
    const scenes = scriptScenes(scriptLine || p.request);
    gpost(p.groupId, leader.id, { type: 'text', text: '台本（絵コンテ）\n' + scenes.map((s, i) => `${i + 1}. ${s}`).join('\n') });
    const res = await recordVideo({ title: p.title || 'GODAgent', scenes, color: TEAMS.find((t) => t.kind === 'videomake')!.color });
    if (res.dataUrl) { p.deliverables = [{ kind: 'video', caption: p.title, dataUrl: res.dataUrl, mime: res.mime }]; gpost(p.groupId, leader.id, { type: 'video', video: { title: p.title, dataUrl: res.dataUrl, mime: res.mime } }); }
    else { gpost(p.groupId, leader.id, { type: 'error', text: res.error || '動画の生成に失敗しました。' }); p.deliverables = [{ kind: 'note', text: '実映像は生成できませんでした：' + (res.error || '') }]; }
    markDone(members.length - 1, '統合・確認');
  } else if (p.teamKind === 'videoedit') {
    for (let i = 0; i < members.length; i++) { if (stopped(p)) return; markWorking(i); await pace(150); markDone(i, '計画作成'); }
    const hasVideo = (p.inputFiles || []).some((f: any) => (f.mime || '').startsWith('video'));
    const editIdea = await modelSay(`動画編集の方針を日本語一文で：${p.request}`, 60);
    if (editIdea) await gstream(p.groupId, leader.id, `編集の方針（AIモデル）：${editIdea}`);
    const plan = editPlan(p.request);
    gpost(p.groupId, leader.id, { type: 'text', text: '編集プラン\n' + plan.map((s, i) => `${i + 1}. ${s}`).join('\n') });
    gpost(p.groupId, leader.id, { type: 'error', text: '正直なご報告：' + (hasVideo ? '素材を受領しましたが、' : '') + 'プロ向けの本格的な映像編集（カット・合成・書き出し等）は、端末ブラウザ内での実行能力の制約により本アプリ単体では実処理まで行えません。上記は実行可能な編集プランです。実処理が必要な場合はエンコード環境が必要です。' });
    p.deliverables = [{ kind: 'note', text: '編集プラン（実編集処理は端末制約により未対応）' }];
  }
  if (p.progress < 95) { p.progress = 95; saveProj(p); }
}

function imgUrl(prompt: string) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(makeImage(prompt)); }
function scriptScenes(req: string): string[] {
  const t = req.slice(0, 24) || 'GODAgent';
  return [`${t}`, '課題：いまの悩みを提示', '解決：GODAgent が手伝います', '特長：チームで自動制作', 'さあ、始めましょう'];
}
function editPlan(req: string): string[] {
  return ['不要部分・無音の自動カット', '要点テロップと字幕の付与', 'BGMと効果音の追加', '色・明るさ・音量の補正', '書き出し設定（1080p / MP4・WebM）の確認'];
}

// ---- routine scheduler --------------------------------------------------
function tzClock() { const d = new Date(); return { hm: d.toTimeString().slice(0, 5), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], day: String(d.getDate()).padStart(2, '0') }; }
function dueRoutine(r: any, c: any) { const tr = r.trigger || {}; const mins = (now() - (r.lastRun || 0)) / 60000; switch (tr.kind) { case 'interval': return mins >= (tr.minutes || 60); case 'time': case 'daily': return c.hm === (tr.at || '09:00') && mins > 2; case 'weekly': return c.hm === (tr.at || '09:00') && (tr.weekday || 'Mon').startsWith(c.weekday) && mins > 2; case 'monthly': return c.hm === (tr.at || '09:00') && String(tr.day || 1).padStart(2, '0') === c.day && mins > 2; default: return false; } }
function fireRoutine(r: any, manual = false) {
  const b = S.bots[r.botId]; if (!b) return; r.lastRun = now(); r.runs = (r.runs || []).slice(-19).concat({ id: uid('run_'), ts: now(), manual, ok: true }); save(); emit('routine.run', { routineId: r.id });
  let prompt = r.prompt || ''; if (r.skillId) { const sk = Object.values(S.skills).find((s: any) => s.id === r.skillId) as any; if (sk) prompt = `Run the "${sk.name}" skill. ${prompt}`.trim(); }
  const sys = { id: uid('m_'), role: 'user', botId: b.id, type: 'routine', text: prompt, routine: { name: r.name, trigger: r.trigger }, ts: now() }; (S.messages[b.id] ||= []).push(sys); emit('message', sys); runTurn(b, prompt);
}
setInterval(() => { const c = tzClock(); for (const r of Object.values(S.routines) as any[]) if (r.enabled && dueRoutine(r, c)) fireRoutine(r); }, 30000);

// ---- public api ---------------------------------------------------------
export const api = {
  async bootstrap() { ensureSeed(); setTimeout(() => { try { resumeProjects(); } catch {} }, 1500); return { bots: listBots(), settings: S.settings, skills: Object.values(S.skills), routines: Object.values(S.routines), connections: S.connections, apps: APPS, projects: Object.values(S.projects).sort((a: any, b: any) => b.createdAt - a.createdAt), catalog: { shapes: SHAPES, palette: PALETTE, states: STATES, triggerKinds: TRIGGER_KINDS }, engine: 'simulation', computer: computerSnap() }; },
  async bot(id: string) { const b = S.bots[id]; return { bot: b, messages: S.messages[id] || [], memory: S.memory[id] || [], busy: active.has(id), routines: Object.values(S.routines).filter((r: any) => r.botId === id) }; },
  async createBot(p: any) { const b = bot({ kind: p.kind === 'group' ? 'group' : 'bot', name: (p.name || '新しいBot').slice(0, 60), title: (p.title || '').slice(0, 80), shape: SHAPES.includes(p.shape) ? p.shape : 'blob', color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PALETTE[Math.floor(Math.random() * PALETTE.length)], avatarImage: p.avatarImage || null, members: Array.isArray(p.members) ? p.members : [] }); S.bots[b.id] = b; S.messages[b.id] = [{ id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: `はじめまして、${b.name}です。任せたい役割を教えてください。会話の合間も作業を続けます。`, ts: now() }]; save(); emit('bots', listBots()); return b; },
  async patchBot(id: string, p: any) { const b = S.bots[id]; if (!b) return; for (const k of ['name', 'title', 'shape', 'color', 'avatarImage', 'pinned', 'hidden', 'members', 'apps', 'model']) if (k in p) b[k] = p[k]; b.updatedAt = now(); save(); emit('bots', listBots()); emit('bot', b); return b; },
  async deleteBot(id: string) { delete S.bots[id]; delete S.messages[id]; delete S.memory[id]; for (const r of Object.values(S.routines) as any[]) if (r.botId === id) delete S.routines[r.id]; if (S.settings.primaryBotId === id) S.settings.primaryBotId = listBots()[0]?.id || null; save(); emit('bots', listBots()); return { ok: true }; },
  async send(id: string, text: string, files?: any[]) { const b = S.bots[id]; if (!b) return; const msg = { id: uid('m_'), role: 'user', botId: id, type: 'text', text, files: files || [], ts: now() }; (S.messages[id] ||= []).push(msg); save(); emit('message', msg); runTurn(b, text); return msg; },
  async stop(id: string) { active.delete(id); return { ok: true }; },
  async projects() { return Object.values(S.projects).sort((a: any, b: any) => b.createdAt - a.createdAt); },
  async teams() { return TEAMS.map((t) => ({ kind: t.kind, name: t.name, color: t.color, shape: t.shape, groupId: teamGroupId(t.kind), members: (S.bots[teamGroupId(t.kind)!]?.members || []).map((id: string) => ({ id, name: S.bots[id]?.name, role: S.bots[id]?.title })) })); },
  async company() {
    const mem = (id: string) => { const b = S.bots[id] || {}; return { id, name: b.name, role: b.title || b.role, empNo: b.empNo, level: b.level, specialty: b.specialty, leader: !!b.leader }; };
    const teamDepts = TEAMS.map((t) => ({ key: t.kind, name: t.name, color: t.color, shape: t.shape, studio: true, groupId: teamGroupId(t.kind), members: (S.bots[teamGroupId(t.kind)!]?.members || []).map(mem) }));
    const rosters = (S.deptRosters || {});
    const newDepts = DEPARTMENTS.map((d) => ({ key: d.key, name: d.name, color: d.color, shape: d.shape, studio: false, members: (rosters[d.key] || []).map(mem) }));
    const depts = [...newDepts.filter((d) => d.key === 'exec' || d.key === 'manager'), ...teamDepts, ...newDepts.filter((d) => d.key !== 'exec' && d.key !== 'manager')];
    const total = depts.reduce((n, d) => n + d.members.length, 0);
    return { total, departments: depts };
  },
  async think(question: string, level: number) { const r = startThink(question, Number(level) || 5); return r ? { ok: true, groupId: r.groupId } : { ok: false }; },
  async thinkGroupId() { return teamGroupId('think') || null; },
  async genCode(lang: string, request: string) {
    if (lang === 'html' && /ゲーム|game|遊|シュー|弾|パズル|avoid|よけ|回避|collect|集め|ジャンプ|run/i.test(request)) {
      const genre = pickGenre(request);
      const html = makeGame({ title: request.slice(0, 24) || 'Game', theme: request.slice(0, 40), color: '#7C5CFF', genre });
      return { code: html, modelUsed: false, kind: 'game' };
    }
    const m = await modelSay(`次の要望に対する${lang}のコードのみを出力してください（説明文は不要）：${request}`, 240);
    if (m && m.length > 24) return { code: m, modelUsed: true };
    return { code: starterCode(lang, request), modelUsed: false };
  },
  async createProject(teamKind: string, request: string) { const id = startProject(teamKind as any, request); return { id }; },
  async reviseProject(id: string, note: string) { const p = S.projects[id]; if (!p) return { ok: false }; gpost(p.groupId, p.tasks?.[0]?.memberId || S.bots[p.groupId].members[0], { type: 'text', text: `社長、修正指示を承りました：「${note.slice(0, 80)}」。再制作いたします。` }); startProject(p.teamKind, p.request + '（修正指示：' + note + '）', id); return { ok: true }; },
  async approveProject(id: string) { const p = S.projects[id]; if (!p) return { ok: false }; p.status = 'approved'; saveProj(p); awardExp(S.bots[p.groupId]?.members || [], 40); gpost(p.groupId, S.bots[p.groupId].members[0], { type: 'text', text: '社長、ご承認ありがとうございます。正式に完成といたします。チーム全員の経験値が上がりました。' }); return { ok: true }; },
  async stopProject(id: string) { const p = S.projects[id]; if (!p) return { ok: false }; p.status = 'stopped'; saveProj(p); gpost(p.groupId, S.bots[p.groupId].members[0], { type: 'text', text: '社長、作業を停止いたしました。' }); return { ok: true }; },
  async approve(id: string, effect: string, always = false) { return { ok: pendingResolve(id, { effect, always }) }; },
  async answer(id: string, value: string) { return { ok: pendingResolve(id, { value }) }; },
  async addMemory(id: string, kind: string, text: string) { const item = { id: uid('mem_'), kind, text: text.slice(0, 500), ts: now() }; (S.memory[id] ||= []).push(item); save(); emit('memory', S.memory[id]); return item; },
  async editMemory(id: string, mid: string, text: string) { const m = (S.memory[id] || []).find((x) => x.id === mid); if (m) m.text = text; save(); emit('memory', S.memory[id]); return { ok: true }; },
  async delMemory(id: string, mid: string) { S.memory[id] = (S.memory[id] || []).filter((x) => x.id !== mid); save(); emit('memory', S.memory[id]); return { ok: true }; },
  async skills() { return Object.values(S.skills); },
  async createSkill(s: any) { const sk = { id: uid('skill_'), name: s.name || 'New skill', description: s.description || '', steps: s.steps || [], inputs: s.inputs || [], scope: s.scope || 'account', botId: s.botId || null, ts: now() }; S.skills[sk.id] = sk; save(); emit('skills', Object.values(S.skills)); return sk; },
  async patchSkill(id: string, p: any) { const s = S.skills[id]; if (s) { Object.assign(s, p); save(); emit('skills', Object.values(S.skills)); } return s; },
  async delSkill(id: string) { delete S.skills[id]; save(); emit('skills', Object.values(S.skills)); return { ok: true }; },
  async createRoutine(r: any) { const rt = { id: uid('rtn_'), botId: r.botId, name: r.name || 'New routine', trigger: r.trigger || { kind: 'daily', at: '09:00' }, skillId: r.skillId || null, prompt: r.prompt || '', enabled: r.enabled !== false, lastRun: null, runs: [], ts: now() }; S.routines[rt.id] = rt; save(); emit('routines', Object.values(S.routines)); return rt; },
  async patchRoutine(id: string, p: any) { const r = S.routines[id]; if (r) { Object.assign(r, p); save(); emit('routines', Object.values(S.routines)); } return r; },
  async delRoutine(id: string) { delete S.routines[id]; save(); emit('routines', Object.values(S.routines)); return { ok: true }; },
  async runRoutine(id: string) { const r = S.routines[id]; if (r) fireRoutine(r, true); return { ok: true }; },
  async connect(appId: string) { const a = APP_BY_ID[appId]; if (!a) return; const c = { appId, status: 'connected', since: now(), account: 'you@company.example' }; S.connections[appId] = c; save(); emit('connections', S.connections); return c; },
  async disconnect(appId: string) { S.connections[appId] = { appId, status: 'disconnected', since: now() }; save(); emit('connections', S.connections); return { ok: true }; },
  async settings(p: any) { Object.assign(S.settings, p); save(); emit('settings', S.settings); return S.settings; },
  async computer() { return computerSnap(); },
  async computerOpen(target: string, botId?: string) { computerOpenLocal(target, botId!); return computerSnap(); },
  async computerAct(_k: string, _a: any, _b?: string) { return computerSnap(); },
  async takeover(on: boolean, botId?: string) { computer.status = on ? 'takeover' : 'idle'; computer.activeBotId = botId; emit('computer', computerSnap()); return computerSnap(); },
  async uploadFile(name: string, mime: string, dataUrl: string) { const id = uid('file_'); const meta = { id, name, mime, size: Math.round((dataUrl.length * 3) / 4), ts: now(), dataUrl }; S.files[id] = meta; save(); return { id, name, mime, size: meta.size, ts: meta.ts }; },
  async genAvatar(prompt: string) { let h = 0; for (const c of prompt) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { shape: SHAPES[h % SHAPES.length], color: PALETTE[(h >> 5) % PALETTE.length], note: '説明から生成しました（形状＋色）。画像生成は本ビルドでは未対応です。' }; },
};
