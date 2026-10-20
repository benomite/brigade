# The measures report — spec (#163)

**Date**: 2026-10-09
**Status**: approved on 2026-10-09 — the six questions at the end of the document are settled, answers
recorded on the issue. Two departures from the proposal, stated where they apply: the signal (question 3)
and where the repo measures come from (`depot.ts` belongs to #164).
**Issue**: #163 "See drift before it hurts: the measures report"
**Builds on**: `2026-10-08-brigade-v2-design.md` (§The closing, principle 5),
`2026-10-08-runtime-status.md` (the read command whose shape this one takes over),
`2026-10-08-garde-fous.md` (a cook's measures, the settings written to the log). This document
re-decides nothing that appears there.

---

## What #163 delivers

A read command, `npm --prefix runtime run measures`, that lines up over time what the log knows
about how heavy the project is, and a line in `status` when a measure has crossed a declared
threshold. It tidies nothing: the closer is out of scope.

| Issue criterion | What carries it |
|---|---|
| Measures **over time** | One row per **slice of merges**, the most recent at the bottom, and a slope row (from the first slice shown to the last) |
| Derived from the log or the repo, never stored twice | Everything is read from `log.db`. What the log did not yet say enters it as **fields of existing facts** (below), not in a report table written separately |
| Readable without tooling | `run measures`, read-only, modelled on `run status` |
| A crossed threshold is flagged without being asked | The runtime writes it to the log and to its error output at the merge that crosses it, once; a `drift` block in `status` recalls it, absent when there is nothing to say |
| A cook's time shown with caution | No "average time to deliver": the **share of gates** in a delivery's time, and the **median turns per calibration** |
| Does not estimate what it does not know | Only the cooks in the log are counted; a missing measure displays `—`, never zero; nothing on the Max account |

## What the log already knows, and what it lacks

| Measure | In the log today? | What #163 adds |
|---|---|---|
| turns, tokens, duration of a cook | yes — `cook.exited` (`turns`, `tokens`, `durationMs`), calibration in `cook.launched` | nothing |
| merges | yes — `merge.done` | nothing |
| gates time | **no** — `gates.sh` prints it, `Gates` keeps only the verdict, `FAIL` lines and the end of the output | `Gates.measures`: what the gates **declare** (contract below) |
| number and duration of the test suite | **no** — the test output is thrown away when green | same |
| repo size, context size | **no** | same |

A single addition, then: an **optional** field of `Gates`, which `pass.judged`, `pass.replayed`
and `base.checked` already carry. A log from before #163 is read back as is, and its deliveries
display `—`. The pass is not modified.

The proposal had the runtime measure the repo, in `depot.ts` — the only module that runs `git`,
and reserved to #164 during this ticket. So everything goes through the contract: the project
declares what it weighs, as it declares its tests.

### The gates measures contract

The runtime does not know what a test is: the project does. The gates may therefore print, on
their output, lines

```
MESURE  <nom>=<nombre>
```

which `jouerGates` picks up as it already picks up the `FAIL` lines. Six names are known to the
report: `tests`, `tests_s`, `gates_s`, `depot_octets`, `contexte_octets`, `doc_octets`. Any other
name is kept in the log and ignored by the report. Gates that print nothing remain valid: the
column displays `—`.

This repo's `.claude/brigade/gates.sh` declares all six: the tests and their duration taken from
the `node --test` summary (`ℹ tests`, `ℹ duration_ms`), its own wall-clock duration, and the three
sizes. Neither its cap nor its checks change.

### The size of the loaded context — proposed definition

The PO left it "to be defined". What a cook loads **for certain** is written in
`docs/runtime.md` ("What a cook loads"): its instruction, and the repo's `CLAUDE.md` that the
instruction sends it to read. The rest — the docs it chooses to open — is not known without going
through its stream.

Two distinct measures, then, rather than one estimate:

- **`contexte`**: bytes of the `CLAUDE.md` at the root of the served repo, plus those of the files
  it imports by `@path`, transitively. This is the certain tax, paid at every cook.
- **`doc`**: bytes of the `*.md` files tracked by git, `CLAUDE.md` included. This is what a cook
  **may** end up reading, and it is the measure for the spec's trigger "the docs grew by X %". It
  is not presented as read.

In bytes, not tokens: the runtime cannot count tokens without calling a model.

**`depot`** (repo): bytes of what is committed (`git ls-tree -r -l HEAD`), so without dependencies
or builds.

## What the command shows

The example output and the reading of each column are in `docs/runtime.md`, "The measures report".

- A **slice** is worth what the **last** merged delivery of the slice carried (tests, suite,
  repo, context, doc: states), and the **median** of its deliveries for what repeats (gates, gates
  share, turns). In parentheses, the number of cooks behind a median: a median over one cook is
  not one, and the chef must see it.
- **The order of merges is not the order of judgments**: a delivery judged, put on hold, then
  merged without a replay behind another one carries measures older than the project's state. It
  does not conclude — a state measure only counts if its gates are later than those of any
  already merged delivery that declared it.
- **Gates share**: the duration of a delivery's gates, replays included, divided by that duration
  plus that of its cooks. It replaces the raw "time to deliver".
- **Turns**: those of all the ticket's cooks, under the calibration of the last one — the one with
  which it finally went through. In parentheses, the number of tickets behind the median.
- **Calibration**: `model/effort` from `cook.launched`. It is the only ticket size the log
  carries — the manager calibrates according to what it judges of the ticket.
- **Closing, security look**: no fact carries them yet; both counters start from the beginning of
  the log, and say so. They will recalibrate when the closer writes its own.
- `-- --par <n>` sets the size of a slice (10 by default). Beyond twelve slices, only the last
  ones are shown.

Errors, like `status`: `BRIGADE_STATE_DIR` missing or unknown argument → code 2 and the usage;
log missing or from before these projections → code 1 and the reason.

## The thresholds

Declared in the runtime's environment, like the guardrails' caps, and written to the log when they
change (`drift.configured`): `status` and `measures` read them there, with no variable to pass
again on each call. **No default**: an undeclared threshold flags nothing.

| Variable | Threshold on |
|---|---|
| `BRIGADE_DRIFT_TESTS` | the number of tests |
| `BRIGADE_DRIFT_TESTS_SECONDS` | the duration of the suite |
| `BRIGADE_DRIFT_GATES_SECONDS` | the duration of the gates |
| `BRIGADE_DRIFT_CONTEXT_KB` | the size of the context |
| `BRIGADE_DRIFT_REPO_MB` | the size of the repo |
| `BRIGADE_DRIFT_MERGES` | the merges since the last closing |
| `BRIGADE_DRIFT_GROWTH_PERCENT` | the growth of **any** state measure over the last 10 merges — the slope, not the point |
| `BRIGADE_DRIFT_TICKET_TOKENS` | the tokens of the most expensive ticket of the last 10 merges |
| `BRIGADE_DRIFT_LOST_TOKENS` | the tokens of launches with no delivery, over the last 10 merges |

A cap is crossed when it is **exceeded**; the merge counter, when it is **reached**. The slope
compares a state measure to what it was ten merges earlier, and says nothing before that.

**The signal** — settled by the chef: `status` alone does not meet "without being asked". At the
merge that crosses a threshold, the runtime writes `drift.crossed` and a line on its error
output. **Once**: the crossings already signalled are a projection of the log, so they hold after
a restart. Once back under its threshold, or the threshold removed, the measure gets
`drift.cleared` and can be signalled again. No issue is opened. `status` gains the `drift` block,
deduced on reading from the deliveries and the thresholds.

## Modules

```
runtime/src/
  evenements/pass.ts          Gates + measures?
  evenements/derive.ts        drift.configured, drift.crossed, drift.cleared
  gates.ts                    picks up the MESURE lines
  projections/mesures.ts      a ticket's gates, cooks and merges; thresholds in force; signalled crossings
  mesures.ts                  slices, medians, slopes, gauges — side-effect-free functions
  derive.ts                   reads the thresholds from the environment, writes them when they change, signals at merge
  montrer-mesures.ts          `npm run measures`: arguments, display
  etat.ts                     + the `drift` block
  main.ts                     wires up drift
.claude/brigade/gates.sh      declares its six measures
docs/runtime.md               + "The measures report", the `drift` block of `status`, the variables
```

`station.ts`, `nettoyage.ts`, `depot.ts` and `pass.ts` are not touched.

## Boundaries

- **Gates played outside the runtime** — by a V1 dev, by the stop hook — do not write to the log:
  the report only sees the deliveries the pass judged. This repo's drift (203 → 622 tests)
  happened under V1: the report would only have shown it when served by the runtime.
- **Out of scope**, as the issue says: the closer, the effects of a closing, coverage (the closer's
  KPI guardrail), the Max account's consumption (#63).
- **Tests**: on a hand-written log, with no kitchen. Only one plays the real `gates.sh`, on a
  trial project — the gates are at 50 s of processor out of 75.

## What the chef settled (2026-10-09)

1. **The time axis**: slices of merges, 10 by default, `--par <n>`.
2. **The context size**: two measures in bytes, `contexte` and `doc`.
3. **Where the signal lands**: the `drift` block of `status` **and** a runtime warning at the
   crossing, not repeated while the threshold remains crossed. No issue opened by the runtime.
4. **Thresholds**: absolute and slope, in the environment, written to the log, no default.
5. **Ticket of comparable size**: same calibration; the median, and over how many.
6. **The `MESURE` contract**: adopted in `.claude/brigade/gates.sh`, cap and checks unchanged.
