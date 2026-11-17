# mesure-temps-servi

Measures the time from queued to served of the tickets served before and after a date, for epic #3739: the tests step must not make that time grow by more than 10 %. No network, Python 3 only.

## Where the timestamps come from

When a station merges a ticket, it measures its run and appends it to `.claude/brigade/temps-tickets.json` in its clone of the project (`enregistrerTemps`, `runtime/src/temps-ticket/mesure.ts`). The script reads three fields of each record:

- `depuis`: when the issue was filed, or when it got `fire` if that came more than one hour later — both read on GitHub at the merge;
- `attenteQualification`: the seconds from filing to `fire` (0 when `depuis` is already `fire`);
- `mergedAt`: the merge, when the ticket is served.

A ticket is queued at `depuis` + `attenteQualification`, the rule `rattraperLaPrise` uses in the same file, and served at `mergedAt`. A record measured before these fields existed (#2662) is set aside and counted on stderr.

## Run it

```
python3 scripts/mesure-temps-servi/mesure.py \
  --coupure 2026-11-16T22:06:47Z \
  --temps <clone>/.claude/brigade/temps-tickets.json
```

- `--coupure`: a ticket merged before this instant is in the `before` set, from it on in the `after` set (ISO 8601, UTC unless it carries an offset). For epic #3739, the `before` set is the tickets served before the first ticket of the tests step (#3725–#3729) was merged: #3729, merged by PR #3736 on 2026-11-16T22:06:47Z (`81ad77e` on `main`).
- `--temps`: one or more `temps-tickets.json` files (one per station that merges), concatenated; a ticket found in several counts once.

Output: for each set, its tickets, median and mean in minutes; then the relative change of the median and of the mean, each `over 10 %` or `within 10 %`; then a last line `over 10 %` (exit code 1) when either grows by more than 10 %, `within 10 %` (exit code 0) otherwise. A file that cannot be read, or an empty set, prints why on stderr and exits 2 with no verdict.

## Test it on the fixtures

```
python3 -I scripts/mesure-temps-servi/test_mesure.py
```

Both fixtures hold the same `before` set (5 tickets, median and mean 100 min) and one record without `depuis`, set aside. `servis-dans-10.json` → `after` median 105, mean 108 min: `within 10 %`. `servis-au-dela-10.json` → `after` median 120, mean 126 min: `over 10 %`.
