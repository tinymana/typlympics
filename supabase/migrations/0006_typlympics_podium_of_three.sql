-- A podium needs three athletes. Medals for a distance and device are only
-- awarded for a week in which at least three different athletes finished it.
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
    select *,
           rank() over (partition by week_start, ruleset_id, device order by time_ms) as place,
           count(*) over (partition by week_start, ruleset_id, device) as field
    from pending
  ),
  ins as (
    insert into typlympics.weekly_medals (week_start, ruleset_id, device, rank, athlete_id, time_ms)
    select week_start, ruleset_id, device, place, athlete_id, time_ms from ranked where place <= 3 and field >= 3
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
