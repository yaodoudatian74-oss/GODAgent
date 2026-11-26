// Standalone (serverless) backend. Runs entirely in the browser so the app
// works offline inside the APK / as an installed PWA, with no server. It mirrors
// the Node server's behaviour: JSON state in localStorage, a simulation engine,
// the same tools (approvals, memory, handoff), and an iframe-based computer
// (a real WebView render of the bundled fixture pages — not a fake screenshot).
//
// Exposes the same `api` surface and `openStream` as the real client, so the
// rest of the app is unchanged.

type Fn = (...a: any[]) => any;

const LS_KEY = 'godagent.store.v1';
const uid = (p = '') => p + Math.random().toString(36).slice(2, 11);
const now = () => Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

interface Store { bots: Record<string, any>; messages: Record<string, any[]>; memory: Record<string, any[]>; skills: Record<string, any>; routines: Record<string, any>; connections: Record<string, any>; rules: any[]; files: Record<string, any>; settings: any; }

function emptyStore(): Store {
  return { bots: {}, messages: {}, memory: {}, skills: {}, routines: {}, connections: {}, rules: [], files: {},
    settings: { appearance: 'system', accent: 'auto', language: 'ja', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', autoReview: true, primaryBotId: null, computerPermission: 'ask', user: { name: 'あなた', initials: 'YOU' } } };
}

let S: Store = load();
function load(): Store { try { const r = localStorage.getItem(LS_KEY); if (r) { const p = JSON.parse(r); return { ...emptyStore(), ...p, settings: { ...emptyStore().settings, ...p.settings } }; } } catch {} return emptyStore(); }
let saveTimer: any = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} }, 60); }

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
  S.skills[`sk`] = { id: uid('skill_'), name: '週次ステータスまとめ', description: '各プロジェクトの今週の進捗をまとめ、ダイジェストを投稿する。', steps: ['接続済みアプリから更新を収集', 'プロジェクトごとに分類', '短いダイジェストを下書き', '投稿前に承認を仰ぐ'], inputs: ['week'], scope: 'account', ts: now() };
  const r = { id: uid('rtn_'), botId: created[0].id, name: '朝のブリーフィング', trigger: { kind: 'daily', at: '08:30' }, skillId: null, prompt: '短い朝のブリーフィングをください。', enabled: true, lastRun: null, runs: [], ts: now() };
  S.routines[r.id] = r;
  save();
}

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
      setState(b, 'thinking'); await sleep(200);
      const id = uid('m_'); const base = { id, role: 'bot', botId: b.id, type: 'text', text: '', ts: now(), streaming: true };
      (S.messages[b.id] ||= []).push(base); emit('message', base); setState(b, 'working');
      const words = text.split(/(\s+)/); let acc = '';
      for (const w of words) { acc += w; const m = S.messages[b.id].find((x) => x.id === id); if (m) m.text = acc; emit('message.delta', { id, text: acc }); await sleep(14 + Math.random() * 24); }
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
      await sleep(600);
      const patch = { note: note || `Opened ${computer.url}`, status: 'done', url: computer.url, iframe: true };
      const m = S.messages[b.id].find((x) => x.id === card.id); if (m) m.computer = patch; save();
      emit('message.update', { id: card.id, patch: { computer: patch } });
      return { ok: true, url: computer.url };
    },
    async handoff(toBotId: string, task: string) { const to = S.bots[toBotId]; if (!to) return; post(b, { type: 'handoff', handoff: { toBotId, toName: to.name, task } }); return to; },
    done() { setState(b, 'done'); setTimeout(() => setState(b, 'idle'), 2600); },
  };
}

// ---- simulation engine (port of server sim) -----------------------------
const has = (t: string, ...k: string[]) => k.some((w) => t.includes(w));
const active = new Set<string>();
async function runTurn(b: any, userText: string) {
  if (active.has(b.id)) return; active.add(b.id);
  try { await plan(b, userText); } catch {} finally { active.delete(b.id); }
}
async function plan(b: any, userText: string) {
  const T = tools(b); const t = userText.toLowerCase();
  if (has(t, 'remember', 'always', 'from now on', '覚え', '今後', 'いつも')) { await T.saveMemory('instruction', userText.replace(/^(remember|always|覚えて|今後は?)[:,、\s]*/i, '').trim()); await T.reply('承知しました。今後はそのようにいたします。'); return T.done(); }
  if (has(t, 'which', 'should i', 'option', 'choose', 'どっち', 'どちら', 'どれ', 'べき') && b.kind !== 'group') { const a = await T.askQuestion({ question: '進め方がいくつか考えられます。どれがよろしいですか？', options: ['まず動いて、必要なら後で調整', 'すべて下書きしてから確認を仰ぐ', '最も効果の大きい項目だけ'] }); await T.reply(`承知しました。「${a}」で進めます。開始いたします。`); return T.done(); }
  if (b.kind === 'group') {
    const members = (b.members || []).map((id: string) => S.bots[id]).filter(Boolean);
    await T.reply('承知しました。適任のメンバーに引き継ぎます。');
    if (members[1]) { await T.handoff(members[1].id, userText.slice(0, 120)); await sleep(400); const sub = tools(members[1]); await sub.reply(`引き継ぎました。「${userText.slice(0, 60)}」を担当し、完了後にご報告します。`); sub.done(); }
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
  else reply = 'はじめまして。どのような役割でお役に立てばよいでしょう。具体的なご依頼でも、全般的なサポートでも対応します。';
  await T.reply(reply); T.done();
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
  async bootstrap() { ensureSeed(); return { bots: listBots(), settings: S.settings, skills: Object.values(S.skills), routines: Object.values(S.routines), connections: S.connections, apps: APPS, catalog: { shapes: SHAPES, palette: PALETTE, states: STATES, triggerKinds: TRIGGER_KINDS }, engine: 'simulation', computer: computerSnap() }; },
  async bot(id: string) { const b = S.bots[id]; return { bot: b, messages: S.messages[id] || [], memory: S.memory[id] || [], busy: active.has(id), routines: Object.values(S.routines).filter((r: any) => r.botId === id) }; },
  async createBot(p: any) { const b = bot({ kind: p.kind === 'group' ? 'group' : 'bot', name: (p.name || '新しいBot').slice(0, 60), title: (p.title || '').slice(0, 80), shape: SHAPES.includes(p.shape) ? p.shape : 'blob', color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : PALETTE[Math.floor(Math.random() * PALETTE.length)], avatarImage: p.avatarImage || null, members: Array.isArray(p.members) ? p.members : [] }); S.bots[b.id] = b; S.messages[b.id] = [{ id: uid('m_'), role: 'bot', botId: b.id, type: 'text', text: `はじめまして、${b.name}です。任せたい役割を教えてください。会話の合間も作業を続けます。`, ts: now() }]; save(); emit('bots', listBots()); return b; },
  async patchBot(id: string, p: any) { const b = S.bots[id]; if (!b) return; for (const k of ['name', 'title', 'shape', 'color', 'avatarImage', 'pinned', 'hidden', 'members', 'apps']) if (k in p) b[k] = p[k]; b.updatedAt = now(); save(); emit('bots', listBots()); emit('bot', b); return b; },
  async deleteBot(id: string) { delete S.bots[id]; delete S.messages[id]; delete S.memory[id]; for (const r of Object.values(S.routines) as any[]) if (r.botId === id) delete S.routines[r.id]; if (S.settings.primaryBotId === id) S.settings.primaryBotId = listBots()[0]?.id || null; save(); emit('bots', listBots()); return { ok: true }; },
  async send(id: string, text: string, files?: any[]) { const b = S.bots[id]; if (!b) return; const msg = { id: uid('m_'), role: 'user', botId: id, type: 'text', text, files: files || [], ts: now() }; (S.messages[id] ||= []).push(msg); save(); emit('message', msg); runTurn(b, text); return msg; },
  async stop(id: string) { active.delete(id); return { ok: true }; },
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
