import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, SCORING } from '../src/config';
import { Game, dailyTargetFor, rotateCells } from '../src/core/game';
import { dealPieces, Special, type Piece } from '../src/core/generator';
import { canPlaceAll, fits, FULL_ROW, placeAndClear, type Rows } from '../src/core/masks';
import { Rng } from '../src/core/rng';
import { geomOf, SHAPE_POOL, type Cell } from '../src/core/shapes';

const N = BOARD_SIZE;
const emptyRows = (): Rows => new Array(N).fill(0);

function piece(cells: Cell[], color = 1, special: Special = Special.None, specialAt = -1): Piece {
  return { cells, color, special, specialAt, rotatable: false };
}
const line = (len: number, vertical = false): Cell[] =>
  Array.from({ length: len }, (_, i) => (vertical ? [i, 0] : [0, i]) as Cell);

/** Fill board cells from a list of [r, c] with a colour. */
function fill(g: Game, cells: [number, number][], color = 2) {
  for (const [r, c] of cells) g.color[r * N + c] = color;
}

describe('shapes', () => {
  it('builds a pool of unique, normalised shapes for all tiers', () => {
    const keys = new Set(SHAPE_POOL.map((s) => s.geom.key));
    expect(keys.size).toBe(SHAPE_POOL.length);
    for (const t of [0, 1, 2]) expect(SHAPE_POOL.some((s) => s.tier === t)).toBe(true);
    for (const s of SHAPE_POOL) {
      expect(s.weight).toBeGreaterThan(0);
      expect(Math.min(...s.geom.cells.map((c) => c[0]))).toBe(0);
      expect(Math.min(...s.geom.cells.map((c) => c[1]))).toBe(0);
    }
  });
});

describe('masks', () => {
  it('detects fits and bounds', () => {
    const g = geomOf(line(3));
    const rows = emptyRows();
    expect(fits(rows, g, 0, 5)).toBe(true);
    expect(fits(rows, g, 0, 6)).toBe(false);
    rows[0] = 1 << 6;
    expect(fits(rows, g, 0, 5)).toBe(false);
    expect(fits(rows, g, 0, 3)).toBe(true);
  });

  it('clears a full row and a full column simultaneously', () => {
    const rows = emptyRows();
    rows[3] = FULL_ROW & ~(1 << 4); // row 3 missing col 4
    for (let r = 0; r < N; r++) if (r !== 3) rows[r] |= 1 << 4; // col 4 missing row 3
    const res = placeAndClear(rows, geomOf([[0, 0]]), 3, 4);
    expect(res.lines).toBe(2);
    expect(res.rows.every((x) => x === 0)).toBe(true);
  });

  it('canPlaceAll accounts for clears between placements', () => {
    const rows = new Array(N).fill(FULL_ROW);
    rows[0] = FULL_ROW & ~0b1111; // only 4 free cells in row 0
    // 1x4 fills row 0 → it clears → then a 3x3 fits.
    expect(canPlaceAll(rows, [geomOf(line(4)), geomOf([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]])])).toBe(true);
    // Two 1x4 pieces: after the first clears row 0 the second fits too.
    expect(canPlaceAll(rows, [geomOf(line(4)), geomOf(line(5))])).toBe(true);
    // A 1x5 alone can never fit.
    expect(canPlaceAll(rows, [geomOf(line(5))])).toBe(false);
  });
});

describe('generator', () => {
  it('is deterministic for a given seed', () => {
    const a = dealPieces(emptyRows(), new Rng(42), { difficulty: 0.5 });
    const b = dealPieces(emptyRows(), new Rng(42), { difficulty: 0.5 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('forceSolvable deals are always placeable and generation stays fast', () => {
    const rng = new Rng(7);
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      const rows = emptyRows();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (rng.next() < 0.45) rows[r] |= 1 << c;
      // Leave at least one hole so a dot always fits.
      rows[rng.int(N)] &= ~(1 << rng.int(N));
      const set = dealPieces(rows, rng, { difficulty: rng.next(), forceSolvable: true });
      const geoms = set.map((p) => geomOf(p.cells));
      // Only the small-piece fallback may be unsolvable (board so full even dots can't all fit).
      if (!canPlaceAll(rows, geoms)) expect(set.every((p) => p.cells.length <= 3)).toBe(true);
      for (const p of set) {
        if (p.special !== Special.None) expect(p.specialAt).toBeGreaterThanOrEqual(0);
        expect(p.specialAt).toBeLessThan(p.cells.length);
      }
    }
    const ms = performance.now() - t0;
    expect(ms / 300).toBeLessThan(25); // average per deal, generous for slow CI
  });
});

describe('game', () => {
  it('places, clears a row and scores', () => {
    const g = Game.create('classic', { seed: 1 });
    fill(g, Array.from({ length: 7 }, (_, c) => [0, c] as [number, number]));
    g.tray[0] = piece([[0, 0]], 3);
    const res = g.place(0, 0, 7)!;
    expect(res).not.toBeNull();
    expect(res.lines).toBe(1);
    expect(res.rows).toEqual([0]);
    expect(res.cleared).toHaveLength(8);
    expect(res.allClear).toBe(true);
    expect(res.points).toBe(1 + SCORING.lineBase + SCORING.allClearBonus);
    expect(g.isEmpty()).toBe(true);
  });

  it('rejects illegal placements', () => {
    const g = Game.create('classic', { seed: 1 });
    g.tray[0] = piece(line(3));
    fill(g, [[0, 1]]);
    expect(g.place(0, 0, 0)).toBeNull();
    expect(g.place(0, 0, 6)).toBeNull();
    expect(g.place(0, -1, 0)).toBeNull();
    expect(g.place(0, 1, 0)).not.toBeNull();
  });

  it('awards the perfect-colour bonus for single-colour lines', () => {
    const g = Game.create('classic', { seed: 1 });
    fill(g, Array.from({ length: 7 }, (_, c) => [0, c] as [number, number]), 4);
    fill(g, [[5, 5]], 1); // keep the board non-empty so no all-clear bonus
    g.tray[0] = piece([[0, 0]], 4);
    const res = g.place(0, 0, 7)!;
    expect(res.monoLines).toBe(1);
    expect(res.points).toBe(1 + SCORING.lineBase + SCORING.monoLineBonus);
  });

  it('bombs explode 3x3 and chain', () => {
    const g = Game.create('classic', { seed: 1 });
    fill(g, Array.from({ length: 7 }, (_, c) => [4, c] as [number, number]), 2);
    g.special[4 * N + 2] = Special.Bomb; // bomb in the line
    fill(g, [[3, 1], [5, 3], [6, 3]], 5);
    g.special[5 * N + 3] = Special.Bomb; // second bomb inside first blast → chains to (6,3)
    fill(g, [[0, 0]], 1); // untouched
    g.tray[0] = piece([[0, 0]], 2);
    const res = g.place(0, 4, 7)!;
    expect(res.bombs).toBe(2);
    expect(g.color[3 * N + 1]).toBe(0);
    expect(g.color[6 * N + 3]).toBe(0);
    expect(g.color[0]).toBe(1);
    expect(res.cleared.filter((c) => c.cause === 'bomb').length).toBe(3);
  });

  it('builds streaks, fever and resets after the window', () => {
    const g = Game.create('classic', { seed: 1 });
    let res = null;
    for (let i = 0; i < SCORING.feverStreak; i++) {
      fill(g, Array.from({ length: 7 }, (_, c) => [0, c] as [number, number]));
      fill(g, [[7, 7]], 3);
      g.tray[0] = piece([[0, 0]]);
      res = g.place(0, 0, 7)!;
    }
    expect(res!.streak).toBe(SCORING.feverStreak);
    expect(res!.fever).toBe(true);
    for (let i = 0; i < SCORING.streakWindow; i++) {
      g.tray[0] = piece([[0, 0]]);
      g.place(0, 2, i);
    }
    expect(g.streak).toBe(0);
  });

  it('collects gems', () => {
    const g = Game.create('classic', { seed: 1 });
    fill(g, Array.from({ length: 7 }, (_, c) => [2, c] as [number, number]));
    g.special[2 * N + 3] = Special.Gem;
    g.tray[1] = piece([[0, 0]]);
    expect(g.place(1, 2, 7)!.gems).toBe(1);
    expect(g.gems).toBe(1);
  });

  it('deals a new tray when the last piece is placed', () => {
    const g = Game.create('classic', { seed: 3 });
    g.tray = [piece([[0, 0]]), null, null];
    const res = g.place(0, 0, 0)!;
    expect(res.dealt).toBe(true);
    expect(g.tray.every((p) => p !== null)).toBe(true);
  });

  it('rotation keeps track of the special cell', () => {
    const cells: Cell[] = [[0, 0], [0, 1], [0, 2], [1, 0]]; // L
    const r = rotateCells(cells, 2); // special at (0,2)
    // (0,2) -> (2,-0) -> after normalise shift: rotated cells are (0,0)->(0,0),(0,1)->(1,0),(0,2)->(2,0),(1,0)->(0,-1)
    expect(r.cells[r.specialAt]).toEqual([2, 1]);
    let cur = { cells, specialAt: 2 };
    for (let i = 0; i < 4; i++) cur = rotateCells(cur.cells, cur.specialAt);
    expect(cur.cells).toEqual(cells);
    expect(cur.specialAt).toBe(2);
  });

  it('hammer smashes 3x3 and revive frees space', () => {
    const g = Game.create('classic', { seed: 1 });
    fill(g, [[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect(g.hammer(1, 1)).toHaveLength(3);
    expect(g.hammer(6, 6)).toHaveLength(0);
    for (let i = 0; i < N * N; i++) g.color[i] = (i % 7) + 1 > 6 ? 1 : (i % 7) + 1;
    const freed = g.revive();
    expect(freed).toHaveLength(16);
    expect(g.revived).toBe(true);
    expect(g.hasMoves()).toBe(true);
  });

  it('serialises and restores exactly', () => {
    const g = Game.create('classic', { seed: 99 });
    for (let i = 0; i < 20 && g.hasMoves(); i++) autoMove(g);
    const copy = Game.deserialize(JSON.parse(JSON.stringify(g.serialize())))!;
    expect(copy).not.toBeNull();
    expect(copy.serialize()).toEqual(g.serialize());
    // Same future: identical RNG state.
    autoMove(g);
    autoMove(copy);
    expect(copy.serialize()).toEqual(g.serialize());
  });

  it('rejects corrupt saves', () => {
    expect(Game.deserialize(null)).toBeNull();
    expect(Game.deserialize({ v: 1 })).toBeNull();
    const s = Game.create('classic', { seed: 5 }).serialize();
    expect(Game.deserialize({ ...s, color: [1, 2] })).toBeNull();
    expect(Game.deserialize({ ...s, tray: [{ cells: [[1, 1]], color: 1, special: 0, specialAt: -1 }, null, null] })).toBeNull();
    expect(Game.deserialize({ ...s, score: -5 })).toBeNull();
  });

  it('daily challenge is identical for everyone on the same day', () => {
    const a = Game.create('daily', { dailyKey: '2026-11-14' });
    const b = Game.create('daily', { dailyKey: '2026-11-14' });
    const c = Game.create('daily', { dailyKey: '2026-11-15' });
    expect(a.serialize()).toEqual(b.serialize());
    expect(a.tray).not.toEqual(c.tray);
    expect(a.dailyTarget).toBe(dailyTargetFor('2026-11-14'));
  });

  it('simulated games always terminate and keep invariants', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = Game.create('classic', { seed });
      let guard = 0;
      while (g.hasMoves() && guard++ < 5000) {
        const before = g.score;
        autoMove(g);
        expect(g.score).toBeGreaterThan(before);
        for (let i = 0; i < N * N; i++) if (!g.color[i]) expect(g.special[i]).toBe(0);
      }
      expect(guard).toBeLessThan(5000);
    }
  });
});

/** Greedy bot: first legal move, preferring moves that clear lines. */
function autoMove(g: Game): void {
  let fallback: [number, number, number] | null = null;
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const pv = g.previewLines(s, r, c);
        if (!pv) continue;
        if (pv.rows.length + pv.cols.length > 0) {
          g.place(s, r, c);
          return;
        }
        fallback ??= [s, r, c];
      }
    }
  }
  if (fallback) g.place(...fallback);
}
