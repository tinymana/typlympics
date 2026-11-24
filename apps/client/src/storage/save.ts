import { simulate, type InputEvent, type SprintRuleset } from '@typlympics/sim';

/**
 * Versioned local save. Pure functions over JSON strings so they can be
 * tested without a browser. Every stored record keeps its keystroke log:
 * the time is re-derived from the log on load, never trusted as stored.
 */

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'typlympics.save';

/** Compact log encoding: [t, ch] pairs. */
export type PackedLog = Array<[number, string]>;

export interface RecordV1 {
  rulesetId: string;
  timeMs: number;
  seed: string;
  text: string;
  log: PackedLog;
  achievedAt: string;
}

export interface SaveV1 {
  saveVersion: 1;
  settings: { volume: number };
  /** Best run per ruleset id. */
  records: Record<string, RecordV1>;
  totals: { races: number; finishes: number };
}

export function defaultSave(): SaveV1 {
  return { saveVersion: 1, settings: { volume: 0.6 }, records: {}, totals: { races: 0, finishes: 0 } };
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a save from version n to n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // Version 0 was the first internal build: only a best time, no log.
  // A time without a log cannot be verified, so it is dropped.
  0: (old) => ({
    saveVersion: 1,
    settings: { volume: typeof old['volume'] === 'number' ? old['volume'] : 0.6 },
    records: {},
    totals: { races: typeof old['races'] === 'number' ? old['races'] : 0, finishes: 0 },
  }),
};

export function packLog(log: readonly InputEvent[]): PackedLog {
  return log.map((e) => [e.t, e.ch]);
}

export function unpackLog(packed: PackedLog): InputEvent[] {
  return packed.map(([t, ch]) => ({ t, ch }));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parses, migrates and validates a stored save. Never throws. */
export function parseSave(raw: string | null): SaveV1 {
  if (!raw) return defaultSave();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultSave();
  }
  if (!isRecord(data)) return defaultSave();

  let version = typeof data['saveVersion'] === 'number' ? data['saveVersion'] : 0;
  if (version > SAVE_VERSION) return defaultSave(); // written by a newer build
  let current = data;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return defaultSave();
    current = migrate(current);
    version += 1;
  }

  const base = defaultSave();
  const settings = isRecord(current['settings']) ? current['settings'] : {};
  const totals = isRecord(current['totals']) ? current['totals'] : {};
  const records = isRecord(current['records']) ? current['records'] : {};
  const volume = typeof settings['volume'] === 'number' ? settings['volume'] : base.settings.volume;

  const out: SaveV1 = {
    saveVersion: 1,
    settings: { volume: Math.min(1, Math.max(0, volume)) },
    records: {},
    totals: {
      races: typeof totals['races'] === 'number' ? totals['races'] : 0,
      finishes: typeof totals['finishes'] === 'number' ? totals['finishes'] : 0,
    },
  };
  for (const [key, rec] of Object.entries(records)) {
    if (isValidRecordShape(rec)) out.records[key] = rec;
  }
  return out;
}

function isValidRecordShape(v: unknown): v is RecordV1 {
  if (!isRecord(v)) return false;
  return (
    typeof v['rulesetId'] === 'string' &&
    typeof v['timeMs'] === 'number' &&
    typeof v['seed'] === 'string' &&
    typeof v['text'] === 'string' &&
    typeof v['achievedAt'] === 'string' &&
    Array.isArray(v['log']) &&
    v['log'].every(
      (e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && typeof e[1] === 'string',
    )
  );
}

export function serializeSave(save: SaveV1): string {
  return JSON.stringify(save);
}

/**
 * Re-runs a stored record through the simulation. Returns the advance times
 * for ghost playback, or null if the log does not reproduce the stored time.
 */
export function verifyRecord(ruleset: SprintRuleset, rec: RecordV1): readonly number[] | null {
  if (rec.rulesetId !== ruleset.id) return null;
  try {
    const res = simulate(ruleset, rec.text, unpackLog(rec.log));
    if (!res.finished || res.timeMs !== rec.timeMs) return null;
    return res.advanceTimes;
  } catch {
    return null;
  }
}

/** Minimal storage interface so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSave(store: KeyValueStore | null): SaveV1 {
  if (!store) return defaultSave();
  try {
    return parseSave(store.getItem(SAVE_KEY));
  } catch {
    return defaultSave();
  }
}

export function persistSave(store: KeyValueStore | null, save: SaveV1): void {
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, serializeSave(save));
  } catch {
    // Storage can be full or blocked; the game keeps working without it.
  }
}

/** Browser storage if it is usable, otherwise null. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__typlympics_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
