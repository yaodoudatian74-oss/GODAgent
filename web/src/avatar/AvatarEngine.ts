// Canvas avatar engine: renders a shape + two expressive eyes and animates the
// six Bot states (idle, thinking, working, waiting, blocked, done). Shapes morph
// smoothly when changed. One engine instance per visible large avatar.
import { shapePoints, lerpShapes, drawSmoothPath, Pt } from './shapes';

export type BotState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'done';

interface Opts { shape: string; color: string; state: BotState; }

export class AvatarEngine {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private t0 = performance.now();
  private running = false;

  private shape: string;
  private color: string;
  private state: BotState = 'idle';
  private prevState: BotState = 'idle';
  private stateT = 1;        // transition progress

  private curPts: Pt[];
  private fromPts: Pt[];
  private toPts: Pt[];
  private morph = 1;

  // animation sub-state
  private blink = 1;         // 1 open, 0 closed
  private nextBlink = 1500;
  private gaze: Pt = [0, 0];
  private gazeTarget: Pt = [0, 0];
  private pointer: Pt | null = null;
  private doneStart = 0;
  private reduce = false;

  constructor(canvas: HTMLCanvasElement, o: Opts) {
    this.ctx = canvas.getContext('2d')!;
    this.shape = o.shape; this.color = o.color; this.state = o.state; this.prevState = o.state;
    this.curPts = shapePoints(o.shape); this.fromPts = this.curPts; this.toPts = this.curPts;
    this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  setShape(shape: string) {
    if (shape === this.shape) return;
    this.shape = shape; this.fromPts = this.curPts; this.toPts = shapePoints(shape); this.morph = 0;
  }
  setColor(color: string) { this.color = color; }
  setState(state: BotState) {
    if (state === this.state) return;
    this.prevState = this.state; this.state = state; this.stateT = 0;
    if (state === 'done') this.doneStart = performance.now();
  }
  setPointer(p: Pt | null) { this.pointer = p; }

  start() { if (this.running) return; this.running = true; this.loop(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    this.render();
  };

  private ease(a: number) { return a < 0.5 ? 2 * a * a : 1 - Math.pow(-2 * a + 2, 2) / 2; }

  render() {
    const ctx = this.ctx;
    const cv = ctx.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth || 120, cssH = cv.clientHeight || 120;
    if (cv.width !== cssW * dpr || cv.height !== cssH * dpr) { cv.width = cssW * dpr; cv.height = cssH * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const now = performance.now();
    const dt = Math.min(48, now - (this as any)._last || 16); (this as any)._last = now;
    const time = (now - this.t0) / 1000;

    // morph progress
    if (this.morph < 1) { this.morph = Math.min(1, this.morph + dt / 420); this.curPts = lerpShapes(this.fromPts, this.toPts, this.ease(this.morph)); }
    if (this.stateT < 1) this.stateT = Math.min(1, this.stateT + dt / 380);

    // blink timing
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.nextBlink = 1800 + Math.random() * 3200; this.blink = 0; }
    if (this.blink < 1) this.blink = Math.min(1, this.blink + dt / 90);

    // per-state motion parameters
    const m = this.motion(time, now);

    // gaze easing toward target (pointer in idle, scripted otherwise)
    this.gazeTarget = m.gaze;
    this.gaze = [this.gaze[0] + (this.gazeTarget[0] - this.gaze[0]) * 0.12, this.gaze[1] + (this.gazeTarget[1] - this.gaze[1]) * 0.12];

    const cx = cssW / 2, cy = cssH / 2;
    const base = Math.min(cssW, cssH) * 0.40;

    ctx.save();
    ctx.translate(cx + m.dx * base, cy + m.dy * base);
    ctx.rotate(m.rot);
    ctx.scale(m.sx, m.sy);

    // body
    const px = this.curPts.map(([x, y]) => [x * base, y * base] as Pt);
    drawSmoothPath(ctx, px);
    ctx.fillStyle = this.color;
    ctx.fill();

    // subtle inner shading for depth
    const g = ctx.createRadialGradient(-base * 0.3, -base * 0.4, base * 0.2, 0, 0, base * 1.25);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g; ctx.fill();

    // eyes
    this.drawEyes(ctx, base, m);
    ctx.restore();
  }

  private motion(time: number, now: number) {
    const breathe = 1 + Math.sin(time * 1.6) * 0.015;
    let dx = 0, dy = Math.sin(time * 1.6) * 0.015, rot = 0, sx = breathe, sy = breathe;
    let gaze: Pt = [0, 0];
    let eyeH = 1, eyeRot = 0, arc = 0, eyeNarrow = 1;

    const pointerGaze: Pt = this.pointer ? [Math.max(-1, Math.min(1, this.pointer[0])) * 0.28, Math.max(-1, Math.min(1, this.pointer[1])) * 0.22] : [Math.sin(time * 0.5) * 0.12, Math.cos(time * 0.37) * 0.08];

    switch (this.state) {
      case 'idle':
        gaze = pointerGaze; break;
      case 'thinking':
        dy += Math.sin(time * 1.1) * 0.02; rot = Math.sin(time * 0.8) * 0.05;
        gaze = [Math.sin(time * 0.6) * 0.12 - 0.1, -0.22]; eyeNarrow = 0.86; break;
      case 'working':
        dy = Math.sin(time * 6.2) * 0.04; sx = breathe * (1 + Math.sin(time * 6.2) * 0.02);
        gaze = [Math.sin(time * 9) * 0.26, Math.sin(time * 5) * 0.06]; eyeNarrow = 0.92; break;
      case 'waiting': {
        rot = 0.14 + Math.sin(time * 0.9) * 0.015;
        const sigh = Math.max(0, Math.sin(time * 0.7)); sy = breathe * (1 - sigh * 0.05);
        gaze = [0.05, 0.05]; eyeH = 0.42; eyeNarrow = 0.9; break;
      }
      case 'blocked':
        dx = Math.sin(time * 18) * 0.03 * Math.max(0, 1 - ((now % 2600) / 2600)); // periodic shake bursts
        gaze = [0, 0.04]; eyeH = 0.7; eyeRot = 0.5; break;
      case 'done': {
        const e = Math.min(1, (now - this.doneStart) / 1400);
        const pop = Math.sin(Math.min(1, e * 2) * Math.PI) * 0.12;
        sx = breathe + pop; sy = breathe + pop;
        rot = (1 - this.ease(Math.min(1, e * 1.4))) * Math.PI * 2 * 0; // keep upright; celebratory bob instead
        dy -= Math.sin(Math.min(1, e * 2) * Math.PI) * 0.06;
        arc = this.ease(Math.min(1, e * 2)); gaze = [0, -0.02]; break;
      }
    }
    return { dx, dy, rot, sx, sy, gaze, eyeH, eyeRot, arc, eyeNarrow };
  }

  private drawEyes(ctx: CanvasRenderingContext2D, base: number, m: any) {
    const eyeDX = base * 0.34, eyeY = -base * 0.04;
    const ew = base * 0.17, eh = base * 0.30 * m.eyeH * (0.1 + 0.9 * this.blink) * m.eyeNarrow;
    const gx = this.gaze[0] * base * 0.16, gy = this.gaze[1] * base * 0.16;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    for (const side of [-1, 1]) {
      const ex = side * eyeDX + gx, ey = eyeY + gy;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(side * m.eyeRot * 0.4);
      if (m.arc > 0.3) {
        // happy arc eyes (done)
        ctx.lineWidth = base * 0.085; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, base * 0.03, ew * 0.95, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        this.pill(ctx, 0, 0, ew, Math.max(base * 0.02, eh));
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.lineTo(x + w / 2 - r, y - h / 2);
    ctx.arc(x + w / 2 - r, y - h / 2 + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w / 2, y + h / 2 - r);
    ctx.arc(x + w / 2 - r, y + h / 2 - r, r, 0, Math.PI / 2);
    ctx.lineTo(x - w / 2 + r, y + h / 2);
    ctx.arc(x - w / 2 + r, y + h / 2 - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x - w / 2, y - h / 2 + r);
    ctx.arc(x - w / 2 + r, y - h / 2 + r, r, Math.PI, -Math.PI / 2);
    ctx.closePath();
  }
}
