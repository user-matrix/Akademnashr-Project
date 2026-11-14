import { BOARD_SIZE, COLOR_COUNT, DIFFICULTY, SPECIALS } from '../config';
import { canPlaceAll, filledCount, fits, fullLines, type Rows } from './masks';
import type { Rng } from './rng';
import { POOL_BY_TIER, SHAPE_POOL, geomOf, type Cell, type Geom, type ShapeDef } from './shapes';

export const Special = { None: 0, Bomb: 1, Gem: 2 } as const;
export type Special = (typeof Special)[keyof typeof Special];

export interface Piece {
  cells: Cell[];
  /** 1..COLOR_COUNT */
  color: number;
  /** Index into `cells` of the block carrying a special, or -1. */
  specialAt: number;
  special: Special;
  /** Set by the Rotate booster: the player may rotate this piece freely until it is placed. */
  rotatable: boolean;
}

export interface DealOptions {
  /** 0 (easy) .. 1 (hard). */
  difficulty: number;
  /** Always guarantee the three pieces can be placed in some order (used by Reroll / Revive). */
  forceSolvable?: boolean;
  fever?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function pickWeighted(defs: readonly ShapeDef[], rng: Rng): ShapeDef {
  let total = 0;
  for (const d of defs) total += d.weight;
  let x = rng.next() * total;
  for (const d of defs) {
    x -= d.weight;
    if (x < 0) return d;
  }
  return defs[defs.length - 1];
}

function pickTier(weights: readonly number[], rng: Rng): number {
  const total = weights[0] + weights[1] + weights[2];
  let x = rng.next() * total;
  for (let t = 0; t < 3; t++) {
    x -= weights[t];
    if (x < 0) return t;
  }
  return 2;
}

/** A random shape that can complete at least one line right now (the "helping hand"). */
function findClearingShape(rows: Rows, rng: Rng): Geom | null {
  const candidates: Geom[] = [];
  for (const def of SHAPE_POOL) {
    const g = def.geom;
    let found = false;
    for (let r = 0; r + g.h <= BOARD_SIZE && !found; r++) {
      for (let c = 0; c + g.w <= BOARD_SIZE && !found; c++) {
        if (!fits(rows, g, r, c)) continue;
        const next = rows.slice();
        for (let i = 0; i < g.h; i++) next[r + i] |= g.masks[i] << c;
        const { rowBits, colBits } = fullLines(next);
        if (rowBits || colBits) found = true;
      }
    }
    if (found) candidates.push(g);
  }
  if (candidates.length === 0) return null;
  // Prefer bigger pieces: completing a line with a big piece feels better and keeps the board moving.
  candidates.sort((a, b) => b.size - a.size);
  const top = candidates.slice(0, Math.max(3, Math.ceil(candidates.length / 2)));
  return rng.pick(top);
}

function decorate(geoms: Geom[], rng: Rng, opts: DealOptions): Piece[] {
  const bombChance = SPECIALS.bombChance + (opts.fever ? SPECIALS.feverBonus : 0);
  const gemChance = SPECIALS.gemChance + (opts.fever ? SPECIALS.feverBonus : 0);
  return geoms.map((g) => {
    const color = 1 + rng.int(COLOR_COUNT);
    let special: Special = Special.None;
    let specialAt = -1;
    const roll = rng.next();
    if (g.size >= 2 && roll < bombChance) special = Special.Bomb;
    else if (roll < bombChance + gemChance) special = Special.Gem;
    if (special !== Special.None) specialAt = rng.int(g.size);
    return { cells: g.cells.map((c) => [c[0], c[1]] as Cell), color, special, specialAt, rotatable: false };
  });
}

/**
 * Deal three pieces. Fairness rules:
 *  - early on, every set is guaranteed placeable; the guarantee fades with difficulty so games end;
 *  - a "helping hand" piece that can complete a line is often included;
 *  - when the board is crowded, small pieces become more likely (mercy).
 * Fully deterministic for a given RNG state, which makes the daily challenge identical for everyone.
 */
export function dealPieces(rows: Rows, rng: Rng, opts: DealOptions): Piece[] {
  const d = Math.min(1, Math.max(0, opts.difficulty));
  const weights = [0, 1, 2].map((i) => lerp(DIFFICULTY.tierWeightsEasy[i], DIFFICULTY.tierWeightsHard[i], d));
  const fill = filledCount(rows) / (BOARD_SIZE * BOARD_SIZE);
  if (fill > 0.5) {
    const mercy = (fill - 0.5) * 0.8;
    weights[0] += mercy;
    weights[2] = Math.max(0.05, weights[2] - mercy);
  }
  const requireSolvable =
    !!opts.forceSolvable || rng.next() < lerp(DIFFICULTY.solvableChance[0], DIFFICULTY.solvableChance[1], d);
  const helpChance = lerp(DIFFICULTY.helpChance[0], DIFFICULTY.helpChance[1], d);

  for (let attempt = 0; attempt < 24; attempt++) {
    const geoms: Geom[] = [];
    if (rng.next() < helpChance) {
      const helper = findClearingShape(rows, rng);
      if (helper) geoms.push(helper);
    }
    while (geoms.length < 3) geoms.push(pickWeighted(POOL_BY_TIER[pickTier(weights, rng)], rng).geom);
    if (!requireSolvable || canPlaceAll(rows, geoms)) return decorate(rng.shuffle(geoms), rng, opts);
  }
  // Fallback: small pieces only.
  for (let attempt = 0; attempt < 16; attempt++) {
    const geoms = [0, 1, 2].map(() => pickWeighted(POOL_BY_TIER[0], rng).geom);
    if (canPlaceAll(rows, geoms)) return decorate(geoms, rng, opts);
  }
  const dot = geomOf([[0, 0]]);
  return decorate([dot, dot, dot], rng, opts);
}
