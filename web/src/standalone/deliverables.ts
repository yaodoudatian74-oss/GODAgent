// Real deliverable generators used by the AI employees. Nothing here is a mock:
// makeGame returns a complete, playable HTML5 game; recordVideo renders a canvas
// animation and records it to a real WebM file via MediaRecorder.

export interface GameSpec { title: string; theme: string; color: string; genre: 'collector' | 'dodger' | 'shooter'; }

export function pickGenre(text: string): GameSpec['genre'] {
  const t = text.toLowerCase();
  if (/shoot|シュー|撃|弾|fps|stg/.test(t)) return 'shooter';
  if (/dodge|避け|よけ|回避|ランナー|run/.test(t)) return 'dodger';
  return 'collector';
}

// A complete, self-contained, actually playable canvas game. Original abstract
// graphics only. Touch + keyboard, score, lives, levels, win/lose, restart.
export function makeGame(spec: GameSpec): string {
  const { title, theme, color, genre } = spec;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>${esc(title)}</title>
<style>
html,body{margin:0;height:100%;background:#0f1020;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;color:#fff;touch-action:none}
#wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
canvas{background:linear-gradient(180deg,#141633,#0b0c1a);max-width:100%;max-height:100%;touch-action:none}
#hud{position:fixed;top:8px;left:0;right:0;display:flex;gap:14px;justify-content:center;font-weight:700;font-size:15px;text-shadow:0 1px 3px #000;pointer-events:none}
#overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,8,20,.78);text-align:center;padding:24px}
#overlay h1{font-size:26px;margin:0 0 4px}#overlay p{opacity:.85;margin:4px 0}
button{margin-top:16px;border:0;border-radius:12px;padding:14px 26px;font-size:17px;font-weight:700;background:${color};color:#fff}
.hidden{display:none!important}
</style></head><body>
<div id="wrap"><canvas id="c"></canvas></div>
<div id="hud"><span>スコア <b id="score">0</b></span><span>ライフ <b id="lives">3</b></span><span>レベル <b id="level">1</b></span></div>
<div id="overlay"><h1>${esc(title)}</h1><p>${esc(theme)}</p>
<p id="how">${genre === 'shooter' ? '下のバーで狙い、タップ/スペースで発射。敵を倒そう。' : genre === 'dodger' ? 'ドラッグ/矢印で移動。赤い障害物を避けよう。' : 'ドラッグ/矢印で移動。光る玉を集め、赤い玉を避けよう。'}</p>
<p>目標スコア <b>${genre === 'shooter' ? 20 : 15}</b></p>
<button id="start">スタート</button></div>
<script>
const GENRE=${JSON.stringify(genre)}, COLOR=${JSON.stringify(color)}, GOAL=${genre === 'shooter' ? 20 : 15};
const cv=document.getElementById('c'),x=cv.getContext('2d');
let W,H,DPR; function resize(){DPR=Math.min(2,devicePixelRatio||1);const w=Math.min(innerWidth,480),h=Math.min(innerHeight,800);cv.style.width=w+'px';cv.style.height=h+'px';cv.width=w*DPR;cv.height=h*DPR;x.setTransform(DPR,0,0,DPR,0,0);W=w;H=h;}
addEventListener('resize',resize);resize();
let running=false,score=0,lives=3,level=1,items=[],shots=[],t=0,px=W/2,py=H-70,aimx=W/2;
const el=id=>document.getElementById(id);
function reset(){running=true;score=0;lives=3;level=1;items=[];shots=[];t=0;px=W/2;py=H-70;el('overlay').classList.add('hidden');loop();}
function over(win){running=false;const o=el('overlay');o.classList.remove('hidden');o.querySelector('h1').textContent=win?'クリア！':'ゲームオーバー';o.querySelector('#how').textContent='スコア '+score;el('start').textContent='もう一度';}
function spawn(){const r=14+Math.random()*10;const bad=GENRE==='dodger'?true:Math.random()<0.32;items.push({x:20+Math.random()*(W-40),y:-20,r,vy:1.4+level*0.35+Math.random(),bad,vx:(Math.random()-0.5)*1.2});}
function circle(cx,cy,r,c){x.beginPath();x.arc(cx,cy,r,0,7);x.fillStyle=c;x.fill();}
function loop(){ if(!running)return; requestAnimationFrame(loop); t++; x.clearRect(0,0,W,H);
 if(t%Math.max(18,46-level*3)===0)spawn();
 // player
 if(GENRE==='shooter'){px+= (aimx-px)*0.2; circle(px,py,16,COLOR); x.fillStyle='rgba(255,255,255,.35)';x.fillRect(px-2,py-30,4,16);} else circle(px,py,18,COLOR);
 // shots
 for(const s of shots){s.y-=7;circle(s.x,s.y,4,'#fff');}
 shots=shots.filter(s=>s.y>-10);
 // items
 for(const it of items){ it.y+=it.vy; it.x+=it.vx; if(it.x<it.r||it.x>W-it.r)it.vx*=-1;
   circle(it.x,it.y,it.r, it.bad?'#ff4d5e':('hsl('+((t+it.x)%360)+',85%,60%)'));
   const dx=it.x-px,dy=it.y-py,hit=Math.hypot(dx,dy)<it.r+(GENRE==='shooter'?16:18);
   if(GENRE==='shooter'){ it.hit=false; for(const s of shots){ if(Math.hypot(s.x-it.x,s.y-it.y)<it.r+5){it.hit=true;s.y=-99;} } if(it.hit&&it.bad){score++;it.dead=true;} if(it.y>H+30){it.dead=true;} if(hit&&it.bad){lives--;it.dead=true;} }
   else { if(hit){ if(it.bad)lives--; else score++; it.dead=true; } if(it.y>H+30){ if(!it.bad&&GENRE==='collector')lives=Math.max(0,lives); it.dead=true; } }
 }
 items=items.filter(it=>!it.dead);
 level=1+Math.floor(score/5);
 el('score').textContent=score;el('lives').textContent=lives;el('level').textContent=level;
 if(lives<=0)return over(false); if(score>=GOAL)return over(true);
}
// controls
function move(cx){const r=cv.getBoundingClientRect();px=Math.max(16,Math.min(W-16,(cx-r.left)));}
function aim(cx){const r=cv.getBoundingClientRect();aimx=Math.max(16,Math.min(W-16,(cx-r.left)));}
cv.addEventListener('pointermove',e=>{if(GENRE==='shooter')aim(e.clientX);else move(e.clientX);});
cv.addEventListener('pointerdown',e=>{if(GENRE==='shooter'){aim(e.clientX);shots.push({x:px,y:py-28});}else move(e.clientX);});
addEventListener('keydown',e=>{const d=22;if(e.key==='ArrowLeft'){px-=d;aimx-=d;}if(e.key==='ArrowRight'){px+=d;aimx+=d;}if(e.key===' '&&GENRE==='shooter'){shots.push({x:px,y:py-28});}px=Math.max(16,Math.min(W-16,px));});
el('start').addEventListener('click',reset);
</script></body></html>`;
}

// Render a short animated title/scene video and record it to a real WebM file.
// Returns a data: URL, or an object with a reason when the browser can't record.
export async function recordVideo(opts: { title: string; scenes: string[]; color: string; seconds?: number }): Promise<{ dataUrl?: string; error?: string; mime?: string }> {
  try { return await recordVideoInner(opts); }
  catch (e: any) { return { error: 'この端末では動画の録画処理に対応していないため、実映像は生成できませんでした（' + (e?.message || e) + '）。' }; }
}

async function recordVideoInner(opts: { title: string; scenes: string[]; color: string; seconds?: number }): Promise<{ dataUrl?: string; error?: string; mime?: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof (canvas as any).captureStream !== 'function' || typeof (window as any).MediaRecorder === 'undefined') {
    return { error: 'この端末/ブラウザは動画の録画（MediaRecorder / captureStream）に対応していないため、実映像は生成できません。' };
  }
  const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = mimes.find((m) => (window as any).MediaRecorder.isTypeSupported?.(m));
  if (!mime) return { error: 'この端末は WebM 録画コーデックに対応していないため、実映像は生成できません。' };

  const stream = (canvas as any).captureStream(30);
  const rec = new (window as any).MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e: any) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime })); });

  const scenes = opts.scenes.length ? opts.scenes : [opts.title];
  const total = (opts.seconds ?? Math.min(12, 2 + scenes.length * 2)) * 1000;
  const per = total / scenes.length;
  const start = performance.now();
  rec.start();
  function frame(now: number) {
    const el = now - start;
    const si = Math.min(scenes.length - 1, Math.floor(el / per));
    const lp = (el - si * per) / per; // 0..1 within scene
    const g = ctx!.createLinearGradient(0, 0, 1280, 720);
    g.addColorStop(0, opts.color); g.addColorStop(1, '#101225');
    ctx!.fillStyle = g; ctx!.fillRect(0, 0, 1280, 720);
    // drifting shapes
    for (let i = 0; i < 6; i++) { ctx!.globalAlpha = 0.12; ctx!.beginPath(); ctx!.arc((i * 230 + el * 0.05 * (i + 1)) % 1280, 200 + Math.sin(el / 700 + i) * 120, 60 + i * 12, 0, 7); ctx!.fillStyle = '#fff'; ctx!.fill(); }
    ctx!.globalAlpha = Math.min(1, lp * 3) * (1 - Math.max(0, lp - 0.85) * 6.6);
    ctx!.fillStyle = '#fff'; ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
    ctx!.font = si === 0 ? '700 72px sans-serif' : '600 52px sans-serif';
    wrapText(ctx!, scenes[si], 640, 360, 1080, si === 0 ? 86 : 66);
    ctx!.globalAlpha = 1;
    ctx!.font = '500 26px sans-serif'; ctx!.fillStyle = 'rgba(255,255,255,.7)';
    ctx!.fillText(`${si + 1} / ${scenes.length}`, 640, 660);
    if (el < total) requestAnimationFrame(frame); else rec.stop();
  }
  requestAnimationFrame(frame);
  const blob = await done;
  const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
  return { dataUrl, mime };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lh: number) {
  const chars = [...text]; let line = ''; const lines: string[] = [];
  for (const ch of chars) { const test = line + ch; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; } else line = test; }
  if (line) lines.push(line);
  const top = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lh));
}
