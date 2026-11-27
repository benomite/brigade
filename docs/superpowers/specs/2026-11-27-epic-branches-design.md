# Epic branches: the kitchen cooks small, the product ships whole

Date: 2026-11-27. Decided with the chef in conversation; this document is the design to plan from.

## Why

Today every ticket is a small PR merged into `main`, and every push to `main` publishes: an app release
(`publier-app`, `app-v1.0.458` that day), a station release (`publier-station`), and the box and the chef's Mac
update themselves. The small PRs are what made the kitchen fast (from 3–4 merges an hour to 15 on 27 Nov.), but the
chef named four pains:

1. **Too many releases.** One per ticket is unmanageable, even just to update on his side.
2. **He cannot see what changes in the product.** Tickets are too small: he validates a button's size at the same
   level as a change of the app's layout.
3. **Too much CI and deployment time.** Free here because the repository is public; impossible on a private, paid
   project.
4. **The changelog is unreadable** when the kitchen runs on its own.

Before AI, an epic was one branch merged at the end of its validation. The design keeps the kitchen's small PRs as
the unit of **work**, and makes the epic the unit of **product**: what the chef understands, validates, receives,
and reads in the changelog.

## Goals

- An epic is cooked on its own branch `epic/<n>`; its tickets are small PRs into that branch.
- When an epic's last ticket is merged, the kitchen opens **one** PR `epic/<n>` → `main`. That PR is what is judged,
  optionally validated by the chef, merged, published, and written in the changelog: one release, one line.
- **A lone ticket** (no epic) goes to `main` and is published at once, as today. This is the lane for fixes and
  urgent work, typically `prio:0`. A fix that needs more than one ticket is an epic.
- **Each project chooses** whether a finished epic ships on its own or waits for the chef: on brigade it ships on its
  own; on a client project the chef validates before it goes out.
- **Epics are split at the last moment**, and whole: the manager splits an epic when the rail needs work, into every
  ticket it takes, with `Depends on #N` where order matters. No fixed slice size: the cooking places already set the
  pace.

## Non-goals

- A view of epics in the app (grouping the board by epic, an epic card). Worth doing next; not in this design.
- Dependencies between epics.
- Rewriting the release pipelines: publication stays "on push to `main`". `main` simply receives fewer pushes.

## Anti-goals (a failure even if it works)

- **Feature flags** or any code that hides unfinished work inside `main`. It adds code everywhere and goes against
  simplification.
- **Long-lived epics.** At the kitchen's speed an epic lives hours to a day; a design that needs weeks-long branches
  has failed.
- **Losing the small PRs** inside an epic, or their speed.
- **Loosening a safeguard**: the trust filter on authors, the risk zones, the network gates. An epic PR passes every
  check a ticket PR passes.
- **A new role.** The manager, the pass and the kitchen do it.

## Constraints

- `runtime/src/kitchen/` stays under 1,000 lines (987 on 27 Nov., tested by `runtime/test/kitchen/kitchen.test.ts`).
  Epic logic lives beside it, as `runtime/src/epics.ts` does today, and the kitchen only calls it.
- The kitchen's policy stays one pure function (`decide.ts`) over GitHub's state: no memory, a restarted kitchen
  decides the same thing.
- Everything is read from GitHub; trusted authors only (`TRUSTED` in `kitchen/github.ts`).
- The REST quota is shared by the kitchen, the app and the stations (#4627): prefer the GraphQL read the kitchen
  already makes each turn.
- Simplification first: the design removes what it makes useless (below).

## Approaches considered

- **A. One branch per epic** — chosen by the chef. The only one where the epic exists as a whole: one readable diff,
  one validation, one release, one changelog line. Cost: two epics touching the same files conflict at the end; a
  cook resolves it, as conflicts are resolved today. The kitchen needs a base per ticket.
- **B. `main` integrates, publication waits for the epic's end.** Fewest kitchen changes, but `main` holds half-done
  epics: an urgent fix published mid-way ships them, and the chef validates a mixed state of `main`, not the epic.
  Pain 2 only half solved. Rejected.
- **C. A for validated projects, B for the others.** Two circuits to maintain. Rejected.
- **Feature flags in `main`.** Rejected (anti-goal).

## The design

### Vocabulary on GitHub

- **Epic**: an issue labelled `epic`, by a trusted author. Its body says why, what, and **Done when**.
- **Child**: a ticket whose body has `Epic: #<n>` (already parsed into `Issue.epic`).
- **Lone ticket**: a ticket with no `Epic:` line.
- **Epic branch**: `epic/<n>`, created from `main` when the epic is split.

### Splitting at the last moment

- `decide.ts`: when no uncalibrated ticket is left and the rail is short (the condition that calls the manager
  today), the manager is called on the top open epic (by priority, then age) that has **no child yet**. Epics stop
  being invisible to the manager.
- `agents/kitchen/manager.md`: for an epic, the manager splits it **whole**: every ticket it takes to reach Done
  when, `Depends on #N` where order matters. A choice only the chef can make is a `park` with the question, as today.
- On a split, the kitchen opens each child as it does since #4672 (`fire`, the epic's `prio:N`, `Epic: #<n>`), and
  creates `epic/<n>` from `main`.

### Cooking an epic's children

- A child's base is `epic/<n>`; a lone ticket's base is `main`. The kitchen uses the ticket's base everywhere it uses
  `base` today: the worktree (`origin/<base>`), the merge of the base into the worktree, the "ahead" count, the PR's
  base, the cook's and the pass's prompts.
- The pass judges and merges a child PR into `epic/<n>` as it does a ticket PR into `main`, **except risk zones**: a
  child PR does not wait for the chef for a risk zone (chef's decision, below). Nothing runs in production from an
  epic branch; the door that matters is `main`.
- **A merged child is closed by the kitchen** (GitHub closes an issue only for a merge into the default branch), with
  the comment `Merged into epic/<n>: ships with #<n>.` Siblings' `Depends on #N`, the "no open child" test and the
  worktree sweep then work unchanged. The epic stays open until its PR reaches `main`. (Second's call.)
- `tests.yml` also runs on PRs into `epic/**`, with the same planned, touched-tests-only CI (#4607).

### Finishing an epic

- When an epic has children and none is open, and `epic/<n>` is ahead of `main`, the kitchen merges `main` into
  `epic/<n>` (in a worktree; pushed if clean) and opens **the epic PR** `epic/<n>` → `main`, `Closes #<n>`. Its body:
  the epic's title and Done when, and the list of its children with their titles and PRs. The epic is labelled
  `in-pass`.
- A conflicting epic PR goes back to a cook as any conflicting delivery does, with the epic as its ticket and
  `epic/<n>` as its branch.
- **The pass judges the epic PR against the epic's Done when**, on the whole diff. Its verdict also writes **what
  changes for the user**, in a few lines: the kitchen posts it on the PR, and it is the summary the chef reads.
- A refused epic PR (Done when not met): the pass's reason goes to the manager, which splits the missing work as new
  children of the same epic. The epic PR is reopened when they are merged.
- **Risk zones are judged once, at the epic PR** (chef's decision): if the epic's whole diff touches a risk zone of
  `.brigade/kitchen.json`, the approved epic PR waits for the chef's `merge`, whatever the release setting. This also
  covers what a cook changes while resolving the final conflict, which no per-child approval would have seen. Lone
  tickets are judged as today.
- When the epic PR is approved:
  - **`"release": "auto"`** in `.brigade/kitchen.json` (the default): the kitchen merges it. `main` gets one push,
    published once.
  - **`"release": "chef"`**: the epic gets `parked:chef` + `approved` with the summary as its TODO card; the chef's
    `merge` answer merges it. This is the existing risk-zone path (`chefSays`, #4489), reused.
- `.brigade/kitchen.json` is already a risk zone: only the chef changes a project's release setting.

### Lone tickets: the fast lane

Unchanged: base `main`, judged, merged, published at once. When `main` moves, the open epic branches get it when
their epic PR is opened (above). A fix an epic needs earlier is merged into its branch by the cook that needs it, as
`main` is merged into any worktree today.

### Changelog (chef's decision)

The hand-written lines go: cooks no longer add lines to `CHANGELOG.md` (cook and pass prompts, and any gate or test
that asks for them). The changelog becomes the release notes GitHub generates from the PRs merged into `main`
(`publier-app`): an epic's release notes are its PR's "What changes for the user" section, a lone ticket's are its
PR title. `CHANGELOG.md` keeps its history and says where the
changelog now lives.

### Version 1.1.0 (chef's decision)

This change, with the simplification of 27 Nov. (the old runtime, the plugin V1, the docs and captures removed),
ships as **app 1.1.0**: once the epic of this design is merged, its release is `app-v1.1.0`, through the existing
minor-bump path (a hand-made `app-v1.1.0` tag is the base of the next release; `app/packaging/README.md`). This
design cannot cook itself on epic branches (they do not exist yet): its tickets reach `main` one by one, and the
second places the `app-v1.1.0` base once its last ticket is merged.

### Version numbers say what shipped (chef's decision)

From 1.1.0 on, the release of an epic PR raises the **minor** version (1.2.0, 1.3.0…), and the release of a lone
ticket raises the **patch** (1.1.1, 1.1.2…). `publier-app` (and `publier-station` for its own numbers) reads which
kind of PR the push to `main` merged: a head branch `epic/<n>` is an epic, anything else a lone ticket. The numbers
then tell what is new and what is a fix. The station keeps its date-based numbers (`station-0.<date>.<time>`).

### What this removes

- `closeFinishedEpics` (`runtime/src/epics.ts`) for new epics: an epic with a branch closes when its PR is merged
  (`Closes #<n>`). It keeps closing the epics split before this design (no `epic/<n>` branch) until none is open, then
  it goes.
- The hand-written `CHANGELOG.md` lines, in every PR.
- The per-child risk-zone cards inside an epic.
- The supervisor's "an epic with no child: split it yourself" rule (`agents/kitchen/supervisor.md`, #4685): the
  manager sees epics.
- One release, one main CI run and one changelog line per ticket of an epic.

## Left to the builder

- Where exactly the epic logic lives beside `runtime/src/kitchen/` and how `decide.ts` returns it (new action kinds).
- How the kitchen remembers which epics are split (the existing `Split by the manager into …` comment, or the branch's
  existence).
- The exact text added to the manager's and the pass's prompts.
- The migration of open epics on the day this ships (split as before: they may finish on `main`).
- How `readState` maps `epic/<n>` PRs to their epic (`issueOfBranch` knows only `cook/<n>-github` today), the split
  gesture's cap of 10 tickets against "split whole", and how tries and send-backs apply to a refused epic PR.

## Done when

- An epic split by the manager is cooked on `epic/<n>`, its children merged there, and reaches `main` as one PR, one
  push, one release, one changelog entry.
- A lone ticket still reaches `main` and is published at once.
- `"release": "chef"` holds a finished epic until the chef answers `merge`; an epic touching a risk zone waits for
  it under either setting, and its children do not.
- The release notes of a release are generated from its merged PRs; no PR writes `CHANGELOG.md`.
- The release that ships this design is `app-v1.1.0`.
- The kitchen stays under 1,000 lines; the removals above are done.
