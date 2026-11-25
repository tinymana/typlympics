import { describe, expect, it } from 'vitest';
import { nameAllowed } from '../src/names';

describe('name filter', () => {
  it('lets ordinary names through', () => {
    for (const n of ['RYAN', 'HOST ONE', 'CASSIDY', 'SCOTT', 'DICKSON', 'GRAPE', 'SPICE', 'TITAN', 'HELLEN', 'ASSAD 7', 'GLASS', 'MICHELLE']) {
      expect(nameAllowed(n), n).toBe(true);
    }
  });
  it('blocks profanity, including digits, spacing and stretched letters', () => {
    for (const n of ['FUCK', 'SH1T HEAD', 'F U C K', 'FUUUCK', 'B1TCH', 'ASS', 'BIG ASS', 'N1GGA', 'NAZI 88', 'A55', 'DICK', 'D1CK']) {
      expect(nameAllowed(n), n).toBe(false);
    }
  });
});
