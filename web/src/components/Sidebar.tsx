import { useState } from 'react';
import { useStore, actions, getState, Bot } from '../store';
import { AvatarSvg } from '../avatar/Avatar';

function fmtTime(ts: number) {
  const d = new Date(ts); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((now.getTime() - ts) / 86400000);
  if (days < 7) return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function lastLine(botId: string): string {
  const msgs = getState().messages[botId];
  if (!msgs?.length) return '';
  const m = [...msgs].reverse().find((x) => x.type === 'text' && x.text);
  if (!m) { const c = msgs[msgs.length - 1]; return c.type === 'computer' ? 'コンピューターを使用' : c.type; }
  return m.text!.replace(/\s+/g, ' ').slice(0, 60);
}

export function Sidebar() {
  const bots = useStore((s) => s.bots);
  const activeId = useStore((s) => s.activeId);
  const settings = useStore((s) => s.settings);
  const messagesVer = useStore((s) => Object.keys(s.messages).length + ':' + (s.bots[0]?.updatedAt || 0));
  const [q, setQ] = useState('');

  const filtered = bots.filter((b) => !b.hidden && (b.name.toLowerCase().includes(q.toLowerCase()) || (b.title || '').toLowerCase().includes(q.toLowerCase())));
  const pinned = filtered.filter((b) => b.pinned);
  const rest = filtered.filter((b) => !b.pinned);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="traffic"><span className="r" /><span className="y" /><span className="g" /></div>
        <div className="grow" />
        <button className="icon-btn" title="新しいBot" onClick={() => actions.setModal('create')}>＋</button>
      </div>
      <div className="search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bot-list">
        {pinned.length > 0 && <div className="section-label">ピン留め</div>}
        {pinned.map((b) => <Row key={b.id} b={b} active={b.id === activeId} primary={settings.primaryBotId === b.id} _v={messagesVer} />)}
        {pinned.length > 0 && rest.length > 0 && <div className="section-label">Bot</div>}
        {rest.map((b) => <Row key={b.id} b={b} active={b.id === activeId} primary={settings.primaryBotId === b.id} _v={messagesVer} />)}
      </div>
      <div className="sidebar-foot">
        <div className="uava">{settings.user?.initials || 'YOU'}</div>
        <span className="uname">{settings.user?.name || 'あなた'}</span>
        <div className="grow" />
        <button className="icon-btn" title="AIモデル（ダウンロード）" onClick={() => actions.setModal('models')}>🧠</button>
        <button className="icon-btn" title="プロジェクト" onClick={() => actions.setModal('projects')}>📁</button>
        <button className="icon-btn" title="コードスタジオ" onClick={() => actions.setModal('code')}>💻</button>
        <button className="icon-btn" title="スタジオ（音楽・3D・性能）" onClick={() => actions.setModal('studio')}>🎨</button>
        <button className="icon-btn" title="機能一覧（実装状況）" onClick={() => actions.setModal('features')}>📋</button>
        <button className="icon-btn" title="設定" onClick={() => actions.setModal('settings')}>⚙</button>
      </div>
    </aside>
  );
}

function Row({ b, active, primary }: { b: Bot; active: boolean; primary: boolean; _v: string }) {
  const [menu, setMenu] = useState(false);
  const lastTs = getState().messages[b.id]?.slice(-1)[0]?.ts || b.updatedAt;
  function ctx(e: React.MouseEvent) { e.preventDefault(); setMenu(true); }
  return (
    <div className={`bot-row ${active ? 'active' : ''}`} onClick={() => actions.select(b.id)} onContextMenu={ctx}>
      <AvatarSvg shape={b.shape} color={b.color} image={b.avatarImage} size={38} state={b.state} />
      <div className="meta">
        <div className="line1">
          <span className="name">{b.name}</span>
          <span className="time">{fmtTime(lastTs)}</span>
        </div>
        <div className="last">{primary ? 'プライマリBot' : b.kind === 'group' ? `グループ・${b.members.length}` : lastLine(b.id)}</div>
      </div>
      {menu && <RowMenu b={b} close={() => setMenu(false)} />}
    </div>
  );
}

function RowMenu({ b, close }: { b: Bot; close: () => void }) {
  function act(fn: () => void) { return (e: React.MouseEvent) => { e.stopPropagation(); fn(); close(); }; }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={act(() => {})} />
      <div style={{ position: 'absolute', right: 8, top: 44, zIndex: 21, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 6, minWidth: 170 }} onClick={(e) => e.stopPropagation()}>
        <MenuItem onClick={act(() => togglePin(b))}>{b.pinned ? 'ピン留め解除' : 'ピン留め'}</MenuItem>
        <MenuItem onClick={act(() => actions.setModal('editAvatar', b))}>アバターを編集…</MenuItem>
        <MenuItem onClick={act(() => actions.setModal('memory', b))}>メモリ…</MenuItem>
        <MenuItem onClick={act(() => actions.setModal('routines', b))}>ルーティン…</MenuItem>
        <MenuItem onClick={act(() => makePrimary(b))}>プライマリBotにする</MenuItem>
        <MenuItem onClick={act(() => hideBot(b))}>非表示</MenuItem>
        <MenuItem danger onClick={act(() => delBot(b))}>削除</MenuItem>
      </div>
    </>
  );
}
function MenuItem({ children, onClick, danger }: any) {
  return <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 10px', borderRadius: 7, fontSize: 13.5, color: danger ? 'var(--danger)' : 'var(--text)' }}>{children}</button>;
}

import { api } from '../api';
async function togglePin(b: Bot) { await api.patchBot(b.id, { pinned: !b.pinned }); }
async function makePrimary(b: Bot) { await api.settings({ primaryBotId: b.id }); }
async function hideBot(b: Bot) { await api.patchBot(b.id, { hidden: true }); }
async function delBot(b: Bot) { if (confirm(`${b.name} を削除しますか？`)) { await api.deleteBot(b.id); } }
