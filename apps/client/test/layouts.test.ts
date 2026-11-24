import { describe, expect, it } from 'vitest';
import { generateSprintLine } from '@typlympics/content';
import { SPRINT_100M_V1 as R, simulate, type InputEvent } from '@typlympics/sim';
import { classifyKey } from '../src/input/keyboard';

/**
 * The three letter rows of each layout, aligned to the same physical keys.
 * A typist on any of these layouts presses different physical keys but the
 * browser reports the character produced, which is all the game reads.
 */
const LAYOUTS: Record<string, [string, string, string]> = {
  qwerty: ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  dvorak: ["',.pyfgcrl", 'aoeuidhtns', ';qjkxbmwvz'],
  colemak: ['qwfpgjluy;', 'arstdhneio', 'zxcvbkm,./'],
  azerty: ['azertyuiop', 'qsdfghjklm', 'wxcvbn,;:!'],
  qwertz: ['qwertzuiop', 'asdfghjklö', 'yxcvbnm,.-'],
};

const PHYSICAL = LAYOUTS['qwerty'] as [string, string, string];

/** The physical key (named by its QWERTY legend) that types `ch` on a layout. */
function physicalKeyFor(layout: [string, string, string], ch: string): string {
  if (ch === ' ') return 'Space';
  for (let row = 0; row < 3; row++) {
    const col = (layout[row] as string).indexOf(ch);
    if (col >= 0) return `Key:${(PHYSICAL[row] as string)[col]}`;
  }
  throw new Error(`layout cannot type "${ch}"`);
}

describe('keyboard layouts', () => {
  const line = generateSprintLine('layout-matrix').text;

  for (const [name, layout] of Object.entries(LAYOUTS)) {
    it(`${name}: a full sprint line can be typed and finishes the race`, () => {
      const log: InputEvent[] = [];
      const pressed = new Set<string>();
      [...line].forEach((ch, i) => {
        pressed.add(physicalKeyFor(layout, ch));
        // The browser event carries the produced character in `key`.
        const c = classifyKey({ key: ch });
        expect(c).toEqual({ kind: 'char', ch });
        if (c.kind === 'char') log.push({ t: 150 + i * 90, ch: c.ch });
      });
      const res = simulate(R, line, log);
      expect(res.finished).toBe(true);
      expect(res.errors).toBe(0);
      expect(pressed.size).toBeGreaterThan(10);
    });
  }

  it('different layouts use different physical keys for the same line', () => {
    const keysOn = (name: string): string =>
      [...line].map((ch) => physicalKeyFor(LAYOUTS[name] as [string, string, string], ch)).join(',');
    expect(keysOn('dvorak')).not.toBe(keysOn('qwerty'));
    expect(keysOn('colemak')).not.toBe(keysOn('qwerty'));
    expect(keysOn('azerty')).not.toBe(keysOn('qwerty'));
    expect(keysOn('qwertz')).not.toBe(keysOn('qwerty'));
  });

  it('sprint text needs no shifted, dead or AltGr keys on any layout', () => {
    for (let i = 0; i < 300; i++) {
      const text = generateSprintLine(`charset-${i}`).text;
      for (const layout of Object.values(LAYOUTS)) {
        for (const ch of text) expect(() => physicalKeyFor(layout, ch)).not.toThrow();
      }
    }
  });

  it('Caps Lock and Shift do not cause errors under ruleset 100m@1', () => {
    const log = [...line].map((ch, i) => {
      const c = classifyKey({ key: ch.toUpperCase() });
      return { t: 150 + i * 90, ch: c.kind === 'char' ? c.ch : '?' };
    });
    expect(simulate(R, line, log).errors).toBe(0);
  });
});
