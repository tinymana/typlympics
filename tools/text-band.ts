/**
 * Prints the difficulty distribution of raw sprint lines, used to choose
 * DIFFICULTY_BAND in packages/content/src/generator.ts.
 *
 *   npx tsx tools/text-band.ts
 */
import { buildLine, createRng, scoreDifficulty } from '../packages/content/src/index';

const N = 20000;
const rng = createRng('band-analysis');
const scores: number[] = [];
for (let i = 0; i < N; i++) scores.push(scoreDifficulty(buildLine(rng, 100)));
scores.sort((a, b) => a - b);
const pct = (p: number): number => scores[Math.floor((p / 100) * (N - 1))] as number;
for (const p of [1, 5, 15, 25, 50, 75, 85, 95, 99]) {
  console.log(`p${String(p).padStart(2, '0')}: ${pct(p)}`);
}
