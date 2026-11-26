# restitution-des-essais

One-time tool (#4321, epic #4319). It gives back the tries that the Mac station `macbook-air-de-benoit/claude` took from tickets when its fetch failed on the missing branch `v2`, and puts those tickets back on the rail.

It finds the `brigade:echec` comments (one comment is one try) written by that station with the reason `couldn't find remote ref refs/heads/v2` between 17:00 and 19:40 UTC on 2026-11-25, on the open tickets carrying `set-aside:failures` and on the issue numbers given. It deletes those comments, so the tries lost to any other cause stay. Then, on a ticket set aside by its failures, it removes `set-aside:failures` and adds `fire`.

Dry run (default): prints, for each ticket, its number, its current tries, the tries after the restore and the label change, then the number of GitHub writes it would make. It writes nothing.

```
node scripts/restitution-des-essais/restituer.ts [--repo benomite/brigade] [issue number ...]
```

Apply: same output, and the writes are made. The text of each deleted comment is printed, since a delete cannot be undone.

```
node scripts/restitution-des-essais/restituer.ts --apply [--repo benomite/brigade] [issue number ...]
```

Running `--apply` twice gives the result of running it once: the second run finds nothing and makes 0 writes.

Tests: `npm --prefix scripts/restitution-des-essais test`.
