## Looking at an interface delivery

**The box serves no page** (#1844): brigade needs only a GitHub account and a Claude account (#1837),
and a page on the box's loopback is reachable only through `ssh`. Nothing replaces it.

- **A cook's worktree is tidied away as soon as its end is told.** `station` and `status` have no
  `servers`, `to launch` or `service` section, and the runtime ignores `.claude/brigade/service`. Old
  `service.*` events stay in the log, unread.
- **What a cook is doing, and its PR**, are read on GitHub: the ticket's `taken` or `in-pass` label, its
  claim comment and its PR ([`github-seul.md`](github-seul.md)).
- **The screen** is looked at in the before and after captures the cook delivers in its branch and the
  pass links (`captures.ts`); the built app is tried once the PR is merged.
- **The verdict is said on the ticket's issue.**
