# Switching the default branch from `main` (V1) to `v2`

`main` still publishes the V1 plugin; the product lives on `v2`. The chef runs this once to make `v2` the repository's `main` while keeping V1 reachable. The repo side is delivered (#1538); the rest is repository-settings work. Run it from a clone of `benomite/brigade` with `gh` logged in as the owner, with no PR mid-merge and the kitchen stopped.

## What the repo already carries

- `tests.yml`, `publier-app.yml` and `publier-station.yml` trigger on `push` to `main` **and** `v2`, so they work on either side.
- `.claude-plugin/marketplace.json` lists no plugin (the default branch no longer publishes V1); `plugin.json` stays, the gates and worktree setup read it.

## 1. Check the starting point

```bash
git fetch origin --tags
gh pr list --repo benomite/brigade --state open --json number,baseRefName
```

Merge or close what you do not want retargeted: open PRs based on `v2` follow the rename (step 4).

## 2. Tag the current `main` as `v1-final`

```bash
git tag -a v1-final origin/main -m "Brigade V1 plugin, last state of main before the switch"
git push origin v1-final
```

A V1 user installs from this tag: `/plugin marketplace add benomite/brigade@v1-final`, then `/plugin install brigade@brigade`.

## 3. Make `v2` the default branch, then remove the old `main`

GitHub refuses to delete the default branch, so `v2` becomes the default first.

```bash
gh repo edit benomite/brigade --default-branch v2
git push origin --delete main          # V1 stays reachable through v1-final
```

If `main` is protected, lift it first (Settings → Branches).

## 4. Rename `v2` to `main`

```bash
gh api -X POST repos/benomite/brigade/branches/v2/rename -f new_name=main
```

GitHub moves the default branch, retargets the open PRs and redirects the old `v2` URLs. Re-apply `v2`'s protection on `main`, if any.

## 5. Point the local clones and the kitchen at `main`

```bash
git fetch origin --prune
git branch -m v2 main
git branch -u origin/main main
git remote set-head origin -a
```

- `CLAUDE.md`: set **Branche d'intégration** to `main`; the gates and CI read their base from it.
- Every station and workstation: set `BRIGADE_BASE_BRANCH=main` (see `exploitation.md`) and restart the runtime.
- `scripts/README.md` still describes the `main`/`v2` release path: update it afterwards.

## 6. Check the result

- [ ] `git ls-remote --heads origin` lists `main`, no `v2`; the tag `v1-final` is there.
- [ ] The repository page opens on `main`.
- [ ] `/plugin marketplace add benomite/brigade@v1-final` installs V1; without `@v1-final` it offers no plugin.
- [ ] The next push to `main` starts `tests`; a PR formerly based on `v2` shows `main` as its base.
- [ ] `npm --prefix runtime run base` reads `main` and the gates are green.
