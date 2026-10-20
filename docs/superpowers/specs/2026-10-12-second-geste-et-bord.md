# The second reads the queue through the box's gesture, and through the edge of `status` — spec (#317)

**Date**: 2026-10-12
**Status**: decided by the dev on the issue's criteria, **to be contested in review** — no
product decision was left open.
**Issue**: #317 (follows #311 and #312; extends `2026-10-11-second-lit-la-file.md`)

The behaviour, as the chef lives it, is in `README.md` ("Runtime → PO") and in the role
itself (`commands/po.md`, "À l'ouverture : la file du projet"): this document does not copy it.

## What moved under the second

- **#312**: the box has a gesture, `brigade <project> <command>`, and five refusals of its own (64 to 68; 68 came from #314).
- **#311**: the `awaiting` block of `status` is always there, between two lines that make its edge, and
  it says itself when nothing is awaiting.

## What the dev settled

1. **The name passed to the gesture is the project's `nom` in `app.json`.** The PO's criterion in #312 —
   "I declare the host, and that's all" — leaves no room for an extra field. A `nom` that the
   box does not know is therefore read in the gesture's refusal (code 65), not in the file. **#316 (the app),
   merged in the meantime, settled the same: both run `brigade <nom> status`.**
2. **`commande` is no longer read, without being refused.** The app, for its part, refuses the file that still
   carries it (#316) and says to remove it; the second takes only `nom` and `hote` from it, and reads the queue.
3. **The gesture's five refusals have a line of their own**, the same for 64 to 68: `box reached, but its
   gesture refused (code <N>)`, followed by the gesture's sentence. It is what names the unknown
   project, or the account without rights; the second does not translate it.
4. **Any other code**: `box reached, but the command failed (code <N>)`. A box from before #312
   falls into it (`brigade: command not found`, 127): the second shows what it got, it does not say
   that the box is behind.
5. **The block is relayed edges included**, the `end awaiting` line with it: word for word means
   removing nothing. The second no longer composes any sentence when nothing is awaiting.
6. **A code 0 with no edge is a queue read, neither an empty queue nor a queue not read**: a line says
   so, and the whole output follows, word for word. The topo therefore does not fall back on GitHub: `status`
   answered. This is what #318 asks of the app for the same case.
7. **The Codex mirror still does not copy the rule**; its line on the sandbox follows the
   file read and the command run.

## What was tried

The role held by a fresh sub-agent (`sonnet`) in a described environment, running nothing:
`app.json` carries only `nom` and `hote`, the box's answer is given. One pass per case.

| Case | What the role did |
|---|---|
| Control, previous role (two passes) | no `ssh`: `queue not read: no runtime declared…` — without `commande`, it no longer reads anything |
| Reflex mode, code 0, the block says nothing awaits | `ssh … -- box brigade parade status`; the block's two lines, word for word, and no sentence of its own |
| Reflex mode, in a hurry, code 0, block of two entries | the block from `awaiting` to `end awaiting`, edges included, nothing of the rest of `status` |
| Reflex mode, code 0, output with no edge | `queue read, but with no edge: …`, then the whole output; no "nothing awaits you" |
| Topo mode, code 65 | `queue not read: box reached, but its gesture refused (code 65)` and the gesture's sentence; GitHub topo, said as such |
| Topo mode, code 127 (`brigade: command not found`) | `queue not read: box reached, but the command failed (code 127)` and the shell's line; nothing about the box's age; GitHub topo |

The evals suite (`claude plugin eval`) was not played: it is played before a release
(`evals/README.md`). The `po-lit-la-file` case plays the new form there.

## What is not held

- **The modified role is only lived after the plugin is published**: `v2` carries
  `0.16.0`, `main` `0.16.1`. The bump and `scripts/update-partout.sh` are the chef's.
- **A `nom` that carries a space** goes as is to the box, whose shell splits it — the app,
  for its part, quotes it (#316). In both cases the gesture refuses it, and it is its sentence that says so; it
  will not be the same.
- What the spec of 2026-10-11 did not hold is not held any more (session opened in a
  worktree, nothing forces the reading).
