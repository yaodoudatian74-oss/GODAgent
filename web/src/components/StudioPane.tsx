import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api, STANDALONE } from '../api';

// Studio: small but REAL creative/utility tools that a phone WebView can actually do.
//  - 音楽：Web Audio で手続き的にメロディを合成し、本物の WAV ファイルを書き出す。
//  - 3D：立方体/ピラミッド/地形を実際の OBJ として生成し、ワイヤーフレーム表示＋保存。
//  - 性能：端末負荷を抑える性能モードを切り替える（実際に動作速度へ反映）。
// 本物の text→音楽生成AIや text→3D生成AIは端末では動かせないため、ここでは行わない
// （機能一覧に理由を明示）。これは「手続き的生成」の実ツールです。

export function StudioPane() {
  const [tab, setTab] = useState<'music' | 'model3d' | 'perf'>('music');
  if (!STANDALONE) return <div className="muted">スタジオはアプリ版（APK／オフライン版）で利用できます。</div>;
  return (
    <>
      <div className="tabbar">
        <button className={tab === 'music' ? 'on' : ''} onClick={() => setTab('music')}>音楽・音声</button>
        <button className={tab === 'model3d' ? 'on' : ''} onClick={() => setTab('model3d')}>3Dモデル</button>
        <button className={tab === 'perf' ? 'on' : ''} onClick={() => setTab('perf')}>性能モード</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {tab === 'music' && <MusicStudio />}
        {tab === 'model3d' && <ModelStudio />}
        {tab === 'perf' && <PerfStudio />}
      </div>
    </>
  );
}

// ---- 音楽・音声（手続き的合成 → 実WAV） ---------------------------------
const SCALES: Record<string, number[]> = {
  明るい: [0, 2, 4, 7, 9], 落ち着いた: [0, 3, 5, 7, 10], 和風: [0, 2, 5, 7, 9], 幻想的: [0, 2, 3, 7, 8],
};
function MusicStudio() {
  const [mood, setMood] = useState('明るい');
  const [tempo, setTempo] = useState(110);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function gen() {
    setBusy(true); setNote(''); setUrl(null);
    try {
      const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!AC) { setNote('この端末は音声合成（OfflineAudioContext）に対応していません。'); setBusy(false); return; }
      const sr = 44100, beats = 16, spb = 60 / tempo, dur = beats * spb + 0.5;
      const ctx = new AC(1, Math.ceil(sr * dur), sr);
      const scale = SCALES[mood] || SCALES['明るい'];
      const base = 261.63; // C4
      const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      let seed = mood.length * 7 + tempo;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let i = 0; i < beats; i++) {
        const deg = scale[Math.floor(rnd() * scale.length)];
        const oct = rnd() < 0.3 ? 2 : 1;
        const freq = base * Math.pow(2, deg / 12) * oct;
        const t0 = i * spb;
        const osc = ctx.createOscillator(); osc.type = i % 4 === 0 ? 'triangle' : 'sine'; osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + spb * 0.9);
        osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + spb);
        // simple bass every beat
        if (i % 2 === 0) {
          const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = freq / 2;
          const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t0); bg.gain.linearRampToValueAtTime(0.18, t0 + 0.02); bg.gain.exponentialRampToValueAtTime(0.001, t0 + spb);
          b.connect(bg); bg.connect(master); b.start(t0); b.stop(t0 + spb);
        }
      }
      const buf = await ctx.startRendering();
      const wav = encodeWAV(buf);
      setUrl(URL.createObjectURL(wav));
      setNote(`WAVを生成しました（${mood}・${tempo}BPM・約${dur.toFixed(1)}秒）。`);
    } catch (e: any) { setNote('生成中にエラー：' + (e?.message || e)); }
    setBusy(false);
  }
  function download() { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `godagent-${mood}-${tempo}bpm.wav`; a.click(); }

  return (
    <>
      <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>Web Audio で手続き的にメロディ＋ベースを合成し、<b>本物のWAVファイル</b>を端末内で書き出します（オフライン・外部送信なし）。</div>
      <div className="field"><label>雰囲気</label>
        <div className="seg" style={{ flexWrap: 'wrap' }}>{Object.keys(SCALES).map((m) => <button key={m} className={mood === m ? 'on' : ''} onClick={() => setMood(m)}>{m}</button>)}</div>
      </div>
      <div className="field"><label>テンポ：{tempo} BPM</label><input type="range" min={70} max={160} value={tempo} onChange={(e) => setTempo(+e.target.value)} style={{ width: '100%' }} /></div>
      <div className="btn-row"><button className="btn primary" onClick={gen} disabled={busy}>{busy ? '生成中…' : '音楽を生成'}</button>{url && <button className="btn" onClick={download}>WAVを保存</button>}</div>
      {note && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{note}</div>}
      {url && <audio src={url} controls style={{ width: '100%', marginTop: 10 }} />}
      <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>※ 本物のAI作曲モデル（text→音楽）は端末では実行できないため、ここは手続き的合成です。</div>
    </>
  );
}

function encodeWAV(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i])); data.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([data], { type: 'audio/wav' });
}

// ---- 3Dモデル（手続き的 → 実OBJ） --------------------------------------
function buildObj(kind: string): { obj: string; verts: number; faces: number } {
  let V: number[][] = [], F: number[][] = [];
  if (kind === 'cube') {
    V = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    F = [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[5,1,4,8]];
  } else if (kind === 'pyramid') {
    V = [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[0,1.6,0]];
    F = [[1,2,3,4],[1,5,2],[2,5,3],[3,5,4],[4,5,1]];
  } else { // terrain grid
    const N = 6; for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) { const y = Math.sin(x * 0.9) * 0.4 + Math.cos(z * 0.8) * 0.4; V.push([x - N / 2, y, z - N / 2]); }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const a = z * (N + 1) + x + 1; F.push([a, a + 1, a + N + 2, a + N + 1]); }
  }
  const obj = '# GODAgent 3D (procedural)\n' + V.map((v) => `v ${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)}`).join('\n') + '\n' + F.map((f) => 'f ' + f.join(' ')).join('\n') + '\n';
  return { obj, verts: V.length, faces: F.length };
}
function ModelStudio() {
  const [kind, setKind] = useState('cube');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState('');
  const built = useRef<{ obj: string } | null>(null);

  useEffect(() => {
    const r = buildObj(kind); built.current = { obj: r.obj }; setStats(`頂点 ${r.verts} / 面 ${r.faces}`);
    drawWire(canvasRef.current, kind);
  }, [kind]);

  function download() { if (!built.current) return; const blob = new Blob([built.current.obj], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `godagent-${kind}.obj`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  return (
    <>
      <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>基本形状を<b>本物のOBJファイル</b>として手続き的に生成し、簡易ワイヤーフレームで確認・保存できます（glTF/GLBは今後対応）。</div>
      <div className="seg" style={{ marginBottom: 10 }}>{[['cube', '立方体'], ['pyramid', 'ピラミッド'], ['terrain', '地形']].map(([v, l]) => <button key={v} className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{l}</button>)}</div>
      <canvas ref={canvasRef} width={320} height={240} style={{ width: '100%', maxWidth: 360, border: '1px solid var(--border)', borderRadius: 10, background: '#0f1020', display: 'block' }} />
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{stats}</div>
      <div className="btn-row"><button className="btn primary" onClick={download}>OBJを保存</button></div>
      <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>※ text→3D生成AIは端末では実行できないため、ここは手続き的生成です。</div>
    </>
  );
}
function drawWire(cv: HTMLCanvasElement | null, kind: string) {
  if (!cv) return; const x = cv.getContext('2d'); if (!x) return;
  const r = buildObj(kind); const W = cv.width, H = cv.height; x.clearRect(0, 0, W, H);
  // naive isometric projection
  const a = 0.6, scale = 42, cx = W / 2, cy = H / 2 + 20;
  const V: number[][] = []; const lines = r.obj.split('\n');
  for (const ln of lines) { if (ln.startsWith('v ')) { const [, a1, b1, c1] = ln.split(' '); V.push([+a1, +b1, +c1]); } }
  const proj = (v: number[]) => [cx + (v[0] - v[2]) * Math.cos(a) * scale, cy - (v[1] * scale) - (v[0] + v[2]) * Math.sin(a) * scale * 0.5];
  x.strokeStyle = '#7C5CFF'; x.lineWidth = 1.5;
  for (const ln of lines) {
    if (!ln.startsWith('f ')) continue;
    const idx = ln.slice(2).trim().split(/\s+/).map((s) => parseInt(s, 10) - 1);
    x.beginPath();
    idx.forEach((id, i) => { const p = proj(V[id]); if (i === 0) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); });
    x.closePath(); x.stroke();
  }
}

// ---- 性能モード --------------------------------------------------------
const MODES: [string, string][] = [['ultralight', '超軽量'], ['light', '軽量'], ['balanced', 'バランス'], ['high', '高性能'], ['ultimate', 'ULTIMATE']];
function PerfStudio() {
  const settings = useStore((s) => s.settings);
  const cur = settings.perfMode || 'balanced';
  return (
    <>
      <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>端末の負荷・バッテリーと動作速度のバランスを選べます。バックグラウンド時の速度にも反映されます（POCO X7 Pro では「高性能」や「ULTIMATE」も快適です）。</div>
      <div className="seg" style={{ flexWrap: 'wrap' }}>{MODES.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} onClick={() => api.settings({ perfMode: v })}>{l}</button>)}</div>
      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        超軽量：動作をゆっくりにして負荷を最小化 ／ バランス：標準 ／ ULTIMATE：最速（負荷・電池消費は増加）。<br />
        端末の性能・温度・空きメモリに応じた自動調整は今後対応します。
      </div>
    </>
  );
}
