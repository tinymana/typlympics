import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_BAND,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  SPRINT_WORDS,
  createRng,
  generateSprintLine,
  scoreDifficulty,
} from '../src/index';

describe('word list', () => {
  it('contains only lowercase a to z words of 2 to 8 letters, no duplicates', () => {
    expect(SPRINT_WORDS.length).toBeGreaterThan(250);
    expect(new Set(SPRINT_WORDS).size).toBe(SPRINT_WORDS.length);
    for (const w of SPRINT_WORDS) {
      expect(w).toMatch(/^[a-z]+$/);
      expect(w.length).toBeGreaterThanOrEqual(MIN_WORD_LENGTH);
      expect(w.length).toBeLessThanOrEqual(MAX_WORD_LENGTH);
    }
  });
  it('has several words of every length so any line can be closed exactly', () => {
    for (let len = MIN_WORD_LENGTH; len <= MAX_WORD_LENGTH; len++) {
      expect(SPRINT_WORDS.filter((w) => w.length === len).length).toBeGreaterThan(5);
    }
  });
});

describe('prng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-a');
    const c = createRng('seed-b');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    const seqC = Array.from({ length: 20 }, () => c.next());
    expect(seqB).toEqual(seqA);
    expect(seqC).not.toEqual(seqA);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('keeps a known sequence, so server and client always agree', () => {
    const r = createRng('typlympics');
    const got = [r.int(1000), r.int(1000), r.int(1000)];
    expect(got).toMatchInlineSnapshot(`
      [
        419,
        431,
        622,
      ]
    `);
  });
});

describe('sprint line generator', () => {
  it('produces exactly 100 characters of words and single spaces for 2,000 seeds', () => {
    for (let i = 0; i < 2000; i++) {
      const line = generateSprintLine(`seed-${i}`);
      expect(line.text.length).toBe(100);
      expect(line.text).toMatch(/^[a-z]+( [a-z]+)*$/);
      expect(line.difficulty).toBeGreaterThanOrEqual(DIFFICULTY_BAND.min);
      expect(line.difficulty).toBeLessThanOrEqual(DIFFICULTY_BAND.max);
      expect(line.difficulty).toBe(scoreDifficulty(line.text));
    }
  });
  it('never repeats a word back to back', () => {
    for (let i = 0; i < 500; i++) {
      const words = generateSprintLine(`rep-${i}`).text.split(' ');
      for (let j = 1; j < words.length; j++) expect(words[j]).not.toBe(words[j - 1]);
    }
  });
  it('gives the same line for the same seed and different lines for different seeds', () => {
    expect(generateSprintLine('abc')).toEqual(generateSprintLine('abc'));
    expect(generateSprintLine('abc').text).not.toBe(generateSprintLine('abd').text);
  });
  it('keeps a known line for a known seed (generator version 1)', () => {
    expect(generateSprintLine('opening-ceremony').text).toMatchInlineSnapshot(`"strong then same well its small water write long seem give day come against been than we thought say"`);
  });
  it('supports other line lengths for future events', () => {
    for (const len of [40, 60, 400]) expect(generateSprintLine('x', len).text.length).toBe(len);
  });
});
