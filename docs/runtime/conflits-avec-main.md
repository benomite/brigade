# Who resolves a conflict with main

**The cook of the ticket resolves a conflict between the ticket's branch and `main`.** It does so in its
own branch: it merges `main` into the branch, resolves the conflicts, and commits the merge. Then the
gates run, and the ticket goes on through the pass. The rule is the same whether the conflict appears
before the delivery or after a send-back.

## When the cook cannot resolve it

If the cook cannot resolve the conflict, the ticket goes back to a cook with the conflict as a
**send-back**. The new cook works in the same branch, under the same rule.

## What the kitchen never does

- **No ticket is opened to change another ticket's branch.** A conflict is never handed to a new
  ticket that edits someone else's work. The branch belongs to its cook, and only that cook, or a
  cook sent back on that same ticket, changes it.

## When the chef is asked

The **chef is reached only if the conflict hides a product choice**: two tickets that cannot both
hold, and only the chef can say which one wins. The card then asks that choice, in plain words.
**The chef is never asked to run a git command**: no merge, no rebase, no fetch, no branch update.
A card whose only gesture is a git operation is not sent to the chef.

## Wait loops between tickets

When a ticket waits for another ticket, and the wait would never end, the kitchen breaks the loop by
itself. It says so in one line on the issue, so anyone reading the issue sees why the wait ended.

## Vocabulary

Cook, station, send-back, gates, chef, ticket, branch, pass, awaiting and TODO are used as in
[`docs/glossary.md`](../glossary.md).
