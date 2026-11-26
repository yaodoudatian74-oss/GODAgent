import { useState } from 'react';
import { useStore, actions, getState } from '../store';
import { api } from '../api';
import { AvatarCanvas, AvatarSvg } from '../avatar/Avatar';

export function ModalRoot() {
  const modal = useStore((s) => s.modal);
  if (!modal || modal.kind === 'preview') return null;
  const close = () => actions.setModal(null);
  const Body = ({
    create: CreateBot, editAvatar: EditAvatar, settings: Settings, memory: MemoryModal,
    routines: RoutinesModal, apps: ConnectApps, skills: SkillsModal, states: StatePreview,
  } as any)[modal.kind];
  if (!Body) return null;
  return (
    <div className="scrim" onClick={close}>
      <div className={`modal ${['settings', 'routines', 'apps', 'skills', 'states'].includes(modal.kind) ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
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
      <div className="field"><label>Shape</label>
        <div className="shape-grid">
          {shapes.map((s: string) => (
            <button key={s} className={`shape-cell ${s === shape ? 'sel' : ''}`} onClick={() => onShape(s)} title={s}>
              <AvatarSvg shape={s} color={color} size={34} />
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label>Colour</label>
        <div className="color-grid">
          {palette.map((c: string) => <button key={c} className={`swatch ${c === color ? 'sel' : ''}`} style={{ background: c }} onClick={() => onColor(c)} />)}
        </div>
      </div>
    </>
  );
}

// ---- Create Bot --------------------------------------------------------
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
    const b = await api.createBot({ name: name || 'New Bot', title, shape, color, kind, members });
    await actions.refreshBots(); actions.select(b.id); close();
  }
  return (
    <>
      <Header title={kind === 'group' ? 'New group chat' : 'New Bot'} close={close} />
      <div className="modal-body">
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={kind === 'bot' ? 'on' : ''} onClick={() => setKind('bot')}>Bot</button>
          <button className={kind === 'group' ? 'on' : ''} onClick={() => setKind('group')}>Group</button>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
          <AvatarCanvas shape={shape} color={color} state="idle" size={96} />
        </div>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Research Lead" autoFocus /></div>
        {kind === 'bot' && <div className="field"><label>Title (optional)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Recruiting" /></div>}
        <ShapePicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
        {kind === 'group' && (
          <div className="field"><label>Members (2–6)</label>
            {bots.map((b) => (
              <label key={b.id} className="row-between" style={{ padding: '6px 0' }}>
                <AvatarSvg shape={b.shape} color={b.color} size={24} /><span style={{ flex: 1 }}>{b.name}</span>
                <input type="checkbox" checked={members.includes(b.id)} onChange={(e) => setMembers((m) => e.target.checked ? [...m, b.id].slice(0, 6) : m.filter((x) => x !== b.id))} />
              </label>
            ))}
          </div>
        )}
        <div className="btn-row"><button className="btn primary" onClick={create}>Create</button><button className="btn" onClick={close}>Cancel</button></div>
      </div>
    </>
  );
}

// ---- Edit Avatar -------------------------------------------------------
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
  const isPrimary = getState().settings.primaryBotId === bot.id;

  async function save() {
    await api.patchBot(bot.id, { name, title, shape, color, avatarImage: image });
    await actions.refreshBots(); close();
  }
  async function generate() {
    const r = await api.genAvatar(gen); setShape(r.shape); setColor(r.color); setImage(null); setGenNote(r.note);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { alert('Image exceeds the 25MB limit'); return; }
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
    setImage(url);
  }
  return (
    <>
      <Header title="Edit avatar" close={close} />
      <div style={{ display: 'grid', placeItems: 'center', padding: '4px 0 10px' }}>
        <AvatarCanvas shape={shape} color={color} state={bot.state} image={image} size={110} />
      </div>
      <div className="tabbar">
        <button className={tab === 'shape' ? 'on' : ''} onClick={() => setTab('shape')}>Shape</button>
        <button className={tab === 'generate' ? 'on' : ''} onClick={() => setTab('generate')}>Generate</button>
        <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Upload</button>
      </div>
      <div className="modal-body">
        {tab === 'shape' && <>{image && <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => setImage(null)}>Remove image & use shape</button>}<ShapePicker shape={shape} color={color} onShape={(s: string) => { setShape(s); setImage(null); }} onColor={(c: string) => { setColor(c); setImage(null); }} /></>}
        {tab === 'generate' && (
          <div className="field"><label>Describe the avatar</label>
            <textarea rows={3} value={gen} onChange={(e) => setGen(e.target.value)} placeholder="e.g. a calm teal helper" />
            <div className="btn-row"><button className="btn" onClick={generate}>Generate</button></div>
            {genNote && <div className="muted" style={{ marginTop: 8 }}>{genNote}</div>}
          </div>
        )}
        {tab === 'upload' && (
          <div className="field"><label>Upload image (max 25MB)</label>
            <input type="file" accept="image/*" onChange={upload} />
            <div className="muted" style={{ marginTop: 6 }}>JPEG/PNG/GIF. Trimmed to a rounded square.</div>
          </div>
        )}
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="btn-row">
          <button className="btn primary" onClick={save}>Save</button>
          <button className="btn" onClick={close}>Cancel</button>
          <div className="grow" />
          {!isPrimary && <button className="btn sm" onClick={async () => { await api.settings({ primaryBotId: bot.id }); await actions.refreshBots(); }}>Make Primary</button>}
        </div>
      </div>
    </>
  );
}

// ---- Settings ----------------------------------------------------------
function Settings({ close }: any) {
  const s = useStore((x) => x.settings);
  const [tab, setTab] = useState('appearance');
  const set = (p: any) => api.settings(p);
  const tabs = ['account', 'appearance', 'language', 'computer', 'bot', 'timezone', 'autoReview', 'rules', 'apps', 'skills', 'vault', 'notifications', 'updates'];
  const labels: any = { autoReview: 'Auto Review', apps: 'Connect Apps', rules: 'Custom Rules' };
  return (
    <>
      <Header title="Settings" close={close} />
      <div className="tabbar" style={{ flexWrap: 'wrap' }}>
        {tabs.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{labels[t] || t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className="modal-body">
        {tab === 'account' && <>
          <div className="field"><label>Your name</label><input defaultValue={s.user?.name} onBlur={(e) => set({ user: { ...s.user, name: e.target.value } })} /></div>
          <div className="field"><label>Initials</label><input defaultValue={s.user?.initials} maxLength={3} onBlur={(e) => set({ user: { ...s.user, initials: e.target.value.toUpperCase() } })} /></div>
          <div className="muted">Engine mode: <b>{getState().engine}</b> — {getState().engine === 'simulation' ? 'offline simulation (no API key). Set ANTHROPIC_API_KEY to use a live model.' : 'live Claude model.'}</div>
        </>}
        {tab === 'appearance' && <div className="field"><label>Theme</label>
          <div className="seg">{['light', 'dark', 'system'].map((m) => <button key={m} className={s.appearance === m ? 'on' : ''} onClick={() => set({ appearance: m })}>{m}</button>)}</div>
        </div>}
        {tab === 'language' && <div className="field"><label>Language</label>
          <select value={s.language} onChange={(e) => set({ language: e.target.value })}><option value="ja">日本語</option><option value="en">English</option></select>
          <div className="muted" style={{ marginTop: 8 }}>Affects labels where translated; content follows the Bot.</div>
        </div>}
        {tab === 'computer' && <div className="field"><label>Local computer access</label>
          <div className="seg">{[['ask', 'Ask every time'], ['always', 'Always allow'], ['never', 'Never allow']].map(([v, l]) => <button key={v} className={s.computerPermission === v ? 'on' : ''} onClick={() => set({ computerPermission: v })}>{l}</button>)}</div>
          <div className="muted" style={{ marginTop: 8 }}>Bots always have their own cloud computer; this controls your local machine only.</div>
        </div>}
        {tab === 'bot' && <div className="field"><label>Primary Bot</label>
          <select value={s.primaryBotId || ''} onChange={(e) => set({ primaryBotId: e.target.value })}>
            {getState().bots.filter((b) => b.kind === 'bot').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => actions.setModal('states')}>Preview avatar states →</button>
        </div>}
        {tab === 'timezone' && <div className="field"><label>Timezone</label><input defaultValue={s.timezone} onBlur={(e) => set({ timezone: e.target.value })} /><div className="muted" style={{ marginTop: 6 }}>Used to schedule routines.</div></div>}
        {tab === 'autoReview' && <>
          <div className="row-between"><div><b>Auto Review</b><div className="muted">A reviewer evaluates proposed actions against your rules before they run.</div></div>
            <button className={`switch ${s.autoReview ? 'on' : ''}`} onClick={() => set({ autoReview: !s.autoReview })}><i /></button></div>
        </>}
        {tab === 'rules' && <RulesPane />}
        {tab === 'apps' && <ConnectApps embedded />}
        {tab === 'skills' && <SkillsModal embedded />}
        {tab === 'vault' && <div className="muted">The Vault stores credentials your Bots use (connected accounts). Nothing sensitive is kept in this build; connect apps under Connect Apps.</div>}
        {tab === 'notifications' && <div className="field"><label>Notifications</label><div className="muted">Grouped notifications with Bot icons. (Local only in this build.)</div></div>}
        {tab === 'updates' && <div className="muted">GODAgent build v0.1 — recreation of the Grok Bot experience. Avatar refresh: bigger eyes, 12 shapes (square, sparkle, clover, flower, heart, house, star + base shapes).</div>}
      </div>
    </>
  );
}

function RulesPane() {
  return (
    <>
      <div className="muted" style={{ marginBottom: 10 }}>“Always allow” on an approval card saves an Allow rule here, so similar actions run on their own. At 20 Allow rules, a new one replaces the oldest. A “Require approval” rule always beats an “Allow” rule when both match.</div>
      <div className="list-item"><div className="grow"><b>Default</b><div className="muted">Consequential actions (send, post, delete, buy) require your approval.</div></div></div>
      <div className="muted">Create allow rules by choosing “Always allow” on an approval card in chat.</div>
    </>
  );
}

// ---- Memory ------------------------------------------------------------
function MemoryModal({ data, close }: any) {
  const memory = useStore((s) => s.memory[data.id] || []);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('fact');
  async function add() { if (!text.trim()) return; await api.addMemory(data.id, kind, text); setText(''); refresh(); }
  async function refresh() { const d = await api.bot(data.id); getState().memory[data.id] = d.memory; actions.setModal('memory', data); }
  return (
    <>
      <Header title={`${data.name} · Memory`} close={close} />
      <div className="modal-body">
        <div className="muted" style={{ marginBottom: 10 }}>Durable facts, preferences and standing instructions. You can correct or forget any item.</div>
        {memory.map((m: any) => (
          <div key={m.id} className="list-item">
            <span className="pill-badge pending" style={{ textTransform: 'capitalize' }}>{m.kind}</span>
            <span className="grow">{m.text}</span>
            <button className="btn sm danger" onClick={async () => { await api.delMemory(data.id, m.id); refresh(); }}>Forget</button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 12 }}><label>Add to memory</label>
          <div className="btn-row">
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 130 }}><option value="fact">Fact</option><option value="preference">Preference</option><option value="instruction">Instruction</option></select>
            <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Prefers short replies" onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn primary" onClick={add}>Add</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Routines ----------------------------------------------------------
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
      <Header title={`${data.name} · Routines`} close={close} />
      <div className="modal-body">
        {!draft && <>
          {routines.length === 0 && <div className="muted">No routines yet. Routines run skills or prompts on a schedule or an event.</div>}
          {routines.map((r) => (
            <div key={r.id} className="list-item">
              <div className="grow"><b>{r.name || '(untitled)'}</b><div className="muted">{trigLabel(r.trigger)} · {r.runs?.length || 0} runs</div></div>
              <button className={`switch ${r.enabled ? 'on' : ''}`} onClick={() => api.patchRoutine(r.id, { enabled: !r.enabled }).then(() => actions.refreshBots())}><i /></button>
              <button className="btn sm" onClick={() => api.runRoutine(r.id)}>Run</button>
              <button className="btn sm" onClick={() => setDraft({ ...r })}>Edit</button>
              <button className="btn sm danger" onClick={() => api.delRoutine(r.id).then(() => actions.refreshBots()).then(() => actions.setModal('routines', data))}>Delete</button>
            </div>
          ))}
          <div className="btn-row"><button className="btn primary" onClick={() => setDraft(blank())}>New routine</button></div>
        </>}
        {draft && <>
          <div className="field"><label>Name</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Morning briefing" /></div>
          <div className="grid2">
            <div className="field"><label>Trigger</label>
              <select value={draft.trigger.kind} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, kind: e.target.value } })}>
                {cat.triggerKinds.map((k: string) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {['time', 'daily', 'weekly', 'monthly'].includes(draft.trigger.kind) && <div className="field"><label>At (HH:MM)</label><input value={draft.trigger.at || '09:00'} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, at: e.target.value } })} /></div>}
            {draft.trigger.kind === 'interval' && <div className="field"><label>Every (minutes)</label><input type="number" value={draft.trigger.minutes || 60} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, minutes: +e.target.value } })} /></div>}
            {draft.trigger.kind === 'weekly' && <div className="field"><label>Weekday</label><input value={draft.trigger.weekday || 'Mon'} onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, weekday: e.target.value } })} /></div>}
          </div>
          <div className="field"><label>Skill (optional)</label>
            <select value={draft.skillId || ''} onChange={(e) => setDraft({ ...draft, skillId: e.target.value || null })}>
              <option value="">— none —</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Prompt</label><textarea rows={3} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="What should the Bot do when this fires?" /></div>
          <div className="btn-row"><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
        </>}
      </div>
    </>
  );
}
function trigLabel(t: any) {
  if (!t) return '';
  if (t.kind === 'interval') return `Every ${t.minutes || 60} min`;
  if (t.kind === 'weekly') return `Weekly ${t.weekday || 'Mon'} ${t.at || ''}`;
  if (['daily', 'time'].includes(t.kind)) return `Daily ${t.at || ''}`;
  if (t.kind === 'monthly') return `Monthly day ${t.day || 1} ${t.at || ''}`;
  return t.kind;
}

// ---- Connect Apps ------------------------------------------------------
function ConnectApps({ close, embedded }: any) {
  const apps = getState().apps;
  const conns = useStore((s) => s.connections);
  const [q, setQ] = useState('');
  const body = (
    <>
      <div className="search" style={{ margin: '0 0 12px' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {apps.filter((a: any) => a.name.toLowerCase().includes(q.toLowerCase())).map((a: any) => {
        const c = conns[a.id]; const connected = c?.status === 'connected';
        return (
          <div key={a.id} className="app-tile" style={{ marginBottom: 10 }}>
            <div className="app-logo" style={{ background: logoColor(a.id) }}>{a.name[0]}</div>
            <div className="grow"><b>{a.name}</b><div className="muted">{a.desc}</div>
              {connected && <div className="muted" style={{ fontSize: 11 }}>Tools: {a.tools.join(', ')}</div>}</div>
            {connected
              ? <button className="btn sm" onClick={() => api.disconnect(a.id)}>Disconnect</button>
              : <button className="btn sm primary" onClick={() => api.connect(a.id)}>Connect</button>}
          </div>
        );
      })}
    </>
  );
  if (embedded) return body;
  return <><Header title="Connect Apps" close={close} /><div className="modal-body">{body}</div></>;
}
function logoColor(id: string) { const p = ['#D93025', '#1A73E8', '#0F9D58', '#611f69', '#111', '#5E6AD2', '#00A1E0', '#111', '#1A73E8', '#FF7A59']; let h = 0; for (const c of id) h += c.charCodeAt(0); return p[h % p.length]; }

// ---- Skills ------------------------------------------------------------
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
              <div className="muted" style={{ fontSize: 11 }}>{s.scope === 'account' ? 'Account-level' : 'Bot-specific'} · {s.steps?.length || 0} steps</div></div>
            <button className="btn sm" onClick={() => setDraft({ ...s })}>Edit</button>
            <button className="btn sm danger" onClick={async () => { await api.delSkill(s.id); const b = await api.bootstrap(); getState().skills = b.skills; actions.setModal(embedded ? 'settings' : 'skills'); }}>Delete</button>
          </div>
        ))}
        <div className="btn-row"><button className="btn primary" onClick={() => setDraft(blank())}>New skill</button></div>
      </>}
      {draft && <>
        <div className="field"><label>Name</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="field"><label>Description</label><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
        <div className="field"><label>Steps (one per line)</label><textarea rows={4} value={(draft.steps || []).join('\n')} onChange={(e) => setDraft({ ...draft, steps: e.target.value.split('\n').filter(Boolean) })} /></div>
        <div className="field"><label>Scope</label><div className="seg"><button className={draft.scope === 'account' ? 'on' : ''} onClick={() => setDraft({ ...draft, scope: 'account' })}>Account</button><button className={draft.scope === 'bot' ? 'on' : ''} onClick={() => setDraft({ ...draft, scope: 'bot' })}>Bot</button></div></div>
        <div className="btn-row"><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
      </>}
    </>
  );
  if (embedded) return body;
  return <><Header title="Skills" close={close} /><div className="modal-body">{body}</div></>;
}

// ---- State preview (verification aid) ----------------------------------
function StatePreview({ close }: any) {
  const bot = getState().bots.find((b) => b.id === getState().activeId) || getState().bots[0];
  const states = getState().catalog.states;
  return (
    <>
      <Header title="Avatar states" close={close} />
      <div className="modal-body">
        <div className="state-grid">
          {states.map((st: string) => (
            <div key={st} className="state-cell">
              <div style={{ display: 'grid', placeItems: 'center' }}><AvatarCanvas shape={bot.shape} color={bot.color} state={st} size={88} interactive={false} /></div>
              <div className="lab">{st}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
