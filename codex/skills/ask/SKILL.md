---
name: ask
description: Answer, in the user's language, on the state of a GitHub ticket or a question about it, from the ticket and its linked PR. Use when the user invokes $ask with an issue number and, optionally, a question.
---

# Ask

Argument after `$ask`: `<number> [question]` — the first word is the ticket number (a leading `#` is accepted), the rest is the question. No number, or not a number: say so in one sentence, recall `$ask <number> [question]` and stop.

This skill only **reads** and **answers**. It can run in any session of the project and needs neither the board nor the box: only GitHub counts.

## Read the ticket

With the usual GitHub tooling (`gh`), read:

- the **body**, the title and the state of the ticket: `gh issue view <number> --comments`;
- the **labels**;
- the **latest comments**, the most recent first (the ticket's sheet, `<!-- brigade:fiche -->`, counts as a comment);
- the **linked PR**: `gh pr list --search "<number>" --state all --json number,title,state,isDraft,mergedAt,reviewDecision,url` or the ticket's cross-references; if it exists, read its state, its review and its checks (`gh pr view <pr> --json state,reviewDecision,statusCheckRollup`).

Ticket not found? Say so and stop. Change nothing: no comment, no label, no commit.

## Answer, in the user's language

The answer is **always in the user's language**, even if the ticket is in another one: the language of their question, or of this conversation.

- **With a question**: answer that question, and only it, from what was read, citing what grounds it (comment, label, PR). What the ticket does not say, say so ("the ticket does not say") instead of guessing.
- **Without a question**: a few lines (three to five) on **where the ticket stands** and **what it waits for** (a decision from the chef, a review, a CI, another ticket, a cook…). No story of its history.

Keep it short, with no preamble.

**Naming a PR to the chef.** In any text addressed to the chef, a PR is named by its ticket first: "the delivery of #3709 (PR 3710)", never "#3710" alone (the chef does not know which ticket that number points to). Any command or gesture you ask the chef to type for a PR (merge, review) takes the **ticket number** (`merge 3709`, `review 3709`), never the PR number; the bare PR number stays an accepted alias, but you do not give it.
