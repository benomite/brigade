# The supervisor

One supervisor per project replaces the detectors that watched whether the kitchen moved (#3914, epic #3909, spec
[`2026-11-20-kitchen-spinning.md`](../superpowers/specs/2026-11-20-kitchen-spinning.md), section B). The held kitchen,
the stuck rail, the idle-kitchen ticket, the emergency, the rail alerts, the loop tickets and the automatic repair-main
tickets are gone: they overlapped, filed tickets about the rail on the rail itself, and asked the chef for technical
gestures. The code is in `runtime/src/superviseur/`.

## The trigger

The supervisor looks at what the GitHub-only turn already reads (`observation.ts`, no extra GitHub call) and starts a
run on a project when one of these holds (`declenchement.ts`):

- nothing has been merged for **30 min** while a ticket is cookable — counted from the last merge seen, or from the
  opening when none was seen;
- a ticket has been **taken 3 times** without delivering — the claim marks on its comments;
- `main` has been **red for 10 min** — a red check that is not an informative Windows test job.

**Only one run per project at a time** (`un-seul.ts`): a trigger during a run starts nothing. The same trigger does not
start again before 30 min. A kitchen the chef stopped or switched off is not supervised.

## The actor

The project's manager receives a dossier (`dossier.ts`), read-only in a worktree of the base, under the manager's
calibration:

- the queue, each skipped ticket with the claim gate's reason;
- the tail of the journal (its last 50 facts);
- the failing CI step of the first red check of `main` and the useful end of its job log (`journal-du-job.ts`, the
  lines `gh run view --log-failed` shows);
- the history of the ticket at fault (its comments).

A reading that fails is said in the dossier, under « What could not be read »; it never stops the run. The manager
answers with what it saw and the gestures it chooses (`manager.ts`). An unreadable answer plays no gesture in its place.

## The six gestures

The only ones allowed (`gestes.ts`); any other action is refused and touches nothing:

1. rerun the failed jobs of `main`;
2. put a ticket back on the rail, with a note for the next cook;
3. set a ticket aside in WAITING, for a named third party;
4. close a duplicate (or a stale alert);
5. file **one** `fix` ticket for a new cause — `ci:<check>` or `code:<identity>` — when no open ticket of the last month
   carries that cause; never a ticket about a ticket;
6. post a TODO card, only for a **product** or **design** question.

**On a red `main`**, the run reruns the failed jobs first and waits for their new attempt (40 min at most). A fix ticket
for a CI cause is filed only if the rerun stays red, and at most one per red check. A red `main` holds the merge of
any delivery that runs the same check, except the supervisor's fix ticket for that check (`reparationDeLaBase`,
`brigade-github.ts`).

**Never a technical gesture asked of the chef**: no TODO card for a rerun, a merge, a rebase or a log reading.

## The trace

Each run writes **one comment** on the ticket it acted on — the first one a gesture acted on, else the ticket at fault —
with what it saw and what it did (`tour.ts`, marked `<!-- brigade:superviseur -->`). A run that acted on no ticket
writes no comment. Every run is said on the service journal: `supervisor on <project>: <what triggered it> — <what it
did>`.

## What stays from the old detectors

- The queue still says why it does not move: the line of `expliquerLAttente` (`attente-du-rail/raison.ts`), in `status`
  and in the app's rail. The stations of the account it reads moved to `attente-du-rail/stations.ts`, the reading of the
  `fire` issues to `attente-du-rail/lecture.ts`.
- The healing still relaunches a set-aside ticket for a reason a cook can fix, twice at most for the same reason; it no
  longer files a loop ticket (`guerison/relance.ts`).
- The quality figure still knows the repairs of main filed before the supervisor, by their `prio:0` and their
  `brigade:base-rouge` mark (`qualite-github.ts`).
