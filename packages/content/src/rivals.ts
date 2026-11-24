import { createRng } from './prng';

/**
 * Training rivals: computer athletes for Train mode, slowest to fastest.
 * Each is named for an animal that matches its pace. Beat all of them at
 * a distance to earn that distance's Meet Champion badge.
 *
 * A rival does not get special treatment. It "types" a keystroke log that
 * is run through the same simulation as the player's, so it obeys the same
 * start rule and pays the same price for a wrong key.
 */
export interface Rival {
  readonly id: string;
  readonly name: string;
  /** Typing speed the rival averages over a race, in words per minute. */
  readonly wpm: number;
  readonly reactionMs: number;
  /** Chance of a wrong key on any character. */
  readonly errorRate: number;
  /** How uneven the rhythm is: 0 is a metronome, 0.4 is ragged. */
  readonly jitter: number;
  /** Kit colour, as a hex tint for the athlete sprite. */
  readonly tint: number;
}

export const RIVALS: readonly Rival[] = Object.freeze([
  { id: 'snail', name: 'THE SNAIL', wpm: 20, reactionMs: 420, errorRate: 0.03, jitter: 0.4, tint: 0xb9e08a },
  { id: 'tortoise', name: 'THE TORTOISE', wpm: 30, reactionMs: 360, errorRate: 0.025, jitter: 0.35, tint: 0x7fd6a0 },
  { id: 'penguin', name: 'THE PENGUIN', wpm: 40, reactionMs: 310, errorRate: 0.02, jitter: 0.32, tint: 0x8fd0ff },
  { id: 'fox', name: 'THE FOX', wpm: 55, reactionMs: 270, errorRate: 0.018, jitter: 0.28, tint: 0xffa35c },
  { id: 'hare', name: 'THE HARE', wpm: 70, reactionMs: 240, errorRate: 0.015, jitter: 0.26, tint: 0xf4d6a0 },
  { id: 'gazelle', name: 'THE GAZELLE', wpm: 85, reactionMs: 210, errorRate: 0.012, jitter: 0.22, tint: 0xffd23f },
  { id: 'cheetah', name: 'THE CHEETAH', wpm: 100, reactionMs: 185, errorRate: 0.01, jitter: 0.2, tint: 0xff7a5c },
  { id: 'falcon', name: 'THE FALCON', wpm: 120, reactionMs: 160, errorRate: 0.006, jitter: 0.16, tint: 0xc9a0ff },
]);

export function rivalById(id: string | null | undefined): Rival | null {
  return RIVALS.find((r) => r.id === id) ?? null;
}

/** The slowest rival not yet beaten, or null when all are beaten. */
export function nextRival(beaten: readonly string[]): Rival | null {
  return RIVALS.find((r) => !beaten.includes(r.id)) ?? null;
}

export function allRivalsBeaten(beaten: readonly string[]): boolean {
  return RIVALS.every((r) => beaten.includes(r.id));
}

export interface AiKey {
  /** Integer milliseconds since the gun. */
  readonly t: number;
  readonly ch: string;
}

/**
 * Generates the keystroke log a rival types for a line of text.
 *
 * The rhythm is uneven by the rival's jitter, wrong keys happen at its
 * error rate, and the gaps are then scaled so the race takes the time its
 * words-per-minute figure promises, give or take 1.5% on the day. The same
 * rival, text and seed always produce the same log.
 *
 * @param lockoutMs the stumble lockout of the ruleset being raced; the
 *   rival waits it out before typing the right key after a mistake.
 */
export function generateAiLog(rival: Rival, text: string, seed: string, lockoutMs = 200): AiKey[] {
  const n = text.length;
  if (n === 0) return [];
  const rng = createRng(`ai:${rival.id}:${seed}`);
  const targetMs = (n / 5 / rival.wpm) * 60000 * (0.985 + rng.next() * 0.03);
  const recoverMs = lockoutMs + 40;

  const gaps: number[] = [];
  const mistakes = new Set<number>();
  let gapSum = 0;
  for (let i = 1; i < n; i++) {
    const gap = 1 + (rng.next() * 2 - 1) * rival.jitter;
    gaps.push(gap);
    gapSum += gap;
    if (rng.next() < rival.errorRate) mistakes.add(i);
  }

  // Time left for actual typing once the reaction and the stumbles are paid for.
  const budget = Math.max(n * 25, targetMs - rival.reactionMs - mistakes.size * recoverMs);
  const scale = gapSum > 0 ? budget / gapSum : 0;

  const keys: AiKey[] = [];
  let clock = rival.reactionMs;
  keys.push({ t: Math.round(clock), ch: text[0] as string });
  for (let i = 1; i < n; i++) {
    clock += (gaps[i - 1] as number) * scale;
    const right = text[i] as string;
    if (mistakes.has(i)) {
      keys.push({ t: Math.round(clock), ch: right === 'x' ? 'z' : 'x' });
      clock += recoverMs;
    }
    keys.push({ t: Math.round(clock), ch: right });
  }
  return keys;
}
