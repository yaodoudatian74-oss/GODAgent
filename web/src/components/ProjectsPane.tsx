import { useEffect, useState } from 'react';
import { useStore, actions, getState } from '../store';
import { api, STANDALONE } from '../api';
import { Card } from './Cards';

const STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: '計画中', cls: 'pending' }, working: { label: '制作中', cls: 'pending' },
  review: { label: '確認待ち', cls: 'pending' }, approved: { label: '完成', cls: 'done' },
  stopped: { label: '停止', cls: 'err' }, error: { label: 'エラー', cls: 'err' },
};

export function ProjectsPane() {
  const projects = useStore((s) => s.projects);
  const [teams, setTeams] = useState<any[]>([]);
  const [team, setTeam] = useState('game');
  const [req, setReq] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { api.teams().then(setTeams); }, []);

  if (!STANDALONE) return <div className="muted">AI社員チーム（自律プロジェクト）はアプリ版（APK／オフライン版）で利用できます。サーバー版では無効です。</div>;

  async function create() {
    if (!req.trim()) return;
    const r = await api.createProject(team, req.trim());
    setReq(''); if (r?.id) setOpen(r.id);
  }

  return (
    <>
      <div className="muted" style={{ marginBottom: 12 }}>
        37人のAI社員が4チームに分かれています。チームに依頼すると、会議→分担→制作→相互確認→提出まで自動で進み、完成物（遊べるゲーム・画像・動画）をここで確認できます。チームのグループチャットでも同じ依頼ができます。
      </div>

      <div className="field"><label>新しい依頼</label>
        <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {teams.map((t) => <button key={t.kind} className={team === t.kind ? 'on' : ''} onClick={() => setTeam(t.kind)}>{t.name}</button>)}
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <input style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 11px', background: 'var(--panel)', color: 'var(--text)' }}
            value={req} onChange={(e) => setReq(e.target.value)} placeholder={placeholderFor(team)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button className="btn primary" onClick={create}>依頼する</button>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{noteFor(team)}</div>
      </div>

      <div className="section-label" style={{ padding: '8px 0' }}>メンバー</div>
      {teams.find((t) => t.kind === team)?.members?.map((m: any) => (
        <div key={m.id} className="list-item" style={{ padding: '8px 12px' }}>
          <div className="grow"><b>{m.name}</b> <span className="muted">{m.role}</span></div>
          <button className="btn sm" onClick={() => { actions.select(m.id); actions.setModal(null); }}>個別チャット</button>
        </div>
      ))}

      <div className="section-label" style={{ padding: '10px 0 6px' }}>プロジェクト</div>
      {projects.length === 0 && <div className="muted">まだありません。上から依頼してください。</div>}
      {projects.map((p) => (
        <div key={p.id} className="list-item" style={{ display: 'block' }}>
          <div className="row-between">
            <div className="grow"><b>{p.title || p.request?.slice(0, 30)}</b><div className="muted">{p.teamName}{p.round > 1 ? `・第${p.round}版` : ''}</div></div>
            <span className={`pill-badge ${STATUS[p.status]?.cls || 'pending'}`}><span className="d" />{STATUS[p.status]?.label || p.status}</span>
          </div>
          <div style={{ height: 6, background: 'var(--selected)', borderRadius: 99, overflow: 'hidden', margin: '8px 0' }}>
            <div style={{ width: (p.progress || 0) + '%', height: '100%', background: p.status === 'approved' ? 'var(--done)' : 'var(--accent)', transition: 'width .3s' }} />
          </div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? '閉じる' : '詳細・成果物'}</button>
            <button className="btn sm" onClick={() => { actions.select(p.groupId); actions.setModal(null); }}>チーム会話</button>
            {p.status !== 'approved' && p.status !== 'stopped' && <button className="btn sm" onClick={() => api.stopProject(p.id)}>停止</button>}
          </div>
          {open === p.id && <ProjectDetail p={p} />}
        </div>
      ))}
    </>
  );
}

function ProjectDetail({ p }: { p: any }) {
  const [note, setNote] = useState('');
  const fresh = useStore((s) => s.projects.find((x) => x.id === p.id)) || p;
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div className="muted" style={{ marginBottom: 8 }}>依頼: {fresh.request}</div>
      <div className="section-label" style={{ padding: '2px 0' }}>担当と進捗</div>
      {(fresh.tasks || []).map((t: any) => (
        <div key={t.memberId} className="row-between" style={{ fontSize: 13, padding: '3px 0' }}>
          <span>{t.name}・{t.role}</span>
          <span className="muted">{({ pending: '待機', working: '作業中', done: '完了' } as any)[t.status] || t.status}{t.note ? `（${t.note}）` : ''}</span>
        </div>
      ))}
      {fresh.deliverables?.length > 0 && <>
        <div className="section-label" style={{ padding: '8px 0 2px' }}>成果物</div>
        {fresh.deliverables.map((d: any, i: number) => <DeliverablePreview key={i} d={d} />)}
      </>}
      {fresh.status === 'review' && <>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => api.approveProject(fresh.id)}>承認（完成）</button>
          <button className="btn" onClick={() => api.stopProject(fresh.id)}>停止</button>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <input style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '8px 10px', background: 'var(--panel)', color: 'var(--text)' }}
              value={note} onChange={(e) => setNote(e.target.value)} placeholder="修正指示を入力…" />
            <button className="btn" disabled={!note.trim()} onClick={() => { api.reviseProject(fresh.id, note); setNote(''); }}>修正指示</button>
          </div>
        </div>
      </>}
    </div>
  );
}

function DeliverablePreview({ d }: { d: any }) {
  if (d.kind === 'game') return <Card m={{ id: 'd', type: 'game', ts: 0, game: { title: d.title, genre: d.genre, html: d.html } } as any} />;
  if (d.kind === 'image') return <Card m={{ id: 'd', type: 'image', ts: 0, img: { dataUrl: d.dataUrl, caption: d.caption } } as any} />;
  if (d.kind === 'video') return <Card m={{ id: 'd', type: 'video', ts: 0, video: { title: d.caption, dataUrl: d.dataUrl } } as any} />;
  return <div className="muted" style={{ fontSize: 13 }}>{d.text}</div>;
}

function placeholderFor(k: string) {
  return ({ game: '例：かわいい宇宙のアイテム収集ゲーム', image: '例：青い宇宙のキービジュアル', videomake: '例：アプリ紹介の30秒動画', videoedit: '例：この動画を見やすく編集して' } as any)[k] || '依頼内容を入力';
}
function noteFor(k: string) {
  return ({
    game: '完成すると実際に遊べるHTMLゲームを出力します（プレビュー・ダウンロード可）。',
    image: 'オリジナルの画像を複数生成します。',
    videomake: '台本から実際のWebM動画を生成します（端末が録画に対応している場合）。',
    videoedit: '編集プランを作成します。素材のアップロードはチャットから。本格的な実編集処理は端末制約により未対応です（理由を表示します）。',
  } as any)[k] || '';
}
