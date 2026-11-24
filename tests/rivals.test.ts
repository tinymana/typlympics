import { describe, expect, it } from 'vitest';
import {
  RIVALS,
  allRivalsBeaten,
  generateAiLog,
  generateSprintLine,
  nextRival,
  rivalById,
} from '../packages/content/src/index';
import { SPRINT_100M_V1 as R, simulate } from '../packages/sim/src/index';

/** Rivals are content, but they are judged by the simulation, so this test spans both. */
describe('training rivals', () => {
  it('are ordered slowest to fastest with unique ids and names', () => {
    for (let i = 1; i < RIVALS.length; i++) {
      // Speed bands never overlap, so the order is the same in every race.
      expect((RIVALS[i] as (typeof RIVALS)[number]).wpmMin).toBeGreaterThan((RIVALS[i - 1] as (typeof RIVALS)[number]).wpmMax);
    }
    expect(RIVALS.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(RIVALS.map((r) => r.nickname)).toEqual(['TURTLE', 'SLOTH', 'PENGUIN', 'RABBIT', 'FOX', 'WOLF', 'LION', 'GAZELLE', 'CHEETAH', 'FALCON']);
    expect(new Set(RIVALS.map((r) => r.id)).size).toBe(RIVALS.length);
    expect(new Set(RIVALS.map((r) => r.name)).size).toBe(RIVALS.length);
    expect(RIVALS.length).toBe(10);
  });

  it('have legal reaction times, so a rival never false starts', () => {
    for (const r of RIVALS) expect(r.reactionMs).toBeGreaterThanOrEqual(R.minReactionMs);
  });

  it('finish every race under the real rules, at a speed inside their band', () => {
    for (const rival of RIVALS) {
      const slowestMs = (R.distance / 5 / rival.wpmMin) * 60000;
      const fastestMs = (R.distance / 5 / rival.wpmMax) * 60000;
      for (let i = 0; i < 40; i++) {
        const seed = `race-${i}`;
        const text = generateSprintLine(seed).text;
        const res = simulate(R, text, generateAiLog(rival, text, seed, R.errorLockoutMs));
        expect(res.finished, `${rival.id} ${seed}`).toBe(true);
        expect(res.falseStart).toBe(false);
        expect(res.ignored).toBe(0);
        const time = res.timeMs as number;
        // Allow a few ms for rounding each key to a whole millisecond.
        expect(time).toBeGreaterThanOrEqual(fastestMs - 5);
        expect(time).toBeLessThanOrEqual(slowestMs + 5);
      }
    }
  });

  it('make mistakes at roughly their error rate, and pay for them', () => {
    const turtle = RIVALS[0] as (typeof RIVALS)[number];
    let errors = 0;
    const races = 200;
    for (let i = 0; i < races; i++) {
      const text = generateSprintLine(`err-${i}`).text;
      errors += simulate(R, text, generateAiLog(turtle, text, `err-${i}`, R.errorLockoutMs)).errors;
    }
    const perChar = errors / (races * 99);
    expect(perChar).toBeGreaterThan(turtle.errorRate * 0.6);
    expect(perChar).toBeLessThan(turtle.errorRate * 1.4);
  });

  it('a faster rival always beats a slower one on the same line', () => {
    for (let i = 0; i < 30; i++) {
      const seed = `order-${i}`;
      const text = generateSprintLine(seed).text;
      const times = RIVALS.map((r) => simulate(R, text, generateAiLog(r, text, seed, R.errorLockoutMs)).timeMs as number);
      for (let k = 1; k < times.length; k++) expect(times[k] as number).toBeLessThan(times[k - 1] as number);
    }
  });

  it('are deterministic per rival, text and seed, and vary between races', () => {
    const text = generateSprintLine('same').text;
    const fox = rivalById('fox') as (typeof RIVALS)[number];
    expect(generateAiLog(fox, text, 'a')).toEqual(generateAiLog(fox, text, 'a'));
    expect(generateAiLog(fox, text, 'a')).not.toEqual(generateAiLog(fox, text, 'b'));
  });

  it('track progress up the ladder', () => {
    expect(nextRival([])?.id).toBe('turtle');
    expect(nextRival(['turtle', 'sloth'])?.id).toBe('penguin');
    expect(nextRival(['sloth'])?.id).toBe('turtle');
    const all = RIVALS.map((r) => r.id);
    expect(nextRival(all)).toBeNull();
    expect(allRivalsBeaten(all)).toBe(true);
    expect(allRivalsBeaten(all.slice(1))).toBe(false);
    expect(rivalById('nobody')).toBeNull();
  });
});
