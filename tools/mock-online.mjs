/**
 * A stand-in for the Typlympics Edge Function, for browser tests.
 *
 * It answers the same actions with the same shapes, keeps its state in
 * memory, and computes results the way the real server does: from the
 * keystroke log, with the game's own simulation. It does not replace
 * testing the deployed function; it lets the Compete screens be driven
 * end to end without a network.
 *
 * Run with tsx, since it imports the TypeScript packages directly.
 */
import { generateSprintLine } from '../packages/content/src/index.ts';
import { RULESETS, simulate } from '../packages/sim/src/index.ts';

export function createMockServer() {
  const athletes = new Map(); // name -> { id, name, nationality, pin }
  const sessions = new Map(); // token -> athlete
  const rooms = new Map(); // pin -> { pin, hostId, event, state, members: [{athlete, lane}], race }
  const races = new Map(); // id -> { id, event, seed, gunAt, entries: Map(athleteId -> entry) }
  /** Weekly medals; tests add rows here to stand in for a week having closed. */
  const medals = [];
  const bests = new Map(); // `${athleteId}|${rulesetId}` -> { athlete, rulesetId, timeMs, wpm }
  let nextId = 1;
  const id = (prefix) => `${prefix}-${nextId++}`;

  const fail = (status, code, message) => ({ status, json: { ok: false, error: { code, message } } });
  const ok = (data = {}) => ({ status: 200, json: { ok: true, ...data } });

  function roomState(room) {
    const race = room.race
      ? { id: room.race.id, event: room.race.event, rulesetId: RULESETS[room.race.event].id, seed: room.race.seed, gunInMs: Math.round(room.race.gunAt - Date.now()) }
      : null;
    return {
      pin: room.pin,
      hostId: room.hostId,
      event: room.event,
      state: room.state,
      maxPlayers: 4,
      members: room.members.map((m) => ({ id: m.athlete.id, name: m.athlete.name, nationality: m.athlete.nationality, lane: m.lane, device: m.device ?? 'keyboard' })),
      race,
    };
  }

  function handle(body) {
    const me = body.token ? sessions.get(body.token) : null;
    const needAuth = !['enter', 'records', 'weekly', 'hall'].includes(body.action);
    if (needAuth && !me) return fail(401, 'signed_out', 'Sign in again.');

    switch (body.action) {
      case 'enter': {
        const name = String(body.name).toUpperCase();
        let athlete = athletes.get(name);
        let created = false;
        if (!athlete) {
          athlete = { id: id('athlete'), name, nationality: body.nationality, pin: body.pin };
          athletes.set(name, athlete);
          created = true;
        } else if (athlete.pin !== body.pin) {
          return fail(401, 'wrong_pin', 'That name is taken online and the PIN does not match.');
        }
        const token = id('token');
        sessions.set(token, athlete);
        return ok({ token, created, athlete: { id: athlete.id, name: athlete.name, nationality: athlete.nationality } });
      }
      case 'host': {
        const pin = String(10000 + rooms.size * 7 + 4321).slice(0, 5);
        const room = { pin, hostId: me.id, event: body.event, state: 'lobby', members: [{ athlete: me, lane: 0, device: body.device === 'phone' ? 'phone' : 'keyboard' }], race: null };
        rooms.set(pin, room);
        return ok({ room: roomState(room), you: me.id });
      }
      case 'join': {
        const room = rooms.get(body.pin);
        if (!room) return fail(404, 'no_room', 'No race room has that PIN.');
        if (!room.members.some((m) => m.athlete.id === me.id)) {
          if (room.members.length >= 4) return fail(400, 'full', 'That room is full (4 athletes).');
          const lane = [0, 1, 2, 3].find((l) => !room.members.some((m) => m.lane === l));
          room.members.push({ athlete: me, lane, device: body.device === 'phone' ? 'phone' : 'keyboard' });
        }
        return ok({ room: roomState(room), you: me.id });
      }
      case 'room': {
        const room = rooms.get(body.pin);
        if (!room || !room.members.some((m) => m.athlete.id === me.id)) return fail(403, 'not_member', 'You are not in that room.');
        return ok({ room: roomState(room), you: me.id });
      }
      case 'leave': {
        const room = rooms.get(body.pin);
        if (room) room.members = room.members.filter((m) => m.athlete.id !== me.id);
        return ok();
      }
      case 'start': {
        const room = rooms.get(body.pin);
        if (!room) return fail(404, 'no_room', 'No race room has that PIN.');
        if (room.hostId !== me.id) return fail(403, 'not_host', 'Only the host can start the race.');
        const event = body.event ?? room.event;
        const race = { id: id('race'), event, seed: `seed${nextId}`, gunAt: Date.now() + 4000, entries: new Map() };
        for (const m of room.members) race.entries.set(m.athlete.id, { athlete: m.athlete, lane: m.lane, status: 'racing', progress: 0, timeMs: null, wpm: null });
        races.set(race.id, race);
        Object.assign(room, { race, state: 'racing', event });
        return ok({ room: roomState(room), you: me.id });
      }
      case 'tick': {
        const race = races.get(body.raceId);
        const entry = race?.entries.get(me.id);
        if (entry && entry.status === 'racing') entry.progress = Math.max(entry.progress, Number(body.pos) || 0);
        return ok({ positions: [...(race?.entries.values() ?? [])].map((e) => ({ id: e.athlete.id, pos: e.progress, status: e.status, timeMs: e.timeMs })) });
      }
      case 'submit': {
        const race = races.get(body.raceId);
        const entry = race?.entries.get(me.id);
        if (!entry) return fail(403, 'not_entered', 'You are not entered in that race.');
        if (entry.status !== 'racing') return fail(409, 'already_submitted', 'A result is already recorded for this race.');
        const ruleset = RULESETS[race.event];
        const text = generateSprintLine(race.seed, ruleset.distance).text;
        let result;
        try {
          result = simulate(ruleset, text, body.log.map(([t, ch]) => ({ t, ch })));
        } catch {
          return fail(400, 'bad_log', 'The keystroke log breaks the rules of the race.');
        }
        const device = body.device === 'phone' ? 'phone' : 'keyboard';
        Object.assign(entry, { status: result.finished ? 'finished' : 'dnf', timeMs: result.timeMs, wpm: result.wpm, device });
        let personalBest = false;
        if (result.finished) {
          const key = `${me.id}|${ruleset.id}|${device}`;
          const old = bests.get(key);
          if (!old || old.timeMs > result.timeMs) {
            bests.set(key, { athlete: me, rulesetId: ruleset.id, device, timeMs: result.timeMs, wpm: result.wpm });
            personalBest = true;
          }
        }
        if ([...race.entries.values()].every((e) => e.status !== 'racing')) {
          for (const room of rooms.values()) if (room.race === race) room.state = 'done';
        }
        return ok({ result: { status: entry.status, timeMs: result.timeMs, wpm: result.wpm, accuracy: result.accuracy, reactionMs: result.reactionMs, errors: result.errors, falseStart: result.falseStart, personalBest } });
      }
      case 'results': {
        const race = races.get(body.raceId);
        const entries = [...(race?.entries.values() ?? [])].sort(
          (a, b) => Number(b.status === 'finished') - Number(a.status === 'finished') || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity),
        );
        let place = 0;
        return ok({
          done: entries.every((e) => e.status !== 'racing'),
          entries: entries.map((e) => ({ id: e.athlete.id, name: e.athlete.name, nationality: e.athlete.nationality, lane: e.lane, status: e.status, device: e.device ?? 'keyboard', place: e.status === 'finished' ? ++place : null, timeMs: e.timeMs, wpm: e.wpm })),
        });
      }
      case 'records': {
        const boards = {};
        const phoneBoards = {};
        const all = [...bests.values()].sort((a, b) => a.timeMs - b.timeMs);
        for (const b of all) {
          const list = ((b.device === 'phone' ? phoneBoards : boards)[b.rulesetId] ??= []);
          list.push({ rank: list.length + 1, name: b.athlete.name, nationality: b.athlete.nationality, timeMs: b.timeMs, wpm: b.wpm });
        }
        const speed = (device) =>
          all.filter((b) => b.device === device).sort((a, b) => b.wpm - a.wpm).map((b) => ({ name: b.athlete.name, nationality: b.athlete.nationality, wpm: b.wpm, rulesetId: b.rulesetId }));
        return ok({ boards, phoneBoards, topSpeed: speed('keyboard'), phoneTopSpeed: speed('phone'), mostWins: [] });
      }
      case 'weekly': {
        // Everything in the mock happened this week.
        const boards = {};
        const phoneBoards = {};
        for (const b of [...bests.values()].sort((x, y) => x.timeMs - y.timeMs)) {
          const list = ((b.device === 'phone' ? phoneBoards : boards)[b.rulesetId] ??= []);
          list.push({ rank: list.length + 1, name: b.athlete.name, nationality: b.athlete.nationality, timeMs: b.timeMs, wpm: b.wpm });
        }
        const lastWeek = medals.length ? { weekStart: medals[0].weekStart, medals: medals.filter((m) => m.weekStart === medals[0].weekStart) } : null;
        return ok({ weekStart: '2026-11-23', endsInMs: 4 * 86400000 + 3 * 3600000, boards, phoneBoards, lastWeek });
      }
      case 'hall': {
        const months = [...new Set(medals.map((m) => m.weekStart.slice(0, 7)))].sort().reverse();
        const month = body.month ?? months[0] ?? null;
        const table = new Map();
        for (const m of medals) {
          const row = table.get(m.name) ?? { name: m.name, nationality: m.nationality, gold: 0, silver: 0, bronze: 0 };
          row[['gold', 'silver', 'bronze'][m.rank - 1]] += 1;
          table.set(m.name, row);
        }
        return ok({ months, month, medals: medals.filter((m) => m.weekStart.startsWith(month ?? '-')), medalTable: [...table.values()] });
      }
      case 'myMedals': {
        const mine = medals.filter((m) => m.name === me.name);
        const count = (rank) => mine.filter((m) => m.rank === rank).length;
        return ok({ gold: count(1), silver: count(2), bronze: count(3), medals: mine });
      }
      default:
        return fail(400, 'bad_action', 'Unknown action.');
    }
  }

  return { handle, state: { athletes, rooms, races, bests, medals } };
}
