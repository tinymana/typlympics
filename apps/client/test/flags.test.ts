import { describe, expect, it } from 'vitest';
import { FLAGS, FLAG_H, FLAG_W, hasFlag, rasterFlag } from '../src/render/flagData';
import { COUNTRIES } from '../src/storage/countries';

describe('pixel flags', () => {
  it('has a flag for every nationality offered at sign-in, and one for the guest', () => {
    for (const [code] of COUNTRIES) expect(hasFlag(code), code).toBe(true);
    expect(hasFlag('---')).toBe(true);
    // No stray flags for countries that cannot be picked.
    expect(Object.keys(FLAGS).length).toBe(COUNTRIES.length + 1);
  });

  it('draws every flag as a full 16 by 11 grid of colours', () => {
    for (const code of Object.keys(FLAGS)) {
      const grid = rasterFlag(code);
      expect(grid.length).toBe(FLAG_H);
      for (const row of grid) {
        expect(row.length).toBe(FLAG_W);
        for (const c of row) expect(c, code).toMatch(/^#[0-9a-f]{6}$/);
      }
      // Every step paints something: no cell is left at the blank start colour.
      expect(grid.flat().includes('#000000'), code).toBe(false);
    }
  });

  it('gives every nationality a different flag', () => {
    const seen = new Map<string, string>();
    for (const code of Object.keys(FLAGS)) {
      const key = rasterFlag(code).flat().join('');
      expect(seen.get(key), `${code} looks the same as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, code);
    }
  });

  it('falls back to the guest flag for an unknown code', () => {
    expect(rasterFlag('XXX')).toEqual(rasterFlag('---'));
  });

  it('draws a few well-known flags the way they should look', () => {
    const jpn = rasterFlag('JPN');
    expect(jpn[0]?.[0]).toBe('#ffffff');
    expect(jpn[5]?.[8]).toBe('#bc002d');
    const fra = rasterFlag('FRA');
    expect([fra[5]?.[0], fra[5]?.[8], fra[5]?.[15]]).toEqual(['#0055a4', '#ffffff', '#ef4135']);
    const ger = rasterFlag('GER');
    expect([ger[0]?.[8], ger[5]?.[8], ger[10]?.[8]]).toEqual(['#151515', '#dd0000', '#ffce00']);
  });
});
