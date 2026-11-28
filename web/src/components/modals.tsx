import { useState } from 'react';
import { useStore, actions, getState } from '../store';
import { api } from '../api';
import { AvatarCanvas, AvatarSvg } from '../avatar/Avatar';
import { ModelsPane } from './ModelsPane';
import { ProjectsPane } from './ProjectsPane';
import { CodeStudioPane } from './CodeStudioPane';
import { FeaturesPane } from './FeaturesPane';
import { StudioPane } from './StudioPane';
import * as hf from '../localai/hf';

const STATE_LABEL: Record<string, string> = { idle: '待機', thinking: '思考', working: '作業', waiting: '待機中', blocked: '問題発生', done: '完了' };
const KIND_LABEL: Record<string, string> = { fact: '事実', preference: '好み', instruction: '指示' };
const TRIG_KIND_LABEL: Record<string, string> = { time: '時刻', daily: '毎日', weekly: '毎週', monthly: '毎月', interval: '間隔', webhook: 'Webhook', email: 'メール受信', github: 'GitHub', slack: 'Slack' };

export function ModalRoot() {
  const modal = useStore((s) => s.modal);
  if (!modal || modal.kind === 'preview') return null;
  const close = () => actions.setModal(null);
  const Body = ({
    create: CreateBot, editAvatar: EditAvatar, settings: Settings, memory: MemoryModal,
    routines: RoutinesModal, apps: ConnectApps, skills: SkillsModal, states: StatePreview,
    models: ModelsModal, projects: ProjectsModal, code: CodeModal, features: FeaturesModal, studio: StudioModal,
  } as any)[modal.kind];
  if (!Body) return null;
  return (
    <div className="scrim" onClick={close}>
      <div className={`modal ${['settings', 'routines', 'apps', 'skills', 'states', 'models', 'projects', 'code', 'features', 'studio'].includes(modal.kind) ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Body data={modal.data} close={close} />
      </div>
    </div>
  );
}

function Header({ title, close }: { title: string; close: () => void }) {
  return <div className="modal-head"><h2>{title}</h2><div className="grow" /><button className="icon-btn" onClick={close}>✕</button></div>;
}

function ShapePicker({ shape, color, onShape, onColor }: any) {
  const { shapes, palette } = getState().catalog;
  return (
    <>
      <div className="field"><label>形状</label>
        <div className="shape-grid">
          {shapes.map((s: string) => (
            <button key={s} className={`shape-cell ${s === shape ? 'sel' : ''}`} onClick={() => onShape(s)} title={s}>
              <AvatarSvg shape={s} color={color} size={34} />
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label>色</label>
        <div className="color-grid">
          {palette.map((c: string) => <button key={c} className={`swatch ${c === color ? 'sel' : ''}`} style={{ background: c }} onClick={() => onColor(c)} />)}
        </div>
      </div>
    </>
  );
}

// ---- Bot作成 -----------------------------------------------------------
function CreateBot({ close }: any) {
  const cat = getState().catalog;
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [shape, setShape] = useState(cat.shapes[0] || 'blob');
  const [color, setColor] = useState(cat.palette[Math.floor(Math.random() * cat.palette.length)] || '#777777');
  const [kind, setKind] = useState<'bot' | 'group'>('bot');
  const [members, setMembers] = useState<string[]>([]);
  const bots = getState().bots.filter((b) => b.kind === 'bot');

  async function create() {
    const b = await api.createBot({ name: name || '新しいBot', title, shape, color, kind, members });
    await actions.refreshBots(); actions.select(b.id); close();
  }
  return (
    <>
      <Header title={kind === 'group' ? '新しいグループチャット' : '新しいBot'} close={close} />
      <div className="modal-body">
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={kind === 'bot' ? 'on' : ''} onClick={() => setKind('bot')}>Bot</button>
          <button className={kind === 'group' ? 'on' : ''} onClick={() => setKind('group')}>グループ</button>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
          <AvatarCanvas shape={shape} color={color} state="idle" size={96} />
        </div>
        <div className="field"><label>名前</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：リサーチ担当" autoFocus /></div>
        {kind === 'bot' && <div className="field"><label>タイトル（任意）</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：採用" /></div>}
        <ShapePicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
        {kind === 'group' && (
          <div className="field"><label>メンバー（2〜6）</label>
            {bots.map((b) => (
              <label key={b.id} className="row-between" style={{ padding: '6px 0' }}>
                <AvatarSvg shape={b.shape} color={b.color} size={24} /><span style={{ flex: 1 }}>{b.name}</span>
                <input type="checkbox" checked={members.includes(b.id)} onChange={(e) => setMembers((m) => e.target.checked ? [...m, b.id].slice(0, 6) : m.filter((x) => x !== b.id))} />
              </label>
            ))}
          </div>
        )}
        <div className="btn-row"><button className="btn primary" onClick={create}>作成</button><button className="btn" onClick={close}>キャンセル</button></div>
      </div>
    </>
  );
}

// ---- アバター編集 ------------------------------------------------------
function EditAvatar({ data, close }: any) {
  const bot = useStore((s) => s.bots.find((b) => b.id === data.id)) || data;
  const [tab, setTab] = useState<'shape' | 'generate' | 'upload'>('shape');
  const [name, setName] = useState(bot.name);
  const [title, setTitle] = useState(bot.title || '');
  const [shape, setShape] = useState(bot.shape);
  const [color, setColor] = useState(bot.color);
  const [image, setImage] = useState<string | null>(bot.avatarImage);
  const [gen, setGen] = useState('');
  const [genNote, setGenNote] = useState('');
  const [model, setModel] = useState<string>(bot.model || '');
  const isPrimary = getState().settings.primaryBotId === bot.id;

  async function save() {
    await api.patchBot(bot.id, { name, title, shape, color, avatarImage: image, model });
    await actions.refreshBots(); close();
  }
  async function generate() {
    const r = await api.genAvatar(gen); setShape(r.shape); setColor(r.color); setImage(null); setGenNote(r.note);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { alert('画像が25MBの上限を超えています'); return; }
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
    setImage(url);
  }
  return (
    <>
      <Header title="アバターを編集" close={close} />
      <div style={{ display: 'grid', placeItems: 'center', padding: '4px 0 10px' }}>
        <AvatarCanvas shape={shape} color={color} state={bot.state} image={image} size={110} />
      </div>
      <div className="tabbar">
        <button className={tab === 'shape' ? 'on' : ''} onClick={() => setTab('shape')}>形状</button>
        <button className={tab === 'generate' ? 'on' : ''} onClick={() => setTab('generate')}>生成</button>
        <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>アップロード</button>
      </div>
      <div className="modal-body">
        {tab === 'shape' && <>{image && <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => setImage(null)}>画像を外して形状を使う</button>}<ShapePicker shape={shape} color={color} onShape={(s: string) => { setShape(s); setImage(null); }} onColor={(c: string) => { setColor(c); setImage(null); }} /></>}
        {tab === 'generate' && (
          <div className="field"><label>アバターを説明してください</label>
            <textarea rows={3} value={gen} onChange={(e) => setGen(e.target.value)} placeholder="例：落ち着いたティール色の相棒" />
            <div className="btn-row"><button className="btn" onClick={generate}>生成</button></div>
            {genNote && <div className="muted" style={{ marginTop: 8 }}>{genNote}</div>}
          </div>
        )}
        {tab === 'upload' && (
          <div className="field"><label>画像をアップロード（最大25MB）</label>
            <input type="file" accept="image/*" onChange={upload} />
            <div className="muted" style={{ marginTop: 6 }}>JPEG/PNG/GIF。角丸の正方形に切り抜かれます。</div>
          </div>
        )}
        <div className="field"><label>名前</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>タイトル</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>使用するモデル</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">既定に従う（設定 → モデル）</option>
            <option value="sim">内蔵シミュレーション</option>
            {hf.installed().map((m) => <option key={m.id} value={'hf:' + m.id}>{m.id}</option>)}
          </select>
          <div className="muted" style={{ marginTop: 6 }}>Hugging Face のモデルは 設定 → モデル からダウンロードできます（ログイン不要）。</div>
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={save}>保存</button>
          <button className="btn" onClick={close}>キャンセル</button>
          <div className="grow" />
          {!isPrimary && <button className="btn sm" onClick={async () => { await api.settings({ primaryBotId: bot.id }); await actions.refreshBots(); }}>プライマリにする</button>}
        </div>
      </div>
    </>
  );
}

// ---- 設定 --------------------------------------------------------------
function Settings({ close, data }: any) {
  const s = useStore((x) => x.settings);
  const [tab, setTab] = useState(data?.tab || 'appearance');
  const set = (p: any) => api.settings(p);
  const tabs = ['models', 'account', 'appearance', 'language', 'computer', 'bot', 'timezone', 'autoReview', 'rules', 'apps', 'skills', 'vault', 'notifications', 'updates'];
  const labels: any = { models: 'モデル', account: 'アカウント', appearance: '外観', language: '言語', computer: 'コンピューター', bot: 'Bot', timezone: 'タイムゾーン', autoReview: '自動レビュー', rules: 'カスタムルール', apps: 'アプリ接続', skills: 'スキル', vault: 'Vault', notifications: '通知', updates: '更新情報' };
  const themeLabel: any = { light: 'ライト', dark: 'ダーク', system: 'システム' };
  return (
    <>
      <Header title="設定" close={close} />
      <div className="tabbar" style={{ flexWrap: 'wrap' }}>
        {tabs.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{labels[t] || t}</button>)}
      </div>
      <div className="modal-body">
        {tab === 'account' && <>
          <div className="field"><label>お名前</label><input defaultValue={s.user?.name} onBlur={(e) => set({ user: { ...s.user, name: e.target.value } })} /></div>
          <div className="field"><label>イニシャル</label><input defaultValue={s.user?.initials} maxLength={3} onBlur={(e) => set({ user: { ...s.user, initials: e.target.value.toUpperCase() } })} /></div>
          <div className="muted">エンジン: <b>{getState().engine === 'simulation' ? 'シミュレーション' : 'Claude（ライブ）'}</b> — {getState().engine === 'simulation' ? 'オフラインのシミュレーション動作（APIキー無し）。ANTHROPIC_API_KEY を設定すると実モデルを使用します。' : '実際の Claude モデルで動作中。'}</div>
        </>}
        {tab === 'appearance' && <div className="field"><label>テーマ</label>
          <div className="seg">{['light', 'dark', 'system'].map((m) => <button key={m} className={s.appearance === m ? 'on' : ''} onClick={() => set({ appearance: m })}>{themeLabel[m]}</button>)}</div>
        </div>}
        {tab === 'language' && <div className="field"><label>言語</label>
          <select value={s.language} onChange={(e) => set({ language: e.target.value })}><option value="ja">日本語</option><option value="en">English</option></select>
          <div className="muted" style={{ marginTop: 8 }}>翻訳済みのラベルに反映されます。会話の内容は各Botに従います。</div>
        </div>}
        {tab === 'computer' && <div className="field"><label>ローカルPCへのアクセス</label>
          <div className="seg">{[['ask', '毎回確認'], ['always', '常に許可'], ['never', '許可しない']].map(([v, l]) => <button key={v} className={s.computerPermission === v ? 'on' : ''} onClick={() => set({ computerPermission: v })}>{l}</button>)}</div>
          <div className="muted" style={{ marginTop: 8 }}>Botは常に専用のクラウドコンピューターを持ちます。この設定はお使いのローカル端末のみに適用されます。</div>
        </div>}
        {tab === 'bot' && <div className="field"><label>プライマリBot</label>
          <select value={s.primaryBotId || ''} onChange={(e) => set({ primaryBotId: e.target.value })}>
            {getState().bots.filter((b) => b.kind === 'bot').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => actions.setModal('states')}>アバターの状態をプレビュー →</button>
        </div>}
        {tab === 'timezone' && <div className="field"><label>タイムゾーン</label><input defaultValue={s.timezone} onBlur={(e) => set({ timezone: e.target.value })} /><div className="muted" style={{ marginTop: 6 }}>ルーティンのスケジュールに使われます。</div></div>}
        {tab === 'autoReview' && <>
          <div className="row-between"><div><b>自動レビュー</b><div className="muted">提案された操作を、実行前にあなたのルールに照らしてレビュー担当が評価します。</div></div>
            <button className={`switch ${s.autoReview ? 'on' : ''}`} onClick={() => set({ autoReview: !s.autoReview })}><i /></button></div>
        </>}
        {tab === 'models' && <ModelsPane />}
        {tab === 'rules' && <RulesPane />}
        {tab === 'apps' && <ConnectApps embedded />}
        {tab === 'skills' && <SkillsModal embedded />}
        {tab === 'vault' && <div className="muted">Vault はBotが使う認証情報（接続済みアカウント）を保管します。本ビルドでは機密情報は保存しません。アプリは「アプリ接続」から接続してください。</div>}
        {tab === 'notifications' && <div className="field"><label>通知</label><div className="muted">Botアイコン付きのグループ通知。（本ビルドではローカルのみ）</div></div>}
        {tab === 'updates' && <div className="muted">GODAgent build v0.1 — Grok Bot 体験の再現版。アバター刷新：目を大きく、12形状（四角・キラキラ・クローバー・花・ハート・家・星＋基本形状）。</div>}
      </div>
    </>
  );
}

function RulesPane() {
  return (
    <>
      <div className="muted" style={{ marginBottom: 10 }}>承認カードで「常に許可」を選ぶと、ここに許可ルールが保存され、同様の操作は自動で実行されます。許可ルールが20件に達すると、新しいものが最も古いものを置き換えます。「承認が必要」ルールは、両方が一致した場合に「許可」ルールより常に優先されます。</div>
      <div className="list-item"><div className="grow"><b>デフォルト</b><div className="muted">影響の大きい操作（送信・投稿・削除・購入）にはあなたの承認が必要です。</div></div></div>
      <div className="muted">チャットの承認カードで「常に許可」を選ぶと、許可ルールが作成されます。</div>
    </>
  );
}

// ---- メモリ ------------------------------------------------------------
function MemoryModal({ data, close }: any) {
  const memory = useStore((s) => s.memory[data.id] || []);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('fact');
  async function add() { if (!text.trim()) return; await api.addMemory(data.id, kind, text); setText(''); refresh(); }
  async function refresh() { const d = await api.bot(data.id); getState().memory[data.id] = d.memory; actions.setModal('memory', data); }
  return (
    <>
      <Header title={`${data.name}・メモリ`} close={close} />
      <div className="modal-body">
        <div className="muted" style={{ marginBottom: 10 }}>継続的な事実・好み・指示。どの項目も訂正・忘却できます。</div>
        {memory.map((m: any) => (
          <div key={m.id} className="list-item">
            <span className="pill-badge pending">{KIND_LABEL[m.kind] || m.kind}</span>
            <span className="grow">{m.text}</span>
            <button className="btn sm danger" onClick={async () => { await api.delMemory(data.id, m.id); refresh(); }}>忘れる</button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 12 }}><label>メモリに追加</label>
          <div className="btn-row">
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 130 }}><option value="fact">事実</option><option value="preference">好み</option><option value="instruction">指示</option></select>
            <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="例：短い返信を好む" onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn primary" onClick={add}>追加</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- ルーティン --------------------------------------------------------
function RoutinesModal({ data, close }: any) {
  const routines = useStore((s) => s.routines.filter((r) => r.botId === data.id));
  const skills = getState().skills;
  const cat = getState().catalog;
  const [draft, setDraft] = useState<any>(null);

  function blank() { return { botId: data.id, name: '', trigger: { kind: 'daily', at: '09:00' }, prompt: '', skillId: null, enabled: true }; }
  async function save() {
    if (draft.id) await api.patchRoutine(draft.id, draft); else await api.createRoutine(draft);
    setDraft(null); const b = await api.bootstrap(); getState().routines = b.routines; actions.setModal('routines', data);
  }
  return (
    <>
      <Header title={`${data.name}・ルーティン`} close={close} />
      <div className="modal-body">
        {!draft && <>
          {routines.length === 0 && <div className="muted">ルーティンはまだありません。ルーティンは、スケジュールやイベントに応じてスキルやプロンプトを実行します。</div>}
          {routines.map((r) => (
            <div key={r.id} className="list-item">
              <div className="grow"><b>{r.name || '（名称未設定）'}</b><div className="muted">{trigLabel(r.trigger)}・実行 {r.runs?.length || 0} 回</div></div>
              <button className={`switch ${r.enabled ? 'on' : ''}`} onClick={() => api.patchRoutine(r.id, { enabled: !r.enabled }).then(() => actions.refreshBots())}><i /></button>
              <button className="btn sm" onClick={() => api.runRoutine(r.id)}>実行</button>
              <button className="btn sm" onClick={() => setDraft({ ...r })}>編集</button>
              <button className="btn sm danger" onClick={() => api.delRoutine(r.id).then(() => actions.refreshBots()).then(() => actions.setModal('routines', data))}>削除</button>
            </div>
          ))}
          <div className="btn-row"><button className="btn primary" onClick={() => setDraft(blank())}>新しいルーティン</button></div>
        </>}
        {draft && <>
          <div className="field"><label>名前</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例：朝のブリーフィング" /></div>
          <div className="grid2">
            <div className="field"><label>トリガー</label>
              <select value={draft.trigger.kind} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, kind: e.target.value } })}>
                {cat.triggerKinds.map((k: string) => <option key={k} value={k}>{TRIG_KIND_LABEL[k] || k}</option>)}
              </select>
            </div>
            {['time', 'daily', 'weekly', 'monthly'].includes(draft.trigger.kind) && <div className="field"><label>時刻（HH:MM）</label><input value={draft.trigger.at || '09:00'} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, at: e.target.value } })} /></div>}
            {draft.trigger.kind === 'interval' && <div className="field"><label>間隔（分）</label><input type="number" value={draft.trigger.minutes || 60} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, minutes: +e.target.value } })} /></div>}
            {draft.trigger.kind === 'weekly' && <div className="field"><label>曜日</label><input value={draft.trigger.weekday || 'Mon'} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, weekday: e.target.value } })} /></div>}
          </div>
          <div className="field"><label>スキル（任意）</label>
            <select value={draft.skillId || ''} onChange={(e) => setDraft({ ...draft, skillId: e.target.value || null })}>
              <option value="">— なし —</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>プロンプト</label><textarea rows={3} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="このルーティンが発火したとき、Botに何をさせますか？" /></div>
          <div className="btn-row"><button className="btn primary" onClick={save}>保存</button><button className="btn" onClick={() => setDraft(null)}>キャンセル</button></div>
        </>}
      </div>
    </>
  );
}
function trigLabel(t: any) {
  if (!t) return '';
  if (t.kind === 'interval') return `${t.minutes || 60}分ごと`;
  if (t.kind === 'weekly') return `毎週 ${t.weekday || 'Mon'} ${t.at || ''}`;
  if (['daily', 'time'].includes(t.kind)) return `毎日 ${t.at || ''}`;
  if (t.kind === 'monthly') return `毎月 ${t.day || 1}日 ${t.at || ''}`;
  return TRIG_KIND_LABEL[t.kind] || t.kind;
}

// ---- アプリ接続 --------------------------------------------------------
function ConnectApps({ close, embedded }: any) {
  const apps = getState().apps;
  const conns = useStore((s) => s.connections);
  const [q, setQ] = useState('');
  const body = (
    <>
      <div className="search" style={{ margin: '0 0 12px' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input placeholder="アプリを検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {apps.filter((a: any) => a.name.toLowerCase().includes(q.toLowerCase())).map((a: any) => {
        const c = conns[a.id]; const connected = c?.status === 'connected';
        return (
          <div key={a.id} className="app-tile" style={{ marginBottom: 10 }}>
            <div className="app-logo" style={{ background: logoColor(a.id) }}>{a.name[0]}</div>
            <div className="grow"><b>{a.name}</b><div className="muted">{a.desc}</div>
              {connected && <div className="muted" style={{ fontSize: 11 }}>ツール: {a.tools.join(', ')}</div>}</div>
            {connected
              ? <button className="btn sm" onClick={() => api.disconnect(a.id)}>接続解除</button>
              : <button className="btn sm primary" onClick={() => api.connect(a.id)}>接続</button>}
          </div>
        );
      })}
    </>
  );
  if (embedded) return body;
  return <><Header title="アプリ接続" close={close} /><div className="modal-body">{body}</div></>;
}
function logoColor(id: string) { const p = ['#D93025', '#1A73E8', '#0F9D58', '#611f69', '#111', '#5E6AD2', '#00A1E0', '#111', '#1A73E8', '#FF7A59']; let h = 0; for (const c of id) h += c.charCodeAt(0); return p[h % p.length]; }

// ---- スキル ------------------------------------------------------------
function SkillsModal({ close, embedded }: any) {
  const skills = useStore((s) => s.skills);
  const [draft, setDraft] = useState<any>(null);
  function blank() { return { name: '', description: '', steps: [], inputs: [], scope: 'account' }; }
  async function save() {
    if (draft.id) await api.patchSkill(draft.id, draft); else await api.createSkill(draft);
    setDraft(null); const b = await api.bootstrap(); getState().skills = b.skills; actions.setModal(embedded ? 'settings' : 'skills');
  }
  const body = (
    <>
      {!draft && <>
        {skills.map((s) => (
          <div key={s.id} className="list-item">
            <div className="grow"><b>{s.name}</b><div className="muted">{s.description}</div>
              <div className="muted" style={{ fontSize: 11 }}>{s.scope === 'account' ? 'アカウント共通' : 'Bot固有'}・{s.steps?.length || 0} ステップ</div></div>
            <button className="btn sm" onClick={() => setDraft({ ...s })}>編集</button>
            <button className="btn sm danger" onClick={async () => { await api.delSkill(s.id); const b = await api.bootstrap(); getState().skills = b.skills; actions.setModal(embedded ? 'settings' : 'skills'); }}>削除</button>
          </div>
        ))}
        <div className="btn-row"><button className="btn primary" onClick={() => setDraft(blank())}>新しいスキル</button></div>
      </>}
      {draft && <>
        <div className="field"><label>名前</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="field"><label>説明</label><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
        <div className="field"><label>手順（1行に1つ）</label><textarea rows={4} value={(draft.steps || []).join('\n')} onChange={(e) => setDraft({ ...draft, steps: e.target.value.split('\n').filter(Boolean) })} /></div>
        <div className="field"><label>範囲</label><div className="seg"><button className={draft.scope === 'account' ? 'on' : ''} onClick={() => setDraft({ ...draft, scope: 'account' })}>アカウント</button><button className={draft.scope === 'bot' ? 'on' : ''} onClick={() => setDraft({ ...draft, scope: 'bot' })}>Bot</button></div></div>
        <div className="btn-row"><button className="btn primary" onClick={save}>保存</button><button className="btn" onClick={() => setDraft(null)}>キャンセル</button></div>
      </>}
    </>
  );
  if (embedded) return body;
  return <><Header title="スキル" close={close} /><div className="modal-body">{body}</div></>;
}

// ---- AIモデル（ダウンロード）専用画面 ----------------------------------
function ModelsModal({ close }: any) {
  return (
    <>
      <Header title="AIモデル" close={close} />
      <div className="modal-body"><ModelsPane /></div>
    </>
  );
}

function ProjectsModal({ close }: any) {
  return (
    <>
      <Header title="AI社員・プロジェクト" close={close} />
      <div className="modal-body"><ProjectsPane /></div>
    </>
  );
}

function CodeModal({ close }: any) {
  return (
    <>
      <Header title="コードスタジオ" close={close} />
      <div className="modal-body"><CodeStudioPane /></div>
    </>
  );
}

function FeaturesModal({ close }: any) {
  return (
    <>
      <Header title="機能一覧（実装状況）" close={close} />
      <div className="modal-body"><FeaturesPane /></div>
    </>
  );
}

function StudioModal({ close }: any) {
  return (
    <>
      <Header title="スタジオ（音楽・3D・性能）" close={close} />
      <div className="modal-body"><StudioPane /></div>
    </>
  );
}

// ---- アバター状態プレビュー --------------------------------------------
function StatePreview({ close }: any) {
  const bot = getState().bots.find((b) => b.id === getState().activeId) || getState().bots[0];
  const states = getState().catalog.states;
  return (
    <>
      <Header title="アバターの状態" close={close} />
      <div className="modal-body">
        <div className="state-grid">
          {states.map((st: string) => (
            <div key={st} className="state-cell">
              <div style={{ display: 'grid', placeItems: 'center' }}><AvatarCanvas shape={bot.shape} color={bot.color} state={st} size={88} interactive={false} /></div>
              <div className="lab">{STATE_LABEL[st] || st}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
