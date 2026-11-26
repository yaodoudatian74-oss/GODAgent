import { useStore, actions, getState } from '../store';
import { api } from '../api';

export function ComputerPanel() {
  const c = useStore((s) => s.computer) || {};
  const botId = getState().activeId || undefined;
  const takeover = c.status === 'takeover';

  return (
    <aside className="preview">
      <div className="preview-head">
        <strong style={{ fontSize: 14 }}>Computer</strong>
        <span className="muted" style={{ fontSize: 12 }}>{c.available ? (takeover ? 'You are in control' : 'Bot is in control') : 'Unavailable'}</span>
        <div className="grow" />
        <button className="icon-btn preview-close" onClick={() => actions.setModal(null)}>✕</button>
      </div>
      <div className="preview-body">
        {!c.available ? (
          <div className="muted">The cloud computer is unavailable here ({c.reason || 'Chromium could not start'}). No screen is shown because there is nothing real to display.</div>
        ) : (
          <>
            <div className="browser-frame">
              <div className="browser-bar">
                <span style={{ display: 'flex', gap: 6 }}><i style={dot('#ff5f57')} /><i style={dot('#febc2e')} /><i style={dot('#28c840')} /></span>
                <span className="url">{c.url || 'about:blank'}</span>
              </div>
              {c.shot
                ? <img className="browser-shot" src={c.shot} alt="live screenshot" />
                : <div className="browser-shot" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-faint)', minHeight: 280 }}>Idle</div>}
            </div>
            <div className="btn-row">
              {!takeover
                ? <button className="btn" onClick={() => api.takeover(true, botId)}>Take over</button>
                : <button className="btn primary" onClick={() => api.takeover(false, botId)}>Give control back</button>}
              <button className="btn sm" onClick={() => api.computerOpen('web', botId)}>Open web</button>
              <button className="btn sm" onClick={() => api.computerAct('scroll', 400, botId)}>Scroll</button>
            </div>
            {takeover && <div className="takeover-note">You have the computer. Scroll and navigate, then hand control back to the Bot to continue.</div>}
            {c.activeBotId && <div className="takeover-note">Shared computer · active bot: {getState().bots.find((b) => b.id === c.activeBotId)?.name || c.activeBotId}</div>}
          </>
        )}
      </div>
    </aside>
  );
}
function dot(bg: string) { return { width: 10, height: 10, borderRadius: 999, background: bg, display: 'inline-block' } as React.CSSProperties; }
