### The `merge` grant

Automatic merge exists only **under a grant**. It is a runtime object — facts in the
log — : you enable it, extend it and revoke it **without restarting**, and the pass rereads it
**at every merge decision**.

```bash
npm --prefix runtime run grant                               # its state, what is left of it, its `latest actions` and `latest uses`, the "without a grant, …" summary
npm --prefix runtime run grant -- enable merge            # no expiry
npm --prefix runtime run grant -- enable merge --for 4h   # it lapses on its own in four hours
npm --prefix runtime run grant -- enable merge --until 18h30 --uses 10
npm --prefix runtime run grant -- extend merge --for 2h   # a running grant, without revoking it
npm --prefix runtime run grant -- revoke merge
```

- **Absent by default**, and **not retroactive**: enabling it applies to the following deliveries;
  the ones the pass has already stopped, you merge by hand.
- **Every use is logged** (`grant.used`: ticket, PR, commit, verdict): it is the answer to
  "why is this code on `v2`?" — `grant` lists the uses, `pass -- <ticket>` the verdict.
- **The merge is written in two steps**: the intent (`grant.used`) before the call to GitHub, the
  result after (`merge.done`, `merge.failed`). A runtime that dies between the two rereads the PR
  at restart. GitHub accepts the merge only if the branch is still on the judged commit; a
  merge it **refuses** is not retried (`merge-refused`).

- **Everything `grant`, `base` and `pass` write is in English** (words from `docs/glossary.md`):
  `grant merge  ACTIVE since … (by chef)`, `latest uses`, `base never checked: …`, `nothing to
  replay: the base is not red`. The old words (`activer`, `prolonger`, `revoquer`, `--pour`,
  `--jusqu-a`, `--usages`, `--sans-echeance`) still answer until 2027-01-14, while stating the new one;
  a grant, a refusal or a log written before are shown and applied as they are.

- **What no grant allows** is read in `run grant`, line `never granted`: `identifiants-max`
  (reading the Max account credentials) and `acces-prod` (any action on a project's production).
  Asking for it — `enable acces-prod` — is **refused, you included**: the command names the line, exits
  with 1 and writes your request to the log (`grant.refused`, reread in `latest actions`). The list is
  in `runtime/src/grant.ts` and changes only through a delivery, which is read in a diff.

⚠️ **With an active grant, code written by a cook lands on the integration branch without any
human having read it**: its judges are the project's gates and CI, and a reviewer that is a model.

#### A due date, and it lapses on its own

| You type | What it means |
|---|---|
| *(nothing)* | **No expiry**: it holds until you revoke it |
| `--for 30min` · `4h` · `1h30` · `2d` | A duration, counted from now. **The recommended form**: a duration has no time zone, it cannot be misread |
| `--until 18h` · `18h30` | Today at that time, **in box time, in UTC — not yours**. The command answers `understood: until Oct 12 19:20 UTC — in 4 h 00` **before** writing: if the duration is not the one you thought, `revoke` or `extend` in one word. A time already past is **refused**, not carried over to tomorrow |
| `--until 2026-10-12T18:00` · `2026-10-12` | That day at that time; without a time, until the **end** of the day (23:59:59) |
| `--uses 10` | For ten merges |

`--for` or `--until`, one or the other. **Wherever a due date is shown** (`grant`, `status`,
the app's state column), the remaining duration comes first and the instant follows, **time zone in
letters**: `58 min left (until Oct 12 19:20 UTC)`. The box does not know your time zone and
need not know it; the log stays in UTC. `--uses` is given alone or with a date — **the first
reached turns the grant off**. A due date that cannot be read is refused; nothing is written.

- **It lapses on its own**: a grant whose time has passed no longer holds for whoever reads it, noticed or
  not. The lapse is a fact of its own (`grant.expired`), dated at the **due date**: `grant` reads
  `LAPSED since …`, where your action reads `REVOKED`. Expired while the runtime is stopped, it is turned off
  at restart, before any decision.
- **At N uses, it counts down on the merge done, not on the attempt.** A refused merge, or a
  stopped delivery that you merge by hand, consumes nothing. An intent without a result
  **holds** a use until GitHub says what became of it: merged, it is **consumed**; otherwise
  **returned**.
- **A green delivery that arrives after the lapse is stopped** (`no-grant`), and its issue like its
  line in the queue say "the `merge` grant lapsed on its own on …".

#### Extending it, without revoking it

`extend merge` takes `--for`, `--until`, `--uses <n>` (n **more** than what is left) or
`--no-expiry` (lifts the due date): **one more fact** (`grant.extended`). **Extending does not
shorten**: a closer date, or a limit set on a grant that had none, is
refused — revoke then enable again. A lapsed or revoked grant is not extended, it is
**re-enabled** with `enable`; `enable` on an active grant writes nothing and points to `extend`.

### Seeing the pass

```bash
npm --prefix runtime run pass              # the deliveries: phase, reason, returns consumed, PR — the base's state first when it matters, the summary of stops without a grant last
npm --prefix runtime run pass -- 17        # the history of ticket 17: each verdict and what produced it
npm --prefix runtime run pass -- 17 --json  # the same history for the app, with the ticket's cost: a JSON object {ticket, steps, cost}
```

```
BASE RED since 2026-10-09T09:20:52.000Z (5d2e7b1) — after the merge of #17: nothing is judged or merged, deliveries wait
#18  STOPPED — green, not merged (no-grant)  returns 0/2  since 2026-10-08T14:20:03.000Z  https://github.com/benomite/brigade/pull/53
#20  ESCALATED TO THE CHEF (unjudged : ci-silent)  returns 0/2  since 2026-10-08T14:40:11.000Z  https://github.com/benomite/brigade/pull/55
```

`run pass -- <ticket>` unrolls each fact: review, verdict (`verdict no. 412: GREEN — gates
green (code 0) · CI no check · reviewer nothing blocking`, then `judged: 77c01de merged with
the base 4be1f07`), return, grant use, merge and the GitHub identity that did it. Both
commands never write, and answer while the runtime is running.

| Event | Meaning |
|---|---|
| `grant.activated`, `grant.revoked` | The chef's commands (outside any ticket). `until`, `uses`: the due date, if there is one |
| `grant.refused` | The chef asked for what no grant allows: `action`, and `line`, the line that forbids it. Nothing is granted |
| `grant.extended`, `grant.expired` | The chef extends (`until`, `uses` that **add up**; null, the limit is lifted); the grant lapsed on its own (`cause`: `until` or `uses`; `since`: the due date) |
| `pass.entered` | A delivery **off the rail** enters the pass — the PR of a closing pass (`run`, `branch`, `pr`, `number`). Its `ticket`, and that of all the facts of its pass, is the number of that PR |
| `pass.started`, `pass.pr-opened` | The pass takes a delivery (run, PR, judged commit); it opened the PR the station had not been able to open (`reconciled`: found afterwards) |
| `pass.reviewed` | The reviewer reviewed the `run`'s delivery, on this `sha`: `review`, `outcome` (`green`, `red`, `unreadable` + `reason`), `summary`, `findings`, `truncated`. If unreadable, it is followed by another on the same `sha`, twice at most |
| `pass.judged` | The verdict, with `sha`, `base`, `merged` (null: the merge cannot be done), `gates`, `ci`, `review`, `findings`, `judgeModified`, `declarations`, `noDiff` |
| `pass.served`, `grant.used` | Green and without a diff, served without a merge; the intent to merge, grant use — each with the number of the verdict that authorizes it |
| `merge.done` | Merged. `by`: `pass` or `outside`; `actor`: the GitHub account; `reconciled`: noticed after a restart; `unverified`: done outside the runtime, the base is to be checked |
| `merge.failed` | The merge did not go through: `interrupted`, or GitHub's refusal |
| `pass.held` | Green, not merged: `reason` (`no-grant`, `review-required`, `merge-refused`), `cause`, `expired` |
| `pass.second-judged` | Stopped because it touches its judges, the `run`'s delivery, on this `sha`, was judged by the second judge — once: `verdict` (`not-weakened`, `weakened`, `cannot-establish`), `reason`; `judge`, `model`, `effort` — its run and its calibration, null if it was not launched; `reviewer` and `review` — the reviewer's calibration and the run of its review. `not-weakened`: it goes back toward the merge, like an ordinary green delivery; otherwise, a `gesture` card (`todo.entered`, author `pass`) is written with the verdict |
| `pass.waiting` | Neither judged nor merged for now: `base-red`, `machine-saturated`, `gates-cut-saturated` (with the `sha` whose gates were cut). It resumes on its own |
| `pass.returned`, `pass.deferred`, `pass.outdated` | Red: return `n` of 2, with the findings; the hand goes to the manager; GitHub required an up-to-date branch and refused the merge, `findings` go back to the cook |
| `pass.escalated` | Escalated to the chef: `reason` (`still-red`, `unjudged`, `manager-split`), `cause` |
| `pass.pr-closed` | The PR was closed without a merge: the pass no longer judges, returns or merges this delivery. Written once |
| `pass.abandoned` | The ticket left the rail without its delivery being merged: `branch`, `pr` (still open, or null), `merged`, `closed`. A merge intent in flight finds its end there |
| `base.checked` | Outside any ticket. The gates played on the base alone: `sha`, `outcome` (`green`, `red`, `skipped`), `gates`, `tickets`; on a `skipped`, `red` (the red that remains) and `reason` (the attempt was not made) |
| `base.recheck-requested`, `base.recheck-held` | A replay is requested — by the chef (`run base -- replay`), or by the pass, once per red (author `pass`); the saturated machine holds it (`resource`, `observed`, `limit`) |
| `base.repair-opening`, `base.repair-opened` | The red held after its replay: the creation of the repair ticket is announced (`sha`), then the ticket is born, under its number (`sha`, `failures`, `reconciled`: found on GitHub rather than created) |
| `base.check-held`, `base.check-resumed` | The base cannot be brought in (`reason`, once per cause); it can be brought in again |

`pass.rehearsed`, `pass.base-moved` and `pass.replayed` are no longer written: a log that
carries them is still read.

### What is left after a cook

Each cook has its worktree (`worktrees/<run>`, under the project's state — or, on the chef's computer,
`~/.local/share/brigade/station/worktrees/<project>/<run>`) and its local branch (`cook/<run>`) in the
station's clone. The log names it `worktrees/<run>` in both cases. You have nothing to do.

| What is left | When it goes |
|---|---|
| **the cook's worktree**, with what the project ignores | at the end of the cook, however it ends; or at the next start, if the runtime was killed |
| **the local branch** `cook/<run>` | once the ticket is **served** or **off the rail**, if all its commits are on origin. Otherwise it stays, quietly |
| **the remote branch** | never by the runtime (GitHub setting *Automatically delete head branches*) |

**What lingers is committed first**, in the name of `brigade`: modified tracked files, new
files the project does not ignore. For a delivery, this commit goes with it (see "The cook does not
deliver, the station harvests"); otherwise it stays on the local branch, **never pushed**.
Finding a failed cook's work — the branch name is in the issue's comment:
`git -C <clone> log --stat <base>..cook/<run>`.

**What cannot be tidied is said, and nothing in it is touched** (`worktree.kept`; `journalctl`,
`status`): a worktree that is no longer on its branch, that is no longer a worktree, a `git` that
fails. The runtime retries at each tick. To clear it, read `detail`: `git switch cook/<run>`
or `git rebase --abort` in the worktree; otherwise `git -C <clone> worktree remove --force
<worktree>`. As long as it lasts, a return on its branch waits ten minutes (`worktree-failed`).

In the log: `worktree.removed` (`worktree`, `branch`, `harvest` — the commit of what lingered there,
or `null`), `worktree.kept` (`reason`, `detail`; written once), `branch.removed`.

**Prune nothing in the station's clone** (`git fetch --prune`): "absent from origin" is read there
without the network, and a branch merged by *squash* would be wrongly kept. Only the worktrees that
the log tells about are touched.

### What the pass does not guarantee

- **"Only the pass merges" is closed by one GitHub identity per role, and only where you have
  set it up** (the three Apps and the branch rule from "One GitHub identity per role"). What
  remains unguaranteed:
  - **The cook runs under the runtime's Unix account.** Without a partition, it reads what that account reads:
    the Apps' keys, a `gh auth login` or an SSH key left on the machine. **The partition closes it**
    for what it hides (`/etc/brigade`); `~/.config/gh`, `~/.ssh` are closed only if you
    add them to `BRIGADE_SANDBOX_HIDDEN` (see "The partition"). Without it, the project's secrets
    are partitioned only by file permissions (see "The project's secrets").
  - **The runtime holds the three keys**: a flaw in the runtime is worth all three roles.
  - **The branch rule is a repository setting**, which the runtime does not check. Without it,
    the cook identity (`contents: write`) can push to the integration branch.
  - **The repository's humans keep their rights**: a merge by hand reads `outside`, and the
    base is checked afterwards.
  - **A ticket that touches `.github/workflows/` is not delivered** under the cook identity, which has
    no `workflows` right: the cook fails (`push-failed`), the work stays on its
    local branch, to be pushed by hand.
  - **Under the single identity** — without `BRIGADE_GITHUB_APPS_DIR` — none of this is closed:
    cook and pass go through the same `gh`, and what holds a cook back is the list of tools
    forbidden at launch, **in good faith**. The runtime says so at every start. A branch
    protection can still forbid any direct push there (`installer.md`, "Protecting the
    integration branch").
- **The gates played are those of the merge — hence the cook's, if it touched them —**, with the
  runtime's rights. Hence the `review-required` rule.
- **What is judged is the merge with the base of the moment**, but: a merge made **by hand**
  can slip in between the last look at the base and the call to GitHub (it triggers a
  check of the base); **a broken base is seen red only when something makes it be judged**
  — a direct push is not enough — and it stays so until you have repaired it or had it replayed;
  a stopped delivery is not rejudged when the base moves; **CI and the reviewer judge the
  branch's commit, not the merge**. For CI, the pass draws only one consequence: a
  red on a branch that does not have the base's head is not a verdict (see "CI says").
  "Without the base's head" is read in the clone — does the fetched base have commits that the
  delivered commit does not? —, not at GitHub: a `pull_request` workflow, which judges a
  *merge ref* that the clone does not have, is held to be stale by the same test, even if it ran after the last
  move of the base. **Two non-actions, intended**: the pass never asks GitHub to
  replay a CI, and **the reviewer is not reread when only the base moved** — its object is the
  cook's work, which has not changed.
- **The reviewer is a model, of the same engine as the cook**: it may share its blind spot, and
  be convinced by what it reads. **"Without write access" rests on its tool
  list**, not on a system fence. It has no GitHub identity: the pass publishes its
  review.
- **A ticket taken off the rail closes nothing behind it**, and its departure is seen only at the poll.
- **A new file that the project does not ignore goes into the PR**, if the cook left it in a
  delivery. The reviewer is warned; the only guard is the project's `.gitignore`.
