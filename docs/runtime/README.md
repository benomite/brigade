# The V2 runtime

The runtime keeps a project's **log**, an append-only series of events from which everything else
derives, starting with the **rail**, the queue of tickets to serve. It lives in `runtime/`, runs on
Node 26 with no build and no run-time dependency.

Installing is separate: [`installer.md`](../installer.md). Decisions and reasons:
[`superpowers/specs/`](../superpowers/specs/).

**Open this index first, then only the pages of your part of the runtime.**

## Where to find what

| Page | What it holds |
|---|---|
| [`../reglages.md`](../reglages.md) | The three levels of settings and their fallbacks |
| [`github-seul.md`](github-seul.md) | **The GitHub-only station, the kitchen's only path**, and what was removed with the station roles |
| [`journal-et-rail.md`](journal-et-rail.md) | The log, the ticket rail |
| [`garde-fous.md`](garde-fous.md) | The guardrails: caps, stop and resume |
| [`station.md`](station.md) | Stations, several cooks, worktree setup, gates, calibration, a ticket's card |
| [`station-distante.md`](station-distante.md) | A station on another machine, the local kitchen in the sandbox, moving a kitchen |
| [`station-cook.md`](station-cook.md) | File zones, the harvest, refusals, quota, the Max connection |
| [`station-machine.md`](station-machine.md) | One station per machine, the GitHub call budget, adding a project |
| [`station-navigateur.md`](station-navigateur.md) | Looking at an interface delivery |
| [`manager.md`](manager.md) | The manager and the tickets of the epic |
| [`pass.md`](pass.md) | The pass: review, decision, merge |
| [`pass-merge.md`](pass-merge.md) | The merge, seeing the pass |
| [`etat-et-mesures.md`](etat-et-mesures.md) | Kitchen state, measures |
| [`carnet-lecons.md`](carnet-lecons.md) | The lessons notebook |
| [`fermeture.md`](fermeture.md) | The closing that observes, the closing that writes |
| [`identites-et-secrets.md`](identites-et-secrets.md) | One GitHub identity per role, the project's secrets |
| [`cloison-et-arbitre.md`](cloison-et-arbitre.md) | The partition, the arbiter between projects |
| [`exploitation.md`](exploitation.md) | Variables, backup, "Driving it", dev workstation, the box |
