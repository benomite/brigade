# Risk levels: which actions wait for the chef

Rule 10 of the [simplified process](../superpowers/specs/2026-11-24-simplified-process.md): risk decides where the
chef's opinion is required. Publishing, paying or writing to a client must always reach the chef; fixing a typo never
should. Each project ranks its kinds of action in its project sheet (#4230). The code is in `runtime/src/risque/`.

## The ranks

Each kind of action has one rank:

- `chef`: the chef must answer before the action runs;
- `safe`: no chef needed.

## The kinds and their defaults

| Kind | What it does | Default rank |
|---|---|---|
| `publish` | publish | `chef` |
| `pay` | pay | `chef` |
| `write-to-client` | write to a client | `chef` |
| `fix-typo` | fix a typo | `safe` |

Any other kind, one the project sheet does not rank, is `chef`.

A ticket says its kinds of action with `kind:<kind>` labels, for example `kind:publish`. A ticket with several kinds is
`chef` as soon as one of them is. A ticket with no `kind:` label is not ranked: the pass merges it as before, by its
level alone.

## Where the chef changes a rank

In the project sheet, `.claude/brigade/projet.json`, the `risks` field: one entry per kind, `chef` or `safe`. Only the
kinds it names change; the others keep their default.

```json
{
  "version": 1,
  "integrationBranch": "main",
  "risks": { "fix-typo": "chef", "rename-a-file": "safe" }
}
```

Like every project setting ([`../reglages.md`](../reglages.md)), it changes by a pull request. The pass reads it on the
integration branch, as last fetched, at each merge: a rank merged applies from the next ticket, with no other edit and
no restart. A rank other than `chef` or `safe`, or a kind that is not lowercase letters, digits and dashes, is
refused, as for any invalid setting.

## At the pass

The merge of a green delivery is the pass's action, and it goes through the gate of the pass's autonomy level
([`autonomie.md`](autonomie.md)):

- ranked `chef`: the merge is parked for the chef, even when the pass is on `act`. The held gesture says what it will
  do — `merge PR #12 of #34, which will publish: <the ticket's title>` — and why it waits. Nothing is merged until the
  chef answers with `npm --prefix runtime run manager -- approve <id>`; the runtime then merges it at its next tick, and
  the ticket is served as any merged delivery;
- ranked `safe`: the merge never reaches the chef through its rank. It goes through the pass's level as before;
- the pass on `observe` never merges, whatever the rank.

A project sheet that cannot be read parks the merge for the chef, with the reason: no rank is guessed in its place. A
station with no gate (no state directory) has nowhere to park: it does not merge a delivery ranked `chef`, and says so
in its log.
