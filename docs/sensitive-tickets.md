# Sensitive tickets

A **sensitive** ticket is one whose merge needs the chef's eyes before it lands. This page is the one place that says what makes a ticket sensitive, who can mark it, how the mark shows, and what changes for it. Other docs point here instead of repeating it.

## What makes a ticket sensitive

A ticket is sensitive when it touches:

- a **migration**;
- **security**;
- a **payment**;
- the **deletion of user data**.

Anything else is not sensitive.

## Who can mark it

The mark can be set by:

- the **chef**;
- the **second**;
- the **manager**, who proposes it when it qualifies a ticket, with its reason on the ticket (one sentence, in a comment, as the manager's role says).

## How it shows

- The label `sensitive` on the GitHub issue.
- The ticket card, which carries the same mark.

## What changes

A sensitive ticket goes through the kitchen like any other:

1. A cook takes it and cooks it.
2. The pass judges it, as usual.
3. It then waits in TODO as one **review before merge** card, with two answers:
   - **merge**: the ticket is merged;
   - **send back with a note**: the ticket goes back with the note.

A ticket that is not sensitive is merged by the pass alone.

See [glossary](glossary.md) for the terms `sensitive` and `review before merge`.
