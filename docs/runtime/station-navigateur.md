## Looking at an interface delivery

Until #1844, the box served an interface delivery from its cook's worktree — the command the
project declared in `.claude/brigade/service`, on the worktree's port — and the app opened that page
through an `ssh` port forwarding. **The box serves no page any more**: brigade needs only a GitHub
account and a Claude account (#1837), and a page on the box's loopback is reachable only through
`ssh`. Nothing replaces it.

- **A cook's worktree is tidied away as soon as its end is told**, whatever its delivery touches.
  `station` and `status` have no `servers`, `to launch` or `service` section any more, and the
  runtime reads no `.claude/brigade/service` — a project that still carries one loses nothing, the
  file is simply ignored.
- **What a cook is doing, and its PR**, are published in the Kitchen board for an app that has only
  GitHub: its `activites` ([`tableau-de-cuisine.md`](tableau-de-cuisine.md)).
- **The screen of an interface delivery** is looked at in its captures, before and after, which the
  cook delivers in its branch and the pass links (`captures.ts`); the built app is tried once the PR
  is merged.
- **The verdict is said on the ticket's issue**, as before.

A log written before #1844 still holds `service.*` events (`service.started`, `service.listening`,
`service.stopped`, …): nothing reads them any more, `log` shows them as they are.
