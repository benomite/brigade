# Stations belong to the chef: an installed app is a station, a project chooses its own

*Product spec, 2026-10-15. Drawn up with the chef in session (the second). It says the **what**;
the **how** is the manager's.*

## Why

The chef, on 2026-10-15:

> there is no place to manage the stations (the app's home). I figure we could globalize the
> station system. The app installed on the Mac = 1 station, the app installed on my Windows
> computer = 1 other station, the app installed on my server = 1 station, on my phone = 1
> station. Each project declares which stations it uses and on which station the manager is
> installed.

Two concrete uses motivate it:

1. **`espace` needs a Windows test machine**, on which a fake OBS live runs. Tickets that touch
   OBS cannot be cooked on the box.
2. **Brigade without a server**: a user who only has their computer installs the app, declares
   their computer the project's main station, and the kitchen starts.

And an observation from the day before: installing the box and a project took dozens of copied
lines, and the installation was "never finished" (#542). A station that introduces itself and that
the chef accepts with one click replaces that path.

### What already exists (#399)

A project declares its stations in `BRIGADE_STATIONS`
(`<machine>/<engine>:<cook cap>:<capabilities>`), each announces **capabilities**, and a ticket can
**require** a capability (`requires`, on its card): it only goes to a station that provides it,
otherwise it is set aside (`no-station: <capability>`). This spec keeps that model. What changes:
**where stations come from** (the app, no longer a drop-in), **whose they are** (the chef's, no
longer a project's), and **who runs the manager** (a main station, possibly a desktop computer).

## Vocabulary

| Word | What it is |
|---|---|
| **station** | a machine where the brigade app is installed and which **cooks**: it can pick up tickets |
| **workstation** | an app that **steers** without cooking: see the queue, rule on what awaits, talk to the second. The phone is a workstation; the Mac can be a station and a workstation at once |
| a project's **main station** | the station that runs its **runtime**: the manager, the rail, the pass. One per project |
| **capability** | what a station can do beyond code: `obs`, `windows`, `chef-box-access`… (#399) |

## What the chef lives

### The home: their stations

- **The app's home lists its stations and its workstations**: each with its name, its machine,
  whether it is reachable, its capabilities, whether it is partitioned, and the projects that use
  it.
- **They add a station there**:
  - **a desktop computer** (Mac, Windows): they install the app on it and add the project to it by
    its git repository. The machine **introduces itself**;
  - **a headless server**: the home gives them **a single command** to run on the server; it
    installs brigade and shows **a code**, which they enter in their home. The second can run that
    command for them over `ssh`, but it is a shortcut, not the normal path.
- **A machine that introduces itself appears "pending" in the home**, and the chef **accepts** it
  with one click, with its capabilities. Without that acceptance, it cooks nothing: having access
  to the repository is not enough to plug a machine into one's kitchen.
- **They remove a station** from the home: it takes no more tickets, and the projects that used it
  say so.

### A project chooses its stations

- In the project's settings, the chef **ticks the stations** this project uses, and **designates
  its main station**.
- No more manual declaration: `BRIGADE_STATIONS` and the drop-in disappear from the normal path.

### The main station, and single-station mode

- **The main station runs the project's runtime.** When it is off, **the project's kitchen
  stops** until it returns. That is the principle, accepted.
- **Single-station**: a project whose only station is the chef's computer. Brigade works with the
  app alone, without a server.
- **The app pushes toward an always-on station**: as long as a project's main station is a desktop
  computer, the project's space says so, in one line and with one action, for example "your
  kitchen stops when this Mac sleeps: add a server so it runs continuously".

### Every station picks up, every workstation steers

- **Any station can pick up tickets** from the projects that use it, within the limit of its
  capabilities and its cook cap.
- **Any station and any workstation can open a second** on a project.
- **The phone is a workstation**: queue, decisions, second. It does not cook.

### The protections of a desktop station

On the box, a cook runs in a partition (allow-listed network, Max credentials read-only, nothing
but its worktree). On a desktop computer, that partition does not exist by default.

- **A station without a partition only takes tickets that require one of its capabilities** (the
  Windows station only takes `obs` tickets). Ordinary code cooks on a partitioned station.
- **Exception: the main station of a single-station project** cooks everything, since it is alone.
- **In both cases, the app says so when the station is accepted**, and in the home: "no partition:
  this machine's cooks see everything your account sees". It is up to the chef to choose what they
  put there (for example a Windows account dedicated to tests).

## The `espace` case

1. The chef installs the app on their Windows test machine, and adds `espace` to it by its
   repository.
2. The Windows machine appears "pending" in their home. They accept it, with the capability `obs`.
3. In `espace`'s settings, they tick the Windows station. The box stays the main one.
4. A ticket that touches OBS carries `requires: obs`: it goes to the Windows machine. The other
   tickets cook on the box, partitioned.
5. With the Windows machine off, the `obs` tickets wait, and say so; the rest of the rail moves.

## Exit criteria

- **The `espace` case is played end to end** on the chef's real Windows machine: an `obs` ticket
  is cooked on the Windows machine, delivered, and merged.
- **A single-station project** starts on a new Mac with the app alone, without a single copied
  line, and delivers a first ticket.
- **A server is added with a command and a code**, with no other action, and can be designated
  main.
- **No station is declared by hand** in a drop-in.

## Out of scope

- **The phone that cooks.**
- **A partition on macOS or Windows**: a desktop station stays without a partition, and says so.
- **A main station that hands over** to another when it goes off: the kitchen stops, that is the
  principle.
- **Stations shared between several humans**: a station belongs to one chef.

## What must not regress

- **The box's partition**: a cook on a server station stays partitioned as today.
- **Capabilities and `requires`** (#399): a ticket that requires a missing capability is set aside
  and says so, without looping (#640).
- **Projects already served by the box** move to the new model without copying anything: their
  current stations become stations of the home, and the box stays their main one.

## Links

- #399 — stations and their capabilities.
- #542, #676 — the installation that must have an end, and its UX.
- #640 — a ticket set aside does not loop.
- #700 — terminals on any machine.
