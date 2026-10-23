# Switching the default branch from `main` (V1) to `v2`

`main` still publishes the V1 plugin; the product lives on `v2`. This page is the procedure the chef runs, once, to make `v2` the repository's `main` while keeping V1 reachable. Everything the repo needed is already delivered (#1538); what is left is repository-settings work, which only the chef can do.

Run it from a clone of `benomite/brigade` with `gh` logged in as the owner. Do it when no PR is mid-merge and the kitchen is stopped.

## What the repo already carries

- `tests.yml`, `publier-app.yml` and `publier-station.yml` trigger on `push` to `main` **and** `v2` (and `tests.yml` on pull requests to both), so they work on either side of the switch. Once `v2` is gone, `v2` in those lists is a dead entry that may be dropped.
- `publier-app.yml` publishes from the branch it runs on (`main` or `v2`), and its secrets link follows that branch.
- The other workflows (`android.yml`, `app-windows.yml`, `runtime-windows.yml`) run on pull requests, whatever the base: nothing to change.
- `.claude-plugin/marketplace.json` lists no plugin any more: the default branch no longer publishes V1. `plugin.json` stays, because the gates and the worktree setup read it.

## 1. Check the starting point

```bash
git fetch origin --tags
git rev-parse origin/main origin/v2
gh repo view benomite/brigade --json defaultBranchRef -q .defaultBranchRef.name   # main
gh pr list --repo benomite/brigade --state open --json number,baseRefName
```

Merge or close what you do not want retargeted: open PRs based on `v2` follow the rename in step 4.

## 2. Tag the current `main` as `v1-final`

```bash
git tag -a v1-final origin/main -m "Brigade V1 plugin, last state of main before the switch"
git push origin v1-final
gh api repos/benomite/brigade/git/ref/tags/v1-final -q .object.sha   # same sha as origin/main
```

A V1 user installs the plugin from this tag:

```text
/plugin marketplace add benomite/brigade@v1-final
/plugin install brigade@brigade
```

## 3. Make `v2` the default branch, then remove the old `main`

GitHub refuses to delete the default branch, so `v2` becomes the default first. No force push is needed.

```bash
gh repo edit benomite/brigade --default-branch v2
git push origin --delete main          # V1 stays reachable through v1-final
```

If `main` is protected, lift its protection in Settings → Branches first.

## 4. Rename `v2` to `main`

```bash
gh api -X POST repos/benomite/brigade/branches/v2/rename -f new_name=main
gh repo view benomite/brigade --json defaultBranchRef -q .defaultBranchRef.name   # main
```

GitHub moves the default branch, retargets the open PRs and redirects the old `v2` URLs. Re-apply on `main` the protection that `v2` had, if any.

## 5. Point the local clones and the kitchen at `main`

```bash
git fetch origin --prune
git branch -m v2 main
git branch -u origin/main main
git remote set-head origin -a
```

Then, in the repo:

- `CLAUDE.md`: set the binding **Branche d'intégration** to `main`. The gates and CI read their base from it.
- Every station and workstation: set `BRIGADE_BASE_BRANCH=main` (see `exploitation.md`) and restart the runtime.
- `scripts/README.md` still describes the release path between `main` and `v2`: update it in a follow-up once the switch is done.

## 6. Check the result

```bash
git ls-remote --heads origin           # main, no v2
git ls-remote --tags origin v1-final   # the tag is there
gh repo view benomite/brigade --json defaultBranchRef -q .defaultBranchRef.name   # main
gh workflow list --repo benomite/brigade
gh run list --repo benomite/brigade --branch main --limit 5
```

Check list:

- [ ] The repository page opens on `main`, and shows the V2 `README.md` with `runtime/` and `app/` (not the V1 plugin README).
- [ ] The branch selector lists `main` and no `v2`; the tag selector lists `v1-final`.
- [ ] `/plugin marketplace add benomite/brigade@v1-final` installs the V1 plugin; `/plugin marketplace add benomite/brigade` offers no plugin.
- [ ] The next push to `main` starts the `tests` workflow (and `publier-app` / `publier-station` when it touches the app or the runtime); an open PR is checked by `tests` with `main` as base.
- [ ] An open PR formerly based on `v2` now shows `main` as its base.
- [ ] The kitchen's `npm --prefix runtime run base` reads `main` and its gates are green.
