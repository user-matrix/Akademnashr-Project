import { BOARD_SIZE } from '../config';
import type { ClearedCell, Game, PlaceResult } from '../core/game';
import { Special, type Piece } from '../core/generator';
import { geomOf } from '../core/shapes';
import { Effects, ease } from './effects';
import { SpriteCache, THEME, roundRect } from './theme';

const N = BOARD_SIZE;

export interface Layout {
  w: number;
  h: number;
  cell: number;
  gap: number;
  boardX: number;
  boardY: number;
  boardSize: number;
  gridX: number;
  gridY: number;
  trayY: number;
  trayH: number;
  trayCell: number;
  slotX: number[];
  slotY: number;
}

export interface DragView {
  slot: number;
  /** Top-left of the dragged piece, CSS px. */
  x: number;
  y: number;
  target: { r: number; c: number } | null;
  preview: { rows: number[]; cols: number[] } | null;
}

export type ToolMode = 'none' | 'rotate' | 'hammer';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites = new SpriteCache();
  readonly fx = new Effects();
  layout!: Layout; // set by resize()
  game: Game | null = null;
  drag: DragView | null = null;
  hammerTarget: { r: number; c: number } | null = null;
  tool: ToolMode = 'none';
  /** Pause continuous animations (fever glow) while an overlay covers the board. */
  frozen = false;

  private dpr = 1;
  private boardCache: HTMLCanvasElement | null = null;
  private dealAt = [0, 0, 0];
  private returnAnim: ({ x: number; y: number; t0: number } | null)[] = [null, null, null];
  private raf = 0;
  private lastFrame = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    const lowEnd = (navigator.hardwareConcurrency ?? 4) <= 2;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.fx.quality = reduced ? 0.35 : lowEnd ? 0.6 : 1;
  }

  // ------------------------------------------------------------------ layout

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    // Cap DPR at 2.5: beyond that the fill-rate cost on phones is not worth the sharpness.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.sprites.dpr = this.dpr;
    this.sprites.clear();

    const margin = 12;
    const cellByW = (w - margin * 2) / (N + 0.5);
    const cellByH = (h * 0.68) / (N + 0.5);
    const cell = Math.max(16, Math.floor(Math.min(cellByW, cellByH, 64)));
    const pad = Math.round(cell * 0.25);
    const boardSize = cell * N + pad * 2;
    // Tray pieces are sized for 4-cell spans; the rare 5-long piece is scaled down individually.
    const trayCell = Math.max(10, Math.floor(Math.min(cell * 0.62, (boardSize / 3 - 10) / 4)));
    const trayH = trayCell * 4 + 20;
    const between = Math.round(cell * 0.55);
    const total = boardSize + between + trayH;
    const boardY = Math.max(margin * 0.5, Math.round((h - total) * 0.4));
    const boardX = Math.round((w - boardSize) / 2);
    const trayY = boardY + boardSize + between;
    this.layout = {
      w, h, cell,
      gap: Math.max(1, Math.round(cell * 0.05)),
      boardX, boardY, boardSize,
      gridX: boardX + pad,
      gridY: boardY + pad,
      trayY, trayH, trayCell,
      slotX: [0, 1, 2].map((i) => boardX + (boardSize * (2 * i + 1)) / 6),
      slotY: trayY + trayH / 2,
    };
    this.buildBoardCache();
    this.invalidate();
  }

  private buildBoardCache(): void {
    const L = this.layout;
    const cv = document.createElement('canvas');
    cv.width = Math.round(L.boardSize * this.dpr);
    cv.height = Math.round(L.boardSize * this.dpr);
    const ctx = cv.getContext('2d')!;
    ctx.scale(this.dpr, this.dpr);
    const r = L.cell * 0.35;
    roundRect(ctx, 0, 0, L.boardSize, L.boardSize, r);
    const bg = ctx.createLinearGradient(0, 0, 0, L.boardSize);
    bg.addColorStop(0, '#1b2150');
    bg.addColorStop(1, THEME.boardBg);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = THEME.boardEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    const off = L.gridX - L.boardX;
    const s = L.cell - L.gap * 2;
    for (let rr = 0; rr < N; rr++) {
      for (let c = 0; c < N; c++) {
        roundRect(ctx, off + c * L.cell + L.gap, off + rr * L.cell + L.gap, s, s, s * 0.18);
        ctx.fillStyle = THEME.slot;
        ctx.fill();
        ctx.strokeStyle = THEME.slotEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    this.boardCache = cv;
  }

  // ------------------------------------------------------------------ hit tests

  /** Board cell under a point, or null. */
  cellAt(x: number, y: number): { r: number; c: number } | null {
    const L = this.layout;
    const c = Math.floor((x - L.gridX) / L.cell);
    const r = Math.floor((y - L.gridY) / L.cell);
    return r >= 0 && r < N && c >= 0 && c < N ? { r, c } : null;
  }

  /** Tray slot under a point (generous hit area: the full third of the tray band). */
  slotAt(x: number, y: number): number {
    const L = this.layout;
    if (y < L.trayY - L.cell * 0.5) return -1;
    const third = L.boardSize / 3;
    const i = Math.floor((x - L.boardX) / third);
    return Math.max(0, Math.min(2, i));
  }

  /** Grid position a dragged piece (top-left at x,y) would snap to. */
  snap(x: number, y: number): { r: number; c: number } {
    const L = this.layout;
    return { r: Math.round((y - L.gridY) / L.cell), c: Math.round((x - L.gridX) / L.cell) };
  }

  /** Where a tray piece is drawn (top-left + cell size), used to animate pick-up. */
  trayPieceRect(slot: number, piece: Piece): { x: number; y: number; cell: number } {
    const L = this.layout;
    const g = geomOf(piece.cells);
    const span = Math.max(g.w, g.h);
    const s = span > 4 ? Math.floor((L.trayCell * 4) / span) : L.trayCell;
    return { x: L.slotX[slot] - (g.w * s) / 2, y: L.slotY - (g.h * s) / 2, cell: s };
  }

  // ------------------------------------------------------------------ loop

  invalidate(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;
    this.fx.update(dt);
    this.draw(now);
    const animating =
      this.fx.active(now) ||
      !!this.drag ||
      this.dealAt.some((t) => now - t < 400) ||
      this.returnAnim.some((a) => a && now - a.t0 < 200) ||
      (!this.frozen && !!this.game?.fever) ||
      this.tool !== 'none';
    if (animating) this.invalidate();
    else this.lastFrame = 0;
  };

  // ------------------------------------------------------------------ drawing

  private draw(now: number): void {
    const ctx = this.ctx;
    const L = this.layout;
    if (!L) return; // not measured yet (first ResizeObserver callback pending)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    const game = this.game;
    if (!game || !this.boardCache) return;

    const [sx, sy] = this.fx.shakeOffset(now);
    ctx.save();
    ctx.translate(sx, sy);

    if (game.fever && !this.frozen) this.drawFeverGlow(now);
    ctx.drawImage(this.boardCache, L.boardX, L.boardY, L.boardSize, L.boardSize);

    const s = L.cell - L.gap * 2;
    // Placed blocks
    for (let i = 0; i < N * N; i++) {
      const color = game.color[i];
      if (!color) continue;
      const r = (i / N) | 0;
      const c = i % N;
      ctx.drawImage(this.sprites.get(color, s, game.special[i] as Special), L.gridX + c * L.cell + L.gap, L.gridY + r * L.cell + L.gap, s, s);
    }

    // Drop preview: highlight lines that will clear + ghost piece
    const drag = this.drag;
    if (drag && drag.target) {
      const piece = game.tray[drag.slot];
      if (piece) {
        if (drag.preview && (drag.preview.rows.length || drag.preview.cols.length)) {
          const pulse = 0.2 + 0.14 * Math.sin(now / 90);
          ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
          for (const r of drag.preview.rows) this.fillCellsRect(r, 0, 1, N);
          for (const c of drag.preview.cols) this.fillCellsRect(0, c, N, 1);
        }
        ctx.globalAlpha = THEME.ghostAlpha;
        this.drawPiece(piece, L.gridX + drag.target.c * L.cell, L.gridY + drag.target.r * L.cell, L.cell);
        ctx.globalAlpha = 1;
      }
    }

    // Hammer preview
    if (this.tool === 'hammer' && this.hammerTarget) {
      const { r, c } = this.hammerTarget;
      const r0 = Math.max(0, r - 1);
      const c0 = Math.max(0, c - 1);
      const r1 = Math.min(N - 1, r + 1);
      const c1 = Math.min(N - 1, c + 1);
      ctx.fillStyle = THEME.hammer;
      this.fillCellsRect(r0, c0, r1 - r0 + 1, c1 - c0 + 1);
    }

    this.fx.draw(ctx, now, 'under');
    ctx.restore();

    this.drawTray(now);

    if (drag) {
      const piece = game.tray[drag.slot];
      if (piece) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
        this.drawPiece(piece, drag.x, drag.y, L.cell);
        ctx.restore();
      }
    }

    this.fx.draw(ctx, now, 'over');
  }

  private fillCellsRect(r: number, c: number, rows: number, cols: number): void {
    const L = this.layout;
    roundRect(
      this.ctx,
      L.gridX + c * L.cell + L.gap * 0.5,
      L.gridY + r * L.cell + L.gap * 0.5,
      cols * L.cell - L.gap,
      rows * L.cell - L.gap,
      L.cell * 0.2,
    );
    this.ctx.fill();
  }

  private drawFeverGlow(now: number): void {
    const ctx = this.ctx;
    const L = this.layout;
    const pulse = 0.55 + 0.45 * Math.sin(now / 160);
    ctx.save();
    const grad = ctx.createLinearGradient(L.boardX, L.boardY, L.boardX + L.boardSize, L.boardY + L.boardSize);
    grad.addColorStop(0, THEME.fever[0]);
    grad.addColorStop(0.5, THEME.fever[1]);
    grad.addColorStop(1, THEME.fever[2]);
    ctx.shadowColor = THEME.fever[1];
    ctx.shadowBlur = 18 + 14 * pulse;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    roundRect(ctx, L.boardX - 2, L.boardY - 2, L.boardSize + 4, L.boardSize + 4, L.cell * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  /** Draws a piece with its top-left at (x, y) using the given cell pitch. */
  private drawPiece(piece: Piece, x: number, y: number, pitch: number): void {
    const gap = Math.max(1, Math.round(pitch * 0.05));
    const s = pitch - gap * 2;
    piece.cells.forEach(([r, c], i) => {
      const sp = i === piece.specialAt ? piece.special : Special.None;
      this.ctx.drawImage(this.sprites.get(piece.color, s, sp), x + c * pitch + gap, y + r * pitch + gap, s, s);
    });
  }

  private drawTray(now: number): void {
    const ctx = this.ctx;
    const L = this.layout;
    const game = this.game!;
    for (let slot = 0; slot < 3; slot++) {
      const piece = game.tray[slot];
      if (!piece || (this.drag && this.drag.slot === slot)) continue;
      const rect = this.trayPieceRect(slot, piece);
      let { x, y } = rect;
      let alpha = game.pieceFits(slot) ? 1 : 0.32;

      const dt = now - this.dealAt[slot];
      if (dt < 400) {
        const t = ease.outBack(Math.max(0, dt) / 400);
        x += (1 - t) * L.w * 0.6;
        alpha *= Math.max(0, Math.min(1, dt / 200));
      }
      const ret = this.returnAnim[slot];
      if (ret) {
        const t = Math.min(1, (now - ret.t0) / 200);
        if (t >= 1) this.returnAnim[slot] = null;
        else {
          const e = ease.outCubic(t);
          x = ret.x + (x - ret.x) * e;
          y = ret.y + (y - ret.y) * e;
        }
      }

      if (this.tool === 'rotate' && !piece.rotatable) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(155,107,255,${(0.15 + 0.2 * pulse).toFixed(3)})`;
        roundRect(ctx, L.slotX[slot] - L.boardSize / 6 + 6, L.trayY, L.boardSize / 3 - 12, L.trayH, 16);
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      this.drawPiece(piece, x, y, rect.cell);
      ctx.globalAlpha = 1;
      if (piece.rotatable) this.drawRotateBadge(L.slotX[slot] + L.boardSize / 6 - 18, L.trayY + 14);
    }
  }

  private drawRotateBadge(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#9b6bff';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, 6, -Math.PI * 0.9, Math.PI * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const ax = x + Math.cos(Math.PI * 0.6) * 6;
    const ay = y + Math.sin(Math.PI * 0.6) * 6;
    ctx.moveTo(ax - 4, ay - 1);
    ctx.lineTo(ax + 3, ay - 3);
    ctx.lineTo(ax + 1, ay + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ animation triggers

  dealt(): void {
    const now = performance.now();
    this.dealAt = [now, now + 60, now + 120];
    this.invalidate();
  }

  returnPiece(slot: number, fromX: number, fromY: number): void {
    this.returnAnim[slot] = { x: fromX, y: fromY, t0: performance.now() };
    this.invalidate();
  }

  /** Visuals for a successful placement. */
  onPlace(res: PlaceResult, labels: { main: string | null; sub: string | null }): void {
    const L = this.layout;
    const now = performance.now();
    const s = L.cell - L.gap * 2;

    // Flash placed cells
    for (const idx of res.placed) {
      const x = L.gridX + (idx % N) * L.cell + L.gap;
      const y = L.gridY + ((idx / N) | 0) * L.cell + L.gap;
      this.fx.add({
        layer: 'under',
        dur: 220,
        draw: (ctx, t) => {
          ctx.globalAlpha = 0.55 * (1 - t);
          ctx.fillStyle = '#fff';
          roundRect(ctx, x, y, s, s, s * 0.2);
          ctx.fill();
        },
      }, now);
    }

    // Centre of the placed piece (for floating score)
    let cx = 0;
    let cy = 0;
    for (const idx of res.placed) {
      cx += L.gridX + (idx % N) * L.cell + L.cell / 2;
      cy += L.gridY + ((idx / N) | 0) * L.cell + L.cell / 2;
    }
    cx /= res.placed.length;
    cy /= res.placed.length;

    if (res.cleared.length) {
      this.animateClear(res.cleared, cx, cy, now);
      if (res.bombs > 0) {
        for (const cc of res.cleared) {
          if (cc.special !== Special.Bomb) continue;
          const bx = L.gridX + (cc.idx % N) * L.cell + L.cell / 2;
          const by = L.gridY + ((cc.idx / N) | 0) * L.cell + L.cell / 2;
          this.shockwave(bx, by, L.cell * 2.2, '#ffcf6b');
        }
        this.fx.shake(9, 320);
      } else if (res.lines >= 3) {
        this.fx.shake(4 + res.lines, 260);
      }
    }

    const scoreColor = res.fever ? '#ffcf6b' : res.lines ? '#ffffff' : 'rgba(255,255,255,0.85)';
    this.floatText(`+${res.points}`, cx, cy - L.cell * 0.4, scoreColor, res.lines ? L.cell * 0.62 : L.cell * 0.45);
    if (labels.main || labels.sub) this.banner(labels.main, labels.sub, res.allClear ? '#3cc7ff' : res.fever ? '#ffb347' : '#ffffff');
    this.invalidate();
  }

  /** Shrink + scatter cleared cells, rippling outward from (ox, oy). */
  animateClear(cells: ClearedCell[], ox: number, oy: number, now = performance.now()): void {
    const L = this.layout;
    const s = L.cell - L.gap * 2;
    for (const cc of cells) {
      const x = L.gridX + (cc.idx % N) * L.cell + L.gap;
      const y = L.gridY + ((cc.idx / N) | 0) * L.cell + L.gap;
      const dist = Math.hypot(x + s / 2 - ox, y + s / 2 - oy) / L.cell;
      const delay = Math.min(dist * 28, 260);
      const sprite = this.sprites.get(cc.color, s, cc.special);
      const color = this.sprites.colorOf(cc.color);
      let burst = false;
      this.fx.add({
        layer: 'under',
        dur: 300,
        delay,
        draw: (ctx, t) => {
          if (!burst) {
            burst = true;
            this.fx.burst(x + s / 2, y + s / 2, color, cc.special === Special.Gem ? 10 : 4, L.cell * 7);
          }
          const k = 1 - ease.inCubic(t);
          ctx.globalAlpha = k;
          ctx.translate(x + s / 2, y + s / 2);
          ctx.rotate(t * 0.6);
          ctx.scale(0.2 + 0.8 * k + 0.15 * Math.sin(t * Math.PI), 0.2 + 0.8 * k + 0.15 * Math.sin(t * Math.PI));
          ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.6 * (1 - t);
          ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
        },
      }, now);
    }
  }

  shockwave(x: number, y: number, radius: number, color: string): void {
    this.fx.add({
      layer: 'over',
      dur: 420,
      draw: (ctx, t) => {
        const e = ease.outCubic(t);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(x, y, radius * e, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.6 * e, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  floatText(text: string, x: number, y: number, color: string, size: number): void {
    const L = this.layout;
    this.fx.add({
      layer: 'over',
      dur: 850,
      draw: (ctx, t) => {
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.font = `900 ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const yy = y - ease.outCubic(t) * L.cell * 1.2;
        const half = ctx.measureText(text).width / 2 + 4;
        const px = Math.max(L.boardX + half, Math.min(L.boardX + L.boardSize - half, x));
        ctx.lineWidth = Math.max(3, size * 0.16);
        ctx.strokeStyle = THEME.textStroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, px, yy);
        ctx.fillStyle = color;
        ctx.fillText(text, px, yy);
      },
    });
  }

  banner(main: string | null, sub: string | null, color: string): void {
    const L = this.layout;
    const cx = L.boardX + L.boardSize / 2;
    const cy = L.boardY + L.boardSize * 0.42;
    this.fx.add({
      layer: 'over',
      dur: 1100,
      delay: 80,
      draw: (ctx, t) => {
        const appear = ease.outBack(Math.min(1, t / 0.25));
        ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        ctx.translate(cx, cy - t * L.cell * 0.4);
        ctx.scale(appear, appear);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        if (main) {
          const size = Math.round(L.cell * 0.95);
          ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          ctx.lineWidth = size * 0.2;
          ctx.strokeStyle = THEME.textStroke;
          ctx.strokeText(main, 0, 0);
          const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(1, color);
          ctx.fillStyle = g;
          ctx.fillText(main, 0, 0);
        }
        if (sub) {
          const size = Math.round(L.cell * 0.5);
          ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          ctx.lineWidth = size * 0.22;
          ctx.strokeStyle = THEME.textStroke;
          const y = main ? L.cell * 0.85 : 0;
          ctx.strokeText(sub, 0, y);
          ctx.fillStyle = '#ffe28a';
          ctx.fillText(sub, 0, y);
        }
      },
    });
    this.invalidate();
  }
}
