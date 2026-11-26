// Parametric generators for the avatar silhouettes. Each returns N points on a
// closed ring in a centered [-1,1] space, all with the same count and starting
// angle so any two shapes can be morphed by linear interpolation.
//
// These are original abstract blobs (geometry only); "expressive eyes on a
// simple shape" is the design concept, not any specific character.

export const N = 96;
export type Pt = [number, number];

const TAU = Math.PI * 2;

// deterministic value noise for the organic "blob" wobble
function noise(seed: number) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  return a - Math.floor(a);
}
function smoothNoise(t: number, seed: number, freq: number) {
  const x = t * freq;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const n0 = noise(i + seed) * 2 - 1;
  const n1 = noise(i + 1 + seed) * 2 - 1;
  return n0 * (1 - u) + n1 * u;
}

function ring(radiusFn: (theta: number, t: number) => number): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < N; k++) {
    const t = k / N;
    const theta = -Math.PI / 2 + t * TAU; // start at top
    const r = radiusFn(theta, t);
    pts.push([Math.cos(theta) * r, Math.sin(theta) * r]);
  }
  return normalize(pts);
}

// parametric (x(t), y(t)) generator, resampled to N evenly-spaced points
function param(fn: (t: number) => Pt): Pt[] {
  const dense: Pt[] = [];
  const M = 720;
  for (let k = 0; k < M; k++) dense.push(fn(k / M));
  // arc-length resample
  const seg: number[] = [];
  let total = 0;
  for (let k = 0; k < M; k++) {
    const a = dense[k], b = dense[(k + 1) % M];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d); total += d;
  }
  const out: Pt[] = [];
  let acc = 0, idx = 0;
  for (let k = 0; k < N; k++) {
    const target = (total * k) / N;
    while (acc + seg[idx] < target && idx < M - 1) { acc += seg[idx]; idx++; }
    const f = seg[idx] ? (target - acc) / seg[idx] : 0;
    const a = dense[idx], b = dense[(idx + 1) % M];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return normalize(out);
}

function normalize(pts: Pt[]): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const s = 1 / (Math.max(maxX - minX, maxY - minY) / 2);
  return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s] as Pt);
}

const gens: Record<string, () => Pt[]> = {
  circle: () => ring(() => 1),
  blob: () => ring((_th, t) => 1 + 0.12 * smoothNoise(t, 7, 5) + 0.05 * smoothNoise(t, 19, 9)),
  capsule: () => ring((th) => {
    // wide rounded rect (pill): superellipse stretched on x
    const ax = 1.35, ay = 0.82, n = 5;
    const c = Math.cos(th), s = Math.sin(th);
    const r = Math.pow(Math.pow(Math.abs(c) / ax, n) + Math.pow(Math.abs(s) / ay, n), -1 / n);
    return r;
  }),
  square: () => ring((th) => {
    const n = 4.2, c = Math.cos(th), s = Math.sin(th);
    return Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
  }),
  triangle: () => param((t) => {
    // rounded triangle via 3 lobes
    const th = t * TAU - Math.PI / 2;
    const r = 1 + 0.42 * Math.cos(3 * (th + Math.PI / 2));
    // round corners by softening
    const rr = Math.pow(r, 0.72);
    return [Math.cos(th) * rr, Math.sin(th) * rr * 0.98 + 0.04];
  }),
  teardrop: () => param((t) => {
    const th = t * TAU - Math.PI / 2;
    // circle with a pulled point at top
    const pull = Math.max(0, Math.cos(th)) ; // not used
    const r = 1 + 0.5 * Math.pow(Math.max(0, -Math.sin(th)), 2.2);
    return [Math.cos(th) * r * 0.92, Math.sin(th) * r];
  }),
  flower: () => ring((_th, t) => 1 + 0.17 * Math.cos(6 * t * TAU)),
  clover: () => ring((_th, t) => 1 + 0.22 * Math.cos(4 * t * TAU + Math.PI)),
  sparkle: () => ring((_th, t) => {
    const a = Math.cos(4 * t * TAU);
    return 0.5 + 0.9 * Math.pow(Math.abs(a), 2.4) * Math.sign(1);
  }),
  star: () => param((t) => {
    const spikes = 5, th = t * TAU - Math.PI / 2;
    const m = Math.cos(spikes * th);
    const r = 0.62 + 0.52 * Math.pow((m + 1) / 2, 1.9);
    return [Math.cos(th) * r, Math.sin(th) * r];
  }),
  heart: () => param((t) => {
    const a = t * TAU;
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    return [x, y];
  }),
  house: () => param((t) => {
    // square body + triangular roof, as one closed outline
    const pts: Pt[] = [
      [-1, 1], [-1, -0.15], [0, -1], [1, -0.15], [1, 1],
    ];
    // walk the polygon by perimeter fraction
    const per: number[] = [];
    let tot = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); per.push(d); tot += d; }
    let target = t * tot, i = 0;
    while (i < pts.length && per[i] < target) { target -= per[i]; i++; }
    const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
    const f = per[i % pts.length] ? target / per[i % pts.length] : 0;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }),
};

const cache = new Map<string, Pt[]>();
export function shapePoints(name: string): Pt[] {
  if (cache.has(name)) return cache.get(name)!;
  const g = gens[name] || gens.blob;
  const pts = g();
  cache.set(name, pts);
  return pts;
}

export function lerpShapes(a: Pt[], b: Pt[], t: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) out.push([a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t]);
  return out;
}

// Catmull-Rom → smooth closed path on a 2D context (points in pixel space).
export function drawSmoothPath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (i === 0) ctx.moveTo(p1[0], p1[1]);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  ctx.closePath();
}

export const SHAPE_NAMES = Object.keys(gens);
