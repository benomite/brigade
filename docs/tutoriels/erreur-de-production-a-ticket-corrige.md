# From a production error to a fixed ticket

From a production error in Sentry to a merged fix: Sentry opens a GitHub issue carrying the label `fire`, a human lets it onto the rail once, and a cook fixes it. No code to write on your side.

Words (*rail*, *cook*, *pass*…) are those of [`docs/glossary.md`](../glossary.md).

## Before you start

- A project already running in Brigade, with its kitchen started ([`premier-projet.md`](premier-projet.md)).
- A Sentry project for the same application, and the right to install an integration on your Sentry organization and on the GitHub repository Brigade works on.
- The labels `fire` and `accepted` exist on that repository. Create them first if they do not: a GitHub issue cannot carry a label that does not exist.

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

**The first gate: an issue from Sentry is not trusted by default.** Sentry's integration is not an account with write access to your repository. The kitchen takes no issue whose author has no write access, **even with the label `fire`**, and passes no agent its body (`runtime/src/kitchen/github.ts`). So an issue opened by Sentry does not go straight to the rail:

1. **It waits in Backlog.** Nothing reads it, nothing cooks it.
2. **A human lets it in.** You, or an account with write access, add the label **`accepted`** to the issue. From then on the kitchen treats it as any other ticket. To drop it instead, close it.

This applies to each issue Sentry opens, so a human stays in the loop for every error. This guide documents no way around it.

Once the issue is accepted, this is Brigade's ordinary path:

3. **It goes to a cook.** With `fire`, it is in **Ready** and taken as soon as a place is free. Without it, the manager calibrates it first (labels `fire`, `model:`, `effort:`), splits it, or parks it for you if it needs a product choice.
4. **A cook takes it** in its own worktree on a branch `cook/<n>-github`, reads the Sentry error in the issue body and implements a fix; the kitchen opens its pull request. The card goes from **Cooking** to **Pass**.
5. **The pass judges it**: it waits for the CI, then reviews the diff. A red CI or a refused review sends it back to a cook, with the reason on the issue.
6. **The ticket is fixed**: a green delivery is merged by the kitchen, the issue closed, the card is in **Served**.

A ticket refused three times waits for you in **Parked**, counted in **TODO**.

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

Some fixes should never land on their own: a **migration**, **security**, a **payment** or the **deletion of user data**. Declare the paths of that code as risk zones in `.brigade/kitchen.json` on the default branch, for example `{"risk": ["db/migrations/", "app/billing/"]}`.

A fix that touches a risk zone goes through the kitchen as any other: a cook fixes it and the pass judges it. But the kitchen does not merge it. Approved, it waits in **Parked** (labels `parked:chef` and `approved`), counted in **TODO**: answer `merge` on the ticket, or merge the pull request yourself.

The zone is read from the pull request's files, not from Sentry: a fix in sensitive code is held whatever rule opened its issue.

*Placeholder: a human fills this in after a real run of this guide. It has not been run yet; the Sentry screens are written from Sentry's documentation, so if one differs, trust the screen.*

Tested on: <project>, <date>
