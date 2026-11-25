import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVENT_IDS,
  RULESETS,
  SPRINT_100M_V1 as R,
  eventLabel,
  rulesetFor,
  SimInputError,
  applyInput,
  createSprint,
  formatTime,
  medalFor,
  positionAt,
  simulate,
  type InputEvent,
} from '../src/index';

const TEXT = 'the quick brown fox jumps over the lazy dog and then runs back home to rest by the warm fire at dusk';
// Guard the fixture itself.
if (TEXT.length !== 100) throw new Error(`fixture is ${TEXT.length} chars`);

/** A clean run: first key at `reaction`, then one key every `interval` ms. */
function cleanLog(reaction: number, interval: number): InputEvent[] {
  return [...TEXT].map((ch, i) => ({ ch, t: reaction + i * interval }));
}

/** Deterministic pseudo-random numbers for the fuzz tests. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sprint rules (ruleset 100m@1)', () => {
  it('one correct character is one metre and the 100th stops the clock', () => {
    const res = simulate(R, TEXT, cleanLog(150, 100));
    expect(res.finished).toBe(true);
    expect(res.distance).toBe(100);
    expect(res.timeMs).toBe(150 + 99 * 100);
    expect(res.reactionMs).toBe(150);
    expect(res.errors).toBe(0);
    expect(res.accuracy).toBe(1);
    expect(res.falseStart).toBe(false);
  });

  it('120 WPM with a 150 ms reaction runs 10.05 s', () => {
    const res = simulate(R, TEXT, cleanLog(150, 100));
    expect(formatTime(res.timeMs as number)).toBe('10.05');
    expect(res.wpm).toBeCloseTo(119.4, 1);
  });

  it('reports splits at 30, 60 and 100 metres', () => {
    const res = simulate(R, TEXT, cleanLog(150, 100));
    expect(res.splits).toEqual([
      { mark: 30, tMs: 150 + 29 * 100 },
      { mark: 60, tMs: 150 + 59 * 100 },
      { mark: 100, tMs: 150 + 99 * 100 },
    ]);
  });

  it('a wrong key stumbles: 200 ms lockout, no backspace needed', () => {
    const s = createSprint(R, TEXT);
    expect(applyInput(s, { t: 200, ch: 't' })).toBe('advance');
    expect(applyInput(s, { t: 300, ch: 'x' })).toBe('error');
    // Inside the lockout even the correct key is ignored.
    expect(applyInput(s, { t: 400, ch: 'h' })).toBe('locked');
    expect(applyInput(s, { t: 499, ch: 'h' })).toBe('locked');
    expect(s.pos).toBe(1);
    // At exactly 200 ms the lockout is over.
    expect(applyInput(s, { t: 500, ch: 'h' })).toBe('advance');
    expect(s.pos).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.ignored).toBe(2);
  });

  it('keys ignored during a lockout do not extend it or count as errors', () => {
    const s = createSprint(R, TEXT);
    applyInput(s, { t: 200, ch: 'z' });
    applyInput(s, { t: 250, ch: 'z' });
    applyInput(s, { t: 399, ch: 'z' });
    expect(s.errors).toBe(1);
    expect(applyInput(s, { t: 400, ch: 't' })).toBe('advance');
  });

  it('a key before the gun is a false start with a 300 ms penalty from the gun', () => {
    const s = createSprint(R, TEXT);
    expect(applyInput(s, { t: -40, ch: 't' })).toBe('falseStart');
    expect(s.pos).toBe(0);
    expect(applyInput(s, { t: 150, ch: 't' })).toBe('locked');
    expect(applyInput(s, { t: 299, ch: 't' })).toBe('locked');
    expect(applyInput(s, { t: 300, ch: 't' })).toBe('advance');
    expect(s.falseStart).toBe(true);
    expect(s.reactionMs).toBe(150);
  });

  it('a reaction under 100 ms is a false start with a 300 ms penalty from that key', () => {
    const s = createSprint(R, TEXT);
    expect(applyInput(s, { t: 60, ch: 't' })).toBe('falseStart');
    expect(s.pos).toBe(0);
    expect(applyInput(s, { t: 359, ch: 't' })).toBe('locked');
    expect(applyInput(s, { t: 360, ch: 't' })).toBe('advance');
    expect(s.falseStart).toBe(true);
    expect(s.reactionMs).toBe(60);
  });

  it('a reaction of exactly 100 ms is legal', () => {
    const s = createSprint(R, TEXT);
    expect(applyInput(s, { t: 100, ch: 't' })).toBe('advance');
    expect(s.falseStart).toBe(false);
  });

  it('accuracy counts wrong keys against correct ones', () => {
    const log = cleanLog(150, 300);
    log.splice(1, 0, { t: 200, ch: 'q' }); // one error, lockout ends at 400 < 450
    const res = simulate(R, TEXT, log);
    expect(res.finished).toBe(true);
    expect(res.errors).toBe(1);
    expect(res.accuracy).toBeCloseTo(100 / 101, 10);
  });

  it('input after the finish is ignored', () => {
    const s = createSprint(R, TEXT);
    for (const ev of cleanLog(150, 100)) applyInput(s, ev);
    expect(s.finished).toBe(true);
    expect(applyInput(s, { t: 99999, ch: 'a' })).toBe('afterFinish');
    expect(s.pos).toBe(100);
  });

  it('an unfinished race has no official time', () => {
    const res = simulate(R, TEXT, cleanLog(150, 100).slice(0, 42));
    expect(res.finished).toBe(false);
    expect(res.timeMs).toBeNull();
    expect(res.wpm).toBeNull();
    expect(res.distance).toBe(42);
  });
});

describe('input validation', () => {
  it('rejects text of the wrong length', () => {
    expect(() => createSprint(R, 'too short')).toThrow(SimInputError);
  });
  it('rejects fractional timestamps', () => {
    expect(() => applyInput(createSprint(R, TEXT), { t: 150.5, ch: 't' })).toThrow(SimInputError);
  });
  it('rejects timestamps that go backwards', () => {
    const s = createSprint(R, TEXT);
    applyInput(s, { t: 200, ch: 't' });
    expect(() => applyInput(s, { t: 199, ch: 'h' })).toThrow(SimInputError);
  });
  it('rejects multi-character input', () => {
    expect(() => applyInput(createSprint(R, TEXT), { t: 150, ch: 'th' })).toThrow(SimInputError);
  });
});

describe('determinism', () => {
  it('the same log gives the same result for 1,000 random logs', () => {
    const rand = lcg(20261124);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
    for (let n = 0; n < 1000; n++) {
      const log: InputEvent[] = [];
      let t = Math.floor(rand() * 400) - 100;
      let pos = 0;
      const length = 80 + Math.floor(rand() * 120);
      for (let i = 0; i < length; i++) {
        // Mostly the right key, sometimes a random one.
        const right = TEXT[Math.min(pos, 99)] as string;
        const ch = rand() < 0.9 ? right : (alphabet[Math.floor(rand() * alphabet.length)] as string);
        log.push({ t, ch });
        if (ch === right) pos++;
        t += Math.floor(rand() * 260);
      }
      const a = simulate(R, TEXT, log);
      const b = simulate(R, TEXT, log.map((e) => ({ ...e })));
      expect(b).toEqual(a);

      // Invariants that must hold for any log.
      expect(a.distance).toBeLessThanOrEqual(100);
      expect(a.advanceTimes.length).toBe(a.distance);
      for (let i = 1; i < a.advanceTimes.length; i++) {
        expect(a.advanceTimes[i] as number).toBeGreaterThanOrEqual(a.advanceTimes[i - 1] as number);
      }
      if (a.finished) expect(a.timeMs).toBe(a.advanceTimes[99]);
      else expect(a.timeMs).toBeNull();
    }
  });

  it('golden replay: a fixed log keeps its exact result under ruleset 100m@1', () => {
    // Ten clean keys, one wrong key, a recovery pause, then ninety clean keys.
    const chars = [...TEXT];
    const log: InputEvent[] = [];
    for (let i = 0; i < 10; i++) log.push({ ch: chars[i] as string, t: 183 + i * 87 });
    log.push({ ch: '!', t: 971 });
    for (let i = 10; i < 100; i++) log.push({ ch: chars[i] as string, t: 1200 + (i - 10) * 87 });
    const res = simulate(R, TEXT, log);
    expect(res.finished).toBe(true);
    expect(res.timeMs).toBe(8943);
    expect(res.reactionMs).toBe(183);
    expect(res.errors).toBe(1);
    expect(res.ignored).toBe(0);
    expect(res.splits).toEqual([
      { mark: 30, tMs: 2853 },
      { mark: 60, tMs: 5463 },
      { mark: 100, tMs: 8943 },
    ]);
  });
});

describe('helpers', () => {
  it('positionAt returns metres covered at a time', () => {
    const times = [100, 200, 300];
    expect(positionAt(times, 50)).toBe(0);
    expect(positionAt(times, 100)).toBe(1);
    expect(positionAt(times, 250)).toBe(2);
    expect(positionAt(times, 9999)).toBe(3);
  });
  it('awards medals from the ruleset thresholds', () => {
    expect(medalFor(R, 9990)).toBe('worldClass');
    expect(medalFor(R, 11500)).toBe('gold');
    expect(medalFor(R, 15000)).toBe('silver');
    expect(medalFor(R, 19999)).toBe('bronze');
    expect(medalFor(R, 20001)).toBeNull();
    expect(medalFor(R, null)).toBeNull();
  });
  it('formats times to hundredths, truncating like a track clock', () => {
    expect(formatTime(10050)).toBe('10.05');
    expect(formatTime(9999)).toBe('9.99');
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(83456)).toBe('1:23.45');
  });
});

describe('the five track events', () => {
  it('have one ruleset each, one character per metre, on the sprint\'s rules', () => {
    expect(EVENT_IDS).toEqual(['100m', '200m', '400m', '800m']);
    const distances = EVENT_IDS.map((e) => RULESETS[e].distance);
    expect(distances).toEqual([100, 200, 400, 800]);
    for (const e of EVENT_IDS) {
      const rs = RULESETS[e];
      expect(rs.id).toBe(`${e}@1`);
      expect(rs.event).toBe(e);
      expect(rs.errorLockoutMs).toBe(R.errorLockoutMs);
      expect(rs.falseStartPenaltyMs).toBe(R.falseStartPenaltyMs);
      expect(rs.minReactionMs).toBe(R.minReactionMs);
      expect(rs.splitMarks[rs.splitMarks.length - 1]).toBe(rs.distance);
    }
  });

  it('set time standards at 60, 80, 100 and 120 WPM for every distance', () => {
    expect(RULESETS['200m'].medalsMs).toEqual({ bronze: 40000, silver: 30000, gold: 24000, worldClass: 20000 });
    expect(RULESETS['1500m'].medalsMs).toEqual({ bronze: 300000, silver: 225000, gold: 180000, worldClass: 150000 });
    // The 100m keeps its original, approved values, which are the same speeds.
    expect(RULESETS['100m'].medalsMs).toEqual({ bronze: 20000, silver: 15000, gold: 12000, worldClass: 10000 });
  });

  it('run a full race at every distance', () => {
    for (const e of EVENT_IDS) {
      const rs = RULESETS[e];
      const text = 'ab '.repeat(Math.ceil(rs.distance / 3)).slice(0, rs.distance);
      const log = [...text].map((ch, i) => ({ ch, t: 150 + i * 100 }));
      const res = simulate(rs, text, log);
      expect(res.finished).toBe(true);
      expect(res.timeMs).toBe(150 + (rs.distance - 1) * 100);
      expect(res.splits.map((sp) => sp.mark)).toEqual([...rs.splitMarks]);
      expect(res.wpm).toBeCloseTo(rs.distance / 5 / ((res.timeMs as number) / 60000), 6);
    }
  });

  it('look up rulesets and labels by event', () => {
    expect(rulesetFor('400m')).toBe(RULESETS['400m']);
    expect(rulesetFor('marathon')).toBe(R);
    expect(rulesetFor(undefined)).toBe(R);
    expect(eventLabel('1500m')).toBe('1500 M');
  });
});

describe('architecture', () => {
  it('packages/sim imports nothing outside itself', () => {
    const dir = join(__dirname, '..', 'src');
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
      for (const spec of imports) {
        expect(spec.startsWith('./'), `${file} imports ${spec}`).toBe(true);
      }
    }
  });
});
