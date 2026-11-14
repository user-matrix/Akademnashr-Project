/** Time-based visual effects: tweens, particles, screen shake. Purely cosmetic — never touches game state. */

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export interface Fx {
  start: number;
  dur: number;
  /** 'under' = drawn with the board (gets shake), 'over' = drawn above everything. */
  layer: 'under' | 'over';
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

const MAX_PARTICLES = 420;

export class Effects {
  private fx: Fx[] = [];
  private particles: Particle[] = [];
  private shakeStart = 0;
  private shakeDur = 0;
  private shakeAmp = 0;
  /** Scales particle counts down on weak devices / reduced-motion. */
  quality = 1;

  add(fx: Omit<Fx, 'start'> & { delay?: number }, now = performance.now()): void {
    this.fx.push({ ...fx, start: now + (fx.delay ?? 0) });
  }

  burst(x: number, y: number, color: string, count: number, speed: number): void {
    const n = Math.round(count * this.quality);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.75);
      const max = 0.45 + Math.random() * 0.45;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.35,
        life: max, max,
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        color,
      });
    }
  }

  shake(amp: number, ms: number): void {
    if (amp * this.quality < this.shakeAmp && performance.now() < this.shakeStart + this.shakeDur) return;
    this.shakeStart = performance.now();
    this.shakeDur = ms;
    this.shakeAmp = amp * this.quality;
  }

  shakeOffset(now: number): [number, number] {
    const t = (now - this.shakeStart) / this.shakeDur;
    if (t >= 1 || t < 0) return [0, 0];
    const a = this.shakeAmp * (1 - t);
    return [(Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a];
  }

  active(now: number): boolean {
    return this.fx.length > 0 || this.particles.length > 0 || now < this.shakeStart + this.shakeDur;
  }

  update(dt: number): void {
    const g = 1400;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, layer: 'under' | 'over'): void {
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i];
      if (f.layer !== layer || now < f.start) continue;
      const t = Math.min(1, (now - f.start) / f.dur);
      ctx.save();
      f.draw(ctx, t);
      ctx.restore();
    }
    if (layer === 'over') {
      for (const p of this.particles) {
        const a = p.life / p.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.5 + a * 0.5);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // Drop finished effects once per frame (after the last layer is drawn).
      this.fx = this.fx.filter((f) => now < f.start + f.dur);
    }
  }

  clear(): void {
    this.fx = [];
    this.particles = [];
    this.shakeDur = 0;
  }
}
