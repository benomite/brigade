# Risk levels

Rule 10 of the [simplified process](../superpowers/specs/2026-11-24-simplified-process.md): risk decides where the
chef's opinion is required. Publishing, paying or writing to a client always reach the chef; fixing a typo never does.
Ticket #4230. Code: `runtime/src/risque/risque.ts`.

## The ranking

Each kind of action has a rank:

- `chef`: the chef must answer before the action runs;
- `safe`: the action runs, and never reaches the chef.

| Kind | Default rank |
|---|---|
| `publish` | `chef` |
| `pay` | `chef` |
| `write-to-client` | `chef` |
| `fix-typo` | `safe` |
| any other kind | `chef` |

A kind the project sheet does not rank takes its default. A kind with no default is `chef`.

## Where the chef changes a rank

In the project sheet, `.claude/brigade/projet.json` of the project's repository, and only there: the field `risk`, kind
-> rank.

```json
{
  "risk": {
    "publish": "safe",
    "fix-typo": "chef"
  }
}
```

`risk` is one of the project's settings ([`../reglages.md`](../reglages.md)): a rank that is neither `chef` nor `safe`
is refused, like any invalid setting.

The pass reads the sheet as the integration branch holds it, like the station's other settings, again each time a
ticket's merge reaches it: a rank changed in the sheet on the integration branch applies from the next ticket, with no
other edit and no restart. While the sheet cannot be read, the merge of a ticket that has a kind is parked for the
chef, and the parked item says why.

## At the pass

A ticket says the kind of its action by a label `action:<kind>` (for example `action:publish`). A ticket with no such
label is merged as before.

When the pass merges the green delivery of a ticket that has a kind:

- ranked `safe`: the merge goes through the pass's level, as before ([autonomie.md](autonomie.md)), and nothing is
  parked for the chef;
- ranked `chef`: the merge is parked for the chef, whatever the pass's level, with a plain statement of what it will do
  (« #12 will publish by merging PR #34 (`abc1234`) — its kind `publish` is ranked 'chef' in the project sheet: it
  waits for the chef's answer »). It does not run until the chef answers.

The parked merge is a held gesture of the `pass` at the gate of the agents' gestures: `npm --prefix runtime run manager`
lists it under `held gestures`, and the chef answers with `npm --prefix runtime run manager -- approve <id>`. The
running runtime then merges it at its next tick. That answer is the only one the merge needs: it does not go through
the pass's level again, so on `propose` too the chef answers once. A merge that GitHub refuses after the chef's answer
(a conflict, a moved head) is said on the station's log.

The observe / propose / act levels keep working: with the pass on `observe`, a merge ranked `chef` is only logged, as
`not done`, and never parked nor merged.
