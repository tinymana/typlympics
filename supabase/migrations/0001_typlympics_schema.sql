-- Typlympics online data. Everything lives in its own schema, which is not
-- exposed through the project's public API. The only way in is the
-- "typlympics" Edge Function, which connects as the database owner.
create schema if not exists typlympics;

-- Nothing here is reachable by the anon or authenticated API roles.
revoke all on schema typlympics from public, anon, authenticated;

create table typlympics.athletes (
  id uuid primary key default gen_random_uuid(),
  -- Upper case, A to Z, 0 to 9 and single spaces; unique across the game.
  name text not null unique check (name ~ '^[A-Z0-9]+( [A-Z0-9]+)*$' and char_length(name) between 1 and 12),
  nationality text not null check (nationality ~ '^[A-Z]{3}$'),
  -- bcrypt hash of the four-digit PIN.
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table typlympics.sessions (
  -- SHA-256 of the session token; the token itself is never stored.
  token_hash text primary key,
  athlete_id uuid not null references typlympics.athletes (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index sessions_athlete_idx on typlympics.sessions (athlete_id);

create table typlympics.rooms (
  -- Five-digit room PIN that others type to join.
  pin text primary key check (pin ~ '^[0-9]{5}$'),
  host_id uuid not null references typlympics.athletes (id) on delete cascade,
  event text not null check (event in ('100m', '200m', '400m', '800m', '1500m')),
  state text not null default 'lobby' check (state in ('lobby', 'racing', 'done')),
  race_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_host_idx on typlympics.rooms (host_id);

create table typlympics.room_members (
  pin text not null references typlympics.rooms (pin) on delete cascade,
  athlete_id uuid not null references typlympics.athletes (id) on delete cascade,
  lane int not null check (lane between 0 and 3),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (pin, athlete_id),
  unique (pin, lane)
);
create index room_members_athlete_idx on typlympics.room_members (athlete_id);

create table typlympics.races (
  id uuid primary key default gen_random_uuid(),
  pin text not null,
  event text not null,
  ruleset_id text not null,
  seed text not null,
  gun_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index races_pin_idx on typlympics.races (pin);

create table typlympics.race_entries (
  race_id uuid not null references typlympics.races (id) on delete cascade,
  athlete_id uuid not null references typlympics.athletes (id) on delete cascade,
  lane int not null,
  status text not null default 'racing' check (status in ('racing', 'finished', 'dnf', 'review')),
  -- All figures below are computed on the server from the keystroke log.
  time_ms int,
  wpm numeric(7, 2),
  accuracy numeric(6, 5),
  reaction_ms int,
  errors int,
  false_start boolean,
  log jsonb,
  submitted_at timestamptz,
  primary key (race_id, athlete_id)
);
create index race_entries_athlete_idx on typlympics.race_entries (athlete_id);

-- Each athlete's best verified time per ruleset: the all-time leaderboard.
create table typlympics.bests (
  athlete_id uuid not null references typlympics.athletes (id) on delete cascade,
  ruleset_id text not null,
  time_ms int not null,
  wpm numeric(7, 2) not null,
  race_id uuid not null,
  achieved_at timestamptz not null default now(),
  primary key (athlete_id, ruleset_id)
);
create index bests_board_idx on typlympics.bests (ruleset_id, time_ms);

-- Row level security on with no policies: even if the schema were exposed
-- by mistake, the API roles could read and write nothing.
alter table typlympics.athletes enable row level security;
alter table typlympics.sessions enable row level security;
alter table typlympics.rooms enable row level security;
alter table typlympics.room_members enable row level security;
alter table typlympics.races enable row level security;
alter table typlympics.race_entries enable row level security;
alter table typlympics.bests enable row level security;
