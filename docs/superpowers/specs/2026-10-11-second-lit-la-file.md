# On opening, the second reads the project's queue — spec (#309)

**Date**: 2026-10-11
**Status**: decided — three product decisions settled by `question-spec` (answers below),
the rest by the dev, **to be contested in review**.
**Issue**: #309 (milestone 6, epic #294)

The behaviour, as the chef lives it, is in `README.md` ("Runtime → PO") and in the role
itself (`commands/po.md`, "À l'ouverture : la file du projet"): this document does not copy it.

## Where it lives

"The second", in this repository, is the plugin's **PO** role. The ticket is in **plugin V1 zone**:
`commands/po.md`, its mirror `codex/skills/po/`, a case under `evals/`. Nothing under `runtime/` or
`app/`: the queue exists (#191), the second just did not read it.

## What was settled by `question-spec`

1. **The queue is read in both modes**, a single call on opening. Reflex mode keeps
   "no prior state of play", the queue excepted.
2. **The `awaiting` block is relayed as is**; in topo mode, **the whole output of `status`
   replaces** the two `gh issue list` calls and the reading of the roadmap. "Nothing awaits you" is only
   said once the command succeeded and the block is absent.
3. **Any later claim about the project's state is made on a fresh read**: one
   line in the role, no more.

## What the dev settled

1. **A single source: `~/.config/brigade/app.json`**, the app's file (#295, #296). The project
   is the one whose `dossier` is the session's repository. No extra binding in the `CLAUDE.md`.
   `BRIGADE_APP_CONFIG`, which serves to try the app, is not taken up by the role.
2. **The same command as the app**: `ssh -o BatchMode=yes -o ConnectTimeout=10 -- <host>
   '<command> run status'`, with a 30 s timeout. The second therefore has nothing to learn that the app
   does not already know, and what one reads, the other reads.
3. **The three outcomes of `ssh` are those of #297**, read from the code alone: 255 → not reached; any
   other code → reached, but `run status` failed; 0 → read. The timeout says itself (`no
   answer in 30 s`): the second does not know whether `ssh` had reached the box, and does not guess. One line each, then
   what the command wrote. No second try, no diagnosis.
4. **"Queue not read" and "queue empty" are not said the same way.** Three lines begin with
   `queue not read:`; `nothing awaits you` is reserved for code 0 with no `awaiting` block.
5. **Queue not read in topo mode: today's topo, on GitHub, saying that it is one.**
   This holds for a project with no runtime as for a box that does not answer: the second carries on.
6. **No `SessionStart` hook**: it would play for every session of every role, devs
   included. The spec says "a hook"; what is delivered is a role instruction, read when it is
   loaded.
7. **The Codex mirror does not copy the rule**: it only says what a sandbox that refuses
   reading outside the repository or the network must conclude from it — a queue not read.

## What was tried

The modified role, held by a fresh sub-agent (`sonnet`) in a described environment, running nothing;
a control on the previous role.

| Case | What the role did |
|---|---|
| Control, previous role, no argument, runtime declared | two `gh issue list` and the roadmap; no `ssh` — the project's state is rebuilt |
| Reflex mode, in a hurry, `awaiting` block of two lines | reading of `app.json`, one `ssh … run status`, the block word for word at the top, then the issue laid out; no full `gh issue list` |
| Reflex mode, empty queue, then "still nothing awaiting me?" forty minutes later | `nothing awaits you`, then the command rerun and the fresh block relayed |
| Topo mode, `ssh` at 255 | `queue not read: box not reached` and the `ssh` line; neither `ssh -v` nor `ping`; GitHub topo, said as such |
| Topo mode, project with no `hote` (another project of the file has one) | no `ssh`; `queue not read: no runtime declared…`; GitHub topo, said as such |
| Topo mode, `run status` at code 1 | `queue not read: box reached, but run status failed (code 1)` and the command's message; neither `systemctl` nor `journalctl`; GitHub topo |

The evals suite (`claude plugin eval`) was not played: it is played before a release
(`evals/README.md`), and the `po-lit-la-file` case is added to it.

## What is not held

- **"What awaits the manager"** (first criterion of the issue) is only served by what
  `status` prints: the `awaiting` block carries what the manager awaits **from the chef**. What the runtime's
  manager has not yet judged has no line in `status`, and the second does not reconstruct it.
- **Nothing forces the reading**: it is a role instruction, not code. An eval case guards it,
  nothing else.
- **The modified role is only lived after the plugin is published** (`v2` carries `0.16.0`): outside
  this ticket.
- **A session opened in a worktree** of the project, whose folder is not that of
  `app.json`, does not find its project: queue not read.
