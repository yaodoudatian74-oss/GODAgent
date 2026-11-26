import { useEffect, useRef } from 'react';
import { AvatarEngine, BotState } from './AvatarEngine';
import { shapePoints, drawSmoothPath } from './shapes';

// Animated canvas avatar — used for the header and large displays.
export function AvatarCanvas({ shape, color, state, size = 120, image, interactive = true }:
  { shape: string; color: string; state: string; size?: number; image?: string | null; interactive?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eng = useRef<AvatarEngine | null>(null);

  useEffect(() => {
    if (image) return;
    const cv = ref.current!;
    const e = new AvatarEngine(cv, { shape, color, state: state as BotState });
    eng.current = e; e.start();
    return () => e.stop();
  }, [image]);

  useEffect(() => { eng.current?.setShape(shape); }, [shape]);
  useEffect(() => { eng.current?.setColor(color); }, [color]);
  useEffect(() => { eng.current?.setState(state as BotState); }, [state]);

  function onMove(ev: React.PointerEvent) {
    if (!interactive) return;
    const r = (ev.target as HTMLElement).getBoundingClientRect();
    eng.current?.setPointer([((ev.clientX - r.left) / r.width - 0.5) * 2, ((ev.clientY - r.top) / r.height - 0.5) * 2]);
  }
  function onLeave() { eng.current?.setPointer(null); }

  if (image) return <img className="avatar-img" src={image} width={size} height={size} style={{ width: size, height: size }} alt="" />;
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} onPointerMove={onMove} onPointerLeave={onLeave} className="avatar-canvas" />;
}

// Cheap static SVG avatar for list rows (no per-row rAF). Blinks via CSS.
export function AvatarSvg({ shape, color, size = 36, image, state }:
  { shape: string; color: string; size?: number; image?: string | null; state?: string }) {
  if (image) return <img className="avatar-img" src={image} width={size} height={size} style={{ width: size, height: size }} alt="" />;
  const pts = shapePoints(shape);
  const S = 50, R = 40;
  const path = toSvgPath(pts.map(([x, y]) => [S + x * R, S + y * R]));
  const eyeY = S - R * 0.04, ew = R * 0.17, eh = R * 0.30, edx = R * 0.34;
  const working = state === 'working' || state === 'thinking';
  return (
    <svg className={`avatar-svg ${working ? 'avatar-busy' : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d={path} fill={color} />
      <g fill="#fff" className="eyes">
        <rect x={S - edx - ew / 2} y={eyeY - eh / 2} width={ew} height={eh} rx={ew / 2} />
        <rect x={S + edx - ew / 2} y={eyeY - eh / 2} width={ew} height={eh} rx={ew / 2} />
      </g>
    </svg>
  );
}

function toSvgPath(pts: [number, number][]) {
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (i === 0) d += `M${p1[0].toFixed(2)},${p1[1].toFixed(2)}`;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + 'Z';
}
