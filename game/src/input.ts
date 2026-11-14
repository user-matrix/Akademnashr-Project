import type { Game } from './core/game';
import { geomOf } from './core/shapes';
import type { Renderer } from './render/renderer';

export interface InputHandlers {
  canInteract(): boolean;
  onPick(slot: number): void;
  /** Return true if the piece was placed. */
  onDrop(slot: number, r: number, c: number): boolean;
  onInvalidDrop(): void;
  /** Tap on a piece that the Rotate booster unlocked. */
  onRotateTap(slot: number): void;
  /** Rotate booster is armed and the player picked a piece. */
  onRotateTool(slot: number): void;
  onHammer(r: number, c: number): void;
}

const TAP_SLOP = 10;

/**
 * Pointer handling for touch, pen and mouse (Pointer Events cover all three).
 * On touch the piece floats above the finger so the player can see where it lands.
 */
export class InputController {
  private pointerId: number | null = null;
  private pointerType = 'touch';
  private slot = -1;
  private startX = 0;
  private startY = 0;
  private lastKey = '';
  /** False until the pointer leaves the tap radius on a rotatable piece (so a tap doesn't lift it). */
  private dragStarted = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
    private getGame: () => Game | null,
    private h: InputHandlers,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancelEvt);
    canvas.addEventListener('lostpointercapture', this.cancelEvt);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private down = (e: PointerEvent): void => {
    if (this.pointerId !== null || !this.h.canInteract()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const game = this.getGame();
    if (!game) return;
    const { x, y } = this.pos(e);
    const R = this.renderer;

    if (R.tool === 'hammer') {
      const cell = R.cellAt(x, y);
      if (!cell) return;
      this.capture(e);
      R.hammerTarget = cell;
      R.invalidate();
      return;
    }

    const slot = R.slotAt(x, y);
    if (slot < 0 || !game.tray[slot]) return;
    if (R.tool === 'rotate') {
      this.h.onRotateTool(slot);
      return;
    }
    this.capture(e);
    this.slot = slot;
    this.startX = x;
    this.startY = y;
    this.lastKey = '';
    this.dragStarted = !game.tray[slot]!.rotatable;
    this.h.onPick(slot);
    this.update(x, y);
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const { x, y } = this.pos(e);
    const R = this.renderer;
    if (R.tool === 'hammer') {
      const cell = R.cellAt(x, y);
      if (cell && (cell.r !== R.hammerTarget?.r || cell.c !== R.hammerTarget?.c)) {
        R.hammerTarget = cell;
        R.invalidate();
      }
      return;
    }
    this.update(x, y);
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const { x, y } = this.pos(e);
    const R = this.renderer;
    this.release(e);

    if (R.tool === 'hammer') {
      const target = R.hammerTarget;
      R.hammerTarget = null;
      if (target) this.h.onHammer(target.r, target.c);
      R.invalidate();
      return;
    }

    const slot = this.slot;
    const drag = R.drag;
    R.drag = null;
    this.slot = -1;
    const game = this.getGame();
    if (!game) return;
    const moved = Math.hypot(x - this.startX, y - this.startY);
    const piece = game.tray[slot];

    if (!this.dragStarted && piece?.rotatable) {
      this.h.onRotateTap(slot);
      R.invalidate();
      return;
    }
    if (!drag) return;
    if (drag.target && this.h.onDrop(slot, drag.target.r, drag.target.c)) return;
    if (moved >= TAP_SLOP) this.h.onInvalidDrop();
    R.returnPiece(slot, drag.x, drag.y);
  };

  private cancelEvt = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.cancel();
  };

  /** Abort any gesture in progress (e.g. the app went to background or an overlay opened). */
  cancel(): void {
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        /* already released */
      }
    }
    this.pointerId = null;
    this.slot = -1;
    this.renderer.drag = null;
    this.renderer.hammerTarget = null;
    this.renderer.invalidate();
  }

  private capture(e: PointerEvent): void {
    this.pointerId = e.pointerId;
    this.pointerType = e.pointerType;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* some WebViews throw for synthetic events */
    }
  }

  private release(e: PointerEvent): void {
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointerId = null;
  }

  private update(x: number, y: number): void {
    const game = this.getGame();
    const piece = game?.tray[this.slot];
    if (!game || !piece) return;
    if (!this.dragStarted) {
      if (Math.hypot(x - this.startX, y - this.startY) < TAP_SLOP) return;
      this.dragStarted = true;
    }
    const L = this.renderer.layout;
    const g = geomOf(piece.cells);
    const pw = g.w * L.cell;
    const ph = g.h * L.cell;
    // Finger-friendly lift: the piece's bottom edge sits about one cell above the touch point.
    const lift = this.pointerType === 'mouse' ? 0 : ph / 2 + L.cell * 1.1;
    const left = x - pw / 2;
    const top = y - ph / 2 - lift;
    const snap = this.renderer.snap(left, top);
    const key = `${snap.r},${snap.c}`;
    const prev = this.renderer.drag;
    let target = prev?.target ?? null;
    let preview = prev?.preview ?? null;
    if (key !== this.lastKey || !prev) {
      this.lastKey = key;
      preview = game.previewLines(this.slot, snap.r, snap.c);
      target = preview ? snap : null;
    }
    this.renderer.drag = { slot: this.slot, x: left, y: top, target, preview };
    this.renderer.invalidate();
  }
}
