import { api } from '../api';
import { actions, Msg } from '../store';

export function Card({ m }: { m: Msg }) {
  switch (m.type) {
    case 'computer': return <ComputerCard m={m} />;
    case 'approval': return <ApprovalCard m={m} />;
    case 'question': return <QuestionCard m={m} />;
    case 'email': return <EmailCard m={m} />;
    case 'memory': return <MemoryCard m={m} />;
    case 'image': return <ImageCard m={m} />;
    case 'handoff': return <HandoffCard m={m} />;
    case 'file': return <FileCard m={m} />;
    case 'error': return <ErrorCard m={m} />;
    case 'routine': return <RoutineCard m={m} />;
    default: return null;
  }
}

function Head({ k, badge }: { k: string; badge?: React.ReactNode }) {
  return <div className="card-head"><span className="k">{k}</span><div className="grow" />{badge}</div>;
}

function statusBadge(status: string) {
  if (status === 'done' || status === 'allowed') return <span className="pill-badge done"><span className="d" />{status === 'allowed' ? '許可' : '完了'}</span>;
  if (status === 'working') return <span className="pill-badge pending"><span className="d" />作業中</span>;
  if (status === 'error' || status === 'denied') return <span className="pill-badge err"><span className="d" />{status === 'denied' ? '拒否' : 'エラー'}</span>;
  if (status === 'pending') return <span className="pill-badge pending"><span className="d" />要対応</span>;
  return null;
}

function ComputerCard({ m }: { m: Msg }) {
  const c = m.computer || {};
  return (
    <div className="card2 bot">
      <Head k="コンピューター" badge={statusBadge(c.status)} />
      <div style={{ fontSize: 14 }}>{c.note}</div>
      {c.shot
        ? <img className="computer-shot" src={c.shot} alt="コンピューターのスクリーンショット" onClick={() => actions.setModal('preview')} />
        : c.status !== 'error' && <div className="computer-shot" onClick={() => actions.setModal('preview')} />}
      {c.url && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => actions.setModal('preview')}>プレビューを開く</button>}
    </div>
  );
}

function ApprovalCard({ m }: { m: Msg }) {
  const a = m.approval || {};
  const resolved = a.status === 'allowed' || a.status === 'denied';
  async function decide(effect: 'allow' | 'deny', always = false) { await api.approve(a.id, effect, always); }
  return (
    <div className="card2 bot">
      <Head k="承認" badge={statusBadge(a.status)} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>{a.action}</div>
      <div className="muted" style={{ marginTop: 2 }}>{a.detail}</div>
      {a.auto && <div className="muted" style={{ marginTop: 6 }}>保存済みルールにより自動承認されました。</div>}
      {!resolved && !a.auto && (
        <div className="btn-row">
          <button className="btn primary" onClick={() => decide('allow', false)}>{a.hasRule ? '許可' : '一度だけ許可'}</button>
          {!a.hasRule && <button className="btn" onClick={() => decide('allow', true)}>常に許可</button>}
          <button className="btn danger" onClick={() => decide('deny')}>拒否</button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ m }: { m: Msg }) {
  const q = m.question || {};
  async function answer(v: string) { await api.answer(q.id, v); }
  return (
    <div className="card2 bot">
      <Head k="質問" />
      <div style={{ fontSize: 14 }}>{q.prompt}</div>
      {q.answer
        ? <div className="muted" style={{ marginTop: 8 }}>選択: <b style={{ color: 'var(--text)' }}>{q.answer}</b></div>
        : q.options
          ? <div className="choice">{q.options.map((o: string) => <button key={o} className="btn" onClick={() => answer(o)}>{o}</button>)}</div>
          : <InlineAnswer onSend={answer} />}
    </div>
  );
}
function InlineAnswer({ onSend }: { onSend: (v: string) => void }) {
  let v = '';
  return <div className="btn-row" style={{ width: '100%' }}>
    <input className="field" style={{ flex: 1 }} placeholder="回答を入力…" onChange={(e) => (v = e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSend(v); }} />
  </div>;
}

function EmailCard({ m }: { m: Msg }) {
  const e = m.email || {};
  return (
    <div className="card2 bot">
      <Head k="メール下書き" badge={e.sent ? statusBadge('done') : <span className="pill-badge pending"><span className="d" />下書き</span>} />
      <div className="email-fields">
        <div className="row"><span className="lab">宛先</span><span>{e.to}</span></div>
        <div className="row"><span className="lab">件名</span><span>{e.subject}</span></div>
        <div className="body">{e.body}</div>
      </div>
    </div>
  );
}

function MemoryCard({ m }: { m: Msg }) {
  return (
    <div className="card2 bot">
      <Head k="メモリ" badge={statusBadge('done')} />
      <div style={{ fontSize: 14 }}>{m.memory?.text}</div>
    </div>
  );
}

function ImageCard({ m }: { m: Msg }) {
  const img = m.img || {};
  return (
    <div className="card2 bot">
      <Head k="画像" badge={statusBadge('done')} />
      {img.dataUrl && <img src={img.dataUrl} alt={img.caption || ''} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />}
      {img.caption && <div className="muted" style={{ marginTop: 8 }}>{img.caption}</div>}
    </div>
  );
}

function HandoffCard({ m }: { m: Msg }) {
  const h = m.handoff || {};
  return (
    <div className="card2 bot">
      <Head k="引き継ぎ" />
      <div className="handoff">引き継ぎ先 <b>{h.toName}</b>: <span className="muted">{h.task}</span></div>
    </div>
  );
}

function FileCard({ m }: { m: Msg }) {
  const f = m.file || {};
  return (
    <div className="card2 bot">
      <Head k="ファイル" />
      <div className="row-between">
        <span>📄 {f.name}</span>
        <div className="grow" />
        {f.id && <a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">ダウンロード</a>}
      </div>
    </div>
  );
}

function ErrorCard({ m }: { m: Msg }) {
  return <div className="card2 bot"><Head k="エラー" badge={statusBadge('error')} /><div style={{ fontSize: 14, color: 'var(--danger)' }}>{m.text}</div></div>;
}

function RoutineCard({ m }: { m: Msg }) {
  return (
    <div className="card2" style={{ alignSelf: 'center', maxWidth: 520, textAlign: 'center', background: 'transparent', border: 'none' }}>
      <div className="system-note">▶ ルーティン「{m.routine?.name}」を実行 — {m.text?.slice(0, 80)}</div>
    </div>
  );
}
