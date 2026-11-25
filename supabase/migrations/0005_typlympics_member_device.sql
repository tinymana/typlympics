-- What each athlete in a room is playing on, as their client reports it,
-- so the room and the race can show a keyboard or phone icon by their name.
alter table typlympics.room_members
  add column if not exists device text not null default 'keyboard' check (device in ('keyboard', 'phone'));
