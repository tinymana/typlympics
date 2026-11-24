import { describe, expect, it } from 'vitest';
import { generateSprintLine } from '@typlympics/content';
import { topLineFor, wrapLines } from '../src/render/textLines';

describe('text band lines', () => {
  it('covers the whole text in order, with no line longer than the limit', () => {
    for (const len of [100, 200, 400, 800, 1500]) {
      for (let i = 0; i < 20; i++) {
        const text = generateSprintLine(`wrap-${i}`, len).text;
        const lines = wrapLines(text, 54);
        expect(lines[0]?.start).toBe(0);
        expect(lines[lines.length - 1]?.end).toBe(text.length);
        for (let k = 0; k < lines.length; k++) {
          const line = lines[k] as { start: number; end: number };
          expect(line.end - line.start).toBeLessThanOrEqual(54);
          expect(line.end).toBeGreaterThan(line.start);
          if (k > 0) expect(line.start).toBe(lines[k - 1]?.end);
          // Lines break only after a space, so no word is split.
          if (k < lines.length - 1) expect(text[line.end - 1]).toBe(' ');
        }
      }
    }
  });

  it('fits the 100m on two lines, so the sprint never scrolls', () => {
    for (let i = 0; i < 200; i++) {
      const lines = wrapLines(generateSprintLine(`two-${i}`, 100).text, 54);
      expect(lines.length).toBe(2);
      for (let pos = 0; pos <= 100; pos++) expect(topLineFor(lines, pos)).toBe(0);
    }
  });

  it('cuts a word longer than a line instead of looping', () => {
    const lines = wrapLines('a'.repeat(130), 54);
    expect(lines.map((l) => l.end - l.start)).toEqual([54, 54, 22]);
  });

  it('scrolls a long race one line at a time and stops at the last two lines', () => {
    const text = generateSprintLine('scroll', 400).text;
    const lines = wrapLines(text, 54);
    expect(lines.length).toBeGreaterThan(6);
    expect(topLineFor(lines, 0)).toBe(0);
    expect(topLineFor(lines, (lines[0] as { end: number }).end - 1)).toBe(0);
    expect(topLineFor(lines, (lines[0] as { end: number }).end)).toBe(1);
    expect(topLineFor(lines, (lines[3] as { start: number }).start)).toBe(3);
    // In the final line, and after the finish, the window holds the last two lines.
    expect(topLineFor(lines, text.length - 1)).toBe(lines.length - 2);
    expect(topLineFor(lines, text.length)).toBe(lines.length - 2);
  });
});
