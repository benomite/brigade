# Measuring the runtime suite and the gates

Three scripts, run from anywhere in a worktree. They change no test and no gate.

| Script | What it measures | Takes |
|---|---|---|
| `suite-runtime.sh [<out-dir>] [-- <launcher options>]` | the **whole runtime suite, once**, through the ordered launcher `runtime/test-config/suite.ts`: wall clock, CPU, test counts, load, the 10 longest files | 1 to 3 min |
| `profil-runtime.sh [<out.tsv>] [<files at once>]` | the **CPU of each runtime test file**, each run alone, `nproc` at a time: `cpu_s user_s sys_s wall_s code file`, sorted by CPU (`PROFIL_RUNTIME_DIR=<dir>/runtime` profiles an extracted base) | 2 to 3 min |
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
(`node --test`, five files at a time, sorted by name, with its 2 s reporter): the baseline, on the same machine.
`SUITE_RUNTIME_DIR=<dir>/runtime` plays another runtime than the worktree's: the base, extracted whole
(some tests read `docs/` and `.claude/`), without `git worktree`, whose `prune` from a cook's sandbox
erases the other worktrees' entries:

```sh
d=.brigade-state/avant/src; mkdir -p "$d" && git archive origin/main | tar -x -C "$d"
SUITE_RUNTIME_AVANT=1 SUITE_RUNTIME_DIR="$PWD/$d/runtime" scripts/mesure-cpu-gates/suite-runtime.sh .brigade-state/avant/out
```

An extracted tree is not a git checkout: the five tests of `enrolement/commande.test.ts` fail there, and only there.

To compare the tests run by two passes: `diff <A>/tests.txt <B>/tests.txt` (one line per test, skipped ones marked).

### What the ordered launcher changes, and why

- **Longest files first** (`runtime/test-config/durees.tsv`, refreshed from the `durees.tsv` a pass writes). `node --test` takes its files in name order, five at a time: a 40 s file drawn last held the suite alone while the other cores waited.
- **As many files at once as logical cores** (`BRIGADE_TESTS_CONCURRENCE` or `--concurrence` to override). Past that, the wall clock no longer drops: the suite is bound by the CPU.
- **Blocking stdout in each test file** (`runtime/test-config/sortie-bloquante.ts`). Under `--test-force-exit`, a loaded launcher lost the end of a file's report, and tests were missing from the count (23 and 35 on two passes of a loaded box).
- **Short files several per process** (`suite.ts`, "Les petits fichiers"). A file under a second paid about half of it to start: its Node, the test runner, and the runtime modules it loads — the same as its neighbour's. Files known to last under 4 s are played in batches of up to 8 s, one process per batch, their tests one after the other (the batch loads its files by `await import`, one after the other: under static imports, a file whose modules await at load let its neighbour's tests pass first). A file stays alone when it touches anything its neighbours would share: the process environment, its directory, its signals, the process's GitHub counter (`installerLimite`), global mocks (`t.mock` is undone per test, so it is fine). A file calling `temporaireDuFichier` opens its own batch and never shares it with a file that keeps directories (`repertoireDuFichier`, `aides/box.ts`). An unknown file runs alone until `durees.tsv` knows it.
- **The same files and the same guard as `npm test`**: `test/**/*.test.ts` and `test-hang-guard/**/*.test.ts`, with `test-hang-guard/charger.ts` preloaded in every file (#2084: a test past 30 s fails, named).
- **The same 2 s rule as `npm test`** (#2129): the launcher plays the reporter `test/garde-duree/reporteur.ts` beside `spec`. A test over 2 s that `test/garde-duree/exceptions.ts` does not list is named on stderr and turns the suite red.
- Temp dir in `/dev/shm` when it has room, Node's compile cache, `git --exec-path` first in `PATH` — as the gates and `npm test` already do.

### What the tests change (#2085)

The launcher alone left the suite at about 616 s of CPU. The rest came from the tests starting fewer real processes, where the process is not what they prove:
- **The runtime, the station and the CLIs start in the test's process** where the test only reads what they say (`appeler`, `demarrerIci`, `jouerLaStation` in `runtime/test/outils.ts`). What depends on the process (start by its file, exit code, a real signal, a lock another process holds) is still proven with `lancer`.
- **The test kitchen starts its cooks without `relais.ts`** (`sansRelais`, `runtime/test/aides/cuisine.ts`), except where the cook outliving the runtime is the subject (`relais: true`).
- **The command table plays each script as `npm run` plays it, without `npm`** (`commandes.test.ts`). The real `npm run` is still tested once per kind of name.
- **The update machine scenarios run side by side**, install and update asynchronous (`mise-a-jour/machine.test.ts`): `spawnSync` froze the file.
- **Two tests prove less**, and their names say so. No test is deleted or skipped, but the reviewer and the chef should know:
  - `lectures-sous-condition.test.ts`: the hour of ticks plays the 1st, 2nd and 60th ticks and moves the clock over the other 57. The 60 ticks cost 2,760 processes of the fake `gh`.
  - `mise-a-jour/machine.test.ts`: two published versions instead of three (the third took the same path as the first), and the first package is built with gzip instead of xz (`paquet.test.ts` still builds the real one).

### Before and after, on the station (2026-11-04)

The box station: Intel Xeon E5-1620 v2 at 3.7 GHz, 4 physical cores, 8 threads, shared with the other worktrees' cooks (the load at the start of each pass is in the table; it never fell under 7). Both passes on the same base, in the same hour:
- **Before** is the branch's base, `origin/main` at `0ac4994`, extracted with `git archive` and played by `SUITE_RUNTIME_AVANT=1 SUITE_RUNTIME_DIR=… suite-runtime.sh`: the exact command of `npm test`.
- **After** is this branch, played by `suite-runtime.sh`.

| Whole runtime suite | Before (`npm test`) | After (`suite-runtime.sh`) |
|---|---|---|
| Wall clock | 450.7 s | **74.1 s** |
| CPU (user + system) | 979.9 s | **459.3 s** |
| Tests run | 4564 | **4566** |
| Passed / failed / skipped | 4552 / 6 / 6 | 4560 / 0 / 6 |
| Load at the start (1 min) | 7.55 (20.6 during the pass) | 11.55 |

The six failures before are the measure's, not the base's: the five `enrolement/commande.test.ts` tests, which need a git checkout and fail in an extracted tree, and `mise-a-jour/machine.test.ts`, whose serial scenarios went past their limit under the load (97 s). `diff` of the two `tests.txt`: two tests more after (`npm run` on an old script name, and one in `garde-duree.test.ts` for the 2 s rule's bisection, which this branch brought), four tests renamed (the two that prove less, and two in `commandes.test.ts`), **none gone**.

Earlier passes of the same branch today, on the same box, before the 19 files `main` added entered `durees.tsv` (unknown, they ran alone): 84.6 s and 104.6 s, with 509 and 487 s of CPU. Larger batches (files under 6 s, batches of 12 s) were tried after: 77.8 s and 458.7 s of CPU, no gain, dropped. The wall clock follows the load the other worktrees put on the box. The CPU does not.

The slowest files before, and the slowest after. Each file is played alone, eight at a time (`profil-runtime.sh`, wall s / CPU s, children included; 894 s of CPU over all the files before, 679 s after). The fourth column is its wall clock inside the suite after.

| File | Before, alone | After, alone | In the suite | Cause, and what was done |
|---|---|---|---|---|
| `test/mise-a-jour/machine.test.ts` | 52.4 / 27.7 | **19.0** / 23.0 | 17.0 | Machine scenarios one after the other, each install or update under `spawnSync`, which froze the file. **Fixed**: side by side, asynchronous, and two versions instead of three. |
| `test/0-en-premier/recette.test.ts` | 38.5 / 4.9 | 38.1 / 4.9 | 37.9 | Waits on purpose for the station's real 30 s cadence: the spec measures it. **Not changed**: the launcher starts it first, under the rest of the suite. It is the suite's lower bound. |
| `test/lectures-sous-condition.test.ts` | 33.0 / 26.3 | **4.3** / 4.4 | 6.0 | An hour of ticks, 2,760 fake `gh` processes. **Fixed**: three ticks played, the clock moved over the 57 others (proves less, see above). |
| `test/installation.test.ts` | 29.8 / 26.1 | 26.6 / **18.7** | 26.1 | Real installs, one Node process of about 170 modules per step. **Fixed in part**: the CLIs and the runtime in the test's process where only their output is read. The real `git` and setup steps stay. |
| `test/pass.test.ts` | 29.4 / 29.7 | 25.2 / **16.6** | 19.2 | The pass end to end with real cooks. **Fixed in part**: cooks without a relay (one Node process less per cook). |
| `test/station.test.ts` | 20.3 / 26.3 | 18.1 / **14.2** | 16.8 | Starts `src/station/main.ts` per case. **Fixed in part**: cooks without a relay, except the two restarts whose cook must outlive the runtime. |
| `test/fusion.test.ts` | 16.0 / 13.1 | 11.6 / **8.0** | 11.0 | Real repositories and merges. **Fixed in part**: cooks without a relay. |
| `test/exploitation-en-anglais.test.ts` | 15.6 / 24.0 | **3.9** / 4.0 | 4.6 | One CLI process (167 modules) per command shown. **Fixed**: the commands run in the test's process. |
| `test/desinstallateur.test.ts` | 15.3 / 19.4 | 13.2 / 18.9 | 14.9 | The product starts `desinstaller-sous-le-compte.ts` under the service account's uid, 33 times. **Not changed**: that process is what it proves. |
| `test/reaction.test.ts` | 14.9 / 15.1 | 12.0 / **8.1** | 11.4 | The station's reactions with real cooks. **Fixed in part**: cooks without a relay. |
| `test/main.test.ts` | 12.8 / 40.5 | 11.5 / **22.4** | 10.3 | Tests each starting the real runtime (248 modules). **Fixed in part**: 15 of them start it in the test's process (`demarrerIci`). |
| `test/commandes.test.ts` | 4.5 / 25.7 | 1.4 / **3.3** | 2.0 | About forty `npm run`, each one an `npm` start. **Fixed**: each script played without `npm`. |

The slowest after that are not above: `test/depot.test.ts` 12.0 / 8.9 (16.6 in the suite; real repositories, not changed) and `test/station/main.test.ts` 10.7 / 20.0 (10.3; the station's real process and its signals, not changed).

### Where the CPU goes now, and the bound

Profiled on this branch by a module preloaded through `NODE_OPTIONS` that writes, as each Node process exits, its own CPU (`process.resourceUsage()`) and its waited children's (`/proc/self/stat`). For the test's children to inherit it, `ENV_ENFANT` (`runtime/test/outils.ts`) had to pass `NODE_OPTIONS` on, for that pass only. That pass cost 480 s:

| Where | CPU |
|---|---|
| The test files' own processes (47 alone, 357 files in 41 batches) | 227 s |
| Runtime processes the tests or the product start: `station/main.ts` (26 starts) 26 s, `main.ts` (24) 18 s, `desinstaller-sous-le-compte.ts` (33) 13 s, `bascule/main.ts` (23) 12 s, the gists fake `gh` (170) 11 s, others | about 130 s |
| Processes other than Node (`git`, `sh`, `dpkg-deb`, `script`), and the Node processes started under a stripped environment (the gesture through its fake `sudo`, 11 s for `geste.test.ts`) | about 110 s |
| The launcher itself (`spec`, TAP and the 2 s reporter on one stream) | 13.5 s |

The wall clock cannot go below **CPU ÷ threads**: 459 ÷ 8 = **57 s** on this box with nothing else running, and the cadence spec holds 38 s of it alone. The measured 74 to 105 s is that bound with the box shared: at a load of 11 to 17 before the suite starts, it gets about 6 of the 8 threads.

**Under 60 s on this box, shared as it is, would need the CPU under about 360 s, that is 100 s (22 %) less.** What is left is mostly what the tests prove: processes the product itself starts (uninstall under the service account, the gesture through `sudo`, the station's signals), real `git` repositories, and Node's floors on this CPU (`node -e 0` costs about 85 ms of CPU, each module about 0.8 ms). Lazy imports across the runtime's core (`etat.ts` pulls 163 modules, `decisions.ts` 127) would save at best about 100 ms per process, around 20 s here: a product refactor, not a test one.

### Reading the number

The wall clock is bounded below by **CPU ÷ threads** and by **the longest file**. Read both before blaming a test:
`suite-runtime.sh` prints the CPU, `profil-runtime.sh` says which files spend it. The longest file in the suite is now `test/0-en-premier/recette.test.ts` (38 s, mostly waiting on purpose), then `test/installation.test.ts` (26 s).
