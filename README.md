# TYPLYMPICS

Arcade keyboard athletics by Tiny Mana Studios. Real typing skill drives an animated athlete.

Current state: **milestone 1 prototype**, a single-player 100m sprint.

## Play

```
pnpm install
pnpm dev        # http://localhost:5173
```

- Enter starts a race. Type the line shown at the bottom of the screen.
- One correct key is one metre. The 100th correct key stops the clock.
- A wrong key is a stumble: input is ignored for 200 ms. There is no backspace.
- A key before the gun, or within 100 ms of it, is a false start and costs 300 ms.
- Enter or Tab on the result screen races again. Esc restarts a race, or returns to the title from the result.
- Your best run is saved in the browser and runs beside you as a ghost.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server with hot reload |
| `pnpm test` | Unit and property tests (Vitest) |
| `pnpm typecheck` | Strict TypeScript check of every package |
| `pnpm build` | Production build into `apps/client/dist` |
| `pnpm smoke` | Builds, then plays three real races in headless Chrome and checks the rules, the save and the frame rate |
| `pnpm check` | Type check, tests and build together |

`pnpm smoke` needs Chrome or Chromium; set `CHROME_PATH` if it is not at `/usr/bin/google-chrome`.

## Hosting on GitHub Pages

`.github/workflows/pages.yml` type-checks, tests, builds and publishes the game on every push to `main`. One-time setup: in the repository on GitHub, open Settings, then Pages, and set Source to "GitHub Actions". The game is then served at `https://<owner>.github.io/typlympics/`.

## Layout

```
packages/sim       Pure race rules and scoring. No dependencies, no DOM, no clock.
packages/content   Seeded PRNG, word list, sprint line generator and difficulty band.
apps/client        Phaser 4 + Vite game client.
  src/input        Key capture and classification.
  src/render       Scenes, generated textures, layout.
  src/audio        Synthesised sound effects.
  src/storage      Versioned local save with migrations.
tools              Text difficulty analysis and the browser smoke test.
```

## The one rule everything rests on

A race result is a pure function of the ruleset, the challenge seed and the timestamped keystroke log:

```ts
simulate(ruleset, text, log) -> result
```

The client plays a race by feeding keys into the simulation, then recomputes the official result from the log when the race ends. The ghost is a stored log replayed. Saved records are re-verified from their logs on load, so an edited time is discarded. The ranked server in later milestones will call the same function, which is why no client ever needs to report a score.

## Process

- Mechanics live in versioned rulesets (`packages/sim/src/rulesets.ts`). Changing one requires creative director approval and an entry in `MECHANICS.md`.
- Every change is recorded in `CHANGELOG.md`.
- Milestone checkpoints are Git tags (`m1-checkpoint-1`, ...).
- Design documents: the Typlympics Pre-Production Package.

## Art and audio

Everything on screen is drawn in code and every sound is synthesised, so the prototype contains no third-party assets. Both are placeholders for original production art in the style of the title-screen concept.
