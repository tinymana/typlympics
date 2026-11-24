import { createRng } from './prng';

/**
 * Training rivals: the Typlympics opponent roster for Train mode, slowest
 * to fastest. Names, nicknames and speed bands are the creative director's
 * (roster of 2026-11-24). Beat all of them at a distance to earn that
 * distance's Meet Champion badge.
 *
 * A rival does not get special treatment. It "types" a keystroke log that
 * is run through the same simulation as the player's, so it obeys the same
 * start rule and pays the same price for a wrong key.
 */
export interface Rival {
  readonly id: string;
  /** Roster number, 1 to 10. */
  readonly number: number;
  readonly name: string;
  /** The animal the rival is known as, e.g. "Turtle". */
  readonly nickname: string;
  /** Speed band in words per minute. Each race is typed at a speed inside it. */
  readonly wpmMin: number;
  readonly wpmMax: number;
  /** The band as shown to players, e.g. "25-34 WPM". */
  readonly band: string;
  readonly reactionMs: number;
  /** Chance of a wrong key on any character. */
  readonly errorRate: number;
  /** How uneven the rhythm is: 0 is a metronome, 0.4 is ragged. */
  readonly jitter: number;
  /** Kit colour, as a hex tint for the athlete sprite. */
  readonly tint: number;
}

export const RIVALS: readonly Rival[] = Object.freeze([
  { id: 'turtle', number: 1, name: 'TERRY SHELLMAN', nickname: 'TURTLE', wpmMin: 18, wpmMax: 24, band: 'UNDER 25 WPM', reactionMs: 440, errorRate: 0.03, jitter: 0.4, tint: 0x8fd67a },
  { id: 'sloth', number: 2, name: 'SLEEPY STEVE', nickname: 'SLOTH', wpmMin: 25, wpmMax: 34, band: '25-34 WPM', reactionMs: 400, errorRate: 0.027, jitter: 0.38, tint: 0xc9a27a },
  { id: 'penguin', number: 3, name: 'FROSTBITE', nickname: 'PENGUIN', wpmMin: 35, wpmMax: 44, band: '35-44 WPM', reactionMs: 340, errorRate: 0.022, jitter: 0.33, tint: 0x8fd0ff },
  { id: 'rabbit', number: 4, name: 'RICKY RAPID', nickname: 'RABBIT', wpmMin: 45, wpmMax: 54, band: '45-54 WPM', reactionMs: 300, errorRate: 0.02, jitter: 0.3, tint: 0xffc2d6 },
  { id: 'fox', number: 5, name: 'THE SLY GUY', nickname: 'FOX', wpmMin: 55, wpmMax: 64, band: '55-64 WPM', reactionMs: 270, errorRate: 0.018, jitter: 0.28, tint: 0xffa35c },
  { id: 'wolf', number: 6, name: 'WOLFGANG', nickname: 'WOLF', wpmMin: 65, wpmMax: 74, band: '65-74 WPM', reactionMs: 245, errorRate: 0.015, jitter: 0.26, tint: 0xb9b6d6 },
  { id: 'lion', number: 7, name: 'KING LEO', nickname: 'LION', wpmMin: 75, wpmMax: 84, band: '75-84 WPM', reactionMs: 225, errorRate: 0.013, jitter: 0.23, tint: 0xffc24a },
  { id: 'gazelle', number: 8, name: 'LIGHTNING LEGS', nickname: 'GAZELLE', wpmMin: 85, wpmMax: 94, band: '85-94 WPM', reactionMs: 205, errorRate: 0.011, jitter: 0.21, tint: 0xffe08a },
  { id: 'cheetah', number: 9, name: 'SPEED DEMON', nickname: 'CHEETAH', wpmMin: 95, wpmMax: 109, band: '95-109 WPM', reactionMs: 185, errorRate: 0.009, jitter: 0.19, tint: 0xff9a5c },
  { id: 'falcon', number: 10, name: 'THE PEREGRINE', nickname: 'FALCON', wpmMin: 110, wpmMax: 125, band: '110+ WPM', reactionMs: 160, errorRate: 0.006, jitter: 0.16, tint: 0xc9a0ff },
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
 * Each race the rival picks a speed inside its band. The rhythm is uneven
 * by its jitter, wrong keys happen at its error rate, and the gaps are then
 * scaled so the whole race, stumbles included, takes the time that speed
 * promises. The same rival, text and seed always produce the same log.
 *
 * @param lockoutMs the stumble lockout of the ruleset being raced; the
 *   rival waits it out before typing the right key after a mistake.
 */
export function generateAiLog(rival: Rival, text: string, seed: string, lockoutMs = 200): AiKey[] {
  const n = text.length;
  if (n === 0) return [];
  const rng = createRng(`ai:${rival.id}:${seed}`);
  const wpm = rival.wpmMin + rng.next() * (rival.wpmMax - rival.wpmMin);
  const targetMs = (n / 5 / wpm) * 60000;
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
