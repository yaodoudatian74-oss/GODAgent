import { useRef, useState } from 'react';
import { api, STANDALONE } from '../api';

// Phase 5 — Code Studio. A real in-app editor that RUNS web code (HTML/CSS/JS)
// in a sandboxed iframe, so the result (a game, a site, an interactive page) is a
// genuine, previewable artifact — not a mock. Other languages can be written and
// saved but not executed inside a WebView, and the app says so honestly.

const STARTER = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;display:grid;place-items:center;height:100vh;background:#0f1020;color:#fff;font-family:sans-serif}
  button{font-size:20px;padding:14px 22px;border:0;border-radius:12px;background:#7C5CFF;color:#fff}
</style></head>
<body>
  <div style="text-align:center">
    <h1 id="t">こんにちは、社長！</h1>
    <button onclick="document.getElementById('t').textContent='ボタンが動きました 🎉'">押してみる</button>
  </div>
</body></html>`;

const RUNNABLE = new Set(['html']);
const LANGS: { id: string; label: string }[] = [
  { id: 'html', label: 'HTML/CSS/JS（実行可）' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' }, { id: 'kotlin', label: 'Kotlin' },
  { id: 'c', label: 'C' }, { id: 'cpp', label: 'C++' }, { id: 'csharp', label: 'C#' },
  { id: 'rust', label: 'Rust' }, { id: 'sql', label: 'SQL' }, { id: 'glsl', label: 'GLSL' },
];

export function CodeStudioPane() {
  const [lang, setLang] = useState('html');
  const [code, setCode] = useState(STARTER);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [aiReq, setAiReq] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const runnable = RUNNABLE.has(lang);

  function run() {
    if (!runnable) { setNote(`${lang} はアプリ内（WebView）では実行できません。HTML/CSS/JS のみ実行できます。コードの閲覧・保存は可能です。`); return; }
    setNote(''); setSrcdoc(code);
  }
  function download() {
    const ext = ({ html: 'html', javascript: 'js', typescript: 'ts', python: 'py', java: 'java', kotlin: 'kt', c: 'c', cpp: 'cpp', csharp: 'cs', rust: 'rs', sql: 'sql', glsl: 'glsl' } as any)[lang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'godagent-code.' + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function aiGen() {
    if (!aiReq.trim()) return;
    setBusy(true); setNote('');
    try {
      const r = await api.genCode(lang, aiReq.trim());
      if (r?.code) { setCode(r.code); setNote(r.modelUsed ? 'AIモデルで生成しました。' : 'モデル未導入のため、動作するテンプレートを挿入しました（設定→モデルで導入するとAI生成になります）。'); }
      else setNote('生成できませんでした。');
    } catch { setNote('生成中にエラーが発生しました。'); }
    setBusy(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart, en = t.selectionEnd; const v = t.value; const nv = v.slice(0, s) + '  ' + v.slice(en); setCode(nv); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
  }

  if (!STANDALONE) return <div className="muted">コードスタジオはアプリ版（APK／オフライン版）で利用できます。</div>;

  return (
    <>
      <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
        アプリ内でコードを書き、HTML/CSS/JS はその場で<b>実行</b>してプレビューできます（遊べるゲームやサイトになります）。他の言語は閲覧・保存に対応します（WebView内では実行できないため、理由を表示します）。
      </div>
      <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {LANGS.map((l) => <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>)}
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <div className="btn-row" style={{ marginTop: 0, marginBottom: 6 }}>
          <input style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '8px 10px', background: 'var(--panel)', color: 'var(--text)' }}
            value={aiReq} onChange={(e) => setAiReq(e.target.value)} placeholder="AIにコードを作らせる（例：玉をよけるゲーム）" onKeyDown={(e) => e.key === 'Enter' && aiGen()} />
          <button className="btn" onClick={aiGen} disabled={busy}>{busy ? '生成中…' : 'AI生成'}</button>
        </div>
        <textarea ref={taRef} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown}
          spellCheck={false} wrap="off"
          style={{ width: '100%', height: 260, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 13, lineHeight: 1.5, border: '1px solid var(--border-strong)', borderRadius: 10, padding: 10, background: '#0e1116', color: '#e6edf3', whiteSpace: 'pre', overflow: 'auto' }} />
      </div>

      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn primary" onClick={run} disabled={!runnable} title={runnable ? '' : 'HTML/CSS/JS のみ実行できます'}>▶ 実行</button>
        <button className="btn" onClick={download}>保存（ダウンロード）</button>
        {srcdoc !== null && <button className="btn sm" onClick={() => setSrcdoc(null)}>プレビューを閉じる</button>}
      </div>
      {note && <div className="muted" style={{ color: 'var(--amber,#a66300)', marginTop: 8, fontSize: 13 }}>{note}</div>}

      {srcdoc !== null && (
        <div style={{ marginTop: 12 }}>
          <div className="section-label" style={{ padding: '4px 0' }}>実行結果（アーティファクト）</div>
          <iframe title="code-result" sandbox="allow-scripts allow-pointer-lock" srcDoc={srcdoc}
            style={{ width: '100%', height: 360, border: '1px solid var(--border)', borderRadius: 10, background: '#0f1020' }} />
        </div>
      )}

      <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
        実行は端末内のサンドボックス（iframe）で行われ、外部には送信されません。対応していない実行形式（APK/EXEビルド、サーバー実行など）は端末制約により非対応です。
      </div>
    </>
  );
}
