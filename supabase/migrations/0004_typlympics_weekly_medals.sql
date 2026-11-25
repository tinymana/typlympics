-- Weekly medals. A week runs Monday 00:00 UTC to the next Monday. When a week
-- is over, the three fastest athletes at each distance, on each device, are
-- recorded here for good. Equal times share a medal.
create table if not exists typlympics.weekly_medals (
  week_start date not null,
  ruleset_id text not null,
  device text not null check (device in ('keyboard', 'phone')),
  rank int not null check (rank between 1 and 3),
  athlete_id uuid not null references typlympics.athletes (id) on delete cascade,
  time_ms int not null,
  awarded_at timestamptz not null default now(),
  primary key (week_start, ruleset_id, device, athlete_id)
);
create index if not exists weekly_medals_athlete_idx on typlympics.weekly_medals (athlete_id);

-- Weeks whose medals have been awarded, so a week is only ever closed once.
create table if not exists typlympics.weeks_closed (
  week_start date primary key,
  closed_at timestamptz not null default now()
);

alter table typlympics.weekly_medals enable row level security;
alter table typlympics.weeks_closed enable row level security;

create index if not exists race_entries_week_idx on typlympics.race_entries (submitted_at) where status = 'finished';

-- Awards medals for every finished week that has not been closed yet.
-- Safe to call at any time and as often as wanted; returns medals awarded.
create or replace function typlympics.close_weeks() returns int
language plpgsql
set search_path = ''
as $$
declare
  awarded int;
  this_week timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
begin
  with src as (
    select (date_trunc('week', e.submitted_at at time zone 'utc'))::date as week_start,
           r.ruleset_id, e.device, e.athlete_id, min(e.time_ms) as time_ms
    from typlympics.race_entries e
    join typlympics.races r on r.id = e.race_id
    where e.status = 'finished' and e.submitted_at < this_week
    group by 1, 2, 3, 4
  ),
  pending as (
    select * from src s where not exists (select 1 from typlympics.weeks_closed c where c.week_start = s.week_start)
  ),
  ranked as (
    select *, rank() over (partition by week_start, ruleset_id, device order by time_ms) as place from pending
  ),
  ins as (
    insert into typlympics.weekly_medals (week_start, ruleset_id, device, rank, athlete_id, time_ms)
    select week_start, ruleset_id, device, place, athlete_id, time_ms from ranked where place <= 3
    on conflict do nothing
    returning 1
  )
  select count(*) into awarded from ins;

  insert into typlympics.weeks_closed (week_start)
  select distinct (date_trunc('week', e.submitted_at at time zone 'utc'))::date
  from typlympics.race_entries e
  where e.status = 'finished' and e.submitted_at < this_week
  on conflict do nothing;

  return awarded;
end;
$$;

revoke all on function typlympics.close_weeks() from public, anon, authenticated;
