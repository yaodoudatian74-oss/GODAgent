import { useStore, actions, getState } from '../store';
import { api } from '../api';

export function ComputerPanel() {
  const c = useStore((s) => s.computer) || {};
  const botId = getState().activeId || undefined;
  const takeover = c.status === 'takeover';

  return (
    <aside className="preview">
      <div className="preview-head">
        <strong style={{ fontSize: 14 }}>コンピューター</strong>
        <span className="muted" style={{ fontSize: 12 }}>{c.available ? (takeover ? 'あなたが操作中' : 'Botが操作中') : '利用不可'}</span>
        <div className="grow" />
        <button className="icon-btn preview-close" onClick={() => actions.setModal(null)}>✕</button>
      </div>
      <div className="preview-body">
        {!c.available ? (
          <div className="muted">このクラウドコンピューターは利用できません（{c.reason || 'Chromium を起動できませんでした'}）。実際に表示できる画面が無いため、何も表示していません。</div>
        ) : (
          <>
            <div className="browser-frame">
              <div className="browser-bar">
                <span style={{ display: 'flex', gap: 6 }}><i style={dot('#ff5f57')} /><i style={dot('#febc2e')} /><i style={dot('#28c840')} /></span>
                <span className="url">{c.url || 'about:blank'}</span>
              </div>
              {c.mode === 'iframe' && c.url && c.url !== 'about:blank'
                ? <iframe className="browser-shot" src={c.url} title="computer" style={{ border: 0, height: 360, pointerEvents: takeover ? 'auto' : 'none' }} />
                : c.shot
                  ? <img className="browser-shot" src={c.shot} alt="live screenshot" />
                  : <div className="browser-shot" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-faint)', minHeight: 280 }}>待機中</div>}
            </div>
            <div className="btn-row">
              {!takeover
                ? <button className="btn" onClick={() => api.takeover(true, botId)}>操作を引き継ぐ</button>
                : <button className="btn primary" onClick={() => api.takeover(false, botId)}>操作を返す</button>}
              <button className="btn sm" onClick={() => api.computerOpen('web', botId)}>Webを開く</button>
              <button className="btn sm" onClick={() => api.computerAct('scroll', 400, botId)}>スクロール</button>
            </div>
            {takeover && <div className="takeover-note">あなたがコンピューターを操作中です。スクロール・ページ移動を行い、続きはBotに操作を返してください。</div>}
            {c.activeBotId && <div className="takeover-note">共有コンピューター・担当Bot: {getState().bots.find((b) => b.id === c.activeBotId)?.name || c.activeBotId}</div>}
          </>
        )}
      </div>
    </aside>
  );
}
function dot(bg: string) { return { width: 10, height: 10, borderRadius: 999, background: bg, display: 'inline-block' } as React.CSSProperties; }
