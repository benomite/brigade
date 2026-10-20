# The station, redone from scratch: one installation per machine, then projects, and never a command again

*Product spec, 2026-10-15. Drawn with the chef in session (the second). It says the **what**; the
**how** is the manager's. It takes precedence over [the stations spec of the same day](2026-10-15-stations-globales-design.md)
wherever they differ; what this one does not say (station / workstation vocabulary, capabilities,
`requiert`, the partition of desktop stations, cases of `space`) remains valid.*

## Why

On 2026-10-15, not one brigade commissioning succeeded on its own. Each one stumbled on something
else — the network, the sudo password, settings left in the drop-in, a changed systemd unit
(twice, once for a comment) — and ended up as commands copied by the chef, sometimes as
root. The Max session was lost every eight hours because its renewal, delivered, had
never been activated, and nothing had said so.

The chef:

> since not a single commissioning worked on its own, maybe we can admit
> that your system does NOT WORK AT ALL

> priority 1 is to redo the station system from 0, especially the server station.

> stations, it's 1 install, and then we add the projects, we don't install the station 6 times
> for 6 projects (so not 6 updates each time — we didn't install the Mac app 6 times as far as I
> know)

> the logic must be the same for Windows and mobile (and other futures)

Study #739 ([2026-10-15-etude-brigade-sur-hermes.md](2026-10-15-etude-brigade-sur-hermes.md))
ruled out Hermes, but concluded in the same direction: the generic plumbing (installation, service, update)
is what costs us most, and it must be bought as standard tools rather than
written by hand.

## The three principles

1. **One installation per machine, then projects are added to it.** A project is not an
   installation: it is a line of configuration of a station. A machine has a single version
   of brigade, and a single update, however many projects it serves.
2. **A single system of stations, the same logic on every platform**: Linux, Mac,
   Windows, phone, and those to come. No platform has a path of its own; what
   changes from one platform to another is only what gets installed (a package, the app).
3. **After the installation, no more commands in a terminal** — not to update, not to add a
   project, not to repair. A gesture of the chef is a button, or a login.

## What a station is

- **A station is installed once per machine.**
  - On a server: a **system package** (Debian first), installed by **a single command**
    taken from a **global installation guide**, outside any project. The guide can be accompanied
    by an LLM.
  - On a computer (Mac, Windows, desktop Linux): **the app**. An installed app is a
    station.
  - On a phone: the app too. The phone is a **workstation** — it drives, it does not cook
    (settled in the stations spec) — but it follows the same logic: one installation, then
    the projects.
- **A single brigade service per machine, for all its projects.** Adding or removing a project
  touches no system file.
- **The station updates itself**, like a browser: when a version comes out, it moves to it;
  the cooks in flight finish; the queue says so ("moved to version X at 14:02"). The chef can
  **freeze the version** of a station, through a setting in the app. Everything the system carries —
  service units, rights, renewal timer — comes with the package and follows its
  updates: **no root gesture after the installation**, ever.
- **A failed update rolls back by itself** to the previous version, and says so in one line.
- **The Max connection** is made once, during the guided installation. The station then renews it
  itself; if it is lost, the only gesture asked is a login, and the kitchen resumes
  by itself within the minute.
- **No direct link between machines.** Everything goes through **GitHub**, where the rail already is: the
  stations take their tickets there and write there where they stand; the app and the phone read it
  there. The rail stays visible when a station is off. The price, accepted: following a cook
  in flight is refreshed to the minute, not to the second.
- **A project's main station** — the one that runs its manager and its pass — is
  chosen **per project**, in the app. The app **recommends a server station**, always on.
  If the main one is a computer's app, the project's kitchen stops when the app is closed,
  and the app says so at the time of the choice.

## The chef's journey

1. **Install a server station**: the chef opens the global guide, pastes a command on the
   server, logs in to Max on site. The server displays a code; the chef types it in the app.
   The station appears on the home screen: "online · version X · no project".
2. **Install a desktop station**: install the app. The machine appears in the same list.
3. **Add a project**: in the app, the chef chooses the GitHub repository, its stations, its
   main one (the server proposed by default). GitHub asks to authorize brigade on this repository, in one
   click on its page. That is all.
4. **The kitchen's first ticket prepares the repository**: its checks (gates), the
   preparation of its tickets (worktree setup), the sites it may reach. A cook
   writes it and **tests it on the real station**, where it will run; the chef merges it in one click.
   The rail then starts.
5. **Daily life**: no command, no update to launch. Only the chef's decisions
   await them, each with its button.

**When it breaks**, the failure is told in one line, with a button, on the station concerned:
station unreachable ("the box has not given a sign of life for 10 min"), update failed and
rolled back, Max connection lost (a login). Never a series of commands.

## The switch from today

- On the current box, the chef does the fresh installation **once** (the command, the code).
- Brigade takes over **by itself** the three projects (`brigade`, `espace`, `calculus-workspace`): their
  log, their decisions, their tickets in progress. Nothing is lost; the kitchen stops for a few
  minutes.
- The three `brigade@<projet>` services, the homemade commissioning (its gesture and the per-project
  switch), their sudoers rules and the settings left in the drop-ins are **removed** by
  this installation.

## Exit criteria

- **Three versions in a row pass by themselves** on the box, one of which changes a service
  unit, without any gesture from the chef.
- **Adding a fourth project** takes under 10 minutes, without a terminal.
- **A Max session that expires** only asks for a login; the kitchen restarts by itself.
- **Installing a station on a second machine** (a Mac or a second server) follows the same
  journey, and a project can cook there.
- The box serves its three projects with **a single installation and a single version**.

## Out of scope

- The Windows station of `espace` (OBS): same logic, after this redesign.
- Notifications to the phone (the ntfy lead of study #739).
- The content of the rail cards and of the "Check" screen: their own tickets (#622, #674,
  #747).

## What disappears

The per-project installation, the commissioning gesture, the per-project switch, their sudoers rules
and their doc — on the order of 7,000 lines according to study #739. The open tickets that repair this path
(#474, #560, #743, #756 and those of epic #602) are closed as replaced by this spec, at the
moment the manager splits it.

## Non-regressions

- The **partition** of cooks on a server station, the network **door**, the one-hour GitHub tokens
  that no cook receives: unchanged.
- The **pass**, the `merge` **grant**, the zones, the append-only log: unchanged.
- The cook in flight during an update **finishes** its work (#704).
- The **Max quota** remains consumed by the official `claude` binary, never otherwise.
