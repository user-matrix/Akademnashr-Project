import { BOARD_SIZE, COLOR_COUNT, DAILY, DIFFICULTY, ECONOMY, SCORING } from '../config';
import { dealPieces, Special, type Piece } from './generator';
import { fits, fitsAnywhere, fullLines, type Rows } from './masks';
import { hashString, randomSeed, Rng } from './rng';
import { cellsKey, geomOf, normalize, type Cell } from './shapes';

const N = BOARD_SIZE;

export type Mode = 'classic' | 'daily';

export type ClearCause = 'line' | 'bomb' | 'tool';

export interface ClearedCell {
  idx: number;
  color: number;
  special: Special;
  cause: ClearCause;
}

export interface PlaceResult {
  slot: number;
  row: number;
  col: number;
  color: number;
  placed: number[];
  rows: number[];
  cols: number[];
  cleared: ClearedCell[];
  lines: number;
  monoLines: number;
  bombs: number;
  gems: number;
  points: number;
  streak: number;
  multiplier: number;
  fever: boolean;
  feverStarted: boolean;
  allClear: boolean;
  dealt: boolean;
  dailyReached: boolean;
}

export interface SaveData {
  v: 1;
  mode: Mode;
  seed: number;
  rng: number;
  color: number[];
  special: number[];
  tray: (Piece | null)[];
  score: number;
  streak: number;
  movesSinceClear: number;
  moves: number;
  lines: number;
  gems: number;
  revived: boolean;
  dailyKey: string | null;
  dailyTarget: number;
  dailyReached: boolean;
}

function bitsToList(bits: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (bits & (1 << i)) out.push(i);
  return out;
}

export function dailyTargetFor(key: string): number {
  const steps = Math.floor((DAILY.maxTarget - DAILY.minTarget) / DAILY.step) + 1;
  return DAILY.minTarget + (hashString('target:' + key) % steps) * DAILY.step;
}

export class Game {
  mode: Mode;
  seed: number;
  rng: Rng;
  color = new Uint8Array(N * N);
  special = new Uint8Array(N * N);
  tray: (Piece | null)[] = [null, null, null];
  score = 0;
  streak = 0;
  movesSinceClear = 0;
  moves = 0;
  lines = 0;
  /** Gems collected this game (converted to coins by the app). */
  gems = 0;
  revived = false;
  dailyKey: string | null = null;
  dailyTarget = 0;
  dailyReached = false;

  private constructor(mode: Mode, seed: number) {
    this.mode = mode;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
  }

  static create(mode: Mode, opts: { seed?: number; dailyKey?: string } = {}): Game {
    if (mode === 'daily') {
      const key = opts.dailyKey ?? 'unknown';
      const g = new Game(mode, hashString('daily:' + key));
      g.dailyKey = key;
      g.dailyTarget = dailyTargetFor(key);
      g.deal();
      return g;
    }
    const g = new Game(mode, opts.seed ?? randomSeed());
    g.deal();
    return g;
  }

  // ---------------------------------------------------------------- queries

  get fever(): boolean {
    return this.streak >= SCORING.feverStreak;
  }

  get difficulty(): number {
    // The first two deals are always gentle so new players learn the game.
    if (this.moves < 6) return 0;
    return Math.min(1, this.score / DIFFICULTY.maxAtScore);
  }

  rows(): Rows {
    const rows = new Array<number>(N).fill(0);
    for (let i = 0; i < N * N; i++) if (this.color[i]) rows[(i / N) | 0] |= 1 << i % N;
    return rows;
  }

  isEmpty(): boolean {
    for (let i = 0; i < N * N; i++) if (this.color[i]) return false;
    return true;
  }

  canPlace(slot: number, r: number, c: number): boolean {
    const p = this.tray[slot];
    return !!p && fits(this.rows(), geomOf(p.cells), r, c);
  }

  /** Lines that would be cleared if the piece in `slot` were dropped at (r, c); null if it does not fit. */
  previewLines(slot: number, r: number, c: number): { rows: number[]; cols: number[] } | null {
    const p = this.tray[slot];
    if (!p) return null;
    const g = geomOf(p.cells);
    const rows = this.rows();
    if (!fits(rows, g, r, c)) return null;
    for (let i = 0; i < g.h; i++) rows[r + i] |= g.masks[i] << c;
    const { rowBits, colBits } = fullLines(rows);
    return { rows: bitsToList(rowBits), cols: bitsToList(colBits) };
  }

  pieceFits(slot: number): boolean {
    const p = this.tray[slot];
    return !!p && fitsAnywhere(this.rows(), geomOf(p.cells));
  }

  hasMoves(): boolean {
    const rows = this.rows();
    return this.tray.some((p) => !!p && fitsAnywhere(rows, geomOf(p.cells)));
  }

  /** Would rotating some remaining piece create a legal move? (used to decide if the Rotate booster can help) */
  rotationHelps(): boolean {
    const rows = this.rows();
    return this.tray.some((p) => {
      if (!p) return false;
      let cells: Cell[] = p.cells;
      for (let i = 0; i < 3; i++) {
        cells = rotateCells(cells, -1).cells;
        if (fitsAnywhere(rows, geomOf(cells))) return true;
      }
      return false;
    });
  }

  // ---------------------------------------------------------------- actions

  place(slot: number, r: number, c: number): PlaceResult | null {
    const piece = this.tray[slot];
    if (!piece || !this.canPlace(slot, r, c)) return null;

    const placed: number[] = [];
    piece.cells.forEach(([dr, dc], i) => {
      const idx = (r + dr) * N + (c + dc);
      this.color[idx] = piece.color;
      this.special[idx] = i === piece.specialAt ? piece.special : Special.None;
      placed.push(idx);
    });
    this.tray[slot] = null;
    this.moves++;

    // ---- find full lines (rows + cols are evaluated together, before anything is removed)
    const { rowBits, colBits } = fullLines(this.rows());
    const fullRows = bitsToList(rowBits);
    const fullCols = bitsToList(colBits);
    let monoLines = 0;
    for (const row of fullRows) if (this.isMono((k) => row * N + k)) monoLines++;
    for (const col of fullCols) if (this.isMono((k) => k * N + col)) monoLines++;

    const clear = new Map<number, ClearedCell>();
    const mark = (idx: number, cause: ClearCause) => {
      if (!clear.has(idx) && this.color[idx]) {
        clear.set(idx, { idx, color: this.color[idx], special: this.special[idx] as Special, cause });
      }
    };
    for (const row of fullRows) for (let k = 0; k < N; k++) mark(row * N + k, 'line');
    for (const col of fullCols) for (let k = 0; k < N; k++) mark(k * N + col, 'line');

    // ---- bombs inside cleared lines explode (3×3) and can chain into other bombs
    let bombs = 0;
    const queue: number[] = [];
    for (const cc of clear.values()) if (cc.special === Special.Bomb) queue.push(cc.idx);
    const exploded = new Set<number>();
    while (queue.length) {
      const b = queue.pop()!;
      if (exploded.has(b)) continue;
      exploded.add(b);
      bombs++;
      this.forArea(b, 1, (idx) => {
        const had = clear.has(idx);
        mark(idx, 'bomb');
        if (!had && this.special[idx] === Special.Bomb) queue.push(idx);
      });
    }

    const cleared = [...clear.values()];
    let gems = 0;
    let bombCells = 0;
    for (const cc of cleared) {
      if (cc.special === Special.Gem) gems++;
      if (cc.cause === 'bomb') bombCells++;
      this.color[cc.idx] = 0;
      this.special[cc.idx] = Special.None;
    }

    // ---- scoring
    const lines = fullRows.length + fullCols.length;
    const wasFever = this.fever;
    if (lines > 0) {
      this.streak++;
      this.movesSinceClear = 0;
    } else if (++this.movesSinceClear >= SCORING.streakWindow) {
      this.streak = 0;
    }
    const fever = this.fever;
    const multiplier =
      lines > 0 ? Math.min(SCORING.comboMax, 1 + SCORING.comboStep * (this.streak - 1)) * (fever ? SCORING.feverMultiplier : 1) : 1;
    const base =
      (SCORING.lineBase * lines * (lines + 1)) / 2 + monoLines * SCORING.monoLineBonus + bombCells * SCORING.bombCellPoints;
    const allClear = lines > 0 && this.isEmpty();
    const points =
      piece.cells.length * SCORING.perCell + Math.round(base * multiplier) + (allClear ? SCORING.allClearBonus : 0);
    this.score += points;
    this.lines += lines;
    this.gems += gems;

    let dealt = false;
    if (this.tray.every((p) => p === null)) {
      this.deal();
      dealt = true;
    }

    let dailyReached = false;
    if (this.mode === 'daily' && !this.dailyReached && this.score >= this.dailyTarget) {
      this.dailyReached = dailyReached = true;
    }

    return {
      slot, row: r, col: c, color: piece.color, placed,
      rows: fullRows, cols: fullCols, cleared, lines, monoLines, bombs, gems, points,
      streak: this.streak, multiplier, fever, feverStarted: fever && !wasFever, allClear, dealt, dailyReached,
    };
  }

  /** Rotate booster step 1: unlock free rotation for a piece. */
  makeRotatable(slot: number): boolean {
    const p = this.tray[slot];
    if (!p || p.rotatable) return false;
    p.rotatable = true;
    return true;
  }

  /** Rotate a piece 90° clockwise (only if it was unlocked by the Rotate booster). */
  rotatePiece(slot: number): boolean {
    const p = this.tray[slot];
    if (!p || !p.rotatable) return false;
    const r = rotateCells(p.cells, p.specialAt);
    p.cells = r.cells;
    p.specialAt = r.specialAt;
    return true;
  }

  /** Hammer booster: smash the 3×3 area around (r, c). Returns destroyed cells (empty = nothing to smash). */
  hammer(r: number, c: number): ClearedCell[] {
    if (r < 0 || c < 0 || r >= N || c >= N) return [];
    const out: ClearedCell[] = [];
    this.forArea(r * N + c, 1, (idx) => {
      if (!this.color[idx]) return;
      out.push({ idx, color: this.color[idx], special: this.special[idx] as Special, cause: 'tool' });
    });
    for (const cc of out) {
      if (cc.special === Special.Gem) this.gems++;
      this.color[cc.idx] = 0;
      this.special[cc.idx] = Special.None;
    }
    return out;
  }

  /** Reroll booster: a brand-new, guaranteed-placeable set of three pieces. */
  reroll(): void {
    this.tray = dealPieces(this.rows(), this.rng, { difficulty: this.difficulty, forceSolvable: true, fever: this.fever });
  }

  /** Second chance: clears the most crowded 4×4 area and deals a guaranteed-placeable set. */
  revive(): ClearedCell[] {
    let best = 0;
    let bestCount = -1;
    for (let r = 0; r <= N - 4; r++) {
      for (let c = 0; c <= N - 4; c++) {
        let count = 0;
        for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) if (this.color[(r + dr) * N + c + dc]) count++;
        if (count > bestCount) {
          bestCount = count;
          best = r * N + c;
        }
      }
    }
    const out: ClearedCell[] = [];
    const br = (best / N) | 0;
    const bc = best % N;
    for (let dr = 0; dr < 4; dr++) {
      for (let dc = 0; dc < 4; dc++) {
        const idx = (br + dr) * N + bc + dc;
        if (!this.color[idx]) continue;
        out.push({ idx, color: this.color[idx], special: this.special[idx] as Special, cause: 'tool' });
        this.color[idx] = 0;
        this.special[idx] = Special.None;
      }
    }
    this.revived = true;
    this.reroll();
    return out;
  }

  /** End-of-game coin reward from score (gem coins are paid out immediately when collected). */
  scoreCoins(): number {
    return Math.floor(this.score / ECONOMY.scorePerCoin);
  }

  // ---------------------------------------------------------------- persistence

  serialize(): SaveData {
    return {
      v: 1,
      mode: this.mode,
      seed: this.seed,
      rng: this.rng.state,
      color: Array.from(this.color),
      special: Array.from(this.special),
      tray: this.tray.map((p) => (p ? { ...p, cells: p.cells.map((c) => [c[0], c[1]] as Cell) } : null)),
      score: this.score,
      streak: this.streak,
      movesSinceClear: this.movesSinceClear,
      moves: this.moves,
      lines: this.lines,
      gems: this.gems,
      revived: this.revived,
      dailyKey: this.dailyKey,
      dailyTarget: this.dailyTarget,
      dailyReached: this.dailyReached,
    };
  }

  /** Restores a saved game. Returns null for anything malformed so a corrupt save can never crash the app. */
  static deserialize(raw: unknown): Game | null {
    try {
      const d = raw as SaveData;
      if (!d || d.v !== 1 || (d.mode !== 'classic' && d.mode !== 'daily')) return null;
      if (!isIntArray(d.color, N * N, 0, COLOR_COUNT) || !isIntArray(d.special, N * N, 0, 2)) return null;
      if (!Array.isArray(d.tray) || d.tray.length !== 3) return null;
      const nums = [d.seed, d.rng, d.score, d.streak, d.movesSinceClear, d.moves, d.lines, d.gems, d.dailyTarget];
      if (!nums.every((n) => Number.isFinite(n) && n >= 0)) return null;
      const tray: (Piece | null)[] = [];
      for (const p of d.tray) {
        if (p === null) {
          tray.push(null);
          continue;
        }
        if (!isValidPiece(p)) return null;
        // Placement relies on cells being normalised (bounding box at 0,0); reject anything else.
        if (cellsKey(normalize(p.cells)) !== cellsKey(p.cells)) return null;
        tray.push({
          cells: p.cells.map((c) => [c[0], c[1]] as Cell),
          color: p.color,
          special: p.special,
          specialAt: p.specialAt,
          rotatable: !!p.rotatable,
        });
      }
      const g = new Game(d.mode, d.seed);
      g.rng.state = d.rng >>> 0;
      g.color.set(d.color);
      g.special.set(d.special);
      g.tray = tray;
      g.score = d.score;
      g.streak = d.streak;
      g.movesSinceClear = d.movesSinceClear;
      g.moves = d.moves;
      g.lines = d.lines;
      g.gems = d.gems;
      g.revived = !!d.revived;
      g.dailyKey = typeof d.dailyKey === 'string' ? d.dailyKey : null;
      g.dailyTarget = d.dailyTarget;
      g.dailyReached = !!d.dailyReached;
      if (tray.every((p) => p === null)) g.deal();
      return g;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- internals

  private deal(): void {
    this.tray = dealPieces(this.rows(), this.rng, { difficulty: this.difficulty, fever: this.fever });
  }

  private isMono(at: (k: number) => number): boolean {
    const first = this.color[at(0)];
    for (let k = 1; k < N; k++) if (this.color[at(k)] !== first) return false;
    return true;
  }

  private forArea(center: number, radius: number, fn: (idx: number) => void): void {
    const r0 = (center / N) | 0;
    const c0 = center % N;
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      if (r < 0 || r >= N) continue;
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || c >= N) continue;
        fn(r * N + c);
      }
    }
  }
}

/** Rotate cells 90° clockwise, keeping track of which cell carries the special. */
export function rotateCells(cells: readonly Cell[], specialAt: number): { cells: Cell[]; specialAt: number } {
  const rotated = cells.map(([r, c]) => [c, -r] as Cell);
  let minR = Infinity;
  let minC = Infinity;
  for (const [r, c] of rotated) {
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
  }
  const out = normalize(rotated);
  if (specialAt < 0) return { cells: out, specialAt: -1 };
  const sr = rotated[specialAt][0] - minR;
  const sc = rotated[specialAt][1] - minC;
  return { cells: out, specialAt: out.findIndex(([r, c]) => r === sr && c === sc) };
}

function isIntArray(a: unknown, len: number, min: number, max: number): a is number[] {
  return Array.isArray(a) && a.length === len && a.every((x) => Number.isInteger(x) && x >= min && x <= max);
}

function isValidPiece(p: unknown): p is Piece {
  const q = p as Piece;
  if (!q || !Array.isArray(q.cells) || q.cells.length < 1 || q.cells.length > 9) return false;
  if (!q.cells.every((c) => Array.isArray(c) && c.length === 2 && c.every((v) => Number.isInteger(v) && v >= 0 && v < N))) {
    return false;
  }
  if (!Number.isInteger(q.color) || q.color < 1 || q.color > COLOR_COUNT) return false;
  if (q.special !== Special.None && q.special !== Special.Bomb && q.special !== Special.Gem) return false;
  if (!Number.isInteger(q.specialAt) || q.specialAt < -1 || q.specialAt >= q.cells.length) return false;
  if (q.special !== Special.None && q.specialAt < 0) return false;
  return true;
}
