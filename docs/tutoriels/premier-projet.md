# Tutorial: add a first project and cook its first ticket

From an installed app to a merged pull request: you add a project, open a ticket as a GitHub issue, watch a cook work it, review at the pass, and merge.

> **Status: not yet checked on the real app.** Screens, labels and results are written from the documentation and source, not from a recorded run. If a step does not match, trust the screen and report it as an issue on [benomite/brigade](https://github.com/benomite/brigade).

Words (*rail*, *cook*, *pass*, *served*…) are those of [`docs/glossary.md`](../glossary.md).

## Before you start

- The app is installed and you are signed in to GitHub and Claude ([`docs/installation.md`](../installation.md)). Cooks run on your Claude Max quota.
- A GitHub repository you can push to. **Use a throwaway one**: an empty `<you>/brigade-tryout` with a `README.md`. Cooks push branches there and the pass merges there.

## 1. Add the project

On the first-run screen, type your GitHub login and the repository as `owner/repo`, and click **open this project**.

**You see**: the repository cloned, the project in the icon bar, and its space with two tabs, **Rail** and **Cooks**, and the terminal of the second on the right.

## 2. Start the kitchen

Click **choose its machine**, keep the presets, and click **Start the kitchen**. Four steps (`done`, `now`, `to come`) show the station preparing the repository with a ticket of its own.

**You see**: every step ticked, the **Rail** tab with its columns, and the **project** switch reading `project on` (green): a project added from the app starts on.

## 3. Open the ticket

1. On the throwaway repository, open an issue, for example titled `Add a CONTRIBUTING.md`, body `Create a CONTRIBUTING.md with a three-line "how to propose a change" section.`
2. Add the label **`fire`**, which puts a ticket on the rail. For a quick run, add `model:haiku` and `effort:low` too. Create the labels first if they do not exist.

**You see**: the ticket as a card in **On the rail**.

## 4. Watch the cook work

The card moves to **Taken**, with the cook's name. **Cooks** shows the station's state and the ticket in flight; a click on its card opens its sheet. The cook works in its own worktree, pushes a branch and opens a pull request.

**You see**: the card go from **Taken** to **Pass** once the pull request is open.

## 5. Review at the pass

The pass runs the gates and the review on the pull request and writes its verdict on the issue. Open the pull request from the **Pass** card to read the diff and the verdict.

**Do not merge by hand unless the pass stops.** The project switch being on enables the `merge` grant (`docs/runtime/exploitation.md`, "The project switch"), so a green delivery is merged by the pass itself.

A delivery waits for you, in **TODO** with the buttons `send back to the kitchen` and `remove from the rail`, only when:

- the pass escalates it (a verdict it cannot settle alone);
- the project switch is off (`project off`) or you revoked the grant. Switch it back on and waiting deliveries are merged.

## 6. The PR is merged

For a green delivery the pass merges. Otherwise merge the pull request on GitHub yourself.

**You see**: the card in **Served**; on GitHub, the pull request merged and the issue closed.

## What you get

- A merged pull request on your throwaway repository, with the cook's `CONTRIBUTING.md`.
- The ticket closed, with the pass's verdict and the merge written on it.
- In the app: the card in **Served**, counted in `served 24 h` on the project's tile; the project's Settings page keeps the log.

Further: [`docs/app.md`](../app.md) for every screen, [`docs/runtime/`](../runtime/README.md) for the runtime.
