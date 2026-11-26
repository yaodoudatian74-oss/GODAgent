import { useEffect, useRef, useState } from 'react';
import { useStore, actions, getState, Msg } from '../store';
import { api } from '../api';
import { AvatarCanvas } from '../avatar/Avatar';
import { Card } from './Cards';

export function Chat() {
  const activeId = useStore((s) => s.activeId);
  const bot = useStore((s) => s.bots.find((b) => b.id === s.activeId) || null);
  const msgs = useStore((s) => (s.activeId ? s.messages[s.activeId] : null));
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs?.length, msgs?.[msgs.length - 1]?.text]);

  if (!bot) return <section className="chat" />;
  const busy = bot.state === 'thinking' || bot.state === 'working';

  return (
    <section className="chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={() => actions.setMobilePane('list')}>‹</button>
        <AvatarCanvas shape={bot.shape} color={bot.color} state={bot.state} image={bot.avatarImage} size={30} interactive={false} />
        <div>
          <div className="title">{bot.name}</div>
          <div className="subtitle">{stateLabel(bot.state)}{bot.title ? ` · ${bot.title}` : ''}</div>
        </div>
        <div className="grow" />
        <button className="icon-btn" title="Computer" onClick={() => actions.setModal('preview')}>🖥</button>
        <button className="icon-btn" title="Bot details" onClick={() => actions.setModal('editAvatar', bot)}>⋯</button>
      </header>

      <div className="chat-scroll" ref={scroller}>
        <div className="msgs">
          {(msgs || []).map((m, i) => <MsgView key={m.id} m={m} prev={msgs![i - 1]} />)}
        </div>
      </div>

      <Composer botId={activeId!} busy={busy} />
    </section>
  );
}

function stateLabel(s: string) {
  return ({ idle: 'Idle', thinking: 'Thinking…', working: 'Working…', waiting: 'Waiting for you', blocked: 'Needs your help', done: 'Done' } as any)[s] || s;
}

function MsgView({ m, prev }: { m: Msg; prev?: Msg }) {
  const showTime = !prev || (m.ts - prev.ts > 10 * 60000);
  const time = <div className="ts-sep">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>;
  if (m.type === 'text') {
    return <>
      {showTime && time}
      <div className={`bubble ${m.role === 'user' ? 'user' : 'bot'} ${m.streaming ? 'cursor-blink' : ''}`}>{m.text}</div>
      {m.files?.length ? <div className="muted" style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', fontSize: 12 }}>{m.files.map((f: any) => f.name).join(', ')}</div> : null}
    </>;
  }
  if (m.type === 'routine' && m.role === 'user') return <Card m={m} />;
  return <>{showTime && time}<Card m={m} /></>;
}

function Composer({ botId, busy }: { botId: string; busy: boolean }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const bot = getState().bots.find((b) => b.id === botId);
  const ta = useRef<HTMLTextAreaElement>(null);

  function grow() { const el = ta.current!; el.style.height = 'auto'; el.style.height = Math.min(180, el.scrollHeight) + 'px'; }

  async function submit() {
    const t = text.trim(); if (!t && files.length === 0) return;
    setText(''); setFiles([]); setTimeout(() => { if (ta.current) ta.current.style.height = 'auto'; }, 0);
    await actions.send(t || '(sent files)', files);
  }
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { alert('File exceeds the 25MB limit'); return; }
    const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
    const meta = await api.uploadFile(f.name, f.type, dataUrl);
    setFiles((x) => [...x, meta]);
  }

  return (
    <div className="composer">
      {files.length > 0 && <div className="attach-row">{files.map((f) => <span key={f.id} className="chip">📎 {f.name} <button style={{ border: 'none', background: 'none' }} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>✕</button></span>)}</div>}
      <div className="composer-inner">
        <label className="round" title="Attach">
          ＋<input type="file" hidden onChange={pickFile} />
        </label>
        <textarea ref={ta} value={text} placeholder={`Message ${bot?.name || ''}`} rows={1}
          onChange={(e) => { setText(e.target.value); grow(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        {busy
          ? <button className="round" title="Stop" onClick={() => api.stop(botId)}>■</button>
          : <button className="round send" title="Send" disabled={!text.trim() && files.length === 0} onClick={submit}>↑</button>}
      </div>
    </div>
  );
}
