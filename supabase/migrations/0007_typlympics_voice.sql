-- Voice chat. Audio never touches the server: it flows directly between the
-- players' browsers. The server only passes the short connection messages
-- ("signals") the browsers need to find each other, then forgets them.
alter table typlympics.room_members add column if not exists voice_at timestamptz;

create table if not exists typlympics.voice_signals (
  id bigint generated always as identity primary key,
  pin text not null references typlympics.rooms (pin) on delete cascade,
  from_id uuid not null references typlympics.athletes (id) on delete cascade,
  to_id uuid not null references typlympics.athletes (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists voice_signals_to_idx on typlympics.voice_signals (pin, to_id, id);
create index if not exists voice_signals_from_idx on typlympics.voice_signals (from_id);
create index if not exists voice_signals_to_athlete_idx on typlympics.voice_signals (to_id);
alter table typlympics.voice_signals enable row level security;
