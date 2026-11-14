import { it } from 'vitest';
import { Game } from '../src/core/game';

function bestMove(g: Game): [number, number, number] | null {
  // Smarter bot: maximise lines cleared, tie-break by fewer filled cells afterwards & lower position.
  let best: [number, number, number] | null = null;
  let bestScore = -Infinity;
  for (let s = 0; s < 3; s++) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pv = g.previewLines(s, r, c);
    if (!pv) continue;
    const score = (pv.rows.length + pv.cols.length) * 100 + r + Math.random();
    if (score > bestScore) { bestScore = score; best = [s, r, c]; }
  }
  return best;
}

// Opt-in: `npm run balance`. Prints score / length distribution of 200 bot games for tuning config.ts.
it.skipIf(!import.meta.env.BALANCE)('balance report', () => {
  const scores: number[] = []; const moves: number[] = []; let ms = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = Game.create('classic', { seed });
    const t0 = performance.now();
    while (g.hasMoves() && g.moves < 3000) { const m = bestMove(g)!; g.place(...m); }
    ms += performance.now() - t0;
    scores.push(g.score); moves.push(g.moves);
  }
  scores.sort((a, b) => a - b); moves.sort((a, b) => a - b);
  const q = (a: number[], p: number) => a[Math.floor(p * (a.length - 1))];
  console.log('score p10/p50/p90/max', q(scores, .1), q(scores, .5), q(scores, .9), scores[scores.length - 1]);
  console.log('moves p10/p50/p90/max', q(moves, .1), q(moves, .5), q(moves, .9), moves[moves.length - 1]);
  console.log('avg ms per move', (ms / moves.reduce((a, b) => a + b, 0)).toFixed(3));
}, 120_000);
