/**
 * Client for the Typlympics online API (a Supabase Edge Function).
 *
 * Nothing here can report a time or a place. A finished race is submitted
 * as its keystroke log and the server replies with what it computed.
 */

export const ONLINE_URL = 'https://epvpekylasvxoipxyvku.supabase.co/functions/v1/typlympics';

export interface OnlineAthlete {
  id: string;
  name: string;
  nationality: string;
}

export interface RoomMember extends OnlineAthlete {
  lane: number;
}

export interface RoomRace {
  id: string;
  event: string;
  rulesetId: string;
  seed: string;
  /** Milliseconds until the gun when the server answered; negative once it has fired. */
  gunInMs: number;
}

export interface RoomState {
  pin: string;
  hostId: string;
  event: string;
  state: 'lobby' | 'racing' | 'done';
  maxPlayers: number;
  members: RoomMember[];
  race: RoomRace | null;
}

export interface OfficialResult {
  status: 'finished' | 'dnf' | 'review';
  timeMs: number | null;
  wpm: number | null;
  accuracy: number;
  reactionMs: number | null;
  errors: number;
  falseStart: boolean;
  personalBest: boolean;
}

export interface Standing extends RoomMember {
  status: 'racing' | 'finished' | 'dnf' | 'review';
  place: number | null;
  timeMs: number | null;
  wpm: number | null;
}

export interface Position {
  id: string;
  pos: number;
  status: string;
  timeMs: number | null;
}

export interface BoardRow {
  rank: number;
  name: string;
  nationality: string;
  timeMs: number;
  wpm: number;
}

export interface Records {
  /** Keyboard boards, by ruleset id. */
  boards: Record<string, BoardRow[]>;
  /** Phone boards, by ruleset id. */
  phoneBoards: Record<string, BoardRow[]>;
  phoneTopSpeed: Array<{ name: string; nationality: string; wpm: number; rulesetId: string }>;
  topSpeed: Array<{ name: string; nationality: string; wpm: number; rulesetId: string }>;
  mostWins: Array<{ name: string; nationality: string; wins: number }>;
}

export class OnlineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OnlineError';
  }
}

/** A room answer plus the local clock reading for the moment the server produced it. */
export interface RoomAnswer {
  room: RoomState;
  you: string;
  /** performance.now() estimate of when the server computed `race.gunInMs`. */
  answeredAt: number;
}

export interface OnlineApi {
  enter(name: string, nationality: string, pin: string): Promise<{ token: string; created: boolean; athlete: OnlineAthlete }>;
  host(token: string, event: string): Promise<RoomAnswer>;
  join(token: string, pin: string): Promise<RoomAnswer>;
  room(token: string, pin: string): Promise<RoomAnswer>;
  leave(token: string, pin: string): Promise<void>;
  start(token: string, pin: string, event: string): Promise<RoomAnswer>;
  tick(token: string, raceId: string, pos: number): Promise<Position[]>;
  submit(token: string, raceId: string, log: Array<[number, string]>, device: 'keyboard' | 'phone'): Promise<OfficialResult>;
  results(token: string, raceId: string): Promise<{ done: boolean; entries: Standing[] }>;
  records(): Promise<Records>;
}

type Json = Record<string, unknown>;

export function createOnlineApi(url: string = ONLINE_URL, fetchImpl: typeof fetch = (...args) => fetch(...args)): OnlineApi {
  async function call(action: string, body: Json = {}): Promise<{ data: Json; sentAt: number; receivedAt: number }> {
    const sentAt = performance.now();
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
    } catch {
      throw new OnlineError('offline', 'Could not reach the Typlympics server. Check your connection.');
    }
    const receivedAt = performance.now();
    let data: Json;
    try {
      data = (await res.json()) as Json;
    } catch {
      throw new OnlineError('server', 'The server sent an answer the game could not read.');
    }
    if (!res.ok || data['ok'] !== true) {
      const err = (data['error'] ?? {}) as Json;
      throw new OnlineError(String(err['code'] ?? 'server'), String(err['message'] ?? 'Something went wrong on the server.'));
    }
    return { data, sentAt, receivedAt };
  }

  async function roomCall(action: string, body: Json): Promise<RoomAnswer> {
    const { data, sentAt, receivedAt } = await call(action, body);
    // The server's "ms until the gun" was true about halfway through the round trip.
    return { room: data['room'] as RoomState, you: String(data['you']), answeredAt: (sentAt + receivedAt) / 2 };
  }

  return {
    async enter(name, nationality, pin) {
      const { data } = await call('enter', { name, nationality, pin });
      return { token: String(data['token']), created: data['created'] === true, athlete: data['athlete'] as OnlineAthlete };
    },
    host: (token, event) => roomCall('host', { token, event }),
    join: (token, pin) => roomCall('join', { token, pin }),
    room: (token, pin) => roomCall('room', { token, pin }),
    async leave(token, pin) {
      await call('leave', { token, pin });
    },
    start: (token, pin, event) => roomCall('start', { token, pin, event }),
    async tick(token, raceId, pos) {
      const { data } = await call('tick', { token, raceId, pos });
      return data['positions'] as Position[];
    },
    async submit(token, raceId, log, device) {
      const { data } = await call('submit', { token, raceId, log, device });
      return data['result'] as OfficialResult;
    },
    async results(token, raceId) {
      const { data } = await call('results', { token, raceId });
      return { done: data['done'] === true, entries: data['entries'] as Standing[] };
    },
    async records() {
      const { data } = await call('records');
      return {
        boards: (data['boards'] ?? {}) as Records['boards'],
        phoneBoards: (data['phoneBoards'] ?? {}) as Records['phoneBoards'],
        topSpeed: (data['topSpeed'] ?? []) as Records['topSpeed'],
        phoneTopSpeed: (data['phoneTopSpeed'] ?? []) as Records['phoneTopSpeed'],
        mostWins: (data['mostWins'] ?? []) as Records['mostWins'],
      };
    },
  };
}

/** The API used by the game. Tests replace it with a fake server. */
export const online: OnlineApi = createOnlineApi();

/** Local time of the gun, from a room answer that carries a race. */
export function gunTimeFrom(answer: RoomAnswer): number | null {
  return answer.room.race ? answer.answeredAt + answer.room.race.gunInMs : null;
}

export function ordinal(place: number): string {
  return ['1ST', '2ND', '3RD', '4TH'][place - 1] ?? `${place}TH`;
}
