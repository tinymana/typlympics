# Mechanics log

Approved mechanics and every change to them. Mechanics are data in
`packages/sim/src/rulesets.ts`; a change means a new ruleset version, an
entry here, and the creative director's approval. Results under different
ruleset versions are never mixed on one leaderboard.

## 100m sprint

### Ruleset `100m@1`

Status: **in use for the milestone 1 prototype.** The creative director
gave the go-ahead to start the build on 2026-11-24 with these recommended
values. They stay provisional until confirmed after the first playtest.

| Mechanic | Value | Design reference |
| --- | --- | --- |
| Distance | 100 characters, 1 correct character = 1 metre | D2 |
| Wrong key | Stumble: input ignored for 200 ms, no backspace | D3 |
| Keys during a lockout | Ignored; do not count as errors or extend the lockout | D3 |
| False start | Any key before the gun, or a first key under 100 ms after it | D4 |
| False start penalty | Input ignored for 300 ms (from the gun, or from the early key) | D4 |
| Start sequence | Marks 1.5 s, then gun after a random 1.0 to 2.5 s | D4 |
| Text | Lowercase common English words and spaces, generated from a seed, shown at "On your marks" | D5 |
| Letter case | Letters are folded to lowercase, so Caps Lock has no effect | D5 |
| Official time | Timestamp of the 100th correct character, in whole ms; shown to 0.01 s, truncated | 2.3 |
| Splits | 30 m, 60 m, 100 m | 2.3 |
| Medals | Bronze 20.00, silver 15.00, gold 12.00, world class 10.00 | 2.3 |
| Streaks | Presentation only, no effect on speed | D11 |

Text generator version 1: difficulty band 5.5 to 13.5 (about the 15th to
85th percentile of raw lines, measured with `tools/text-band.ts`).

### Open for the first playtest

- Is 200 ms the right stumble length?
- Should the text appear at "On your marks" or only at the gun?
- Are the medal times right for a first-session player?

## Training rivals (Train mode)

Status: **provisional, built at the creative director's request on
2026-11-24; names and speeds await confirmation.** Rivals are content, not
rules: they type under ruleset `100m@1` like any player, and results
against them never reach a leaderboard.

| Rival | Speed | 100m time (about) | Reaction | Error rate per key |
| --- | --- | --- | --- | --- |
| The Snail | 20 WPM | 60.0 s | 0.42 s | 3.0% |
| The Tortoise | 30 WPM | 40.0 s | 0.36 s | 2.5% |
| The Penguin | 40 WPM | 30.0 s | 0.31 s | 2.0% |
| The Fox | 55 WPM | 21.8 s | 0.27 s | 1.8% |
| The Hare | 70 WPM | 17.1 s | 0.24 s | 1.5% |
| The Gazelle | 85 WPM | 14.1 s | 0.21 s | 1.2% |
| The Cheetah | 100 WPM | 12.0 s | 0.185 s | 1.0% |
| The Falcon | 120 WPM | 10.0 s | 0.16 s | 0.6% |

- A rival's finishing time varies by up to 1.5% either way from race to race.
- A rival unlocks when the one before it is beaten. A win means crossing the line first; a dead heat is not a win.
- Beating all eight at a distance earns that distance's Meet Champion badge.

Open questions: are eight rivals and these speeds right, and should a fast
typist be able to skip straight to a harder rival?
