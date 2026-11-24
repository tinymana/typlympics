import { createRng, type Rng } from './prng';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, SPRINT_WORDS } from './words';

/** Bump when the word list, the algorithm or the band changes. */
export const GENERATOR_VERSION = 1;

/**
 * Lines whose difficulty falls outside this band are re-rolled, so that
 * times set on different seeds are comparable. Values come from
 * tools/text-band.ts (roughly the 15th to 85th percentile of raw lines).
 */
export const DIFFICULTY_BAND: { readonly min: number; readonly max: number } = Object.freeze({
  min: 5.5,
  max: 13.5,
});

const MAX_ATTEMPTS = 200;

const WORDS_BY_LENGTH: ReadonlyMap<number, readonly string[]> = (() => {
  const map = new Map<number, string[]>();
  for (const w of SPRINT_WORDS) {
    const list = map.get(w.length) ?? [];
    list.push(w);
    map.set(w.length, list);
  }
  return map;
})();

// Which finger types each letter on a QWERTY layout. Used only to estimate
// difficulty; input itself is layout independent.
const FINGER: Readonly<Record<string, number>> = (() => {
  const groups = ['qaz', 'wsx', 'edc', 'rfvtgb', 'yhnujm', 'ik', 'ol', 'p'];
  const map: Record<string, number> = {};
  groups.forEach((g, i) => {
    for (const ch of g) map[ch] = i;
  });
  return map;
})();

const RARE = new Set(['q', 'z', 'x', 'j']);

/**
 * Difficulty estimate for a line. Higher is harder.
 * Same-finger letter pairs slow everyone down the most; rare letters and
 * doubled letters a little.
 */
export function scoreDifficulty(text: string): number {
  let score = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (RARE.has(ch)) score += 1.5;
    if (i === 0) continue;
    const prev = text[i - 1] as string;
    if (ch === ' ' || prev === ' ') continue;
    if (ch === prev) score += 0.5;
    else if (FINGER[ch] !== undefined && FINGER[ch] === FINGER[prev]) score += 2;
  }
  return score;
}

/** Builds one line of exactly `length` characters from whole words. */
export function buildLine(rng: Rng, length: number): string {
  if (length < MIN_WORD_LENGTH) throw new Error(`length ${length} is too short for a line`);
  const words: string[] = [];
  let remaining = length;
  let last = '';
  for (;;) {
    if (remaining <= MAX_WORD_LENGTH) {
      // Close the line with a word that fits exactly.
      const exact = (WORDS_BY_LENGTH.get(remaining) ?? []).filter((w) => w !== last);
      words.push(rng.pick(exact));
      break;
    }
    // Any word is fine as long as what is left can still be filled.
    let word: string;
    do {
      word = rng.pick(SPRINT_WORDS);
    } while (word === last || remaining - word.length - 1 < MIN_WORD_LENGTH);
    words.push(word);
    last = word;
    remaining -= word.length + 1;
  }
  return words.join(' ');
}

export interface SprintLine {
  readonly seed: string;
  readonly text: string;
  readonly difficulty: number;
  /** How many candidates were rolled before one landed in the band. */
  readonly attempts: number;
  readonly generatorVersion: number;
}

/** Deterministically generates the sprint line for a seed. */
export function generateSprintLine(seed: string, length = 100): SprintLine {
  const rng = createRng(`sprint:${GENERATOR_VERSION}:${length}:${seed}`);
  let best: { text: string; difficulty: number; distance: number } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = buildLine(rng, length);
    const difficulty = scoreDifficulty(text);
    if (difficulty >= DIFFICULTY_BAND.min && difficulty <= DIFFICULTY_BAND.max) {
      return { seed, text, difficulty, attempts: attempt, generatorVersion: GENERATOR_VERSION };
    }
    const distance = Math.min(
      Math.abs(difficulty - DIFFICULTY_BAND.min),
      Math.abs(difficulty - DIFFICULTY_BAND.max),
    );
    if (best === null || distance < best.distance) best = { text, difficulty, distance };
  }
  // Practically unreachable; fall back to the closest candidate.
  const fallback = best as { text: string; difficulty: number };
  return {
    seed,
    text: fallback.text,
    difficulty: fallback.difficulty,
    attempts: MAX_ATTEMPTS,
    generatorVersion: GENERATOR_VERSION,
  };
}
