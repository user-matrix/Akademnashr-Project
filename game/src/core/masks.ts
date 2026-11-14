import { BOARD_SIZE } from '../config';
import type { Geom } from './shapes';

/**
 * Bitboard helpers. A board is BOARD_SIZE row masks; bit c of rows[r] is set when cell (r, c) is filled.
 * These pure functions power the piece generator's look-ahead search, so they must stay allocation-light.
 */
export type Rows = number[];

export const FULL_ROW = (1 << BOARD_SIZE) - 1;

export function fits(rows: Rows, g: Geom, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r + g.h > BOARD_SIZE || c + g.w > BOARD_SIZE) return false;
  for (let i = 0; i < g.h; i++) {
    if (rows[r + i] & (g.masks[i] << c)) return false;
  }
  return true;
}

export function fitsAnywhere(rows: Rows, g: Geom): boolean {
  for (let r = 0; r + g.h <= BOARD_SIZE; r++) {
    for (let c = 0; c + g.w <= BOARD_SIZE; c++) {
      if (fits(rows, g, r, c)) return true;
    }
  }
  return false;
}

/** Bitsets of full rows and full columns. */
export function fullLines(rows: Rows): { rowBits: number; colBits: number } {
  let rowBits = 0;
  let colBits = FULL_ROW;
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (rows[r] === FULL_ROW) rowBits |= 1 << r;
    colBits &= rows[r];
  }
  return { rowBits, colBits };
}

/** Place (assumes it fits), then clear full lines. Returns a new board and the number of cleared lines. */
export function placeAndClear(rows: Rows, g: Geom, r: number, c: number): { rows: Rows; lines: number } {
  const next = rows.slice();
  for (let i = 0; i < g.h; i++) next[r + i] |= g.masks[i] << c;
  const { rowBits, colBits } = fullLines(next);
  if (rowBits === 0 && colBits === 0) return { rows: next, lines: 0 };
  for (let i = 0; i < BOARD_SIZE; i++) {
    next[i] = rowBits & (1 << i) ? 0 : next[i] & ~colBits;
  }
  return { rows: next, lines: popcount(rowBits) + popcount(colBits) };
}

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function filledCount(rows: Rows): number {
  let n = 0;
  for (let i = 0; i < rows.length; i++) n += popcount(rows[i]);
  return n;
}

/**
 * True when the pieces can all be placed in SOME order (clears between placements included).
 * Bounded by a node budget so a pathological board can never stall a frame; on budget exhaustion
 * it answers false, which only makes the generator try another set.
 */
export function canPlaceAll(rows: Rows, pieces: readonly Geom[], budget = 120_000): boolean {
  let nodes = 0;
  const rec = (board: Rows, remaining: readonly Geom[]): boolean => {
    if (remaining.length === 0) return true;
    const tried: string[] = [];
    for (let k = 0; k < remaining.length; k++) {
      const g = remaining[k];
      if (tried.includes(g.key)) continue;
      tried.push(g.key);
      const rest = remaining.filter((_, i) => i !== k);
      for (let r = 0; r + g.h <= BOARD_SIZE; r++) {
        for (let c = 0; c + g.w <= BOARD_SIZE; c++) {
          if (++nodes > budget) return false;
          if (!fits(board, g, r, c)) continue;
          if (rest.length === 0) return true;
          if (rec(placeAndClear(board, g, r, c).rows, rest)) return true;
        }
      }
    }
    return false;
  };
  return rec(rows, pieces);
}
