# Contributing to brigade

Thanks for your interest. The code, the docs and the issues are in English; [`docs/glossary.md`](docs/glossary.md) gives the word for each object of the product (ticket, cook, kitchen, pass, log…). Please use those words.

## Report a problem

Open an issue with the [bug report form](.github/ISSUE_TEMPLATE/bug_report.yml). It asks for your operating system, the brigade version, and what you expected versus what happened. Before that, check the [install guide](docs/installer.md) (the Mac app has its own, [`docs/tutoriels/installer-sur-mac.md`](docs/tutoriels/installer-sur-mac.md)): most first-run problems are a missing prerequisite.

## Propose a change

- A new idea: open an issue with the [feature request form](.github/ISSUE_TEMPLATE/feature_request.yml) and wait for feedback before writing a lot of code.
- A small fix (typo, doc, obvious bug): a pull request directly is fine.

The repository's integration branch is `v2`. Read [`CLAUDE.md`](CLAUDE.md) for the zones of the repo (`runtime/`, `app/`, the V1 plugin, `docs/`): a change belongs to one zone and should not write in another.

## Run the tests locally

Node 26 is required for the runtime. No build step.

```bash
npm --prefix runtime ci            # dev dependencies, needed for the type check
npm --prefix runtime test          # runtime tests
npm --prefix runtime run typecheck

npm --prefix app ci                # without the Electron binary: no test launches it
npm --prefix app test              # app tests
npm --prefix app run typecheck
```

Tests use a fake `claude` and no network, so they cost no quota. Do not start the runtime (`npm --prefix runtime start`) or the app (`npm --prefix app start`) casually: started for real, they launch real cooks. The details are in [`docs/runtime/README.md`](docs/runtime/README.md) and [`docs/app.md`](docs/app.md).

## What a pull request looks like

- Targets `v2`, from a branch of your own.
- Does one thing, and links the issue it serves (`Closes #123`).
- Includes tests for the behavior it changes; tests never depend on timing.
- Updates the doc under `docs/` when it changes a behavior. A change to a role in `commands/` is carried into its mirror under `codex/skills/`.
- Has green CI (the `tests` check).
- Has a description saying what changed and why, and how you verified it.
