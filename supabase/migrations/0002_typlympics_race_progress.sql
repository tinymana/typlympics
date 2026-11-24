-- Metres covered so far, as reported by the athlete's client during a race.
-- Used only to draw opponents on screen; results never depend on it.
alter table typlympics.race_entries add column if not exists progress int not null default 0;
