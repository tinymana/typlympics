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

## 200m, 400m, 800m and 1500m

Status: **provisional.** Built on 2026-11-24 after the creative director
set the event list and asked to keep going; the details below are my
defaults and await confirmation.

| Event | Ruleset | Distance | Splits at | Standards (bronze, silver, gold, world class) |
| --- | --- | --- | --- | --- |
| 200m | `200m@1` | 200 characters | 50, 100, 150, 200 m | 40.00, 30.00, 24.00, 20.00 s |
| 400m | `400m@1` | 400 characters | 100, 200, 300, 400 m | 1:20.00, 1:00.00, 48.00, 40.00 s |
| 800m | `800m@1` | 800 characters | 200, 400, 600, 800 m | 2:40.00, 2:00.00, 1:36.00, 1:20.00 |
| 1500m | `1500m@1` | 1,500 characters | 400, 800, 1200, 1500 m | 5:00.00, 3:45.00, 3:00.00, 2:30.00 |

- Every rule is the sprint's: one character per metre, 200 ms stumble, the same start and false start rule.
- Text is the same lowercase word list at every distance, held to the same difficulty per metre.
- Standards are 60, 80, 100 and 120 WPM held for the whole distance.
- The same ten rivals race every distance at the same speed bands.

Open questions: should the 800m and 1500m use real sentences with capitals
and punctuation; should a stumble cost more late in a long race; and is a
straight track acceptable for the 400m and beyond, or should laps be shown?

## Training rivals (Train mode)

Status: **roster approved by the creative director on 2026-11-24** (names,
nicknames, order and speed bands). Reaction times, error rates and rhythm
are my tuning and can change without affecting the bands. Rivals are
content, not rules: they type under ruleset `100m@1` like any player, and
results against them never reach a leaderboard.

| # | Name | Nickname | Speed band | Typed at | Reaction | Errors per key |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Terry Shellman | Turtle | Under 25 WPM | 18 to 24 | 0.44 s | 3.0% |
| 02 | Sleepy Steve | Sloth | 25-34 WPM | 25 to 34 | 0.40 s | 2.7% |
| 03 | Frostbite | Penguin | 35-44 WPM | 35 to 44 | 0.34 s | 2.2% |
| 04 | Ricky Rapid | Rabbit | 45-54 WPM | 45 to 54 | 0.30 s | 2.0% |
| 05 | The Sly Guy | Fox | 55-64 WPM | 55 to 64 | 0.27 s | 1.8% |
| 06 | Wolfgang | Wolf | 65-74 WPM | 65 to 74 | 0.245 s | 1.5% |
| 07 | King Leo | Lion | 75-84 WPM | 75 to 84 | 0.225 s | 1.3% |
| 08 | Lightning Legs | Gazelle | 85-94 WPM | 85 to 94 | 0.205 s | 1.1% |
| 09 | Speed Demon | Cheetah | 95-109 WPM | 95 to 109 | 0.185 s | 0.9% |
| 10 | The Peregrine | Falcon | 110+ WPM | 110 to 125 | 0.16 s | 0.6% |

- Each race, a rival types at a speed drawn from inside its band, so the same rival is a little quicker or slower from race to race.
- Bands do not overlap, so a higher-numbered rival always beats a lower one on the same line.
- A rival unlocks when the one before it is beaten. Nobody skips ahead (decided 2026-11-24).
- A win means crossing the line first; a dead heat is not a win.
- Beating all ten at a distance earns that distance's Meet Champion badge.

## Online versus (Compete)

Decided by the creative director on 2026-11-24: up to four athletes per
race, joined by room PIN, results recorded to the all-time leaderboard for
the distance. The rest is my implementation and open to change.

| Rule | Value |
| --- | --- |
| Athletes per race | Up to 4 |
| Joining | Five-digit room PIN shown to the host |
| Distance | Chosen by the host; can change between races |
| Start | Server sets the gun about 6 to 7.5 s after the host starts |
| Rules in the race | The distance's own ruleset, unchanged |
| Result | Computed on the server from the keystroke log; accepted once |
| Place | Order of official times among finishers |
| Leaderboard | Best official time per athlete per distance |
| Held for review | Finish more than 8 s before its log arrived, or over 300 WPM; not listed |
| Did not finish | Leaving mid-race, or not finishing within the time limit |
| Keyboard or phone | Each result is tagged; World Records ranks the two separately; both may race in one room (decided 2026-11-24) |
| Online identity | Athlete name (unique), nationality and four-digit PIN; five wrong PINs lock the name for 15 minutes |
