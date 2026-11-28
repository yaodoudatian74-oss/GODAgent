import { useEffect, useState } from 'react';
import { useStore, getState } from '../store';
import { api, STANDALONE } from '../api';
import * as hf from '../localai/hf';
import { BUILTIN } from '../localai/builtin';

type Row = { id: string; label?: string; note?: string; downloads?: number };

export function ModelsPane() {
  const settings = useStore((s) => s.settings);
  const [inst, setInst] = useState(hf.installed());
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const refresh = () => setInst(hf.installed());
  const def = settings.defaultModel || 'sim';

  async function doSearch() {
    setBusy(true); setErr('');
    try { setResults(await hf.search(q.trim())); } catch (e: any) { setErr(netMsg(e)); }
    setBusy(false);
  }

  return (
    <>
      <div className="muted" style={{ marginBottom: 12 }}>
        Hugging Face の公開モデルを端末にダウンロードし、Bot がそのモデルで応答します。<b>ログイン・トークンは不要</b>です。
        初回だけ通信が必要で、以後はオフラインで動作します。{hf.hasWebGPU() ? '（WebGPU が使える端末では自動的に高速化します）' : '（WebAssembly で動作します）'}
      </div>
      <div className="muted" style={{ marginBottom: 12, background: 'var(--card, rgba(127,127,127,.08))', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
        ⚠ スマホでは<b>軽量モデル（SmolLM2 135M）</b>をおすすめします。大きいモデルは読み込み時にメモリを多く使い、端末によっては<b>アプリが落ちる（再起動する）</b>ことがあります。大きいモデルはダウンロード前に確認が表示されます。
      </div>
      {!STANDALONE && <div className="muted" style={{ marginBottom: 12, color: 'var(--danger)' }}>※ サーバー版では Bot への割り当てはできません。アプリ版（APK／オフライン版）でご利用ください。</div>}

      <div className="section-label" style={{ padding: '6px 0' }}>内蔵モデル（AIチーム用・インストール済み）</div>
      <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
        各チーム（ゲーム・画像・動画・編集）に<b>最初から割り当て済み</b>のオリジナル小型モデルです。ダウンロード不要・完全オフラインで動きます。小型のため短い案を生成します（文脈理解はありません）。
      </div>
      {BUILTIN.map((b) => (
        <div key={b.id} className="list-item" style={{ padding: '8px 12px' }}>
          <div className="grow"><b style={{ wordBreak: 'break-all' }}>{b.label}</b><div className="muted">{b.note}・内蔵</div></div>
          <span className="pill-badge done"><span className="d" />インストール済み</span>
        </div>
      ))}

      <div className="field" style={{ marginTop: 12 }}><label>既定のモデル（Bot ごとの指定が無い場合）</label>
        <select value={def} onChange={(e) => api.settings({ defaultModel: e.target.value })}>
          <option value="sim">内蔵シミュレーション（ダウンロード不要）</option>
          {inst.map((m) => <option key={m.id} value={'hf:' + m.id}>{m.id}</option>)}
        </select>
      </div>

      {inst.length > 0 && <>
        <div className="section-label" style={{ padding: '6px 0' }}>ダウンロード済み</div>
        {inst.map((m) => (
          <div key={m.id} className="list-item">
            <div className="grow"><b style={{ wordBreak: 'break-all' }}>{m.id}</b><div className="muted">{hf.fmtBytes(m.bytes)}・{m.dtype}</div></div>
            {def !== 'hf:' + m.id && <button className="btn sm" onClick={() => api.settings({ defaultModel: 'hf:' + m.id })}>既定にする</button>}
            <button className="btn sm danger" onClick={async () => {
              if (!confirm(`${m.id} を削除しますか？`)) return;
              await hf.remove(m.id);
              if (def === 'hf:' + m.id) await api.settings({ defaultModel: 'sim' });
              refresh();
            }}>削除</button>
          </div>
        ))}
      </>}

      <div className="section-label" style={{ padding: '6px 0' }}>おすすめ</div>
      {hf.RECOMMENDED.map((r) => <ModelRow key={r.id} row={r} installed={inst.some((m) => m.id === r.id)} onDone={refresh} />)}

      <div className="section-label" style={{ padding: '10px 0 6px' }}>Hugging Face で探す</div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input style={{ flex: 1, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 11px', background: 'var(--panel)', color: 'var(--text)' }}
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：Qwen、Llama、gemma（空欄で人気順）" onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <button className="btn primary" onClick={doSearch} disabled={busy}>{busy ? '検索中…' : '検索'}</button>
      </div>
      {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
      {results && results.length === 0 && <div className="muted" style={{ marginTop: 8 }}>該当するモデルが見つかりませんでした。</div>}
      <div style={{ marginTop: 10 }}>
        {results?.map((r) => <ModelRow key={r.id} row={r} installed={inst.some((m) => m.id === r.id)} onDone={refresh} />)}
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        対象：transformers.js 対応の文章生成モデル（onnx 形式）。サイズはダウンロード前に Hugging Face から実際の値を取得して表示します。大きいモデルは端末のメモリを多く使います。
      </div>
    </>
  );
}

function ModelRow({ row, installed, onDone }: { row: Row; installed: boolean; onDone: () => void }) {
  const [info, setInfo] = useState<{ dtype: string; bytes: number } | null>(null);
  const [infoErr, setInfoErr] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    hf.inspect(row.id).then((i) => live && setInfo(i)).catch((e) => live && setInfoErr(netMsg(e)));
    return () => { live = false; };
  }, [row.id]);

  async function download() {
    const risk = info ? hf.memoryRisk(info.bytes) : 'ok';
    if (risk !== 'ok') {
      const gb = hf.deviceMemoryGB();
      const mem = gb ? `この端末のメモリは約${gb}GBです。` : '';
      const head = risk === 'danger'
        ? `このモデルは大きく、${mem}読み込み中にメモリ不足でアプリが落ちる可能性が高いです。`
        : `このモデルはやや大きく、${mem}端末によっては読み込み中にアプリが落ちることがあります。`;
      if (!confirm(`${head}\nより軽量なモデル（SmolLM2 135M など）をおすすめします。\n\nそれでもダウンロードしますか？`)) return;
    }
    setErr(''); setPct(0);
    try {
      await hf.load(row.id, info?.dtype, (p) => setPct(p.pct));
      setPct(null); onDone();
    } catch (e: any) { setPct(null); setErr(netMsg(e)); }
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap' }}>
      <div className="grow" style={{ minWidth: 180 }}>
        <b style={{ wordBreak: 'break-all' }}>{row.label || row.id}</b>
        <div className="muted" style={{ wordBreak: 'break-all' }}>
          {row.label ? row.id + '・' : ''}{row.note ? row.note + '・' : ''}
          {info ? `${hf.fmtBytes(info.bytes)}（${info.dtype}）` : infoErr ? infoErr : 'サイズ確認中…'}
          {info && hf.memoryRisk(info.bytes) === 'danger' ? '・⚠大きい（落ちる可能性）' : info && hf.memoryRisk(info.bytes) === 'risky' ? '・⚠やや大きい' : ''}
          {row.downloads ? `・${row.downloads.toLocaleString()} DL` : ''}
        </div>
        {pct !== null && <div style={{ marginTop: 8 }}>
          <div style={{ height: 6, background: 'var(--selected)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: 'var(--done)', transition: 'width .2s' }} />
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>ダウンロード中… {pct}%</div>
        </div>}
        {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</div>}
      </div>
      {installed
        ? <span className="pill-badge done"><span className="d" />ダウンロード済み</span>
        : <button className="btn sm primary" disabled={pct !== null || !!infoErr} onClick={download}>{pct !== null ? '取得中…' : 'ダウンロード'}</button>}
    </div>
  );
}

function netMsg(e: any) {
  const m = String(e?.message || e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Hugging Face に接続できません（通信環境、またはこの表示環境の制限を確認してください）';
  return m;
}

export function modelLabel(id?: string) {
  const m = id || getState().settings.defaultModel || 'sim';
  if (!m || m === 'sim') return '内蔵シミュレーション';
  return m.replace(/^hf:/, '').split('/').pop();
}
