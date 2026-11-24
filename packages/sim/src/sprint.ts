import type { SprintRuleset } from './rulesets';

/**
 * 100m sprint simulation.
 *
 * The result of a race is a pure function of (ruleset, text, input log).
 * There is no clock and no randomness in here: time only exists as the
 * integer millisecond timestamps carried by the input events, measured
 * from the starting gun (negative means before the gun).
 */

export interface InputEvent {
  /** Integer milliseconds since the gun. Negative before the gun. */
  readonly t: number;
  /** The single character the key produced. */
  readonly ch: string;
}

export type StepKind =
  | 'advance' // correct key, athlete moves one metre
  | 'finish' // correct key that completes the race
  | 'error' // wrong key, stumble and lockout begin
  | 'locked' // key ignored because a lockout is active
  | 'falseStart' // key before the gun or faster than a legal reaction
  | 'afterFinish'; // key after the race ended, ignored

export interface SprintState {
  readonly ruleset: SprintRuleset;
  readonly text: string;
  /** Metres covered, which is the count of correct characters. */
  pos: number;
  /** Keys with t below this are ignored. */
  lockedUntil: number;
  lastT: number;
  errors: number;
  ignored: number;
  falseStart: boolean;
  reactionMs: number | null;
  /** advanceTimes[i] is the time the athlete reached metre i + 1. */
  advanceTimes: number[];
  finished: boolean;
}

export interface Split {
  readonly mark: number;
  readonly tMs: number;
}

export interface SprintResult {
  readonly rulesetId: string;
  readonly finished: boolean;
  /** Official time in ms, or null if the race was not completed. */
  readonly timeMs: number | null;
  readonly reactionMs: number | null;
  readonly falseStart: boolean;
  readonly distance: number;
  readonly errors: number;
  readonly ignored: number;
  /** Correct keys divided by correct plus wrong keys, 0 to 1. */
  readonly accuracy: number;
  /** Words per minute at five characters per word, over the official time. */
  readonly wpm: number | null;
  readonly splits: readonly Split[];
  readonly advanceTimes: readonly number[];
}

export class SimInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimInputError';
  }
}

export function createSprint(ruleset: SprintRuleset, text: string): SprintState {
  if (text.length !== ruleset.distance) {
    throw new SimInputError(
      `text length ${text.length} does not match race distance ${ruleset.distance}`,
    );
  }
  return {
    ruleset,
    text,
    pos: 0,
    lockedUntil: Number.NEGATIVE_INFINITY,
    lastT: Number.NEGATIVE_INFINITY,
    errors: 0,
    ignored: 0,
    falseStart: false,
    reactionMs: null,
    advanceTimes: [],
    finished: false,
  };
}

/** Applies one keystroke and reports what it did. Mutates the state. */
export function applyInput(state: SprintState, ev: InputEvent): StepKind {
  if (!Number.isInteger(ev.t)) {
    throw new SimInputError(`timestamp must be an integer number of ms, got ${ev.t}`);
  }
  if (typeof ev.ch !== 'string' || ev.ch.length !== 1) {
    throw new SimInputError('input must be exactly one character');
  }
  if (ev.t < state.lastT) {
    throw new SimInputError(`timestamps must not decrease (${ev.t} after ${state.lastT})`);
  }
  if (state.finished) return 'afterFinish';

  const r = state.ruleset;
  state.lastT = ev.t;

  // Any key before the gun is a false start.
  if (ev.t < 0) {
    state.falseStart = true;
    state.lockedUntil = Math.max(state.lockedUntil, r.falseStartPenaltyMs);
    return 'falseStart';
  }

  // The first key after the gun sets the reaction time. Too fast is a false start.
  if (state.reactionMs === null) {
    state.reactionMs = ev.t;
    if (ev.t < r.minReactionMs) {
      state.falseStart = true;
      state.lockedUntil = Math.max(state.lockedUntil, ev.t + r.falseStartPenaltyMs);
      return 'falseStart';
    }
  }

  if (ev.t < state.lockedUntil) {
    state.ignored += 1;
    return 'locked';
  }

  if (ev.ch === state.text[state.pos]) {
    state.pos += 1;
    state.advanceTimes.push(ev.t);
    if (state.pos === r.distance) {
      state.finished = true;
      return 'finish';
    }
    return 'advance';
  }

  state.errors += 1;
  state.lockedUntil = ev.t + r.errorLockoutMs;
  return 'error';
}

export function summarize(state: SprintState): SprintResult {
  const r = state.ruleset;
  const timeMs = state.finished ? (state.advanceTimes[r.distance - 1] ?? null) : null;
  const typed = state.pos + state.errors;
  const splits: Split[] = [];
  for (const mark of r.splitMarks) {
    const t = state.advanceTimes[mark - 1];
    if (t !== undefined) splits.push({ mark, tMs: t });
  }
  return {
    rulesetId: r.id,
    finished: state.finished,
    timeMs,
    reactionMs: state.reactionMs,
    falseStart: state.falseStart,
    distance: state.pos,
    errors: state.errors,
    ignored: state.ignored,
    accuracy: typed === 0 ? 1 : state.pos / typed,
    wpm: timeMs !== null && timeMs > 0 ? r.distance / 5 / (timeMs / 60000) : null,
    splits,
    advanceTimes: state.advanceTimes.slice(),
  };
}

/** Runs a whole input log. This is what a ranked server will call. */
export function simulate(
  ruleset: SprintRuleset,
  text: string,
  log: readonly InputEvent[],
): SprintResult {
  const state = createSprint(ruleset, text);
  for (const ev of log) applyInput(state, ev);
  return summarize(state);
}

/** Metres covered at time t, given the advance times of a run. Used for ghosts. */
export function positionAt(advanceTimes: readonly number[], t: number): number {
  let lo = 0;
  let hi = advanceTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((advanceTimes[mid] as number) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type Medal = 'worldClass' | 'gold' | 'silver' | 'bronze' | null;

export function medalFor(ruleset: SprintRuleset, timeMs: number | null): Medal {
  if (timeMs === null) return null;
  const m = ruleset.medalsMs;
  if (timeMs <= m.worldClass) return 'worldClass';
  if (timeMs <= m.gold) return 'gold';
  if (timeMs <= m.silver) return 'silver';
  if (timeMs <= m.bronze) return 'bronze';
  return null;
}

/** Formats milliseconds as an athletics time, e.g. 10050 -> "10.05". */
export function formatTime(ms: number): string {
  const centis = Math.floor(ms / 10);
  const whole = Math.floor(centis / 100);
  const frac = centis % 100;
  if (whole >= 60) {
    const min = Math.floor(whole / 60);
    const sec = whole % 60;
    return `${min}:${String(sec).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
  }
  return `${whole}.${String(frac).padStart(2, '0')}`;
}
