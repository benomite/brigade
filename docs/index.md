# Brigade documentation

Brigade is a team of AI agents that works your GitHub tickets. You write a ticket and put the
label `fire` on it. A **cook** (a `claude` session) takes it in its own git worktree, implements
it and opens a pull request. The **pass** judges that pull request — gates, CI, an independent
review — and merges it. A desktop app shows all of it: your projects, the **rail** of tickets, the
cooks in flight, and a terminal where **the second** helps you write and prioritize tickets.

This page is organized by what you want to do. The words (*cook*, *rail*, *station*, *pass*,
*served*…) are those of the [glossary](glossary.md). For the repository itself — its layout, how to
contribute and the release notes — go back to the [repository root](../README.md).

## Start here

- [Install brigade and cook your first ticket](installation.md) — the whole path for Mac and
  Windows, from the download to the first merged pull request, with the steps for the unsigned app.
- [Install brigade on Linux](installation-linux.md) — the Linux x64 app, as an AppImage.
- [Tutorial: add a first project and cook its first ticket](tutoriels/premier-projet.md) — add one
  project, open one ticket as a GitHub issue, watch a cook work it, review the delivery at the pass,
  and merge.
- [Tutorial: install brigade on a Mac](tutoriels/installer-sur-mac.md) — from a Mac with nothing on
  it to the app installed and the station of your Mac running.
- [Try it](../README.md#try-it) — the short version, in the repository's README.
- [The brigade plugin for Claude Code](plugin.md) — `/brigade:start`, `/brigade:ask`, `/brigade:ticket` and `/brigade:todo` from any Claude Code
  session: how to install it, and how it lives beside the app's own plugin.

## Run a station

For people who run a station on a server.

- [Install a station on a server](installation-station.md) — a station on a Debian server (with
  systemd), installed once per machine. There is no separate Linux tutorial.
- [Install a station](installer.md) — the walkthrough of the station installation, with its
  checks.
- [One station, being built](superpowers/specs/2026-11-27-one-station-design.md) — the design of epic #4245: one
  archive and one `install.sh` for Mac and Linux, a dedicated `brigade` account and the network gate on every
  station, the `brigade` operator command, the app without a kitchen.

## Add a project and cook its first ticket

- [Tutorial: from a production error to a fixed ticket](tutoriels/erreur-de-production-a-ticket-corrige.md) — connect
  Sentry to GitHub so a production error opens an issue labelled `fire`, and follow it to the merged fix.
- [The app, screen by screen](app.md) — what each part of the app shows and what you can do there.
- [The three levels of settings](reglages.md) — where a setting lives: the project, the station, or
  the app.

## Understand how brigade works

- [The glossary](glossary.md) — the one English word for each object of the product.
- [The kitchen](runtime/README.md) — the runtime: one loop that reads GitHub, decides, and launches
  the agents; where it runs, and how a ticket's labels say its state.
- [The agents' sandbox](runtime/bac-a-sable.md) — what an agent may do on the network, on Linux and
  on a Mac.

## Contribute to brigade

- [Contributing](../CONTRIBUTING.md) — how to propose a change to the repository.
- [The repository root](../README.md) — the project's overview and the protocol as the chef lives it.
- [Worktrees, gates and the team's conventions](../CLAUDE.md) — the rules a contributor and a cook
  follow in this repository.
- [The kitchen on a development workstation](runtime/README.md#on-the-dev-workstation) — how to run
  and test the runtime, and the rules of this repo.
- [The app's development](app.md) — how the app is built and started on a development workstation.
