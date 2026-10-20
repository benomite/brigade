# Installing brigade in a project — spec and plan (#173)

**Date**: 2026-10-09
**Status**: delivered on the dev side; three criteria remain for milestone 7's acceptance test,
on the box
**Issue**: #173 "Installer brigade dans un projet : un parcours court, vérifié, et réversible"
**Builds on**: `2026-10-08-brigade-v2-design.md` (§Migration: V1 conventions kept),
`2026-10-08-station-claude.md` (the reserved clone, the setup before the cook),
`2026-10-08-pass-et-grant-merge.md` (the gates, the grant absent by default).

The path, as the chef lives it, is in `docs/installer.md`: it is the living doc, and this
document does not copy it.

---

## What was true before coding

- What a repository must carry could be read in six places in the code (`SCRIPT_GATES`,
  `SCRIPT_SETUP`, `LABEL`, `calibrage.ts`, `prio:` in `alimenter.ts`, the configuration readers)
  and nowhere in one piece.
- Each configuration reader refuses at the **first** gap, and the runtime at the first reader: a
  badly installed project discovered one missing thing per restart, then at the first cook.
- The runtime does not read the bindings: the integration branch is written twice, with nothing
  comparing them.
- `CLAUDE.md` said "five variables", `docs/runtime.md` "nine": the code requires nine.
- `/brigade:init` sets V1 bindings, scripts and labels — not `fire`, `model:`, `effort:`.

## What is delivered

One chef command, `npm --prefix runtime run installation`, and four gestures:

| Gesture | Effect | Writes anything? |
|---|---|---|
| *(no argument)* | checks the machine, the repository and GitHub; names **everything** that is missing; exits 1 if something is missing | no |
| `labels` | creates the rail labels absent from the repository | on GitHub, only what is missing |
| `setup [<cooks>]` | plays the setup dry in a probe worktree, measures it, says whether it holds at `<cooks>` cooks | a throwaway worktree, removed |
| `uninstall [--confirm]` | removes the reserved clone and the worktrees | only with `--confirm` |

None launches a cook, none opens the log.

## What the dev decided — contestable in review

1. **A path, not an installer.** The installation stays a series of written gestures, whose
   result the command checks. The machine-side gestures need `sudo` and an editor; the
   repository-side gestures are those of `/brigade:init`. A script that did everything would have
   to know the machine — which brigade refuses to do for a project.
2. **`/brigade:init` is not modified.** The V2 labels are created by the runtime command, which
   already has `gh` and the repository name; `init` stays the V1 path, and the Codex mirror is
   not touched.
3. **Three marks**: `ok`, `MISSING` (holds back: code 1), `note` (does not hold back). An absent
   setup is a "note" — the runtime tolerates it; absent gates are a missing item — the pass would
   escalate every delivery.
4. **The labels created are those the issue names** (`fire`, `prio:1`-`3`, `model:`, `effort:`).
   `epic`, `question`, `decision`, `blocked-on-human` are only read by the manager: they stay with
   the chef.
5. **The uninstall keeps the log** and touches nothing of the repository or of GitHub. It removes
   what the issue names — the reserved clone, the worktrees — and prints the service's `sudo`
   gestures, which a process under the service's account cannot do. It asks for `--confirm`: it
   is the only destructive gesture of the CLI. Once confirmed, it refuses as long as the clone
   carries a commit, a stash or a file that the origin does not have (referral 1 of PR #188).
6. **"Holds at 30 cooks"** = the setup finishes under half the lease **and** thirty worktrees fit
   on the disk, reserve deducted. The entry time is shown, not judged: a queued ticket does not
   fail. No shared cache is built (out of scope of the issue).
7. **`BRIGADE_SYSTEMCTL_BIN`**, modeled on `BRIGADE_GH_BIN`: the gates also run on the box, where
   a real `systemctl` would answer the tests.
8. **`installation.ts` launches `git` and `gh` itself**, read-only, whereas `depot.ts` and
   `github.ts` call themselves the only launchers: `github.ts` is closed to this ticket (#174 is
   working on it), and `Depot` can read neither a file of the base nor its mode. To be folded into
   those two modules once #174 is merged, if the review wants it.
9. **The `PART_DU_SETUP` constant** (half the lease) is restated in `installation.ts`: the one in
   `station.ts` is not exported, and `station.ts` is closed to this ticket.

## What is not held here

- The path played **end to end on `calculus`**, "nothing in brigade's code had to change", and
  the first ticket served without a grant: milestone 7's acceptance test, by the chef, on the box
  (`docs/installer.md`, "Recette du jalon 7").
- The cost of **`calculus`'s** setup: the command measures it, the figure is taken on the box.
- The `env $(systemctl show …)` form by which the command receives the service's environment
  could not be tried from a workstation without systemd.

## Plan followed

1. Tests of the check (`runtime/test/installation.test.ts`), red; then `verifier`.
2. Tests of the labels, the measure, the uninstall, the CLI, red; then the rest of
   `runtime/src/installation.ts` and `installation-cli.ts`.
3. `docs/installer.md`, joins in `docs/runtime.md`, "nine variables" in `CLAUDE.md`.
