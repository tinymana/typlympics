import { describe, expect, it } from 'vitest';
import { SPRINT_100M_V1 as R, simulate, type InputEvent } from '@typlympics/sim';
import { generateSprintLine } from '@typlympics/content';
import { classifyKey } from '../src/input/keyboard';
import {
  SAVE_KEY,
  defaultSave,
  loadSave,
  packLog,
  parseSave,
  persistSave,
  serializeSave,
  verifyRecord,
  type KeyValueStore,
  type RecordV1,
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

describe('key classification', () => {
  it('passes printable characters, folded to lowercase', () => {
    expect(classifyKey({ key: 'a' })).toEqual({ kind: 'char', ch: 'a' });
    expect(classifyKey({ key: 'A' })).toEqual({ kind: 'char', ch: 'a' });
    expect(classifyKey({ key: ' ' })).toEqual({ kind: 'char', ch: ' ' });
  });
  it('ignores held-key repeats, composition and shortcut chords', () => {
    expect(classifyKey({ key: 'a', repeat: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'a', isComposing: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'v', ctrlKey: true }).kind).toBe('ignore');
    expect(classifyKey({ key: 'v', metaKey: true }).kind).toBe('ignore');
  });
  it('ignores modifier and navigation keys', () => {
    for (const key of ['Shift', 'CapsLock', 'Backspace', 'ArrowLeft', 'Dead', 'F5']) {
      expect(classifyKey({ key }).kind).toBe('ignore');
    }
  });
  it('recognises the control keys', () => {
    expect(classifyKey({ key: 'Enter' })).toEqual({ kind: 'control', key: 'Enter' });
    expect(classifyKey({ key: 'Tab' })).toEqual({ kind: 'control', key: 'Tab' });
    expect(classifyKey({ key: 'Escape' })).toEqual({ kind: 'control', key: 'Escape' });
  });
});

describe('versioned save', () => {
  it('returns a default save for missing, corrupt or non-object data', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[1,2,3]')).toEqual(defaultSave());
  });

  it('round-trips a save with a record', () => {
    const save = defaultSave();
    save.records[R.id] = makeRecord();
    save.totals = { races: 7, finishes: 5 };
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it('migrates a version 0 save and drops its unverifiable time', () => {
    const v0 = JSON.stringify({ pb100m: 9876, volume: 0.3, races: 12 });
    const save = parseSave(v0);
    expect(save.saveVersion).toBe(1);
    expect(save.settings.volume).toBe(0.3);
    expect(save.totals.races).toBe(12);
    expect(save.records).toEqual({});
  });

  it('refuses a save written by a newer build instead of corrupting it', () => {
    expect(parseSave(JSON.stringify({ saveVersion: 99, records: {} }))).toEqual(defaultSave());
  });

  it('drops malformed records but keeps good ones', () => {
    const save = defaultSave();
    save.records[R.id] = makeRecord();
    const raw = JSON.parse(serializeSave(save));
    raw.records['bad'] = { timeMs: 'fast' };
    const parsed = parseSave(JSON.stringify(raw));
    expect(Object.keys(parsed.records)).toEqual([R.id]);
  });

  it('persists through a store and survives a store that throws', () => {
    const store = fakeStore();
    const save = defaultSave();
    save.totals.races = 3;
    persistSave(store, save);
    expect(store.data[SAVE_KEY]).toBeDefined();
    expect(loadSave(store).totals.races).toBe(3);

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
