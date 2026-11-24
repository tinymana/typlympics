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
