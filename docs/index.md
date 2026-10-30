# Brigade documentation

Brigade is a team of AI agents that works your GitHub tickets. You write a ticket and put the
label `fire` on it. A **cook** (a `claude` session) takes it in its own git worktree, implements
it and opens a pull request. The **pass** judges that pull request — gates, CI, an independent
review — and merges it. A desktop app shows all of it: your projects, the **rail** of tickets, the
cooks in flight, and a terminal where **the second** helps you write and prioritize tickets.

This page is organized by what you want to do. The words (*cook*, *rail*, *station*, *pass*,
*served*…) are those of the [glossary](glossary.md). For the repository itself — its layout, how to
contribute and the release notes — go back to the [repository root](../README.md).

## Install brigade

- [Tutorial: install brigade on a Mac](tutoriels/installer-sur-mac.md) — from a Mac with nothing on
  it to the app installed and the station of your Mac running.
- [Install brigade and cook your first ticket](installation.md) — the whole path for Mac, Windows
  and Linux, from the download to the first merged pull request.
- [Install the app on your Mac](installation-mac.md) — the app as a window on your Mac: opening it,
  your projects, updates.
- [Install a station on a server](installation-station.md) — a station on a Linux server (or on a
  Mac or Windows PC), installed once per machine. There is no separate Linux tutorial: this guide
  covers the Linux install.
- [Install a station](installer.md) — the walkthrough of the station installation, with its
  checks.

## Add a project and cook its first ticket

- [Tutorial: add a first project and cook its first ticket](tutoriels/premier-projet.md) — add one
  project, open one ticket as a GitHub issue, watch a cook work it, review the delivery at the pass,
  and merge.
- [Install brigade and cook your first ticket](installation.md#your-first-ticket) — the same path,
  step by step, in the app's own screens.
- [The app, screen by screen](app.md) — what each part of the app shows and what you can do there.
- [The three levels of settings](reglages.md) — where a setting lives: the project, the station, or
  the app.

## Understand how brigade works

- [The glossary](glossary.md) — the one English word for each object of the product.
- [The V2 runtime](runtime/README.md) — the index of the runtime's pages: the log, the rail, the
  station, the pass.
- [The rail and the log](runtime/journal-et-rail.md) — what the runtime keeps and how the queue of
  tickets is built from it.
- [The pass](runtime/pass.md) — how a delivery is judged, by whom, and what happens after.
- [The station](runtime/station.md) — where the cooks run, and how a ticket becomes a card.
- [The guardrails](runtime/garde-fous.md) — the caps, and how to stop and resume the kitchen.
- [The Kitchen board](tableau-gestes.md) — the gestures the chef can make from a comment on the
  project's pinned board, without a direct link to the box.

## Look after the running kitchen

- [The state of the kitchen](runtime/etat-et-mesures.md) — what the kitchen is doing now and how it
  is measured.
- [Pass and merge](runtime/pass-merge.md) — the `merge` grant, seeing the pass, and what the pass
  does not guarantee.
- [Looking at an interface delivery](runtime/station-navigateur.md) — why the box no longer serves
  its page, and how to look at one now.

## Contribute to brigade

- [Contributing](../CONTRIBUTING.md) — how to propose a change to the repository.
- [The repository root](../README.md) — the project's overview and the protocol as the chef lives it.
- [Worktrees, gates and the team's conventions](../CLAUDE.md) — the rules a contributor and a cook
  follow in this repository.
- [The runtime's operation](runtime/exploitation.md) — how to run and test the runtime on a
  development workstation.
- [The app's development](app.md) — how the app is built and started on a development workstation.
