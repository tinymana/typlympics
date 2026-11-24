# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
