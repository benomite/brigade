# The V2 runtime

The runtime is the process that holds a project's **log**: an append-only series of events, from
which everything else derives, starting with the **rail**, the queue of tickets to serve. It lives
in `runtime/`, runs on Node 26 without a build, and depends on no package at run time.

This doc says what it does, how to drive it and how to acceptance-test it. **Installing brigade**
on a server, for a project, is a separate path, and a single document: [`installer.md`](../installer.md). Decisions and their reasons
are in the specs, [`superpowers/specs/`](../superpowers/specs/); here, only the instruction.

**Open this index first, then only the pages for your part of the runtime.** Each page is 500 lines at most.

## Where to find what

| Page | What it contains |
|---|---|
| [`journal-et-rail.md`](journal-et-rail.md) | What the runtime does today, the log, the ticket rail |
| [`garde-fous.md`](garde-fous.md) | The guardrails: caps, stop and resume |
| [`station.md`](station.md) | The station: declared stations, several cooks, worktree setup, calibration, the ticket card, capabilities |
| [`station-distante.md`](station-distante.md) | A remote station pulls its work, ordinary tickets on the chef's workstation |
| [`station-cook.md`](station-cook.md) | File zones, what a cook loads, the harvest, model refusal, quota, Max connection, viewing the station |
| [`station-machine.md`](station-machine.md) | One station per machine (GitHub presence, pairing), GitHub call budget, adding a project from the app |
| [`station-navigateur.md`](station-navigateur.md) | Viewing an interface delivery in the browser |
| [`manager.md`](manager.md) | The manager and the epic's tickets |
| [`pass.md`](pass.md) | The pass: review, reviewer, decision, green once merged |
| [`pass-merge.md`](pass-merge.md) | The `merge` grant, viewing the pass, what remains after a cook, what the pass does not guarantee |
| [`etat-et-mesures.md`](etat-et-mesures.md) | The kitchen state, the measures report |
| [`carnet-lecons.md`](carnet-lecons.md) | The lessons notebook: its thresholds, promotion and expiry delivered by a PR, removing a lesson |
| [`fermeture.md`](fermeture.md) | The closing that observes, the closing that writes |
| [`identites-et-secrets.md`](identites-et-secrets.md) | One GitHub identity per role, the project's secrets |
| [`cloison-et-arbitre.md`](cloison-et-arbitre.md) | The partition, the arbiter between projects |
| [`exploitation.md`](exploitation.md) | The variables, backing up and restoring, "Driving", the dev workstation, the box |
