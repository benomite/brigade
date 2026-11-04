# mesure-appels-github

Measures the GitHub calls of the runtime over a 24 h window and gives the verdict of epic #2301: **PASS** = calls dropped by at least 80 % against the baseline day (2026-11-04) **and** no minute received a rate-limit response. No network, Python 3 only.

## Run it over a day

```
python3 scripts/mesure-appels-github/mesure.py \
  --debut 2026-11-05T00:00:00Z \
  --appels "$BRIGADE_STATION_DIR/appels-github/compteur.db" \
  --limites <responses.jsonl> \
  --base 1234
```

- `--debut`: start of the 24 h window (UTC); the window is `[debut, debut + 24 h)`.
- `--appels`: the runtime's call log, the `appels` table of the station's `compteur.db` (`runtime/src/limite-github.ts`; one row per call emitted), or a `.jsonl` (one `{"instant": <ms epoch or ISO>}` per call). Copy the db first if the station is running.
- `--base <n>` or `--base-fichier <file>`: the total calls of 2026-11-04 (first line of the file). Never hard-coded.
- `--limites`: the runtime does not record rate-limit responses in the call log, so give a sampled recording of responses, a `.jsonl` of `{"instant": ..., "status": 403|429, "headers": {...}}` taken from the `gh api -i` replies. A minute counts as limited when a 403/429 carries `retry-after` or an `x-ratelimit-*` header. Without it, the rows of `--appels` that carry a `status` are read; if none do, the limited minutes are 0 — only say PASS on a day whose responses you recorded.

Output: total calls, calls per hour, limited minutes, baseline, reduction %, then a last line `PASS` or `FAIL` (exit code 0 / 1).

## Try it on the fixtures

```
python3 scripts/mesure-appels-github/mesure.py --debut 2026-11-05T00:00:00Z --appels scripts/mesure-appels-github/fixtures/reduction-85.jsonl --base-fichier scripts/mesure-appels-github/fixtures/base.txt
```

`reduction-85.jsonl` → PASS; `reduction-70.jsonl` → FAIL (70 %); `reduction-85-limitee.jsonl` → FAIL (one limited minute). Baseline of the fixtures: 1000.
