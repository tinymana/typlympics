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

export type EventId = '100m' | '200m' | '400m' | '800m' | '1500m';

export const EVENT_IDS: readonly EventId[] = Object.freeze(['100m', '200m', '400m', '800m', '1500m']);

export interface SprintRuleset {
  readonly id: string;
  readonly event: EventId;
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

/**
 * The longer track events. They run on the sprint's rules, with one
 * character per metre, so only the distance, the split marks and the time
 * standards differ. The standards are the same typing speeds as the 100m
 * (60, 80, 100 and 120 words per minute) held over the longer distance.
 */
function trackRuleset(event: EventId, distance: number, splitMarks: number[]): SprintRuleset {
  const at = (wpm: number): number => Math.round((distance / 5 / wpm) * 60000);
  return Object.freeze({
    id: `${event}@1`,
    event,
    version: 1,
    distance,
    errorLockoutMs: 200,
    falseStartPenaltyMs: 300,
    minReactionMs: 100,
    splitMarks: Object.freeze(splitMarks),
    medalsMs: Object.freeze({ bronze: at(60), silver: at(80), gold: at(100), worldClass: at(120) }),
  });
}

export const TRACK_200M_V1 = trackRuleset('200m', 200, [50, 100, 150, 200]);
export const TRACK_400M_V1 = trackRuleset('400m', 400, [100, 200, 300, 400]);
export const TRACK_800M_V1 = trackRuleset('800m', 800, [200, 400, 600, 800]);
export const TRACK_1500M_V1 = trackRuleset('1500m', 1500, [400, 800, 1200, 1500]);

/** The current ruleset for each event. */
export const RULESETS: Readonly<Record<EventId, SprintRuleset>> = Object.freeze({
  '100m': SPRINT_100M_V1,
  '200m': TRACK_200M_V1,
  '400m': TRACK_400M_V1,
  '800m': TRACK_800M_V1,
  '1500m': TRACK_1500M_V1,
});

export function rulesetFor(event: string | null | undefined): SprintRuleset {
  return RULESETS[event as EventId] ?? SPRINT_100M_V1;
}

/** Display label for an event, e.g. "1500 M". */
export function eventLabel(event: EventId): string {
  return `${event.replace('m', '')} M`;
}
