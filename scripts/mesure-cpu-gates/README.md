# Measuring the runtime suite and the gates

Three scripts, run from anywhere in a worktree. They change no test and no gate.

| Script | What it measures | Takes |
|---|---|---|
| `suite-runtime.sh [<out-dir>] [-- <launcher options>]` | the **whole runtime suite, once**, through the ordered launcher `runtime/test-config/suite.ts`: wall clock, CPU, test counts, load, the 10 longest files | 1 to 3 min |
| `profil-runtime.sh [<out.tsv>] [<files at once>]` | the **CPU of each runtime test file**, each run alone, `nproc` at a time: `cpu_s user_s sys_s wall_s code file`, sorted by CPU | 2 to 3 min |
| `mesure-cpu-gates.sh [<out-dir>]` | the CPU of one full gates run, then of every test file (runtime and app) run one by one (see `docs/profil-cpu-gates.md`) | about 40 min |

## The whole runtime suite, with its wall clock (#2085)

```sh
scripts/mesure-cpu-gates/suite-runtime.sh            # writes to <worktree>/.brigade-state/suite-runtime/
```

The last lines it prints:

```
suite du runtime : <wall> s d'horloge, <cpu> s de processeur (<user> utilisateur + <sys> système), code <0|1>
tests : <n> joués, <n> verts, <n> en échec, <n> sautés, <n> annulés
```

The launcher itself also prints one line at the end of the spec output:
`suite: <n> tests, <n> files, <s> s wall-clock, concurrency <n>, green|red`.
It can be run directly, from `runtime/`: `node test-config/suite.ts [<files or globs>] [--concurrence <n>]`.

`SUITE_RUNTIME_AVANT=1 scripts/mesure-cpu-gates/suite-runtime.sh <out-dir>` runs instead the exact command of `npm test`
(`node --test`, five files at a time, sorted by name): the baseline, on the same machine.

To compare the tests run by two passes: `diff <A>/tests.txt <B>/tests.txt` (one line per test, skipped ones marked).

### What the ordered launcher changes, and why

- **Longest files first** (`runtime/test-config/durees.tsv`, refreshed from the `durees.tsv` a pass writes). `node --test` takes its files in name order, five at a time: a 40 s file drawn last held the suite alone while the other cores waited.
- **As many files at once as logical cores** (`BRIGADE_TESTS_CONCURRENCE` or `--concurrence` to override). Past that, the wall clock no longer drops: the suite is bound by the CPU.
- **Blocking stdout in each test file** (`runtime/test-config/sortie-bloquante.ts`). Under `--test-force-exit`, a loaded launcher lost the end of a file's report, and tests were missing from the count (23 and 35 on two passes of a loaded box).
- **Short files several per process** (`suite.ts`, "Les petits fichiers"). A file under a second paid about half of it to start: its Node, the test runner, and the runtime modules it loads — the same as its neighbour's. Files known to last under 4 s are played in batches of up to 8 s, one process per batch, their tests one after the other. A file stays alone when it touches anything its neighbours would share: the process environment, its directory, its signals, the process's GitHub counter (`installerLimite`), global mocks (`t.mock` is undone per test, so it is fine). A file calling `temporaireDuFichier` opens its own batch and never shares it with a file that keeps directories (`repertoireDuFichier`, `aides/box.ts`). An unknown file runs alone until `durees.tsv` knows it.
- **The same files and the same guard as `npm test`**: `test/**/*.test.ts` and `test-hang-guard/**/*.test.ts`, with `test-hang-guard/charger.ts` preloaded in every file (#2084: a test past 30 s fails, named).
- **The same 2 s rule as `npm test`** (#2129): the launcher plays the reporter `test/garde-duree/reporteur.ts` beside `spec`. A test over 2 s that `test/garde-duree/exceptions.ts` does not list is named on stderr and turns the suite red.
- Temp dir in `/dev/shm` when it has room, Node's compile cache, `git --exec-path` first in `PATH` — as the gates and `npm test` already do.

### Before and after, on the station (#2085)

Measured on the box station: Intel Xeon E5-1620 v2 at 3.7 GHz, 4 physical cores, 8 threads. Other worktrees were working on it too; the load at the start of each pass is in the table.
Before is `origin/main` at `d0b5fbd`, extracted with `git archive` and played by `SUITE_RUNTIME_AVANT=1 suite-runtime.sh` (the exact command of `npm test`). After is this branch, played by `suite-runtime.sh`.

| Whole runtime suite | Before (`npm test`) | After (`suite-runtime.sh`) |
|---|---|---|
| Wall clock | 128.4 s | **95.4 s** |
| CPU (user + system) | 685.6 s | **616.0 s** |
| Tests run | 4271 | **4272** |
| Passed / failed / skipped | 4265 / 0 / 6 | 4266 / 0 / 6 |
| Load at the start | 6.89 | 9.15 |

`diff` of the two `tests.txt` files gives one more line after: the test of `npm run` on an old script name (`commandes.test.ts`). No test is gone.

The slowest files, before and after. Each file is played alone, eight at a time (`profil-runtime.sh`, wall s / CPU s, children included). The last column is its wall clock inside the suite after.

| File | Before | After | In the suite | Cause, and what was done |
|---|---|---|---|---|
| `test/mise-a-jour/machine.test.ts` | 46.7 / 24.7 | **23.9** / 24.8 | 27.8 | Four machine scenarios, one after the other, and each install or update ran under `spawnSync`, which froze the file. **Fixed**: the scenarios run side by side, and install and update are asynchronous. CPU is the same, since the work is the same. Each scenario declares a 120 s limit to the hang guard: in the loaded suite it goes past 30 s. |
| `test/0-en-premier/recette.test.ts` | 38.3 / 4.7 | 38.7 / 4.7 | 40.0 | Waits on purpose for the station's real 30 s cadence: the spec measures it. **Not changed**: the launcher starts it first, so it runs under the rest of the suite. |
| `test/lectures-sous-condition.test.ts` | 32.5 / 25.1 | 32.4 / 24.8 | 44.4 | An hour of ticks over four projects against a fake `gh`, one process per read. The reads of a tick were made concurrent: **no gain measured**. |
| `test/installation.test.ts` | 31.1 / 25.1 | 31.2 / 25.0 | 38.7 | Real installs, each step a Node process loading about 170 modules. **Not changed.** |
| `test/pass.test.ts` | 26.8 / 29.3 | 27.3 / 29.4 | 26.1 | The pass played end to end: journal work in the process, then gates, `git` and fake `gh`. **Not changed.** |
| `test/station.test.ts` | 20.8 / 26.3 | 19.4 / 26.0 | 23.1 | Starts `src/station/main.ts` (289 modules, about 1 s of CPU per start) once per case. **Not changed.** |
| `test/fusion.test.ts` | 13.9 / 12.6 | 15.2 / 12.9 | 11.0 | Real repositories, merges and `git` processes. **Not changed.** |
| `test/desinstallateur.test.ts` | 13.2 / 17.5 | 13.9 / 17.5 | 21.0 | Starts `desinstaller-sous-le-compte.ts` (162 modules) once per case. **Not changed.** |
| `test/reaction.test.ts` | 13.1 / 14.8 | 14.0 / 15.0 | 14.0 | The station's reactions, with real cooks (`relais.ts` and a fake `claude` per cook). **Not changed.** |
| `test/main.test.ts` | 13.1 / 37.5 | 11.6 / 37.0 | 14.0 | 29 tests, each starting the real runtime (`src/main.ts`, 248 modules, about 0.55 s of CPU per start). **Not changed.** |
| `test/exploitation-en-anglais.test.ts` | 12.1 / 21.4 | 14.6 / 21.6 | 13.3 | One CLI process (167 modules) per command shown. **Not changed.** |
| `test/paquet/paquet.test.ts` | 13.0 / 9.9 | 14.4 / 9.9 | 17.1 | Builds real `.deb` packages with `dpkg-deb`. **Not changed.** |
| `test/commandes.test.ts` | 4.2 / 24.1 | 3.3 / **16.7** | 2.0 | About forty `npm run`, each one an `npm` start (about 0.35 s of CPU) before the script. **Fixed**: each script is played as `npm run` plays it, without `npm`. The real `npm run` is still tested once per kind of name. |

Across the whole suite, the launcher saves what the files repeat. 316 short files run in 37 processes and cost 106 s of CPU, where alone each one pays its start. The suite still costs 616 s.

### Then, fewer real processes per test (#2085, on `origin/main` `2958c14`)

The chef chose to keep the target on this box by having the tests start fewer real processes, knowing some of them then prove less of the real process. What changed:
- **The runtime, the station and the CLIs start in the test's process** where the test only reads what they say (`appeler`, `demarrerIci`, `jouerLaStation` in `runtime/test/outils.ts`). What depends on the process (start by its file, exit code, a real signal, a lock another process holds) is still proven with `lancer`.
- **The test kitchen starts its cooks without `relais.ts`** (`sansRelais`), except where the cook outliving the runtime is the subject.
- **Two tests prove less**, and their names say so:
  - `lectures-sous-condition.test.ts`: the hour of ticks plays the 1st, 2nd and 60th ticks and moves the clock over the other 57. The 60 ticks cost 2,760 processes of the fake `gh`.
  - `mise-a-jour/machine.test.ts`: two published versions instead of three. The third took the same path as the first. The first package is built with gzip instead of xz (`paquet.test.ts` still builds the real one).

Same box, other worktrees busy on it. Both runs on the same tree and in the same hour: before is `origin/main` at `2958c14` played by `SUITE_RUNTIME_AVANT=1 suite-runtime.sh` (the exact command of `npm test`), after is this branch rebased on it, played by `suite-runtime.sh`.

| Whole runtime suite | Before (`npm test`, `2958c14`) | After (`suite-runtime.sh`) |
|---|---|---|
| Wall clock | 175.8 s | **93.3 s** |
| CPU (user + system) | 815.4 s | **480.0 s** |
| Tests run | 4347 | **4348** |
| Passed / failed / skipped | 4341 / 0 / 6 | 4342 / 0 / 6 |
| Load at the start | 14.73 | 8.19 |

`diff` of the two `tests.txt`: one test more (`npm run` on an old script name). Four tests carry a new name, the two above and the two in `commandes.test.ts`. No test is gone.

The slowest files after, in the suite: `0-en-premier/recette.test.ts` 39.0 s (waits on purpose for the 30 s cadence), `installation.test.ts` 29.0 s, `pass.test.ts` 20.8 s, `mise-a-jour/machine.test.ts` 19.4 s, `depot.test.ts` 18.9 s, `station.test.ts` 17.9 s, `desinstallateur.test.ts` 17.2 s, `closing/run.test.ts` 15.0 s, `bac-a-sable/configuration.test.ts` 11.8 s, `bascule/machine.test.ts` 11.3 s.

**The bound the chef accepted.** The chef accepted the suite as measured here, about 95 s on this box, with under 60 s left to a later, heavier ticket. At 480 s of CPU, the floor on 8 threads is 60 s, even on an idle box. Going under it needs the CPU lowered again: lazy imports in the runtime's core, see below.

### Where the CPU goes, and the bound

Measured before the step above, at 616 s of CPU. The proportions still say where the next seconds are.

Profiled by recording `process.cpuUsage()` and `argv` in every Node process the suite starts (a module preloaded through `NODE_OPTIONS`; that pass cost 663 s, the recording included):

| Where | CPU |
|---|---|
| 55 test files played alone | 118 s |
| 316 short files, in 37 batches | 106 s |
| `src/relais.ts`, started 702 times (one per cook) | 61 s, 87 ms each: a bare Node start |
| `src/main.ts` (68 starts), `src/station/main.ts` (36 starts) | 37 s, 35 s |
| Other runtime commands and test doubles the tests start (`bascule/main.ts`, `installation-cli.ts`, `desinstaller-sous-le-compte.ts`, `montrer-*.ts`, fake `gh`, fake `claude`, …) | about 190 s |
| Processes other than Node (`git`, `sh`, `dpkg-deb`, `sqlite3`) | about 115 s |

On this CPU, two floors set the cost:
- `node -e 0` costs **85 ms** of CPU. No V8 or libuv flag lowers it, and the ones that change V8's flags raise it to 120 ms or more.
- Each module costs **about 0.8 ms**, even with the compile cache: resolution, `package.json` lookups and linking.
- `src/etat.ts` pulls 163 modules and `src/decisions.ts` 127, so every command that reads a project's state loads at least about 167. No single import edge removes more than 37 of them.

The wall clock cannot go below **CPU ÷ threads**: 616 ÷ 8 = 77 s, even on an idle box. The measured 95 s is that bound at about 80 % use.

**Under 60 s on this box would need the CPU under about 400 s, that is 215 s (35 %) less.** Neither the launcher nor the test fixtures can give that. The cost is in what the tests prove: real Node processes of the runtime, about 2000 of them, each paying the two floors above. It would take one of these:
1. Lazy imports across the runtime's core (`etat.ts`, `decisions.ts` → `manager.ts` → `reaction.ts` → `pass.ts`), so that a command loads only what it runs. That is a refactor of the product, not of the tests, and it saves at best about 100 ms per process, around 50 s in total.
2. Fewer real processes per test (`relais.ts` per cook, `main.ts` and `station/main.ts` per case). That changes what those tests prove.
3. A faster station. At 616 s of CPU, 60 s needs the equivalent of about 12 of this box's threads at full use: for example a recent CPU with 8 cores and 16 threads.

### Reading the number

The wall clock is bounded below by **CPU ÷ threads** and by **the longest file**. Read both before blaming a test:
`suite-runtime.sh` prints the CPU, `profil-runtime.sh` says which files spend it. The longest file in the suite is now `test/0-en-premier/recette.test.ts` (39 s, mostly waiting on purpose), then `test/installation.test.ts` (29 s).
