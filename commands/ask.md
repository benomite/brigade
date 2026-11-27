---
description: Answers on the state of a ticket (or a question about it) from what GitHub says
argument-hint: <number> [question]
---

Argument: `$ARGUMENTS` — a ticket number, then optionally a question in plain words. The first word is the number (a leading `#` is accepted); everything else is the question. No number, or not a number? Say so in one sentence, recall `/brigade:ask <number> [question]` and stop.

This command only **reads** and **answers**. It can run in the second's session or in any session of the project. It needs neither the board nor the box: only GitHub counts.

## Read the ticket

With the usual GitHub tooling (`gh`), read:

- the **body** and the title, the state (open, closed): `gh issue view <number> --comments`;
- the **labels**;
- the **latest comments** — the most recent first, the ones that say where things stand; the ticket's sheet (`<!-- brigade:fiche -->`) counts as a comment;
- the **linked PR**: `gh pr list --search "<number>" --state all --json number,title,state,isDraft,mergedAt,reviewDecision,url` or the ticket's cross-references; if a PR exists, read its state, its review and the state of its checks (`gh pr view <pr> --json state,reviewDecision,statusCheckRollup`).

Ticket not found? Say so and stop. Change nothing: no comment, no label, no commit.

## Answer, in the user's language

The answer is **always in the user's language**, even if the ticket is in another one: the language of their question, or of this conversation.

- **With a question**: answer that question, and only it, from what you read. Cite what grounds it (a comment, a label, the PR). What the ticket does not say, you say so ("the ticket does not say") instead of guessing.
- **Without a question**: a few lines (three to five) on **where the ticket stands** and **what it waits for** (a decision from the chef, a review, a CI, another ticket, a cook…). No story of its history, no list of its comments.

Keep it short, with no preamble.

**Naming a PR to the chef.** In any text addressed to the chef, a PR is named by its ticket first: "the delivery of #3709 (PR 3710)", never "#3710" alone (the chef does not know which ticket that number points to). Any command or gesture you ask the chef to type for a PR (merge, review) takes the **ticket number** (`merge 3709`, `review 3709`), never the PR number; the bare PR number stays an accepted alias, but you do not give it.
