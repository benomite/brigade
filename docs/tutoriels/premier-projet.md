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

The first question is `Who cooks <owner/repo>?`. Pick **this computer** (listed first, and recommended when no server of yours is online), keep the presets, and confirm.

**You see**: the question answered, and the page moving on to `2 of 2: its setup for Brigade`.

## 3. The setup pull request comes first

Before your own ticket, a repository must be set up for brigade: its bindings and its labels, among them `fire`. Brigade does it itself, with a pull request of its own, `Merge the setup pull request`. The page says at each moment what is awaited and from whom: the second reads your repository (`Nothing is awaited from you yet`), and may ask you a question in its column on the right. Then it says `The setup pull request is waiting for your merge`: open its card (**open its card**, red on the rail, counted in **TODO**) and merge it. Only you merge it: it sets what will judge every future delivery.

**You see**: the page say the project is ready, and the **Rail** taking its place: the project's board, in six columns (**Backlog**, **Ready**, **Cooking**, **Pass**, **Parked**, **Served**).

## 4. Open your own ticket

1. In the app, the second asks what you want to change first. Tell it, for example: `Create a CONTRIBUTING.md with a three-line "how to propose a change" section.`
2. The second writes the issue on the throwaway repository and shows it to you.
3. Say yes: the ticket goes on the rail.

**You see**: the ticket as a card in **Backlog**, then in **Ready** once the manager has calibrated it (labels `fire`, `model:`, `effort:`).

**Alternative, on GitHub**: open an issue on the throwaway repository, for example titled `Add a CONTRIBUTING.md`, with the same body, and add the label **`fire`**, which puts it straight in **Ready**. The setup already created that label: nothing else has to be set on the issue.

## 5. Watch the cook work

The card moves to **Cooking** (label `taken`). The **Agents** tab shows the cook at work. The cook works in its own worktree, on a branch `cook/<n>-github`; the kitchen pushes it and opens a pull request.

**You see**: the card go from **Cooking** to **Pass** once the pull request is open.

## 6. Review at the pass

The pass waits for the pull request's CI, then reviews the diff. A red CI, a conflict or a refused review sends the ticket back to a cook, with the reason in a comment on the issue. Open the pull request from the **Pass** card to read the diff.

**Do not merge by hand.** A delivery whose CI is green and whose verdict is `merge` is merged by the kitchen itself.

A ticket waits for you, in **Parked** and counted in **TODO**, only when:

- it was refused three times (`try:3`);
- the manager needs a product or design choice from you;
- its pull request touches a risk zone the project declares in `.brigade/kitchen.json`: approved by the pass, it waits for your merge.

## 7. The PR is merged

For a green delivery the kitchen merges. For a delivery parked in a risk zone, answer `merge` on the ticket, or merge the pull request on GitHub yourself.

**You see**: the card in **Served**; on GitHub, the pull request merged and the issue closed.

## What you get

- A merged pull request on your throwaway repository, with the cook's `CONTRIBUTING.md`.
- The ticket closed by the merge of its pull request.
- In the app: the card in **Served**.

Further: [`docs/app.md`](../app.md) for every screen.
