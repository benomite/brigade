# Contributing to brigade

The code, the docs and the issues are in English; [`docs/glossary.md`](docs/glossary.md) gives the word for each object (ticket, cook, kitchen, pass, log…). Please use those words.

## Report a problem

Open an issue with the [bug report form](.github/ISSUE_TEMPLATE/bug_report.yml). Before that, check the [install guide](docs/installer.md) (the Mac app has its own, [`docs/tutoriels/installer-sur-mac.md`](docs/tutoriels/installer-sur-mac.md)): most first-run problems are a missing prerequisite.

## Propose a change

- A new idea: open an issue with the [feature request form](.github/ISSUE_TEMPLATE/feature_request.yml) and wait for feedback before writing a lot of code.
- A small fix (typo, doc, obvious bug): a pull request directly is fine.

The integration branch is `main`. [`CLAUDE.md`](CLAUDE.md) gives the zones of the repo: a change belongs to one zone and should not write in another.

## Run the tests locally

Node 26 is required. No build step.

```bash
npm --prefix runtime ci            # dev dependencies, needed for the type check
npm --prefix runtime test
npm --prefix runtime run typecheck

npm --prefix app ci                # without the Electron binary
npm --prefix app test
npm --prefix app run typecheck
```

Tests use a fake `claude` and no network, so they cost no quota. Do not start the runtime or the app casually: started for real, they launch real cooks. Details: [`docs/runtime/README.md`](docs/runtime/README.md) and [`docs/app.md`](docs/app.md).

## What a pull request looks like

- Targets `main`, does one thing, and links its issue (`Closes #123`).
- Includes tests for the behavior it changes; tests never depend on timing.
- Updates the doc under `docs/` when it changes a behavior; a change to `commands/` is carried into `codex/skills/`.
- Has green CI (the `tests` check) and a description saying what changed, why, and how you verified it.
