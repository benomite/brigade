### The merge

A delivery is merged once its verdict is approved and the CI of its head is green
(`runtime/src/github-etat/fusion.ts`). Nothing else is asked of the chef: there is nothing to enable.

- **Approved**: the latest verdict comment on the PR approves it, whichever station rendered it.
- **Green CI**: a check of the head that is red stops the merge, a CI not finished waits. A project whose
  PRs carry no CI has its gates played on the head instead.
- **A branch behind its base** is updated by GitHub, not merged; the merge comes once it is up to date.
- **A merge GitHub refuses** is not retried until the PR or the base changes.

⚠️ **Code written by a cook lands on the integration branch without any human having read it**: its
judges are the gates, the project's CI, and a reviewer that is a model. The brakes are the stop
(`hors-cuisine` sets a ticket aside, [`station.md`](station.md)) and the second judge, which reads a
delivery that changes what judges it before it merges ([`pass.md`](pass.md), "The second judge").

### Deliveries judged in parallel

The pass takes deliveries in delivery order and judges **several at once when their zones do not
overlap** — the `zone` line of each card (`runtime/src/file-de-la-pass.ts`). A path overlaps another
if equal or if one is a folder containing the other; the project's common paths count for no one. The
cap is `BRIGADE_MAX_JUDGEMENTS` (3 by default; [`garde-fous.md`](garde-fous.md)). A delivery holds its
place from the moment the pass takes it to the end of its merge.

| The delivery | What it waits for |
|---|---|
| its zone overlaps that of a delivery in its pass, or ahead of it in line | that one: `waiting for #17: their zones overlap on runtime/src/rail` |
| **no zone** (no or unreadable card, off the rail) or **it wrote outside its zone** (`cook.out-of-zone`) | it is **judged alone**: it starts once no other is in its pass, nothing starts while it is; nothing overtakes it while it waits |
| the cap is reached | a free slot: `waiting for a free slot: 3 judgements at once at most` |

A waiting delivery keeps its place. One whose judgement cannot start (GitHub failing, a PR that does
not open) goes behind the others. With `BRIGADE_MAX_JUDGEMENTS=1`, one at a time, in delivery order.
`pass` names, for a waiting delivery, those in their pass, its place, and what holds it.

#### The safety net behind parallel merges

Merges go one at a time, and a delivery judged on a base that moved since is **judged again** on the
new base before merging ("Green means green once merged", [`pass.md`](pass.md)). After every merge, CI
replays the base. **A red base stops the kitchen** until it is green again or the chef has had it
replayed and repaired; the log of the red names the parallel merges that preceded it.

#### Relaunching a stuck delivery

A delivery is **stuck** when it is in pass, delivered, never judged since, and **nothing in its pass
holds it back**. The running pass takes such a delivery within the second; one that stays has been
forgotten. `status` flags it after **15 minutes** (`COINCEE_APRES_MS`, `file-de-la-pass.ts`): see the
`stuck` block in [`etat-et-mesures.md`](etat-et-mesures.md).

`brigade <project> pass <n> --relaunch` writes `pass.relaunched` (author `chef`, `run`), which wakes
the running pass at once: it takes the delivery **through its queue**, and its history shows
`judging … (run …)` (`pass.started`). It says a judgement is queued, plus `— no runtime is running: it
is judged at its next start` when none runs. No phase changes. It refuses, exits 1, says why and
writes nothing for a delivery that is not stuck:

| The card | The refusal |
|---|---|
| being judged, or merge in flight | `#17 already has an active pass: it is being judged since … — nothing to relaunch` |
| waiting behind others | `#18 is waiting for its turn — #17 is in its pass, next in line: it is not stuck, the pass judges it after` |
| queued for a reason (`base-red`, `machine-saturated`, …) | `#18 is queued (base-red): it is not stuck, the pass takes it up on its own once that is lifted` |
| judged, merged or served | `#17 is already judged green: there is no judgement to relaunch` — or `already merged`, `already served`, `already judged red, and returned to a cook` |
| being cooked, never delivered, off the rail | `#17 is being cooked: there is no delivery to judge yet`, `…never been through the pass…`, `…left the rail…` |

The events not documented in [`pass.md`](pass.md) (which owns `pass.started`, `pass.reviewed`,
`pass.ci-*`, `pass.test-fix-opening`, `pass.held`, `pass.escalated`, `pass.second-judged`,
`pass.pr-closed`, `pass.abandoned`):

| Event | Meaning |
|---|---|
| `pass.entered` | A delivery **off the rail** enters the pass (`run`, `branch`, `pr`, `number`); its `ticket`, and that of every fact of its pass, is the PR number |
| `pass.relaunched` | The chef relaunched a stuck delivery: `run`. Changes no phase |
| `pass.pr-opened` | The pass opened the PR the station could not (`reconciled`: found again afterwards) |
| `pass.judged` | The verdict: `sha`, `base`, `merged` (null: the merge does not go through), `gates`, `ci`, `review`, `findings`, `judgeModified`, `declarations`, `noDiff` |
| `pass.served` | Green with no diff, served without a merge, with the number of the authorizing verdict |
| `merge.done` | Merged. `by`: `pass` or `outside`; `actor`: GitHub account; `reconciled`: noted after a restart; `unverified`: done outside, base to be checked |
| `merge.failed` | Did not go through: `interrupted`, or GitHub's refusal |
| `pass.waiting` | Neither judged nor merged for now: `base-red`, `machine-saturated`, `gates-cut-saturated` (with `sha`). Goes on by itself |
| `pass.returned`, `pass.deferred`, `pass.outdated` | Red: return `n` of 2, with findings; the hand passes to the manager; GitHub required an up-to-date branch and refused the merge, `findings` goes back to the cook |
| `base.checked` | No ticket. Gates on the base alone: `sha`, `outcome` (`green`, `red`, `skipped`), `gates`, `tickets`; on `skipped`, `red` and `reason` |
| `base.recheck-requested`, `base.recheck-held` | A replay requested by the chef (`run base -- replay`) or the pass (once per red, author `pass`); a saturated machine holds it (`resource`, `observed`, `limit`) |
| `base.repair-opening`, `base.repair-opened` | The red held after replay: the repair ticket is announced (`sha`), then born (`sha`, `failures`, `reconciled`) |
| `base.check-held`, `base.check-resumed` | The base cannot be fetched (`reason`, once per cause); it can again |

### What is left after a cook

Each cook has its worktree (`worktrees/<run>` under the project's state, or on the chef's computer
`~/.local/share/brigade/station/worktrees/<project>/<run>`) and its local branch (`cook/<run>`) in the
station's clone.

| What is left | When it goes |
|---|---|
| **the worktree**, with what the project ignores | at the end of the cook, however it ends; or at next start if the runtime was killed |
| **the local branch** `cook/<run>` | once the ticket is **served** or **off the rail**, if all its commits are on the origin; otherwise it stays, quietly |
| **the remote branch** | never by the runtime (GitHub *Automatically delete head branches*) |

**What lies around is committed first**, in the name of `brigade` (modified tracked files, new files
the project does not ignore). For a delivery that commit goes with it ("The cook does not deliver, the
station harvests"); otherwise it stays on the local branch, **never pushed**. A failed cook's work:
`git -C <clone> log --stat <base>..cook/<run>`.

**A worktree whose cook rewrote its `.git` file** (or the `commondir` it names) no longer points to
its repository: the runtime runs no `git` in it. It is **abandoned**: nothing committed, directory
removed, the local branch untouched. **What leaves with it is said**: every path that differs from
the branch, in `journalctl` and the log (`worktree.removed`, `abandoned`).

**What cannot be tidied is said, and nothing in it is touched** (`worktree.kept`; `journalctl`,
`status`): a worktree no longer on its branch or no longer a worktree, a failing `git`. Retried at
every tick. To lift it, read `detail`: `git switch cook/<run>` or `git rebase --abort` in the
worktree; otherwise `git -C <clone> worktree remove --force <worktree>`. Meanwhile a return onto its
branch waits ten minutes (`worktree-failed`).

In the log: `worktree.removed` (`worktree`, `branch`, `harvest` — the commit or `null`; if abandoned,
`abandoned`: `detail`, `against`, `dropped` — first hundred paths prefixed `M`, `D`, `T`, `?`, a new
directory ending in `/` — and `total`), `worktree.kept` (`reason`, `detail`; once), `branch.removed`.

**Prune nothing in the station's clone** (`git fetch --prune`): "absent from the origin" is read there
without network, and a branch merged by *squash* would be kept wrongly.

### What the pass does not guarantee

- **"Only the pass merges" is closed by one GitHub identity per role, only where you set it up** (the
  three Apps and the branch rule of "One GitHub identity per role"). Unguaranteed:
  - **The cook runs under the runtime's Unix account**: without the partition it reads what that
    account reads (the Apps' keys, `gh auth login`, an SSH key). **The partition closes** what it
    hides (`/etc/brigade`); `~/.config/gh`, `~/.ssh` only if added to `BRIGADE_SANDBOX_HIDDEN`. Without
    it, secrets rest on file permissions only.
  - **The runtime holds the three keys**: a flaw in it is worth all three roles.
  - **The branch rule is a repository setting** the runtime does not check; without it the cook
    identity (`contents: write`) can push to the integration branch.
  - **The repository's humans keep their rights**: a merge by hand reads `outside`, base checked after.
  - **A ticket touching `.github/workflows/` cannot be delivered** under the cook identity (no
    `workflows` right): `push-failed`, work stays on its local branch, to push by hand.
  - **Under the single identity** (no `BRIGADE_GITHUB_APPS_DIR`) none of this is closed: cook and pass
    share one `gh`, and the cook is held only by the tool list forbidden at launch, **in good faith**.
    The runtime says so at every start.
- **The gates played are those of the merge, so the cook's if it touched them**, with the runtime's
  rights. Hence `review-required`.
- **What is judged is the merge with the base of the moment**, but: a merge **by hand** can slip in
  between the last look at the base and the call to GitHub (it triggers a base check); **a broken base
  is seen red only when something makes it judged** — a direct push is not enough — until repaired or
  replayed; a stopped delivery is not rejudged when the base moves; **the CI and the reviewer judge
  the branch's commit, not the merge**. A red on a branch without the base's head is not a verdict
  (see "The CI says"), read in the clone (does the fetched base have commits the delivered commit
  lacks?), not at GitHub: a `pull_request` workflow judging a *merge ref* the clone lacks is held
  stale by the same test. **Two non-actions, on purpose**: the pass never asks GitHub to replay a CI,
  and **the reviewer is not reread when only the base moved**.
- **The reviewer is a model, of the same engine as the cook**: it may share its blind spot.
  **"Without write access" rests on its tool list**, not a fence in the system. It has no GitHub
  identity: the pass publishes its review.
- **A ticket off the rail closes nothing behind it**, and its departure is seen only at the poll.
- **A new file the project does not ignore goes into the PR** if the cook left it; the only guard is
  `.gitignore`.
