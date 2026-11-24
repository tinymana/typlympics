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
      expect((RIVALS[i] as (typeof RIVALS)[number]).wpm).toBeGreaterThan((RIVALS[i - 1] as (typeof RIVALS)[number]).wpm);
    }
    expect(new Set(RIVALS.map((r) => r.id)).size).toBe(RIVALS.length);
    expect(new Set(RIVALS.map((r) => r.name)).size).toBe(RIVALS.length);
    expect(RIVALS.length).toBe(8);
  });

  it('have legal reaction times, so a rival never false starts', () => {
    for (const r of RIVALS) expect(r.reactionMs).toBeGreaterThanOrEqual(R.minReactionMs);
  });

  it('finish every race under the real rules, close to their advertised speed', () => {
    for (const rival of RIVALS) {
      const advertisedMs = (R.distance / 5 / rival.wpm) * 60000;
      for (let i = 0; i < 40; i++) {
        const seed = `race-${i}`;
        const text = generateSprintLine(seed).text;
        const res = simulate(R, text, generateAiLog(rival, text, seed, R.errorLockoutMs));
        expect(res.finished, `${rival.id} ${seed}`).toBe(true);
        expect(res.falseStart).toBe(false);
        expect(res.ignored).toBe(0);
        const time = res.timeMs as number;
        expect(time).toBeGreaterThan(advertisedMs * 0.97);
        expect(time).toBeLessThan(advertisedMs * 1.03);
      }
    }
  });

  it('make mistakes at roughly their error rate, and pay for them', () => {
    const snail = RIVALS[0] as (typeof RIVALS)[number];
    let errors = 0;
    const races = 200;
    for (let i = 0; i < races; i++) {
      const text = generateSprintLine(`err-${i}`).text;
      errors += simulate(R, text, generateAiLog(snail, text, `err-${i}`, R.errorLockoutMs)).errors;
    }
    const perChar = errors / (races * 99);
    expect(perChar).toBeGreaterThan(snail.errorRate * 0.6);
    expect(perChar).toBeLessThan(snail.errorRate * 1.4);
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
    expect(nextRival([])?.id).toBe('snail');
    expect(nextRival(['snail', 'tortoise'])?.id).toBe('penguin');
    expect(nextRival(['tortoise'])?.id).toBe('snail');
    const all = RIVALS.map((r) => r.id);
    expect(nextRival(all)).toBeNull();
    expect(allRivalsBeaten(all)).toBe(true);
    expect(allRivalsBeaten(all.slice(1))).toBe(false);
    expect(rivalById('nobody')).toBeNull();
  });
});
