# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added (weekly medals)

- Database (migration 0004): `weekly_medals`, `weeks_closed` and the
  function `typlympics.close_weeks()`, which awards gold, silver and
  bronze per distance and device for every finished week, once. Weeks run
  Monday 00:00 UTC to the next Monday. Equal times share a medal. There is
  no scheduled job: a finished week is closed by the first request that
  arrives after it ends.
- API actions `weekly` (this week's standings, time left, last week's
  medallists), `hall` (medals by month, all-time medal table) and
  `myMedals`.
- World Records has three boards, cycled with Enter: This Week, All Time
  and Hall of Fame.
- Career page shows the athlete's medal count; the title screen announces
  newly won medals once per week won.

### Added (invites)

- Race room invites (`net/invite.ts`): on touch devices an Invite button
  opens the system share sheet with a link to the room; elsewhere the I
  key copies the invite text. The link is the game's address with
  `?room=<PIN>` and nothing else.
- Opening an invite link remembers the PIN, removes it from the address
  bar, and joins the room once the athlete is signed in and online.
- Touch bar can show one extra action button per screen.

### Added (phones)

- Touch devices: a hidden text field raises the phone keyboard, and what
  is typed is fed to the game character by character (`input/mobile.ts`).
  Autocorrect, autocapitalise and spellcheck are switched off on the
  field, and it is cleared after each word.
- On-screen menu buttons (arrows, Enter, Esc, Type). The game is refitted
  to the space the phone keyboard leaves, with the race text shown large
  in a panel under it. A Train race waits on its marks until the keyboard
  is open.
- Device tagging: each race is recorded as `keyboard` or `phone`. It is
  `phone` when characters arrived through the text field while an
  on-screen keyboard was taking up part of the screen. Stored in local
  history and sent with online results.
- Server: `device` on race entries and bests (migration 0003); one best
  per athlete, distance and device; `records` returns `phoneBoards` and
  `phoneTopSpeed` beside the keyboard boards. World Records switches
  between the two with up and down.

### Fixed

- Race room: the host's start press was ignored if a room poll happened
  to be in flight. Polling and starting now use separate flags.

### Known limits (phones)

- The device is reported by the client and can be spoofed, like any
  client-reported value.
- Tested in an emulated phone only. Real phone keyboards vary, especially
  predictive text on Android.

### Changed

- The rival portrait is no longer shown on the result panel (win or loss).
  Portraits remain on the opponent select screen.

### Added (flags)

- Pixel flags for all 70 nationalities and the guest, drawn from data in
  `render/flagData.ts` (16 by 11 pixels each, no image files).
- Flags on the track (above the player's athlete, beside the name on the
  scoreboard, and on online opponents), at sign-in, on the title screen,
  in the race room and on World Records. 98 tests.

### Added (online)

- Database: schema `typlympics` in the `tiny-mana-jams` Supabase project
  (migrations in `supabase/migrations`). Not exposed through the public
  API; row level security on with no policies.
- Edge Function `typlympics` (`supabase/functions/typlympics`): sign-in by
  name and PIN (bcrypt, five wrong tries locks for 15 minutes), rooms with
  a five-digit PIN for up to four athletes, race start with a server gun
  time, progress relay, result submission and the all-time boards. Results
  are computed on the server from the submitted keystroke log with the
  game's own simulation; a result is accepted once per race.
- Client: `net/online.ts`, Compete (go online, host, join), race room, an
  online mode in the race scene with up to three opponents, official
  standings, and a World Records screen.
- Save version 5 keeps the online session token (never the PIN).
- Browser test drives a two-athlete online race against an in-memory
  stand-in for the server (`tools/mock-online.mjs`). 93 unit tests.

### Known limits (online)

- Opponents' positions on screen come from each client a few times a
  second and are display only; places and times come from the logs.
- A finish is checked against when its log reached the server, with an
  allowance of a few seconds, so small timestamp shading is not caught.
- The gun time is sent to clients a few seconds ahead, so a modified
  client could read it.

### Added (five distances)

- Rulesets `200m@1`, `400m@1`, `800m@1` and `1500m@1` on the sprint's
  rules, with their own split marks and time standards; `RULESETS`,
  `rulesetFor` and `eventLabel` in `@typlympics/sim`.
- Text generator holds every line length to the same difficulty per metre.
- Race scene works at any distance: track length, distance marks and
  finish follow the ruleset, and the text band scrolls two lines at a time
  (`render/textLines.ts`), repainting only the cells that change.
- Train: all five distances open, each with its own best, ghost, rival
  ladder and badge. Career page switches distance with left and right.
- 91 tests; the smoke test also runs a 200m.

### Added (main menu and career)

- Live main menu on the title screen: Train, Compete, Career, World
  Records. The background is the menu-less start-screen art; the menu
  frame and rows are cut from the art that has the menu, with a selected
  and an unselected state derived for each row.
- Train: distance select. The 100m is playable; 200m, 400m, 800m and 1500m
  are listed as coming soon.
- Career page from local data: best time and WPM, averages over the last
  20 races, accuracy, reaction, clean races, false starts, trend, recent
  races, and a weekly medals panel that fills once online boards exist.
- Save version 3: each athlete keeps a history of finished races (latest
  200). Version 2 saves migrate with an empty history.
- Compete and World Records screens describing the planned flow.
- Training rivals: the creative director's roster of ten, from Terry
  Shellman the Turtle (under 25 WPM) to The Peregrine (110+ WPM), each
  racing at a speed inside its band, in `packages/content/src/rivals.ts`.
  Portraits appear on the opponent screen (silhouetted while locked) and
  on the result panel, and in a "Meet the rivals" section on the website. A rival's keystroke log is
  generated from its speed, rhythm and error rate and run through the same
  simulation as the player's. Rivals unlock in order; Enter after a win
  faces the next one.
- Opponent select after the distance: time trial against your own best,
  or the rival ladder.
- Meet Champion badge and rival progress on the career page.
- Save version 4: rivals beaten per event. Version 3 saves migrate.
- 82 tests; the smoke test walks the menu, opens every screen and beats
  a rival.

### Added (sign-in and start screen)

- Athlete sign-in scene: name, nationality (70 countries, arrows or
  type-ahead) and a four-digit PIN. A known name asks for its PIN; a new
  name creates an athlete. Three wrong PINs return to the name step.
- Save version 2: per-athlete profiles with their own records and totals,
  an active profile, and a PIN-less GUEST. Version 1 saves migrate, with
  their record moved to GUEST. The PIN is stored only as a salted hash.
  This is a convenience lock for shared computers, not security; real
  accounts come with the server in milestone 5.
- Title screen now uses the creative director's start-screen art. The
  five-ring emblem is covered by the art's own tagline strip. Menu rows
  for unbuilt modes are dimmed.
- Keyboard handling recognises Backspace and the arrow keys as controls.
- 66 tests; the smoke test signs up, signs out, tries a wrong PIN and
  signs back in.

Milestone 2 work: typing measurement and athlete animation.

### Added

- Drive phase out of the blocks (low torso for the first 5 m), finish dip,
  dust at the feet on every stride, and speed lines after 15 clean keys in
  a row. Speed lines are presentation only and never affect the race.
- Photo finish: a finish within 0.10 s of the personal best is announced
  and the margin is shown to the millisecond.
- Layout tests: a full sprint line is typed and finished on QWERTY, Dvorak,
  Colemak, AZERTY and QWERTZ, and sprint text is checked to need no
  shifted, dead or AltGr keys on any of them.
- Smoke test now checks that key repeat, composition, shortcut chords and
  paste cannot advance the athlete, and that logged key times match the
  browser's event timestamps within 1 ms.

### Still open for milestone 2

- Measurement check in Firefox and Safari (only Chrome is automated).
- Photo finish between live opponents arrives with multiplayer; for now it
  compares against the personal-best ghost.

### Added (website)

- Public landing page in `site/` with in-page play, feature tour, roadmap
  and dev notes read from `site/devnotes.json`. `pnpm site` assembles it
  with the game under `play/`.
- GitHub Actions workflow that tests, builds and deploys the game to GitHub Pages on every push to `main`.

## [0.1.0] - 2026-11-24 - Milestone 1, checkpoint 1

First playable build: single-player 100m sprint.

### Added

- Monorepo with pnpm workspaces, strict TypeScript, Vitest and Vite.
- `@typlympics/sim`: deterministic 100m sprint simulation under ruleset `100m@1`
  (one character per metre, 200 ms error lockout, false start rule, splits,
  medals, time formatting, ghost position lookup).
- `@typlympics/content`: seeded PRNG, 273-word sprint list, generator for
  lines of exactly 100 characters, and a difficulty band so different seeds
  are comparable.
- Client: title screen, start sequence (marks, set, random gun delay), race,
  result panel with personal-best delta, splits, reaction, WPM, accuracy and
  medal, one-key rematch.
- Personal-best ghost replayed from its stored keystroke log.
- Versioned local save (version 1) with a migration path from version 0;
  stored records are re-verified from their logs on load.
- Key capture using browser event timestamps; held-key repeats, composition
  input, shortcut chords and paste never count.
- Code-drawn placeholder art in the title-screen palette and synthesised
  sound effects. No third-party assets.
- 44 unit and property tests, including 1,000 randomised logs for
  determinism and a rule that `sim` imports nothing outside itself.
- Browser smoke test that plays three races in headless Chrome.

### Notes

- The personal-best ghost was planned for milestone 3 and is included early
  because it directly serves the "one more race" goal. AI opponents, ghost
  export and the remaining milestone 3 items are not started.
- Photo finish, layout test matrix and refined animation belong to
  milestone 2.
