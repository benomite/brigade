# From a production error to a fixed ticket

From a production error in Sentry to a merged fix: Sentry opens a GitHub issue carrying the label `fire`, a human lets it onto the rail once, and a cook fixes it. No code to write on your side.

Words (*rail*, *cook*, *pass*, *sensitive*…) are those of [`docs/glossary.md`](../glossary.md).

## Before you start

- A project already running in Brigade, with its kitchen started ([`premier-projet.md`](premier-projet.md)).
- A Sentry project for the same application, and the right to install an integration on your Sentry organization and on the GitHub repository Brigade works on.
- The labels `fire` (and `sensitive`, see the safety section) exist on that repository. Create them first if they do not: a GitHub issue cannot carry a label that does not exist.

## 1. Connect Sentry to GitHub

In Sentry, open the organization settings, **Integrations**, find **GitHub**, and install it on the account that owns the repository. Grant it access to the repository Brigade works on, and only that one.

**You see**: the GitHub integration listed as installed, with the repository available to your Sentry projects.

## 2. Open issues with the label `fire`

Sentry creates a GitHub issue from an alert rule, with the action that creates a GitHub issue, or by hand from one Sentry issue (**Create new issue** under *Linked issues*). In either case Sentry's form asks for the repository, a title, a body and **labels**.

1. Create (or edit) an alert rule on the Sentry project, with the filters of the safety section below.
2. For its action, choose the GitHub one that creates an issue, pick the repository, and type `fire` in the labels.
3. Save the rule.

**You see**: when the rule fires, a new issue on the repository, labelled `fire`, whose body carries the Sentry error.

## 3. What happens next

**The first gate: an issue from Sentry is not trusted by default.** Sentry's integration is not an account with write access to your repository. The manager sets aside any issue written by someone without a hand on the repository, **even with the label `fire`**, as `untrusted-author` ([`docs/runtime/manager.md`](../runtime/manager.md)). Only the `github-actions` bot is exempt. So an issue opened by Sentry does not go straight to the rail:

1. **The manager triages it, once.** It comments with a proposal (`duplicate of #N`, `out of scope`, or `ticket` with a `prio:`) and opens a **TODO** card for the project's `product` human (the chef if there is none), with two buttons, **on the rail** or **close**, and a free answer.
2. **A human answers.** Nothing reaches the rail until you, or an account with write access, answer on the card or on the issue. `on the rail` puts the proposed `prio:` (or the one you write, `on the rail prio:N`; `fire` if there is none) and the issue is judged on the manager's next wake-up. `close` closes it.

This applies to each issue Sentry opens, so a human stays in the loop for every error. The manager does not remove this gate for a given Sentry setup: this guide documents no way around it.

Once the issue is on the rail, this is Brigade's ordinary path:

3. **The manager qualifies it.** If it lacks what a cook needs, it completes it or asks; it sets the calibration labels `model:` and `effort:` (and may propose the `sensitive` mark with its reason, see below). A project switched off (`project off`) takes nothing.
4. **A cook takes it** in its own worktree on a branch `cook/<run>`, reads the Sentry error in the issue body, implements a fix and opens a pull request. The card goes from **Taken** to **Pass**.
5. **The pass judges it**: gates, CI and an independent review, and writes its verdict on the issue ([`docs/runtime/pass.md`](../runtime/pass.md)). A green delivery is merged by the pass itself.
6. **The ticket is fixed**: the pull request is merged, the issue closed, the card is in **Served** ([`docs/runtime/pass-merge.md`](../runtime/pass-merge.md)).

A delivery the pass cannot settle alone waits for you in **TODO**.

Brigade fixes what the issue lets a cook understand. It does not watch your production, deploy anything or confirm the error stopped: merging the fix is where it ends, and deploying it stays yours.

## Safety: which errors to send to Brigade

**Not every error.** Each issue sent to Brigade costs a cook's run on your Claude quota and ends in a merged change. Send only the errors you would be willing to see fixed without you looking first.

Concrete rules, set on the Sentry alert rule:

- **Frequency threshold**: fire only when the same error happens at least N times (for example 10) within an hour, so a one-off glitch does not open a ticket.
- **New issues only**: use the condition *a new issue is created*, not *every event*, so one error opens one issue and not one per occurrence.
- **Severity**: filter on the event's level (`error` and above), never `warning` or `info`.
- **Scope**: restrict the rule to the Sentry environment `production` and to the projects whose code lives in this repository.
- **Start narrow**: begin with one rule for one kind of error, read the first few pull requests, and widen only then.

### Errors in sensitive code wait for the chef

Some fixes should never land on their own: a **migration**, **security**, a **payment** or the **deletion of user data** ([`docs/sensitive-tickets.md`](../sensitive-tickets.md)). For such an error, add the label `sensitive` next to `fire` in the Sentry action (a dedicated rule for the sensitive part of your code), or let the manager propose it when it qualifies the ticket.

A ticket labelled `sensitive` goes through the kitchen as any other: a cook fixes it and the pass judges it. But the pass does not merge it. It waits in TODO as one **review before merge** card, with the pull request and two answers: **merge**, or **send back with a note**. This is the behaviour of the epic #3214, which is in the repository at the time of writing (#3223 the hold, #3224 the card, #3225 the manager's proposal, #3226 the doc).

Sentry cannot tell by itself that an error is sensitive: the label comes from your rule, from you, or from the manager's proposal. An error in sensitive code that reaches Brigade through a rule without the label, and that you let onto the rail, is merged by the pass like any other once it is green: the human answer at the first gate is your chance to add `sensitive` before it does.

*Placeholder: a human fills this in after a real run of this guide. It has not been run yet; the Sentry screens are written from Sentry's documentation, so if one differs, trust the screen.*

Tested on: <project>, <date>
