---
description: Write one kitchen-format issue on the current repository, after a short dialogue and the user's go
argument-hint: [the idea, in a few words]
---

Argument: `$ARGUMENTS` — the idea, in free words. It may be empty: then ask for it.

This command turns an idea into **one GitHub issue the kitchen can take**. It runs in any Claude Code session, on the repository of the current directory. It needs only `gh`.

**Language**: this file is in English; talk to the user **in their language** (the one of their messages). The issue itself is always written **in English**, with the words of the project's `docs/glossary.md` when it has one.

## 1. Dialogue (short)

- Find the repository: `gh repo view --json nameWithOwner -q .nameWithOwner`. If it fails, say so in one sentence and stop.
- If the idea is clear, ask nothing. Otherwise ask the fewest questions that settle: why it is wanted, what must change, and how we will see that it is done. One question at a time, never more than three in all.
- Rule out a duplicate with one `gh issue list --search "<keywords>" --state all`. If an issue already covers it, show it and ask whether to go on.
- You write the product need. You leave out file pointers and technical scope: the kitchen's manager completes them.

## 2. Draft, then ask for the go

Show the full draft to the user: the title, then the body in this exact format.

```
## Why
<the need, one short paragraph: who is blocked or what is lost today>

## What
- <what changes, as short bullets; what is out of scope when it helps>

## Acceptance criteria
- <one observable, checkable line each ("when I do X, I see Y"); every criterion can be proved by a test>
```

Rules for the draft:

- The title is short, in English, and says what the user gets. The three sections are all there, in this order, with these exact headings.
- **No `fire` label**, and no `model:` or `effort:` label: the kitchen's manager calibrates the issue. Add no label at all unless the user asks for one.

Then ask: « go ? » (in the user's language). **Create nothing before a clear yes.** If the user corrects the draft, show it again and ask again.

## 3. Create exactly one issue

On the go, run once:

`gh issue create --title "<title>" --body-file <a temporary file holding the body>`

Never create a second issue, never retry after a success, and never edit or close another issue. Then show the **issue URL** that `gh` prints, on a line of its own, and stop.
