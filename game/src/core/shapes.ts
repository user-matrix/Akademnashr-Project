import { BOARD_SIZE } from '../config';

/** [row, col] offset of one block inside a piece. */
export type Cell = readonly [number, number];

export type Tier = 0 | 1 | 2;

/** Precomputed geometry of a piece orientation, used for fast bitmask placement tests. */
export interface Geom {
  key: string;
  cells: Cell[];
  w: number;
  h: number;
  /** masks[i] = bitmask of occupied columns in piece row i (bit c = column c). */
  masks: number[];
  size: number;
}

export interface ShapeDef {
  geom: Geom;
  tier: Tier;
  weight: number;
}

/** Sort + shift cells so the bounding box starts at (0,0). */
export function normalize(cells: readonly Cell[]): Cell[] {
  let minR = Infinity;
  let minC = Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
  }
  return cells
    .map(([r, c]) => [r - minR, c - minC] as Cell)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function cellsKey(cells: readonly Cell[]): string {
  return cells.map(([r, c]) => `${r}${c}`).join('.');
}

/** Rotate 90° clockwise. */
export function rotateCW(cells: readonly Cell[]): Cell[] {
  return normalize(cells.map(([r, c]) => [c, -r] as Cell));
}

export function mirror(cells: readonly Cell[]): Cell[] {
  return normalize(cells.map(([r, c]) => [r, -c] as Cell));
}

const geomCache = new Map<string, Geom>();

export function geomOf(rawCells: readonly Cell[]): Geom {
  const cells = normalize(rawCells);
  const key = cellsKey(cells);
  const cached = geomCache.get(key);
  if (cached) return cached;
  let w = 0;
  let h = 0;
  for (const [r, c] of cells) {
    if (c + 1 > w) w = c + 1;
    if (r + 1 > h) h = r + 1;
  }
  const masks = new Array<number>(h).fill(0);
  for (const [r, c] of cells) masks[r] |= 1 << c;
  const g: Geom = { key, cells, w, h, masks, size: cells.length };
  geomCache.set(key, g);
  return g;
}

function parseArt(art: string[]): Cell[] {
  const cells: Cell[] = [];
  art.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) if (line[c] === '#') cells.push([r, c]);
  });
  return cells;
}

/** All distinct orientations (rotations, optionally mirrors) of a base shape. */
function orientations(base: Cell[], allowMirror: boolean): Cell[][] {
  const out = new Map<string, Cell[]>();
  let cur = normalize(base);
  for (let i = 0; i < 4; i++) {
    out.set(cellsKey(cur), cur);
    if (allowMirror) {
      const m = mirror(cur);
      out.set(cellsKey(m), m);
    }
    cur = rotateCW(cur);
  }
  return [...out.values()];
}

interface BaseShape {
  art: string[];
  tier: Tier;
  /** Relative frequency of the whole family; split evenly between its orientations. */
  weight: number;
  mirror?: boolean;
}

const BASE_SHAPES: BaseShape[] = [
  // Small (tier 0)
  { art: ['#'], tier: 0, weight: 2 },
  { art: ['##'], tier: 0, weight: 3 },
  { art: ['###'], tier: 0, weight: 3 },
  { art: ['##', '#.'], tier: 0, weight: 3 },
  { art: ['#.', '.#'], tier: 0, weight: 1 },
  // Medium (tier 1)
  { art: ['####'], tier: 1, weight: 3 },
  { art: ['##', '##'], tier: 1, weight: 4 },
  { art: ['###', '#..'], tier: 1, weight: 3, mirror: true },
  { art: ['###', '.#.'], tier: 1, weight: 2 },
  { art: ['##.', '.##'], tier: 1, weight: 2, mirror: true },
  // Large (tier 2)
  { art: ['#####'], tier: 2, weight: 3 },
  { art: ['###', '###'], tier: 2, weight: 3 },
  { art: ['###', '###', '###'], tier: 2, weight: 2 },
  { art: ['###', '#..', '#..'], tier: 2, weight: 3 },
  { art: ['#..', '.#.', '..#'], tier: 2, weight: 1 },
];

function buildPool(): ShapeDef[] {
  const pool: ShapeDef[] = [];
  for (const b of BASE_SHAPES) {
    const ors = orientations(parseArt(b.art), !!b.mirror);
    for (const cells of ors) {
      const geom = geomOf(cells);
      if (geom.w > BOARD_SIZE || geom.h > BOARD_SIZE) continue;
      pool.push({ geom, tier: b.tier, weight: b.weight / ors.length });
    }
  }
  return pool;
}

export const SHAPE_POOL: readonly ShapeDef[] = buildPool();

export const POOL_BY_TIER: readonly (readonly ShapeDef[])[] = [0, 1, 2].map((t) =>
  SHAPE_POOL.filter((s) => s.tier === t),
);
