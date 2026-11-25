-- Whether a result was typed on a physical keyboard or a phone's on-screen
-- keyboard. Reported by the client; records are kept separately for each.
alter table typlympics.race_entries
  add column if not exists device text not null default 'keyboard' check (device in ('keyboard', 'phone'));

alter table typlympics.bests
  add column if not exists device text not null default 'keyboard' check (device in ('keyboard', 'phone'));

-- One best per athlete, per ruleset, per device.
create unique index if not exists bests_athlete_ruleset_device_idx
  on typlympics.bests (athlete_id, ruleset_id, device);
alter table typlympics.bests drop constraint if exists bests_pkey;
alter table typlympics.bests add constraint bests_pkey primary key using index bests_athlete_ruleset_device_idx;

drop index if exists typlympics.bests_board_idx;
create index bests_board_idx on typlympics.bests (ruleset_id, device, time_ms);
