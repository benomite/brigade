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
- Temp dir in `/dev/shm` when it has room, Node's compile cache, `git --exec-path` first in `PATH` — as the gates and `npm test` already do.

### Reading the number

The wall clock is bounded below by **CPU ÷ cores** and by **the longest file**. Read both before blaming a test:
`suite-runtime.sh` prints the CPU, `profil-runtime.sh` says which files spend it. On the 8-thread box (4 physical cores),
the runtime suite cost about 690 s of CPU through `npm test`, and about 620 s through the launcher, so its wall clock cannot go below about 78 s there, even when the box is idle — and the longest file, `test/mise-a-jour/machine.test.ts`, holds about 40 s on its own.
