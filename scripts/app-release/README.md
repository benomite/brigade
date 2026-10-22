# scripts/app-release — does this merge publish a new app version?

`decider.ts` takes the files a merge changed and the existing app tags, and says whether the app changed and which `app-v<version>` tag the merge publishes.

```
git diff --name-only <before> <after> | node scripts/app-release/decider.ts --tag app-v1.2.3 --tag app-v1.2.2
```

Output (lines a workflow can append to `$GITHUB_OUTPUT`):

```
changed=true
tag=app-v1.2.4
```

or just `changed=false`.

**The rule.** The app changed when at least one changed file is under `app/` and not under `app/test/`. `runtime/`, `docs/`, `evals/`, `scripts/` and `app/test/` alone do not count.

**The version.** The patch number of the highest `app-v<major>.<minor>.<patch>` tag, plus one. The format and the comparison are the app's own update check (`app/src/mise-a-jour/flux.ts`, imported by the script and its tests). With no such tag, the starting version is `1.0.0` (`VERSION_DE_DEPART`). Minor and major bumps are made by pushing the tag by hand.

**Tests.** `npm --prefix scripts/app-release test` (Node 26, nothing to install).
