# mesure-appels-github

Measures the GitHub calls of the runtime over a 24 h window and gives the verdict of epic #2301: **PASS** = calls dropped by at least 80 % against the baseline day (2026-11-04) **and** no minute received a rate-limit response. No network, Python 3 only.

## Where the calls are recorded

The runtime records each call in the `appels` table of `compteur.db` (`runtime/src/limite-github.ts`), but **keeps only the last hour** (`FENETRE_MS`; every `prendre()` deletes older rows). `compteur.db` alone therefore never covers a day. Sample it regularly and give the script the samples.

Every hour, export the instants added since the previous export (no overlap, so nothing is counted twice):

```
sqlite3 "file:$BRIGADE_STATION_DIR/appels-github/compteur.db?mode=ro" \
  "SELECT json_object('instant', instant) FROM appels WHERE instant > $LAST ORDER BY instant" \
  > appels-$(date -u +%Y%m%dT%H).jsonl
```

(`$LAST` = the greatest `instant` of the previous export, `0` for the first.) The runtime does not record rate-limit responses: also keep a sampled recording of them, a `.jsonl` of `{"instant": ..., "status": 403|429, "headers": {...}}` from the `gh api -i` replies.

## Run it over a day

```
python3 scripts/mesure-appels-github/mesure.py \
  --debut 2026-11-05T00:00:00Z \
  --appels appels-*.jsonl \
  --limites reponses.jsonl \
  --base-fichier base.txt
```

- `--debut`: start of the 24 h window (ISO 8601, UTC unless it carries an offset); the window is `[debut, debut + 24 h)`.
- `--appels`: one or more sources, concatenated: the hourly exports, a `.jsonl` (`{"instant": <ms epoch or ISO>}` per call) or a `compteur.db`. **If the instants read do not cover the window (within one hour at each edge), the script prints why on stderr and exits 2 with no verdict.**
- `--base <n>` or `--base-fichier <file>`: the total calls of 2026-11-04 (first line of the file). An input, never hard-coded.
- `--limites`: the recorded responses. A minute counts as limited when a 403/429 carries `retry-after` or an `x-ratelimit-*` header. Without it, the rows of `--appels` that carry a `status` are read; if none do, the script prints a warning "reponses non enregistrees" before the verdict, since the limited minutes are then 0 without proof.

Output: total calls, calls per hour, limited minutes, baseline, reduction %, then a last line `PASS` or `FAIL` (exit code 0 / 1).

## Test it on the fixtures

```
python3 -I scripts/mesure-appels-github/test_mesure.py
```

Baseline of the fixtures: 1000 (`fixtures/base.txt`), window starting 2026-11-05T00:00:00Z. `reduction-85.jsonl` → PASS; `reduction-70.jsonl` → FAIL (70 %); `reduction-85.jsonl` with `--limites fixtures/limites-une-minute.jsonl` → FAIL (one limited minute); `reduction-85-courte.jsonl` (one hour only) → refused, exit 2.
