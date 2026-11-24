/**
 * Typlympics online API: one Supabase Edge Function, called with
 * POST { action, ... }.
 *
 * Integrity rule: a client never reports a time, a place or a distance.
 * It submits its keystroke log; this function regenerates the race text
 * from the seed it issued, runs the same simulation the game runs, and
 * stores what the simulation says.
 *
 * Source of truth for this file is the repository. It is bundled with the
 * game's own sim and content packages before deployment:
 *   pnpm bundle:function
 */
// @ts-expect-error Deno resolves npm: specifiers at runtime.
import postgres from 'npm:postgres@3.4.5';
import { generateSprintLine } from '../../../packages/content/src/generator';
import { EVENT_IDS, RULESETS, simulate, type EventId, type InputEvent } from '../../../packages/sim/src/index';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response> | Response): void };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL') as string, { prepare: false, max: 2, idle_timeout: 20 });

const MAX_PLAYERS = 4;
const PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
/** Seconds from "start" to the gun, plus up to 1.5 s the players cannot predict exactly. */
const COUNTDOWN_MS = 6000;
/** A lobby member not heard from for this long has left. */
const MEMBER_TIMEOUT_S = 20;
/** Gap allowed between the claimed finish and when the log reached the server. */
const MAX_SUBMIT_LAG_MS = 8000;
const MAX_CLOCK_SKEW_MS = 1500;
/** Above any human typing speed; held for review rather than listed. */
const MAX_WPM = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Row = Record<string, any>;
type Body = Record<string, unknown>;

function str(body: Body, key: string): string {
  const v = body[key];
  if (typeof v !== 'string') throw new ApiError('bad_request', `"${key}" is required.`);
  return v;
}

function normalizeName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------ athletes

/** Signs in with name and PIN, creating the athlete if the name is new. */
async function enter(body: Body): Promise<Row> {
  const name = normalizeName(str(body, 'name'));
  const pin = str(body, 'pin');
  const nationality = typeof body['nationality'] === 'string' ? body['nationality'].toUpperCase() : '';
  if (!name) throw new ApiError('bad_name', 'A name is required.');
  if (!/^[0-9]{4}$/.test(pin)) throw new ApiError('bad_pin', 'The PIN must be four digits.');

  let created = false;
  let rows: Row[] = await sql`
    select id, name, nationality, pin_hash = extensions.crypt(${pin}, pin_hash) as ok,
           coalesce(locked_until > now(), false) as locked
    from typlympics.athletes where name = ${name}`;
  if (rows.length === 0) {
    if (!/^[A-Z]{3}$/.test(nationality)) throw new ApiError('bad_nationality', 'A nationality is required for a new athlete.');
    rows = await sql`
      insert into typlympics.athletes (name, nationality, pin_hash)
      values (${name}, ${nationality}, extensions.crypt(${pin}, extensions.gen_salt('bf', 10)))
      on conflict (name) do nothing
      returning id, name, nationality, true as ok, false as locked`;
    // Lost a race with another sign-up for the same name.
    if (rows.length === 0) throw new ApiError('name_taken', 'That name was just taken. Try again.');
    created = true;
  }
  const athlete = rows[0] as Row;
  if (athlete.locked) throw new ApiError('locked', `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`, 429);
  if (!athlete.ok) {
    await sql`
      update typlympics.athletes
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= ${PIN_ATTEMPTS} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
      where id = ${athlete.id}`;
    throw new ApiError('wrong_pin', 'That name is taken online and the PIN does not match.', 401);
  }
  if (!created) await sql`update typlympics.athletes set failed_attempts = 0, locked_until = null where id = ${athlete.id}`;

  const token = randomHex(32);
  await sql`insert into typlympics.sessions (token_hash, athlete_id) values (${await sha256(token)}, ${athlete.id})`;
  // Old sessions are dropped so the table does not grow without bound.
  await sql`delete from typlympics.sessions where athlete_id = ${athlete.id} and last_seen < now() - interval '30 days'`;
  return { token, created, athlete: { id: athlete.id, name: athlete.name, nationality: athlete.nationality } };
}

async function auth(body: Body): Promise<Row> {
  const token = str(body, 'token');
  const rows: Row[] = await sql`
    update typlympics.sessions s set last_seen = now()
    from typlympics.athletes a
    where s.token_hash = ${await sha256(token)} and a.id = s.athlete_id
    returning a.id, a.name, a.nationality`;
  if (rows.length === 0) throw new ApiError('signed_out', 'Sign in again.', 401);
  return rows[0] as Row;
}

// ------------------------------------------------------------ rooms

async function raceLimitMs(event: EventId): Promise<number> {
  // Enough for the slowest rival's pace and then some.
  return 60000 + RULESETS[event].distance * 4000;
}

/** Closes a race that has run past its limit: anyone still racing did not finish. */
async function expireRace(pin: string): Promise<void> {
  const rows: Row[] = await sql`
    select r.id, r.event, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.rooms m join typlympics.races r on r.id = m.race_id
    where m.pin = ${pin} and m.state = 'racing'`;
  const race = rows[0];
  if (!race) return;
  if (Number(race.since_gun) > (await raceLimitMs(race.event as EventId))) {
    await sql`update typlympics.race_entries set status = 'dnf', submitted_at = now() where race_id = ${race.id} and status = 'racing'`;
    await sql`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${pin}`;
  }
}

async function roomState(pin: string): Promise<Row> {
  const rooms: Row[] = await sql`select pin, host_id, event, state, race_id from typlympics.rooms where pin = ${pin}`;
  const room = rooms[0];
  if (!room) throw new ApiError('no_room', 'No race room has that PIN.', 404);
  const members: Row[] = await sql`
    select a.id, a.name, a.nationality, m.lane
    from typlympics.room_members m join typlympics.athletes a on a.id = m.athlete_id
    where m.pin = ${pin} order by m.lane`;
  let race: Row | null = null;
  if (room.race_id) {
    const races: Row[] = await sql`
      select id, event, ruleset_id, seed, extract(epoch from (gun_at - now())) * 1000 as gun_in_ms
      from typlympics.races where id = ${room.race_id}`;
    const r = races[0];
    if (r) race = { id: r.id, event: r.event, rulesetId: r.ruleset_id, seed: r.seed, gunInMs: Math.round(Number(r.gun_in_ms)) };
  }
  return { pin: room.pin, hostId: room.host_id, event: room.event, state: room.state, maxPlayers: MAX_PLAYERS, members, race };
}

/** Removes members who stopped checking in, and hands the room on if the host left. */
async function pruneRoom(pin: string): Promise<void> {
  await sql`
    delete from typlympics.room_members m using typlympics.rooms r
    where m.pin = ${pin} and r.pin = m.pin and r.state <> 'racing'
      and m.last_seen < now() - make_interval(secs => ${MEMBER_TIMEOUT_S})`;
  const rows: Row[] = await sql`
    select r.host_id, (select athlete_id from typlympics.room_members where pin = r.pin order by lane limit 1) as first_member,
           exists (select 1 from typlympics.room_members where pin = r.pin and athlete_id = r.host_id) as host_present
    from typlympics.rooms r where r.pin = ${pin}`;
  const room = rows[0];
  if (!room) return;
  if (!room.first_member) await sql`delete from typlympics.rooms where pin = ${pin}`;
  else if (!room.host_present) await sql`update typlympics.rooms set host_id = ${room.first_member} where pin = ${pin}`;
}

async function host(body: Body): Promise<Row> {
  const me = await auth(body);
  const event = str(body, 'event');
  if (!(EVENT_IDS as readonly string[]).includes(event)) throw new ApiError('bad_event', 'Unknown distance.');
  // One room per host, and abandoned rooms are cleared out.
  await sql`delete from typlympics.rooms where host_id = ${me.id} or updated_at < now() - interval '6 hours'`;
  await sql`delete from typlympics.room_members where athlete_id = ${me.id}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const pin = String(10000 + (crypto.getRandomValues(new Uint32Array(1))[0] as number) % 90000);
    const made: Row[] = await sql`
      insert into typlympics.rooms (pin, host_id, event) values (${pin}, ${me.id}, ${event})
      on conflict (pin) do nothing returning pin`;
    if (made.length) {
      await sql`insert into typlympics.room_members (pin, athlete_id, lane) values (${pin}, ${me.id}, 0)`;
      return { room: await roomState(pin), you: me.id };
    }
  }
  throw new ApiError('busy', 'Could not open a room. Try again.', 503);
}

async function join(body: Body): Promise<Row> {
  const me = await auth(body);
  const pin = str(body, 'pin');
  await pruneRoom(pin);
  const rooms: Row[] = await sql`select state from typlympics.rooms where pin = ${pin}`;
  const room = rooms[0];
  if (!room) throw new ApiError('no_room', 'No race room has that PIN.', 404);
  const already: Row[] = await sql`select 1 from typlympics.room_members where pin = ${pin} and athlete_id = ${me.id}`;
  if (already.length === 0) {
    if (room.state === 'racing') throw new ApiError('in_progress', 'That race has already started. Wait for the next one.');
    // Leave any other room first, then take the lowest free lane.
    await sql`delete from typlympics.room_members where athlete_id = ${me.id}`;
    const seated: Row[] = await sql`
      insert into typlympics.room_members (pin, athlete_id, lane)
      select ${pin}, ${me.id}, lane from generate_series(0, ${MAX_PLAYERS - 1}) as lane
      where lane not in (select lane from typlympics.room_members where pin = ${pin})
      order by lane limit 1
      on conflict do nothing returning lane`;
    if (seated.length === 0) throw new ApiError('full', `That room is full (${MAX_PLAYERS} athletes).`);
  }
  return { room: await roomState(pin), you: me.id };
}

/** Polled by everyone in the room; doubles as the "still here" signal. */
async function room(body: Body): Promise<Row> {
  const me = await auth(body);
  const pin = str(body, 'pin');
  const seen: Row[] = await sql`update typlympics.room_members set last_seen = now() where pin = ${pin} and athlete_id = ${me.id} returning 1`;
  if (seen.length === 0) throw new ApiError('not_member', 'You are not in that room.', 403);
  await pruneRoom(pin);
  await expireRace(pin);
  return { room: await roomState(pin), you: me.id };
}

async function leave(body: Body): Promise<Row> {
  const me = await auth(body);
  const pin = str(body, 'pin');
  await sql`delete from typlympics.room_members where pin = ${pin} and athlete_id = ${me.id}`;
  await pruneRoom(pin);
  return {};
}

async function start(body: Body): Promise<Row> {
  const me = await auth(body);
  const pin = str(body, 'pin');
  await expireRace(pin);
  const rooms: Row[] = await sql`select host_id, event, state from typlympics.rooms where pin = ${pin}`;
  const r = rooms[0];
  if (!r) throw new ApiError('no_room', 'No race room has that PIN.', 404);
  if (r.host_id !== me.id) throw new ApiError('not_host', 'Only the host can start the race.', 403);
  if (r.state === 'racing') throw new ApiError('in_progress', 'A race is already running.');
  // The host may change the distance between races.
  const event = typeof body['event'] === 'string' && (EVENT_IDS as readonly string[]).includes(body['event']) ? (body['event'] as EventId) : (r.event as EventId);
  const delay = COUNTDOWN_MS + ((crypto.getRandomValues(new Uint32Array(1))[0] as number) % 1500);
  const made: Row[] = await sql`
    insert into typlympics.races (pin, event, ruleset_id, seed, gun_at)
    values (${pin}, ${event}, ${RULESETS[event].id}, ${randomHex(8)}, now() + make_interval(secs => ${delay / 1000}))
    returning id`;
  const raceId = (made[0] as Row).id;
  await sql`
    insert into typlympics.race_entries (race_id, athlete_id, lane)
    select ${raceId}, athlete_id, lane from typlympics.room_members where pin = ${pin}`;
  await sql`update typlympics.rooms set state = 'racing', race_id = ${raceId}, event = ${event}, updated_at = now() where pin = ${pin}`;
  return { room: await roomState(pin), you: me.id };
}

// ------------------------------------------------------------ results

function parseLog(raw: unknown, distance: number): InputEvent[] {
  if (!Array.isArray(raw)) throw new ApiError('bad_log', 'A keystroke log is required.');
  if (raw.length > distance * 4 + 200) throw new ApiError('bad_log', 'The keystroke log is too long.');
  return raw.map((e) => {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || typeof e[1] !== 'string' || e[1].length !== 1) {
      throw new ApiError('bad_log', 'The keystroke log is malformed.');
    }
    return { t: e[0] as number, ch: e[1] as string };
  });
}

async function submit(body: Body): Promise<Row> {
  const me = await auth(body);
  const raceId = str(body, 'raceId');
  const rows: Row[] = await sql`
    select r.id, r.pin, r.event, r.seed, e.status, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.races r join typlympics.race_entries e on e.race_id = r.id
    where r.id = ${raceId} and e.athlete_id = ${me.id}`;
  const race = rows[0];
  if (!race) throw new ApiError('not_entered', 'You are not entered in that race.', 403);
  // A result is accepted once. Replays change nothing.
  if (race.status !== 'racing') throw new ApiError('already_submitted', 'A result is already recorded for this race.', 409);

  const ruleset = RULESETS[race.event as EventId];
  const log = parseLog(body['log'], ruleset.distance);
  const text = generateSprintLine(race.seed as string, ruleset.distance).text;
  let result;
  try {
    result = simulate(ruleset, text, log);
  } catch {
    throw new ApiError('bad_log', 'The keystroke log breaks the rules of the race.');
  }

  let status = result.finished ? 'finished' : 'dnf';
  if (result.finished && result.timeMs !== null) {
    // The claimed finish must sit just before the moment the log arrived.
    const lag = Number(race.since_gun) - result.timeMs;
    if (lag > MAX_SUBMIT_LAG_MS || lag < -MAX_CLOCK_SKEW_MS || (result.wpm ?? 0) > MAX_WPM) status = 'review';
  }

  await sql`
    update typlympics.race_entries
    set status = ${status}, time_ms = ${result.timeMs}, wpm = ${result.wpm === null ? null : Math.round(result.wpm * 100) / 100},
        accuracy = ${Math.round(result.accuracy * 100000) / 100000}, reaction_ms = ${result.reactionMs},
        errors = ${result.errors}, false_start = ${result.falseStart}, log = ${sql.json(body['log'] as any)}, submitted_at = now()
    where race_id = ${raceId} and athlete_id = ${me.id} and status = 'racing'`;

  let personalBest = false;
  if (status === 'finished' && result.timeMs !== null && result.wpm !== null) {
    const best: Row[] = await sql`
      insert into typlympics.bests (athlete_id, ruleset_id, time_ms, wpm, race_id)
      values (${me.id}, ${ruleset.id}, ${result.timeMs}, ${Math.round(result.wpm * 100) / 100}, ${raceId})
      on conflict (athlete_id, ruleset_id) do update
        set time_ms = excluded.time_ms, wpm = excluded.wpm, race_id = excluded.race_id, achieved_at = now()
        where typlympics.bests.time_ms > excluded.time_ms
      returning 1`;
    personalBest = best.length > 0;
  }

  const open: Row[] = await sql`select 1 from typlympics.race_entries where race_id = ${raceId} and status = 'racing' limit 1`;
  if (open.length === 0) await sql`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${race.pin} and race_id = ${raceId}`;

  return {
    result: {
      status,
      timeMs: result.timeMs,
      wpm: result.wpm,
      accuracy: result.accuracy,
      reactionMs: result.reactionMs,
      errors: result.errors,
      falseStart: result.falseStart,
      personalBest,
    },
  };
}

async function results(body: Body): Promise<Row> {
  await auth(body);
  const raceId = str(body, 'raceId');
  const pins: Row[] = await sql`select pin from typlympics.races where id = ${raceId}`;
  if (pins[0]) await expireRace(pins[0].pin as string);
  const entries: Row[] = await sql`
    select a.id, a.name, a.nationality, e.lane, e.status, e.time_ms, e.wpm, e.accuracy, e.reaction_ms, e.false_start
    from typlympics.race_entries e join typlympics.athletes a on a.id = e.athlete_id
    where e.race_id = ${raceId}
    order by (e.status = 'finished') desc, e.time_ms asc nulls last, e.lane`;
  let place = 0;
  return {
    done: entries.every((e) => e.status !== 'racing'),
    entries: entries.map((e) => ({
      id: e.id,
      name: e.name,
      nationality: e.nationality,
      lane: e.lane,
      status: e.status,
      place: e.status === 'finished' ? ++place : null,
      timeMs: e.time_ms,
      wpm: e.wpm === null ? null : Number(e.wpm),
      accuracy: e.accuracy === null ? null : Number(e.accuracy),
      reactionMs: e.reaction_ms,
      falseStart: e.false_start,
    })),
  };
}

/** The all-time boards. Public: no sign-in needed to look. */
async function records(): Promise<Row> {
  const times: Row[] = await sql`
    select * from (
      select b.ruleset_id, a.name, a.nationality, b.time_ms, b.wpm, b.achieved_at,
             row_number() over (partition by b.ruleset_id order by b.time_ms, b.achieved_at) as rank
      from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    ) ranked where rank <= 10 order by ruleset_id, rank`;
  const speed: Row[] = await sql`
    select a.name, a.nationality, b.wpm, b.ruleset_id
    from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    order by b.wpm desc, b.achieved_at limit 10`;
  const wins: Row[] = await sql`
    with ranked as (
      select athlete_id, rank() over (partition by race_id order by time_ms) as place, count(*) over (partition by race_id) as field
      from typlympics.race_entries where status = 'finished'
    )
    select a.name, a.nationality, count(*)::int as wins
    from ranked r join typlympics.athletes a on a.id = r.athlete_id
    where r.place = 1 and r.field >= 2
    group by a.id order by wins desc, a.name limit 10`;
  const boards: Record<string, Row[]> = {};
  for (const t of times) {
    (boards[t.ruleset_id] ??= []).push({ rank: Number(t.rank), name: t.name, nationality: t.nationality, timeMs: t.time_ms, wpm: Number(t.wpm), at: t.achieved_at });
  }
  return {
    boards,
    topSpeed: speed.map((s) => ({ name: s.name, nationality: s.nationality, wpm: Number(s.wpm), rulesetId: s.ruleset_id })),
    mostWins: wins,
  };
}

// ------------------------------------------------------------ entry point

const ACTIONS: Record<string, (body: Body) => Promise<Row>> = { enter, host, join, room, leave, start, submit, results, records };

function reply(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: { code: 'method', message: 'Use POST.' } });
  try {
    const body = (await req.json()) as Body;
    const action = ACTIONS[String(body['action'])];
    if (!action) throw new ApiError('bad_action', 'Unknown action.');
    return reply(200, { ok: true, ...(await action(body)) });
  } catch (e) {
    if (e instanceof ApiError) return reply(e.status, { ok: false, error: { code: e.code, message: e.message } });
    console.error('typlympics function error', e);
    return reply(500, { ok: false, error: { code: 'server', message: 'Something went wrong on the server.' } });
  }
});
