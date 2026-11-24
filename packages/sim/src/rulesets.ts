/**
 * Rulesets hold every approved mechanic as data.
 *
 * A ruleset is immutable once it has been used for a recorded result.
 * Changing a mechanic means adding a new version here and a line in
 * MECHANICS.md with the creative director's approval.
 */

export interface MedalTimesMs {
  readonly bronze: number;
  readonly silver: number;
  readonly gold: number;
  readonly worldClass: number;
}

export interface SprintRuleset {
  readonly id: string;
  readonly event: '100m';
  readonly version: number;
  /** Race length in characters. One correct character is one metre. */
  readonly distance: number;
  /** Input is ignored for this long after a wrong key. */
  readonly errorLockoutMs: number;
  /** Input is ignored for this long after a false start. */
  readonly falseStartPenaltyMs: number;
  /** A first keystroke sooner than this after the gun is a false start. */
  readonly minReactionMs: number;
  /** Distances at which split times are reported. */
  readonly splitMarks: readonly number[];
  readonly medalsMs: MedalTimesMs;
}

export const SPRINT_100M_V1: SprintRuleset = Object.freeze({
  id: '100m@1',
  event: '100m',
  version: 1,
  distance: 100,
  errorLockoutMs: 200,
  falseStartPenaltyMs: 300,
  minReactionMs: 100,
  splitMarks: Object.freeze([30, 60, 100]),
  medalsMs: Object.freeze({ bronze: 20000, silver: 15000, gold: 12000, worldClass: 10000 }),
});
