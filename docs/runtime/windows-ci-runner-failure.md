# Diagnosis: the `runtime-windows` run where over 60 tests failed at once (run 41487915090)

Ticket #2116, under epic #2112. Run 41487915090 is the `push` on `main` of `f852b0e` (merge of #2100), 2026-11-02. This page reads that run, says what failed and where, and gives a verdict.

## Limit of this diagnosis

The raw job log of the failing job is not readable any more from where this diagnosis was written: `gh run view 41487915090 --job 125422995612 --log` and `gh api repos/benomite/brigade/actions/jobs/125422995612/logs` both answer `Forbidden` on the blob URL, with or without the sandbox. What follows rests on the run, job and step records (`gh run view --json jobs`) and on the check annotations (`gh api repos/benomite/brigade/check-runs/125422995612/annotations`), which `runtime/test/support/annotations.ts` writes at the end of each part. **The text of the first error is therefore not captured**: the annotations carry `test failed` for each file, not the error behind it. Anyone who can still open the log should read the first failing file there (`test/decisions.test.ts`, see below) and complete the "First error" section.

## What the run did

Only the job `tests (4/4)` failed. The three other parts of the same commit passed (`1/4` in 5 min 48 s, `3/4` in 8 min, `2/4` in 11 min 28 s), so the commit itself played green on the same runner image.

| Step of `tests (4/4)` | Result | Duration |
|---|---|---|
| Set up job, `core.autocrlf`, checkout, setup-node, `mkdir -p /tmp` | success | 20 s |
| `Tests du runtime` (`node test/support/windows.ts --part 4/4`) | **failure** | 55 s (17:06:47 → 17:07:42) |
| `Post Run actions/setup-node@v4` | skipped | 0 s |
| `Post Run actions/checkout@v4` | **failure** | 0 s |
| Complete job | success | 0 s |

A healthy part 4 plays about 1 040 tests and lasts several minutes (runs 41484649479 and 41488425275 on the same part: `tests 1038` and `tests 1057`). This one ended after 55 s with `tests 242, pass 158, fail 71, cancelled 0, skipped 13`.

## First error seen

Part 4 of 4 plays 92 files in alphabetical order, one at a time (`--test-concurrency=1`). Mapping the annotated files on that list (the list is `part(fichiersDeTest(), "4/4")` at `f852b0e`):

- files 0 to 20 (`activite-cuisine/comptes.test.ts` to `cuisson-de-bout-en-bout.test.ts`) passed, with the 13 usual win32 skips;
- **file 21, `test/decisions.test.ts`, is the first failure**; it is the first file played after `cuisson-de-bout-en-bout.test.ts`, which was green;
- from there, every file failed: `decoupage`, `dependances`, `derive`, `echeance-de-session`, `enregistrement-station/station`, `enrolement/geste`, `etat`, `fermeture-lecture/lecture` (the nine failures the check lists by name), then the 62 others up to the last file of the part, `verrou.test.ts`.

The count closes exactly: files 21 to 91 are 71 files, and the report says `fail 71`. The 71 "tests" are 71 files, one failure each.

First error text: **not recoverable from the annotations** (see the limit above). What is established is its position: the first file after a 21-file green stretch, ~50 s into the part.

## Error common to the 60+ failing tests

All 71 failures have the same signature in the annotations:

- `path` = the test file, `start_line` = **1**, title = `test\<file>.test.ts`, message = `test failed` (the 62 others are folded into one annotation, `62 more failing tests`, whose list is `runtime/test/<file>.test.ts:1 — test\<file>.test.ts`);
- no assertion message, no `condition jamais remplie`, no stack trace, no line number inside a test.

In the `node --test` reporter, a failure at line 1 with the bare title of the file is the **file itself failing**, not one of its tests: the child process of that file did not run its tests to the end (it crashed, could not start, or exited non-zero). Compare with an ordinary red of this job, where the annotation carries a test title, a real line and an assertion (run 41488425275: `station.test.ts:82 … rien en 60 s`; run 41484649479: `stations.test.ts:257 … condition jamais remplie`, `fail 1`).

So what the 71 have in common is that they failed *before reaching any assertion*, one after the other, in 1 s or less each (the 71 files fit in the ~35 s that follow the last green file). That is the signature of an environment that stopped letting a Node process start or write, not of 71 tests with 71 different reasons.

## Verdict: runner environment, not the repository

Evidence:

1. **Same commit, same code, three other runners green.** Parts 1, 2 and 3 of run 41487915090 passed on `f852b0e`. The files of part 4 are plain `test/**/*.test.ts` files with no shared preload (`windows.ts` passes no `--import`), so a repository defect in a shared fixture would also have to break them in the same part for one file and not another; it broke every file from file 21 on, regardless of what each file does.
2. **The same files passed on the neighbouring commits.** The next run on `main` (48033e3, push) is green, and the part 4 of 41484649479 and 41488425275 played these very files (`tests 1038`, `tests 1057`) with a single, different, unrelated failure each. Nothing in `f852b0e` (a merge of #2100, the pass replaying a red CI) touches any file of the part.
3. **Failure is a step cliff, not a test pattern.** 21 files green, then 71 of 71 red, in alphabetical order, with no green file in between. A defect in the repository would depend on the file; a runner that loses its disk, its temp directory or its process table fails from a moment on, whatever the file.
4. **The cleanup step failed too.** `Post Run actions/checkout@v4` failed in 0 s, in a job whose checkout had succeeded 80 s before, and `Post Run actions/setup-node@v4` was skipped. The post step of `checkout` removes its git configuration and credentials; failing there means the runner's workspace or its git was no longer usable at the end of the job. A test cannot normally cause that on its own, and it is the same moment as the file failures.
5. **No process left behind recorded.** The `processes left` notice of the failed job reads `none`: the part did not leak a stuck double that could have starved the machine (that notice is the one that exposed `vssvc.exe ×1` in the neighbouring runs). A leak from the repository's tests is the other candidate for "everything fails after a point", and it is not there.

What the evidence does not tell: *which* resource went away (disk space, the `TEMP` directory, a handle or process limit, a runner service restart). The text that would say it is in the unreadable job log. The verdict as "runner environment" is the best-supported reading of the records above, not a proven root cause.

## Recommendation

**No repository change. Retry on this signature.**

How to recognise it, from the check alone and without the log (`gh api repos/<repo>/check-runs/<job>/annotations`, then filter on `failure`):

- the `counts` notice shows a total far below the part's usual ~1 050 tests (here 242) with `fail` of several dozen, **and**
- the failures are annotated at `start_line` 1 with the file's own title and the message `test failed` (no assertion text, no test title), **and**
- they run, without a green file in between, to the last file of the alphabetical list, **and**
- the job ends in a few minutes at most, with `Post Run actions/checkout@v4` red, and `processes left` is `none`.

When all four hold, re-run the failed job (`gh run rerun 41487915090 --failed`, or the same for the run in question) instead of reading it test by test. A red that shows an assertion, a test title or a real line number is a different case and is judged as before (see the pass guidance on `runtime-windows`).

Follow-up worth a separate ticket, if the signature comes back: the part runner (`runtime/test/support/windows.ts`) writes, at the end of a part, the processes left but nothing about the disk or the temp directory. Adding, in the final report of a part, the free space of the system drive and a line saying whether `os.tmpdir()` is still writable would turn the next occurrence into a diagnosis by annotation. This changes the workflow tooling, not any test, and is not done here.
