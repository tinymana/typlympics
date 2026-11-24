# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
- 73 tests; the smoke test walks the menu and opens every screen.

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
