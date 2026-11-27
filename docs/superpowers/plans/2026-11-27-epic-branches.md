# Epic Branches Implementation Plan

> **For agentic workers:** this plan is cooked by the brigade kitchen: each task below is one ticket, delivered by one
> cook as one PR, with `Depends on #N` where order matters. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An epic is cooked on its own branch `epic/<n>` and reaches `main` as one PR, one release, one changelog
entry; a lone ticket still reaches `main` and ships at once.

**Architecture:** The kitchen gets a base per ticket (`epic/<n>` for a child, `main` for a lone ticket). Epic logic
lives in `runtime/src/epics.ts`, beside the kitchen, which only calls it. Publication stays "on push to `main`";
`main` receives fewer, larger pushes.

**Tech Stack:** TypeScript on Node 26 (no build), `gh` and `git` through the kitchen's `Gh`/`Git`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-27-epic-branches-design.md`

## Global Constraints

- `runtime/src/kitchen/` stays under 1,000 lines (`runtime/test/kitchen/kitchen.test.ts`; 987 on 27 Nov.). New logic
  goes in `runtime/src/epics.ts`; `kitchen.ts` and `decide.ts` only call it.
- `decide.ts` stays a pure function of GitHub's state and the running agents.
- Trusted authors only; no safeguard loosened (risk zones are judged at the epic PR, never skipped).
- Branch names: an epic's branch is `epic/<n>`; a ticket's is `cook/<n>-github` (unchanged).
- The child-closing comment is exactly `Merged into epic/<n>: ships with #<n>.`
- Release setting in `.brigade/kitchen.json`: `"release": "auto"` (default) or `"chef"`.
- Every delivery updates `docs/runtime/README.md` where it changes the kitchen's behaviour.

## Review Focus

- An epic split before this ships (a `Split by the manager into` comment, no `epic/<n>` branch) is never split again
  and still closes when its children close (Task 1, Task 3).
- A child PR whose branch conflicts with `epic/<n>` goes back to a cook, as a ticket PR conflicting with `main` does
  (Task 2).
- An epic PR whose branch conflicts with `main`, is red, or is refused never loops: the kitchen opens one child for it
  and does nothing else on that epic while the child is open (Task 4).
- A lone `prio:0` ticket opened while an epic is in flight still goes to `main` and ships at once (Task 2).
- An epic whose whole diff touches a risk zone waits for the chef even with `"release": "auto"` (Task 5).

---

### Task 1: The kitchen reads epics and their branches

**Files:**
- Modify: `runtime/src/kitchen/github.ts` (query, `issueOfBranch`, `readState`), `runtime/src/kitchen/decide.ts` (`Issue`)
- Create: `runtime/src/epics.ts` additions (keep `closeFinishedEpics`)
- Test: `runtime/test/kitchen/github.test.ts`, `runtime/test/epics.test.ts`

**Interfaces:**
- Produces: `Issue.split?: boolean` (an `epic` with a `Split by the manager into` comment);
  `readState(...)` also returns `epicBranches: number[]` (numbers `n` of the `refs/heads/epic/<n>` branches, read in
  the same GraphQL query with `refs(refPrefix: "refs/heads/epic/")`);
  `issueOfBranch("epic/12") === "12"` beside `cook/12-github`;
  `epicBranch(epic: number): string` → `"epic/<n>"` and `baseOf(issue: Issue, base: string): string` → `epicBranch(issue.epic)`
  when `issue.epic` is set, else `base` (both exported from `runtime/src/epics.ts`).

- [ ] **Step 1:** Tests: `baseOf({ ..., epic: 7 }, "main") === "epic/7"`, `baseOf({ ... }, "main") === "main"`;
  `readState` on a fake GraphQL answer with an `epic` issue whose last comments hold `Split by the manager into #8.`
  gives `split: true`, and with refs `epic/7` gives `epicBranches: [7]`; a PR headed `epic/7` maps to issue 7.
- [ ] **Step 2:** Run `node --test test/kitchen/github.test.ts test/epics.test.ts` in `runtime/`: FAIL.
- [ ] **Step 3:** Implement. Read the comments in the GraphQL query only as `comments(last: 5) { nodes { body } }`.
- [ ] **Step 4:** Same command: PASS; `npm --prefix runtime run typecheck` clean.
- [ ] **Step 5:** Commit.

### Task 2: A child is cooked, judged and merged on its epic's branch

**Files:**
- Modify: `runtime/src/kitchen/kitchen.ts` (`prepare`, `onCookEnd`, `onPassEnd`, `merge`, the cook/pass prompts' `base`),
  `runtime/src/epics.ts`, `.github/workflows/tests.yml` and `.github/workflows/identifier-language.yml`
  (`pull_request.branches: [main, "epic/**"]`), `docs/runtime/README.md`
- Test: `runtime/test/kitchen/kitchen.test.ts`

**Interfaces:**
- Consumes: `baseOf`, `epicBranch` (Task 1).
- Produces: `closeMergedChild(act: Pick<Gestures, "close">, issue: Issue): Promise<void>` in `runtime/src/epics.ts`.

- [ ] **Step 1:** Kitchen test (fake `gh`, real git origin with a branch `epic/7`): a ready ticket whose body has
  `Epic: #7` is cooked in a worktree from `origin/epic/7`, its PR's `--base` is `epic/7`, and after the pass's
  `VERDICT: merge` it is merged and closed with `Merged into epic/7: ships with #7.`; the log reads
  `["#1 taken", "#1 delivered", "#1 in review (PR #100)", "#1 merged (PR #100)"]`.
- [ ] **Step 2:** Kitchen test: a child PR touching a risk path is merged with no `parked:chef` (risk zones are judged
  at the epic PR); the same PR for a lone ticket still waits for the chef (existing test unchanged).
- [ ] **Step 3:** Run `node --test test/kitchen/kitchen.test.ts`: the new tests FAIL.
- [ ] **Step 4:** Implement: every use of `base` for a ticket goes through `baseOf(issue, base)`; `merge` calls
  `closeMergedChild` when `issue.epic` is set; `onPassEnd` skips the risk check when `issue.epic` is set.
- [ ] **Step 5:** Same command: PASS, including "the kitchen stays under 1,000 lines".
- [ ] **Step 6:** Commit.

### Task 3: The manager splits an epic whole, at the last moment

Depends on Task 1.

**Files:**
- Modify: `runtime/src/kitchen/decide.ts` (the manager call), `runtime/src/kitchen/agents.ts` (split: cap 10 → 30,
  create the branch), `runtime/src/kitchen/github.ts` (gesture), `agents/kitchen/manager.md`,
  `agents/kitchen/supervisor.md` (drop the "an epic with no child: split it yourself" rule), `docs/runtime/README.md`
- Test: `runtime/test/kitchen/decide.test.ts`, `runtime/test/kitchen/agents.test.ts`

**Interfaces:**
- Consumes: `Issue.split` (Task 1).
- Produces: gesture `createBranch(name: string, from: string): Promise<void>` in `gestures()` (`gh api -X POST
  repos/<repo>/git/refs` from the sha of `from`); `decide` returns `{ kind: "manager", issues: [epic] }` for an epic.

- [ ] **Step 1:** decide test: no uncalibrated ticket, rail short, an open trusted `epic` #9 not `split`, not parked →
  `{ kind: "manager", issues: [9] }`; the same epic with `split: true` → no manager action.
- [ ] **Step 2:** agents test: a manager answer `{"split": 9, "tickets": [...12 tickets]}` opens 12 children
  (cap 30) and calls `createBranch("epic/9", "main")` once.
- [ ] **Step 3:** Run both test files: FAIL.
- [ ] **Step 4:** Implement; manager prompt: "an `epic` is split whole: every ticket it takes to reach its Done when,
  `Depends on #N` where order matters".
- [ ] **Step 5:** Tests PASS; kitchen under 1,000 lines.
- [ ] **Step 6:** Commit.

### Task 4: A finished epic opens its PR; a blocked one gets a child, not a loop

Depends on Task 2 and Task 3.

**Files:**
- Modify: `runtime/src/epics.ts`, `runtime/src/kitchen/decide.ts` (pass loop for epics), `runtime/src/kitchen/kitchen.ts`
  (calls), `runtime/src/kitchen/github.ts` (`openEpicPr`), `docs/runtime/README.md`
- Test: `runtime/test/epics.test.ts`, `runtime/test/kitchen/kitchen.test.ts`

**Interfaces:**
- Consumes: `epicBranches`, `split` (Task 1), `closeMergedChild` (Task 2).
- Produces: `openFinishedEpics(...)` in `runtime/src/epics.ts`: for each open epic with a branch, no open child, no open
  PR from `epic/<n>`, and the branch ahead of `main`: merge `origin/main` into the branch in a worktree; clean → push and
  open the PR (`--head epic/<n>`, title `#<n> — <epic title>`, body `Closes #<n>`, the epic's Done when, the list of its
  children `#c — title`), label the epic `in-pass`; conflict → open a child `Epic #<n>: merge main into epic/<n>`
  (`Epic: #<n>`, `fire`, the epic's `prio:N`, body: merge `origin/main` and resolve). `closeFinishedEpics` only acts on
  epics with no branch.
  In `decide`, an `in-pass` epic with an open child is skipped; a red or conflicting epic PR gives
  `{ kind: "epic-child", epic, reason }`, which the kitchen applies by opening one child with that reason.

- [ ] **Step 1:** epics test: an epic with branch, no open child, ahead → PR opened with the body above and the epic
  labelled `in-pass`; with a conflict → one child opened, no PR; an epic with no branch and every child closed → closed
  by `closeFinishedEpics` as today.
- [ ] **Step 2:** decide test: an `in-pass` epic whose PR is red → `epic-child`; the same with an open child → nothing.
- [ ] **Step 3:** Run: FAIL. **Step 4:** Implement. **Step 5:** PASS; kitchen under 1,000 lines. **Step 6:** Commit.

### Task 5: The pass judges the epic PR; the project chooses who merges it

Depends on Task 4.

**Files:**
- Modify: `agents/kitchen/pass.md`, `runtime/src/kitchen/kitchen.ts` (`onPassEnd`), `runtime/src/kitchen/main.ts`
  (read `release` beside `risk`; risk zone: the chef merges this PR), `runtime/src/epics.ts`, `docs/runtime/README.md`
- Test: `runtime/test/kitchen/kitchen.test.ts`

**Interfaces:**
- Consumes: the epic PR (Task 4).
- Produces: `KitchenOptions.release: () => "auto" | "chef"`; the pass's answer on an epic PR holds a section
  `## What changes for the user`, which the kitchen appends to the epic PR's body.

- [ ] **Step 1:** Kitchen tests: an approved epic PR with `release: "auto"` and no risk path is merged and the epic
  closes; with `release: "chef"` it gets `parked:chef` + `approved` and is merged on the chef's `merge` answer (the
  #4489 path); with `"auto"` and a risk path in its diff it waits for the chef; a refused epic PR (`VERDICT: refuse —
  …`) opens one child carrying the reason, and the epic stays `in-pass`.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement; pass prompt: on an epic PR, judge the whole diff against the
  epic's Done when, and write `## What changes for the user` in a few lines for the chef. **Step 4:** PASS.
  **Step 5:** Commit.

### Task 6: Releases say what shipped: minor for an epic, patch for a lone ticket

Independent of Tasks 1–5.

**Files:**
- Modify: `scripts/app-release/decider.ts` (flag `--minor`), `.github/workflows/publier-app.yml` (detect the merged
  PR's head branch; release notes), `agents/kitchen/cook.md` ("n'écris pas dans `CHANGELOG.md`"), `CHANGELOG.md`
  (a line at the top: the changelog now lives in the releases), `app/packaging/README.md`
- Test: `scripts/app-release/test/decider.test.ts`

**Interfaces:**
- Produces: `decider.ts --minor`: with tags `app-v1.1.4`, `--minor` gives `tag=app-v1.2.0`, no flag gives
  `tag=app-v1.1.5`.

- [ ] **Step 1:** decider tests for both cases above. **Step 2:** Run `node --test scripts/app-release/test/decider.test.ts`: FAIL.
- [ ] **Step 3:** Implement; `publier-app` passes `--minor` when `gh pr list --state merged --search <sha>` gives a head
  branch starting with `epic/`, and writes the release notes from that PR (`## What changes for the user` of an epic
  PR's body, the title of a lone ticket's PR).
- [ ] **Step 4:** PASS. **Step 5:** Commit.

---

After the last ticket is merged, the second places the `app-v1.1.0` base tag (spec, "Version 1.1.0").
