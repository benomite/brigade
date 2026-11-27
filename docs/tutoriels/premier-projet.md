# Tutorial: add a first project and cook its first ticket

From an installed app to a merged pull request: you add a project, tell the second what to change first, watch a cook work it, review at the pass, and merge.

> **Status: not yet checked on the real app.** Screens, labels and results are written from the documentation and source, not from a recorded run. If a step does not match, trust the screen and report it as an issue on [benomite/brigade](https://github.com/benomite/brigade).

Words (*rail*, *cook*, *pass*, *served*…) are those of [`docs/glossary.md`](../glossary.md).

## Before you start

- The app is installed and you are signed in to GitHub and Claude ([`docs/installation.md`](../installation.md)). Cooks run on your Claude Max quota.
- A GitHub repository you can push to. **Use a throwaway one**: an empty `<you>/brigade-tryout` with a `README.md`. Cooks push branches there and the pass merges there.

## 1. Add the project

On the first-run screen, type the repository as `owner/repo` and click **open this project**. You type no GitHub login: the app reads your account from `gh`, which you signed in to at installation.

**You see**: the repository cloned, and the project's page, which asks one question at a time under a line saying where you are (`1 of 2: who cooks it`, `2 of 2: its setup for Brigade`).

## 2. Choose the station and start the kitchen

The first question is `Who cooks <owner/repo>?`. Pick **this computer** (listed first, and recommended when no server of yours is online), keep the presets, and click **Start the kitchen on this computer**.

**You see**: the question answered, and the page moving on to `2 of 2: its setup for Brigade`.

## 3. The setup pull request comes first

Before your own ticket, a repository must be set up for brigade: its bindings and its labels, among them `fire`. Brigade does it itself, with a pull request of its own, `Merge the setup pull request`. The page says at each moment what is awaited and from whom: the second reads your repository (`Nothing is awaited from you yet`), and may ask you a question in its column on the right. Then it says `The setup pull request is waiting for your merge`: open its card (**open its card**, red on the rail, counted in **TODO**) and merge it. Only you merge it: it sets what will judge every future delivery.

**You see**: the page say the project is ready, the **Rail** taking its place, and the project's **project** switch reading `project on` (green).

## 4. Open your own ticket

1. In the app, the second asks what you want to change first. Tell it, for example: `Create a CONTRIBUTING.md with a three-line "how to propose a change" section.`
2. The second writes the issue on the throwaway repository and shows it to you.
3. Say yes: the ticket goes on the rail.

**You see**: the ticket as a card in **On the rail**.

**Alternative, on GitHub**: open an issue on the throwaway repository, for example titled `Add a CONTRIBUTING.md`, with the same body, and add the label **`fire`**, which puts it on the rail. The setup already created that label: nothing else has to be set on the issue.

## 5. Watch the cook work

The card moves to **Taken**, with the cook's name. **Cooks** shows the station's state and the ticket in flight; a click on its card opens its sheet. The cook works in its own worktree, pushes a branch and opens a pull request.

**You see**: the card go from **Taken** to **Pass** once the pull request is open.

## 6. Review at the pass

The pass runs the gates and the review on the pull request and writes its verdict on the issue. Open the pull request from the **Pass** card to read the diff and the verdict.

**Do not merge by hand unless the pass stops.** A green delivery, with its verdict approved and its CI green, is merged by the pass itself (`docs/runtime/README.md`).

A delivery waits for you, in **TODO** with the buttons `send back to the kitchen` and `remove from the rail`, only when:

- the pass escalates it (a verdict it cannot settle alone);
- the project switch is off (`project off`). Switch it back on and waiting deliveries are merged.

## 7. The PR is merged

For a green delivery the pass merges. Otherwise merge the pull request on GitHub yourself.

**You see**: the card in **Served**; on GitHub, the pull request merged and the issue closed.

## What you get

- A merged pull request on your throwaway repository, with the cook's `CONTRIBUTING.md`.
- The ticket closed, with the pass's verdict and the merge written on it.
- In the app: the card in **Served**, counted in `served 24 h` on the project's tile; the project's Settings page keeps the log.

Further: [`docs/app.md`](../app.md) for every screen, [`docs/runtime/`](../runtime/README.md) for the runtime.
