# The runtime gives its facts as facts: the `faits` command (#343)

Follow-up to #339 (epic #294), runtime part. The app will draw state boards (bar, project
tile, rail); it must deduce nothing from prose.

## The problem

Everything the runtime knows is read in `status` and `rail`, written for a human. A program that
wanted a pill or five numbers would have to read sentences — hence deduce, which the epic
forbids.

## What is decided

Manager's rulings, recorded on the issue (2026-10-12).

- **One more command, `faits`**, rather than an option on `status` and on `rail`: a single
  form, hence a single contract and a single call for the app; the argument parsing of `status` and of
  `rail` is not touched, their text cannot move. It goes through the action like the
  others: `brigade <project> faits`.
- **A JSON object, on one line**, drawn from `lireEtat` — the very reading behind `status`. No
  second reading of the log.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":0,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/…/issues/14"}]}
```

| Field | What it carries |
|---|---|
| `etat` | The project's state, as one word from a closed list (below) |
| `lu` | The box's time at the reading |
| `dernierTick` | The time of the last tick of the running runtime, or `null` — stopped, or no tick since its start |
| `compteurs.rail` | Queued tickets, `BLOCKED` included |
| `compteurs.auTravail` | `taken` tickets |
| `compteurs.aLaPass` | `in pass` tickets |
| `compteurs.attend` | The decisions awaiting the chef: the figure on the head line of the `awaiting` block |
| `compteurs.livres24h` | Tickets served in the 24 h before `lu` — merged by the pass, merged by hand, or served without a merge. A ticket counts once |
| `dernierEvenement` | `seq`, `at`, `type`, `ticket` of the last of the "latest events" of `status` (neither heartbeat nor poll), without its payload; `null` on an empty log. The `type` is displayed, not interpreted: its list is not closed |
| `rail` | Each ticket in service order: `ticket`, `etat`, `titre`, `url` |

**The project's state** — the first true one wins:

| Word | When |
|---|---|
| `off` | the runtime is stopped or never started, according to the log |
| `stopped` | the chef's "stop" |
| `held` | it runs, but nothing starts any more: breaker open, Max connection missing or expired, red base |
| `open` | none of the above |

**A ticket's state**: the word that `status` and `rail` write — `queued`, `BLOCKED`, `taken`,
`in pass`, `served`, `86`.

A reader treats a word it does not know as a colourless word: the list can gain a
word without breaking anyone.

## What the form does not say

- **`open` says what the log says.** A runtime killed without warning still appears running there;
  the form carries `lu` and `dernierTick`, the reader displays their age, nobody concludes. A
  `muette` word, with a threshold, is a question for the PO, not this ticket.
- **An `86` that has a return time** (quota) is in none of the five counters.
- **Neither quota nor machine**: no gauge, no percentage. What the runtime says in a word stays
  in `status`.
- The log, the grants, `station`, the partition, the arbiter.

## What does not change

The output of `status`, of `rail`, of `station`, line for line.

## Plan

1. `runtime/test/faits.test.ts`: the form of a known kitchen, frozen to the character; the form
   against the text of `status` (rail, count, `awaiting`, latest event); each project state word
   with the `status` line that says it; `livres24h` at the clock; the command, read-only.
2. `runtime/src/projections/rail.ts`: `servisDepuis`, the only new reading.
   `runtime/src/etat.ts`: `EtatCuisine.livres24h`, `faits(etat, maintenant)`, and the rail count
   shared with `decrireEtat`.
3. `runtime/src/faits.ts` and the `faits` script of `runtime/package.json`: this is how it
   becomes an action command (`runtime/test/geste.test.ts`).
4. `docs/runtime.md`: "Les faits, pour un programme", and the line in "Piloter".
