import { simulate, type InputEvent, type SprintRuleset } from '@typlympics/sim';

/**
 * Versioned local save. Pure functions over JSON strings so they can be
 * tested without a browser.
 *
 * Version 2 added athlete profiles (name, nationality, PIN), each with its
 * own records. Version 3 added each athlete's race history for the career page. Version 4
 * added the training rivals each athlete has beaten. Version 5 adds the
 * athlete's online session, once they have signed in to compete. Every stored record keeps its keystroke log: the time is
 * re-derived from the log on load, never trusted as stored.
 */

export const SAVE_VERSION = 5;
export const SAVE_KEY = 'typlympics.save';

export const NAME_MAX = 12;
export const PIN_LENGTH = 4;
export const GUEST_ID = 'guest';

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

/** One finished race, kept for the career page. */
export interface RaceSummary {
  rulesetId: string;
  timeMs: number;
  wpm: number;
  /** 0 to 1. */
  accuracy: number;
  reactionMs: number | null;
  errors: number;
  falseStart: boolean;
  /** What the race was typed on. Absent in older saves, which were all keyboard. */
  device?: 'keyboard' | 'phone';
  at: string;
}

/** Most recent finished races kept per athlete. */
export const HISTORY_MAX = 200;

export interface Totals {
  races: number;
  finishes: number;
}

export interface Profile {
  id: string;
  /** Upper case, A to Z, 0 to 9 and single spaces. */
  name: string;
  /** Three-letter country code from COUNTRIES, or "---" for the guest. */
  nationality: string;
  /** Null for the guest profile, which has no PIN. */
  pinSalt: string | null;
  pinHash: string | null;
  createdAt: string;
  /** Best run per ruleset id. */
  records: Record<string, RecordV1>;
  totals: Totals;
  /** Finished races, oldest first, capped at HISTORY_MAX. */
  history: RaceSummary[];
  /** Ids of training rivals beaten, per ruleset id. */
  rivalsBeaten: Record<string, string[]>;
  /** Online session, set after signing in to compete. The PIN is never stored. */
  online: { token: string; athleteId: string } | null;
}

export interface Save {
  saveVersion: 5;
  settings: { volume: number };
  /** The athlete currently signed in on this device, if any. */
  activeProfileId: string | null;
  profiles: Record<string, Profile>;
}

export function defaultSave(): Save {
  return { saveVersion: 5, settings: { volume: 0.6 }, activeProfileId: null, profiles: {} };
}

// ------------------------------------------------------------ profiles

/** Cleans typed text into a profile name. Returns '' if nothing usable is left. */
export function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

export function profileIdFor(name: string): string {
  return normalizeName(name).toLowerCase().replace(/ /g, '-');
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);
}

/**
 * Salted hash of a PIN, so the PIN itself is not sitting in browser storage.
 *
 * This is NOT security. A four-digit PIN has 10,000 possibilities and local
 * storage can be edited by whoever uses the device. It keeps friends on a
 * shared computer out of each other's records, like initials and a PIN on
 * an arcade cabinet. Real accounts arrive with the server in milestone 5.
 */
export function hashPin(pin: string, salt: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const input = `${salt}:${pin}:${salt}`;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      h1 = Math.imul(h1 ^ input.charCodeAt(i), 0x01000193);
      h2 = Math.imul(h2 + input.charCodeAt(i) + round, 0x85ebca6b) ^ (h1 >>> 13);
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function findProfile(save: Save, name: string): Profile | null {
  return save.profiles[profileIdFor(name)] ?? null;
}

export function activeProfile(save: Save): Profile | null {
  return save.activeProfileId ? (save.profiles[save.activeProfileId] ?? null) : null;
}

export function checkPin(profile: Profile, pin: string): boolean {
  if (profile.pinHash === null || profile.pinSalt === null) return true; // guest
  return isValidPin(pin) && hashPin(pin, profile.pinSalt) === profile.pinHash;
}

export interface NewProfile {
  name: string;
  nationality: string;
  pin: string;
}

/** Adds a profile to the save. Throws if the name is unusable, taken, or the PIN malformed. */
export function createProfile(save: Save, input: NewProfile, nowIso: string, salt: string): Profile {
  const name = normalizeName(input.name);
  const id = profileIdFor(name);
  if (!name || !id) throw new Error('A name is required.');
  if (id === GUEST_ID) throw new Error('That name is reserved.');
  if (save.profiles[id]) throw new Error('That name is already taken on this device.');
  if (!isValidPin(input.pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits.`);
  const profile: Profile = {
    id,
    name,
    nationality: input.nationality,
    pinSalt: salt,
    pinHash: hashPin(input.pin, salt),
    createdAt: nowIso,
    records: {},
    totals: { races: 0, finishes: 0 },
    history: [],
    rivalsBeaten: {},
    online: null,
  };
  save.profiles[id] = profile;
  return profile;
}

/** The guest profile has no PIN. It is created on first use. */
export function ensureGuest(save: Save, nowIso: string): Profile {
  const existing = save.profiles[GUEST_ID];
  if (existing) return existing;
  const guest: Profile = {
    id: GUEST_ID,
    name: 'GUEST',
    nationality: '---',
    pinSalt: null,
    pinHash: null,
    createdAt: nowIso,
    records: {},
    totals: { races: 0, finishes: 0 },
    history: [],
    rivalsBeaten: {},
    online: null,
  };
  save.profiles[GUEST_ID] = guest;
  return guest;
}

/** Appends a finished race to an athlete's history, dropping the oldest past the cap. */
export function addToHistory(profile: Profile, summary: RaceSummary): void {
  profile.history.push(summary);
  if (profile.history.length > HISTORY_MAX) {
    profile.history.splice(0, profile.history.length - HISTORY_MAX);
  }
}

/** Records a win over a training rival. Returns true if it is the first win over that rival. */
export function markRivalBeaten(profile: Profile, rulesetId: string, rivalId: string): boolean {
  const list = profile.rivalsBeaten[rulesetId] ?? [];
  if (list.includes(rivalId)) return false;
  profile.rivalsBeaten[rulesetId] = [...list, rivalId];
  return true;
}

export function rivalsBeatenFor(profile: Profile, rulesetId: string): string[] {
  return profile.rivalsBeaten[rulesetId] ?? [];
}

export function randomSalt(): string {
  try {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => n.toString(16).padStart(8, '0')).join('');
  } catch {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
}

// ------------------------------------------------------------ logs

export function packLog(log: readonly InputEvent[]): PackedLog {
  return log.map((e) => [e.t, e.ch]);
}

export function unpackLog(packed: PackedLog): InputEvent[] {
  return packed.map(([t, ch]) => ({ t, ch }));
}

// ------------------------------------------------------------ parsing and migration

type Json = Record<string, unknown>;
type Migration = (old: Json) => Json;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
  // Version 1 had one anonymous set of records. They move to the guest
  // profile so nothing is lost when sign-in arrives.
  1: (old) => {
    const records = isObject(old['records']) ? old['records'] : {};
    const totals = isObject(old['totals']) ? old['totals'] : {};
    const races = typeof totals['races'] === 'number' ? totals['races'] : 0;
    const hasHistory = Object.keys(records).length > 0 || races > 0;
    return {
      saveVersion: 2,
      settings: old['settings'],
      activeProfileId: null,
      profiles: hasHistory
        ? {
            [GUEST_ID]: {
              id: GUEST_ID,
              name: 'GUEST',
              nationality: '---',
              pinSalt: null,
              pinHash: null,
              createdAt: '1970-01-01T00:00:00.000Z',
              records,
              totals,
            },
          }
        : {},
    };
  },
  // Version 2 had no race history. Profiles gain an empty one when parsed.
  2: (old) => ({ ...old, saveVersion: 3 }),
  // Version 3 had no rivals. Profiles gain an empty list when parsed.
  3: (old) => ({ ...old, saveVersion: 4 }),
  // Version 4 had no online session. Profiles start signed out.
  4: (old) => ({ ...old, saveVersion: 5 }),
};

function isValidSummary(v: unknown): v is RaceSummary {
  if (!isObject(v)) return false;
  return (
    typeof v['rulesetId'] === 'string' &&
    typeof v['timeMs'] === 'number' &&
    typeof v['wpm'] === 'number' &&
    typeof v['accuracy'] === 'number' &&
    (v['reactionMs'] === null || typeof v['reactionMs'] === 'number') &&
    typeof v['errors'] === 'number' &&
    typeof v['falseStart'] === 'boolean' &&
    typeof v['at'] === 'string'
  );
}

function isValidRecordShape(v: unknown): v is RecordV1 {
  if (!isObject(v)) return false;
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

function parseRivals(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isObject(v)) return out;
  for (const [rulesetId, list] of Object.entries(v)) {
    if (Array.isArray(list)) out[rulesetId] = [...new Set(list.filter((x): x is string => typeof x === 'string'))];
  }
  return out;
}

function parseOnline(v: unknown): { token: string; athleteId: string } | null {
  if (!isObject(v) || typeof v['token'] !== 'string' || typeof v['athleteId'] !== 'string') return null;
  return { token: v['token'], athleteId: v['athleteId'] };
}

function parseProfile(id: string, v: unknown): Profile | null {
  if (!isObject(v)) return null;
  const name = typeof v['name'] === 'string' ? normalizeName(v['name']) : '';
  if (!name || profileIdFor(name) !== id) return null;
  const pinSalt = typeof v['pinSalt'] === 'string' ? v['pinSalt'] : null;
  const pinHash = typeof v['pinHash'] === 'string' ? v['pinHash'] : null;
  // Only the guest may be without a PIN.
  if ((pinSalt === null || pinHash === null) && id !== GUEST_ID) return null;
  const totals = isObject(v['totals']) ? v['totals'] : {};
  const rawRecords = isObject(v['records']) ? v['records'] : {};
  const records: Record<string, RecordV1> = {};
  for (const [key, rec] of Object.entries(rawRecords)) {
    if (isValidRecordShape(rec)) records[key] = rec;
  }
  return {
    id,
    name,
    nationality: typeof v['nationality'] === 'string' ? v['nationality'].slice(0, 3).toUpperCase() : '---',
    pinSalt: id === GUEST_ID ? null : pinSalt,
    pinHash: id === GUEST_ID ? null : pinHash,
    createdAt: typeof v['createdAt'] === 'string' ? v['createdAt'] : '1970-01-01T00:00:00.000Z',
    records,
    totals: {
      races: typeof totals['races'] === 'number' ? totals['races'] : 0,
      finishes: typeof totals['finishes'] === 'number' ? totals['finishes'] : 0,
    },
    history: (Array.isArray(v['history']) ? v['history'] : []).filter(isValidSummary).slice(-HISTORY_MAX),
    rivalsBeaten: parseRivals(v['rivalsBeaten']),
    online: parseOnline(v['online']),
  };
}

/** Parses, migrates and validates a stored save. Never throws. */
export function parseSave(raw: string | null): Save {
  if (!raw) return defaultSave();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultSave();
  }
  if (!isObject(data)) return defaultSave();

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
  const settings = isObject(current['settings']) ? current['settings'] : {};
  const volume = typeof settings['volume'] === 'number' ? settings['volume'] : base.settings.volume;
  const out: Save = {
    saveVersion: 5,
    settings: { volume: Math.min(1, Math.max(0, volume)) },
    activeProfileId: null,
    profiles: {},
  };
  const profiles = isObject(current['profiles']) ? current['profiles'] : {};
  for (const [id, value] of Object.entries(profiles)) {
    const profile = parseProfile(id, value);
    if (profile) out.profiles[id] = profile;
  }
  const active = current['activeProfileId'];
  if (typeof active === 'string' && out.profiles[active]) out.activeProfileId = active;
  return out;
}

export function serializeSave(save: Save): string {
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

// ------------------------------------------------------------ storage

/** Minimal storage interface so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSave(store: KeyValueStore | null): Save {
  if (!store) return defaultSave();
  try {
    return parseSave(store.getItem(SAVE_KEY));
  } catch {
    return defaultSave();
  }
}

export function persistSave(store: KeyValueStore | null, save: Save): void {
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
