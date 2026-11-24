import { describe, expect, it } from 'vitest';
import { SPRINT_100M_V1 as R, simulate, type InputEvent } from '@typlympics/sim';
import { generateSprintLine } from '@typlympics/content';
import { classifyKey } from '../src/input/keyboard';
import { COUNTRIES, DEFAULT_COUNTRY_INDEX, countryName, findCountry } from '../src/storage/countries';
import {
  GUEST_ID,
  SAVE_KEY,
  activeProfile,
  checkPin,
  createProfile,
  defaultSave,
  ensureGuest,
  findProfile,
  hashPin,
  isValidPin,
  loadSave,
  normalizeName,
  packLog,
  parseSave,
  persistSave,
  serializeSave,
  verifyRecord,
  type KeyValueStore,
  type RecordV1,
  type Save,
} from '../src/storage/save';

function cleanRun(text: string, reaction = 160, interval = 95): InputEvent[] {
  return [...text].map((ch, i) => ({ ch, t: reaction + i * interval }));
}

function makeRecord(): RecordV1 {
  const line = generateSprintLine('save-test');
  const log = cleanRun(line.text);
  const res = simulate(R, line.text, log);
  return {
    rulesetId: R.id,
    timeMs: res.timeMs as number,
    seed: line.seed,
    text: line.text,
    log: packLog(log),
    achievedAt: '2026-11-24T21:00:00.000Z',
  };
}

function fakeStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const NOW = '2026-11-24T22:00:00.000Z';

function saveWithAthlete(): Save {
  const save = defaultSave();
  const p = createProfile(save, { name: 'Ryan', nationality: 'USA', pin: '4821' }, NOW, 'salt-a');
  p.records[R.id] = makeRecord();
  p.totals = { races: 7, finishes: 5 };
  save.activeProfileId = p.id;
  return save;
}

describe('key classification', () => {
  it('passes printable characters, folded to lowercase', () => {
    expect(classifyKey({ key: 'a' })).toEqual({ kind: 'char', ch: 'a' });
    expect(classifyKey({ key: 'A' })).toEqual({ kind: 'char', ch: 'a' });
    expect(classifyKey({ key: ' ' })).toEqual({ kind: 'char', ch: ' ' });
    expect(classifyKey({ key: '7' })).toEqual({ kind: 'char', ch: '7' });
  });
  it('ignores held-key repeats, composition and shortcut chords', () => {
    expect(classifyKey({ key: 'a', repeat: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'a', isComposing: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'v', ctrlKey: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'v', metaKey: true }).kind).toBe('ignore');
  });
  it('ignores modifier and function keys', () => {
    for (const key of ['Shift', 'CapsLock', 'Dead', 'F5', 'Home', 'Delete']) {
      expect(classifyKey({ key }).kind).toBe('ignore');
    }
  });
  it('recognises the control keys used by menus and sign-in', () => {
    for (const key of ['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(classifyKey({ key })).toEqual({ kind: 'control', key });
    }
  });
});

describe('athlete profiles', () => {
  it('normalises names to upper case letters, digits and single spaces', () => {
    expect(normalizeName('  ryan  o\'neil ')).toBe('RYAN ONEIL');
    expect(normalizeName('speedy_99!')).toBe('SPEEDY99');
    expect(normalizeName('a very long name indeed')).toBe('A VERY LONG');
    expect(normalizeName('!!!')).toBe('');
  });

  it('accepts only four-digit PINs', () => {
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('4821')).toBe(true);
    for (const bad of ['', '123', '12345', 'abcd', '12 4', '１２３４']) expect(isValidPin(bad)).toBe(false);
  });

  it('creates a profile, finds it by name in any case, and checks its PIN', () => {
    const save = defaultSave();
    const p = createProfile(save, { name: 'ryan', nationality: 'USA', pin: '4821' }, NOW, 'salt-a');
    expect(p).toMatchObject({ id: 'ryan', name: 'RYAN', nationality: 'USA', createdAt: NOW });
    expect(findProfile(save, 'RyAn')).toBe(p);
    expect(findProfile(save, 'someone else')).toBeNull();
    expect(checkPin(p, '4821')).toBe(true);
    expect(checkPin(p, '4822')).toBe(false);
    expect(checkPin(p, '')).toBe(false);
  });

  it('never stores the PIN itself', () => {
    const save = saveWithAthlete();
    const raw = serializeSave(save);
    expect(raw).not.toContain('4821');
    expect(save.profiles['ryan']?.pinHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes the same PIN differently for different salts, and the same for the same salt', () => {
    expect(hashPin('4821', 'salt-a')).toBe(hashPin('4821', 'salt-a'));
    expect(hashPin('4821', 'salt-a')).not.toBe(hashPin('4821', 'salt-b'));
    expect(hashPin('4821', 'salt-a')).not.toBe(hashPin('4822', 'salt-a'));
  });

  it('rejects duplicate names, the reserved guest name, empty names and bad PINs', () => {
    const save = defaultSave();
    createProfile(save, { name: 'Ryan', nationality: 'USA', pin: '4821' }, NOW, 's');
    expect(() => createProfile(save, { name: 'RYAN', nationality: 'CAN', pin: '1111' }, NOW, 's')).toThrow(/taken/);
    expect(() => createProfile(save, { name: 'guest', nationality: 'CAN', pin: '1111' }, NOW, 's')).toThrow(/reserved/);
    expect(() => createProfile(save, { name: '??', nationality: 'CAN', pin: '1111' }, NOW, 's')).toThrow(/name/);
    expect(() => createProfile(save, { name: 'Ana', nationality: 'ESP', pin: '12' }, NOW, 's')).toThrow(/PIN/);
    expect(Object.keys(save.profiles)).toEqual(['ryan']);
  });

  it('keeps each athlete\'s records separate', () => {
    const save = saveWithAthlete();
    const other = createProfile(save, { name: 'Ana', nationality: 'ESP', pin: '0007' }, NOW, 'salt-b');
    expect(other.records).toEqual({});
    expect(save.profiles['ryan']?.records[R.id]).toBeDefined();
  });

  it('has a guest profile with no PIN', () => {
    const save = defaultSave();
    const guest = ensureGuest(save, NOW);
    expect(guest.id).toBe(GUEST_ID);
    expect(checkPin(guest, '')).toBe(true);
    expect(ensureGuest(save, NOW)).toBe(guest);
  });

  it('reports the active profile', () => {
    const save = saveWithAthlete();
    expect(activeProfile(save)?.name).toBe('RYAN');
    save.activeProfileId = 'nobody';
    expect(activeProfile(save)).toBeNull();
  });
});

describe('nationalities', () => {
  it('has unique three-letter codes and names sorted for browsing', () => {
    const codes = COUNTRIES.map(([c]) => c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const [code, name] of COUNTRIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(name).toMatch(/^[A-Z ]+$/);
    }
    expect(COUNTRIES[DEFAULT_COUNTRY_INDEX]?.[0]).toBe('USA');
  });
  it('finds a country by typed name or code', () => {
    expect(COUNTRIES[findCountry('jam')]?.[0]).toBe('JAM');
    expect(COUNTRIES[findCountry('united s')]?.[0]).toBe('USA');
    expect(COUNTRIES[findCountry('gbr')]?.[0]).toBe('GBR');
    expect(findCountry('zzz')).toBe(-1);
    expect(countryName('KEN')).toBe('KENYA');
  });
});

describe('versioned save', () => {
  it('returns a default save for missing, corrupt or non-object data', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[1,2,3]')).toEqual(defaultSave());
  });

  it('round-trips a save with an athlete and a record', () => {
    const save = saveWithAthlete();
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it('migrates a version 0 save and drops its unverifiable time', () => {
    const save = parseSave(JSON.stringify({ pb100m: 9876, volume: 0.3, races: 12 }));
    expect(save.saveVersion).toBe(2);
    expect(save.settings.volume).toBe(0.3);
    expect(save.profiles[GUEST_ID]?.totals.races).toBe(12);
    expect(save.profiles[GUEST_ID]?.records).toEqual({});
  });

  it('migrates a version 1 save: its record moves to the guest profile', () => {
    const rec = makeRecord();
    const v1 = { saveVersion: 1, settings: { volume: 0.5 }, records: { [R.id]: rec }, totals: { races: 9, finishes: 8 } };
    const save = parseSave(JSON.stringify(v1));
    expect(save.saveVersion).toBe(2);
    expect(save.activeProfileId).toBeNull();
    const guest = save.profiles[GUEST_ID];
    expect(guest?.records[R.id]).toEqual(rec);
    expect(guest?.totals).toEqual({ races: 9, finishes: 8 });
    expect(guest?.pinHash).toBeNull();
  });

  it('migrates an empty version 1 save without inventing a guest', () => {
    const v1 = { saveVersion: 1, settings: { volume: 0.5 }, records: {}, totals: { races: 0, finishes: 0 } };
    expect(parseSave(JSON.stringify(v1)).profiles).toEqual({});
  });

  it('refuses a save written by a newer build instead of corrupting it', () => {
    expect(parseSave(JSON.stringify({ saveVersion: 99, profiles: {} }))).toEqual(defaultSave());
  });

  it('drops malformed profiles and records but keeps good ones', () => {
    const raw = JSON.parse(serializeSave(saveWithAthlete()));
    raw.profiles.ryan.records.bad = { timeMs: 'fast' };
    raw.profiles.broken = { name: 42 };
    raw.profiles.nopin = { name: 'NOPIN', nationality: 'USA', pinSalt: null, pinHash: null, records: {}, totals: {} };
    const parsed = parseSave(JSON.stringify(raw));
    expect(Object.keys(parsed.profiles)).toEqual(['ryan']);
    expect(Object.keys(parsed.profiles['ryan']?.records ?? {})).toEqual([R.id]);
  });

  it('clears an active profile that no longer exists', () => {
    const raw = JSON.parse(serializeSave(saveWithAthlete()));
    raw.activeProfileId = 'ghost';
    expect(parseSave(JSON.stringify(raw)).activeProfileId).toBeNull();
  });

  it('persists through a store and survives a store that throws', () => {
    const store = fakeStore();
    const save = saveWithAthlete();
    persistSave(store, save);
    expect(store.data[SAVE_KEY]).toBeDefined();
    expect(loadSave(store).profiles['ryan']?.totals.races).toBe(7);

    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadSave(broken)).toEqual(defaultSave());
    expect(() => persistSave(broken, save)).not.toThrow();
    expect(loadSave(null)).toEqual(defaultSave());
  });
});

describe('record verification', () => {
  it('accepts a record whose log reproduces its time', () => {
    const rec = makeRecord();
    const times = verifyRecord(R, rec);
    expect(times).not.toBeNull();
    expect((times as readonly number[])[99]).toBe(rec.timeMs);
  });
  it('rejects a record whose time was edited', () => {
    const rec = makeRecord();
    expect(verifyRecord(R, { ...rec, timeMs: rec.timeMs - 2000 })).toBeNull();
  });
  it('rejects a record whose log was edited', () => {
    const rec = makeRecord();
    const log = rec.log.map((e) => [e[0], e[1]] as [number, string]);
    (log[50] as [number, string])[1] = '#';
    expect(verifyRecord(R, { ...rec, log })).toBeNull();
  });
  it('rejects a record from another ruleset', () => {
    expect(verifyRecord(R, { ...makeRecord(), rulesetId: '100m@2' })).toBeNull();
  });
});
