import { Special } from '../core/generator';
import { DEFAULT_SKIN, type Skin } from './skins';


export const THEME = {
  boardBg: '#151a3f',
  boardEdge: 'rgba(124, 140, 255, 0.28)',
  slot: 'rgba(255, 255, 255, 0.045)',
  slotEdge: 'rgba(255, 255, 255, 0.05)',
  ghostAlpha: 0.38,
  lineGlow: 'rgba(255, 255, 255, 0.32)',
  hammer: 'rgba(255, 90, 110, 0.35)',
  text: '#ffffff',
  textStroke: 'rgba(14, 10, 40, 0.85)',
  fever: ['#ff9a3c', '#ff5a6e', '#ffd23f'],
};

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { roundRect };

/**
 * Pre-rendered block sprites. Gradients are expensive on low-end phones, so each (colour, size, special)
 * combination is drawn once to an offscreen canvas and then blitted with drawImage.
 */
export class SpriteCache {
  private cache = new Map<string, HTMLCanvasElement>();
  dpr = 1;
  skin: Skin = DEFAULT_SKIN;

  clear(): void {
    this.cache.clear();
  }

  setSkin(skin: Skin): void {
    if (skin.id === this.skin.id) return;
    this.skin = skin;
    this.cache.clear();
  }

  /** CSS colour of a colour id in the active skin (used for particles). */
  colorOf(color: number): string {
    return this.skin.colors[color] ?? this.skin.colors[1];
  }

  get(color: number, size: number, special: Special = Special.None): HTMLCanvasElement {
    const px = Math.max(4, Math.round(size * this.dpr));
    const key = `${color}|${px}|${special}`;
    let c = this.cache.get(key);
    if (!c) {
      c = this.draw(color, px, special);
      this.cache.set(key, c);
    }
    return c;
  }

  private draw(color: number, s: number, special: Special): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d')!;
    const base = this.colorOf(color);
    switch (this.skin.style) {
      case 'candy':
        this.drawCandy(ctx, s, base);
        break;
      case 'neon':
        this.drawNeon(ctx, s, base);
        break;
      case 'royal':
        this.drawRoyal(ctx, s, base);
        break;
      default:
        this.drawGloss(ctx, s, base);
    }
    if (special === Special.Bomb) this.drawBomb(ctx, s);
    else if (special === Special.Gem) this.drawGem(ctx, s);
    return cv;
  }

  private drawGloss(ctx: CanvasRenderingContext2D, s: number, base: string): void {
    const r = s * 0.2;
    const body = ctx.createLinearGradient(0, 0, 0, s);
    body.addColorStop(0, shade(base, 0.32));
    body.addColorStop(0.55, base);
    body.addColorStop(1, shade(base, -0.28));
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.fillStyle = body;
    ctx.fill();
    // Bottom lip (gives the block thickness)
    ctx.save();
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.clip();
    ctx.fillStyle = shade(base, -0.42);
    ctx.fillRect(0, s * 0.86, s, s * 0.14);
    ctx.restore();
    // Glossy top highlight
    const gloss = ctx.createLinearGradient(0, s * 0.08, 0, s * 0.5);
    gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(ctx, s * 0.12, s * 0.08, s * 0.76, s * 0.4, r * 0.7);
    ctx.fillStyle = gloss;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(s * 0.26, s * 0.24, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.strokeStyle = shade(base, -0.5);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.stroke();
  }

  /** Soft pastel jelly with a bubble highlight. */
  private drawCandy(ctx: CanvasRenderingContext2D, s: number, base: string): void {
    const r = s * 0.34;
    const body = ctx.createRadialGradient(s * 0.35, s * 0.3, s * 0.05, s * 0.5, s * 0.5, s * 0.75);
    body.addColorStop(0, shade(base, 0.45));
    body.addColorStop(0.6, base);
    body.addColorStop(1, shade(base, -0.18));
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.fillStyle = body;
    ctx.fill();
    // Candy stripe
    ctx.save();
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, s * 0.75);
    ctx.lineTo(s * 0.75, -s * 0.1);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.24, s * 0.12, s * 0.07, -0.6, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
  }

  /** Dark tile with a glowing coloured rim. */
  private drawNeon(ctx: CanvasRenderingContext2D, s: number, base: string): void {
    const r = s * 0.16;
    const inset = s * 0.1;
    roundRect(ctx, inset, inset, s - inset * 2, s - inset * 2, r);
    ctx.fillStyle = '#0c0f2a';
    ctx.fill();
    ctx.save();
    ctx.shadowColor = base;
    ctx.shadowBlur = s * 0.18;
    ctx.strokeStyle = base;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.stroke();
    ctx.restore();
    const core = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.4);
    core.addColorStop(0, base + '66');
    core.addColorStop(1, base + '00');
    ctx.fillStyle = core;
    ctx.fillRect(inset, inset, s - inset * 2, s - inset * 2);
    roundRect(ctx, s * 0.3, s * 0.3, s * 0.4, s * 0.4, s * 0.08);
    ctx.strokeStyle = shade(base, 0.5);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.stroke();
  }

  /** Faceted gemstone with a gold frame. */
  private drawRoyal(ctx: CanvasRenderingContext2D, s: number, base: string): void {
    const r = s * 0.12;
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    const frame = ctx.createLinearGradient(0, 0, s, s);
    frame.addColorStop(0, '#fff2b0');
    frame.addColorStop(0.5, '#e0a93a');
    frame.addColorStop(1, '#8a5a12');
    ctx.fillStyle = frame;
    ctx.fill();
    const i = s * 0.12;
    const w = s - i * 2;
    const body = ctx.createLinearGradient(i, i, i + w, i + w);
    body.addColorStop(0, shade(base, 0.4));
    body.addColorStop(0.5, base);
    body.addColorStop(1, shade(base, -0.4));
    ctx.fillStyle = body;
    ctx.fillRect(i, i, w, w);
    // Facets
    const c = s / 2;
    const facet = (pts: number[][], fill: string) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const t = s * 0.3;
    facet([[i, i], [i + w, i], [c + t / 2, c - t / 2], [c - t / 2, c - t / 2]], 'rgba(255,255,255,0.35)');
    facet([[i, i], [c - t / 2, c - t / 2], [c - t / 2, c + t / 2], [i, i + w]], 'rgba(255,255,255,0.15)');
    facet([[i, i + w], [c - t / 2, c + t / 2], [c + t / 2, c + t / 2], [i + w, i + w]], 'rgba(0,0,0,0.25)');
    facet([[i + w, i], [i + w, i + w], [c + t / 2, c + t / 2], [c + t / 2, c - t / 2]], 'rgba(0,0,0,0.12)');
    ctx.strokeStyle = 'rgba(80,45,0,0.6)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    roundRect(ctx, 0.5, 0.5, s - 1, s - 1, r);
    ctx.stroke();
  }

  private drawBomb(ctx: CanvasRenderingContext2D, s: number): void {
    const cx = s * 0.5;
    const cy = s * 0.56;
    const rad = s * 0.24;
    ctx.fillStyle = '#1b1530';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx - rad * 0.35, cy - rad * 0.35, rad * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // fuse
    ctx.strokeStyle = '#3a2f55';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx + rad * 0.5, cy - rad * 0.8);
    ctx.quadraticCurveTo(cx + rad * 0.9, cy - rad * 1.4, cx + rad * 1.2, cy - rad * 1.3);
    ctx.stroke();
    // spark
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(cx + rad * 1.2, cy - rad * 1.3, s * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGem(ctx: CanvasRenderingContext2D, s: number): void {
    const cx = s * 0.5;
    const cy = s * 0.52;
    const w = s * 0.26;
    const h = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w, cy - h * 0.25);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - w, cy - h * 0.25);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#bff6ff');
    g.addColorStop(1, '#6fd9ff');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,90,0.7)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h * 0.25);
    ctx.lineTo(cx + w, cy - h * 0.25);
    ctx.stroke();
  }
}
