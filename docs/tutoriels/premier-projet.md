# Tutorial: add a first project and cook its first ticket

You have just installed brigade V2. This guide takes you from an empty app to a merged pull
request: you add one project, open one ticket as a GitHub issue, watch a cook work it, review
what it delivers at the pass, and merge.

> **Status: not yet checked on the real app.** The screens, button labels and results below are
> written from the app and runtime documentation and source, not from a recorded run on a clean
> machine with a throwaway repository. It is published now so that you have a guide right away,
> but some labels or delays may be wrong. If a step does not match what you see, trust the screen
> and the linked reference pages, and report the difference as an issue on
> [benomite/brigade](https://github.com/benomite/brigade).

Brigade lives in [benomite/brigade](https://github.com/benomite/brigade). Words such as *rail*,
*cook*, *pass*, *served* and *merge* are the ones of [`docs/glossary.md`](../glossary.md).

## Before you start

- The app is installed and opens on your computer, and `gh` is signed in to your GitHub
  account (`gh auth status`).
- A **box** (or station) is installed and prepared: see [`docs/installer.md`](../installer.md)
  and [`docs/installation-mac.md`](../installation-mac.md). The box runs the cooks on your
  Claude Max quota.
- A GitHub repository you administer. **For a first run, use a throwaway repository**: create an
  empty one (for example `<you>/brigade-tryout`) with a `README.md` on its default branch. Cooks
  push branches to it and the pass merges there.

## 1. Add the project

1. Open the app. On a first launch it opens on your paired stations and the projects each
   carries; click the **+** at the foot of the icon bar, or `add a project from a folder
   instead`. **Add a project** opens.
2. Fill the single screen:
   - **Folder**: `Choose…` and pick a local clone of the throwaway repository.
   - **Name**: proposed from the folder; keep it.
   - **GitHub repository**: `<owner>/<name>`, proposed from the folder's `origin`; correct it if
     it is wrong.
   - **Box**: the one you declared (already chosen if there is only one).
   - **Manager and reviewer calibration**: a model and an effort for each, proposed with their
     origin. Keep them for a first run.
   - **Backups**: a directory on the box, proposed as `<root>/<name>`.
3. Click `Install on the box, and add`.

**You see**: the box cloning and setting up the project, then the offer `Open the space of
“<name>” — its installation goes on there`. Click it. The project appears in the icon bar and
its space opens, with two tabs, **Rail** and **Cooks**, and the terminal of the second on the
right.

## 2. Finish the guided installation

Open **Settings**. The installation lists its seven steps, all shown before the first action;
the current one is marked `← now`. Play them in order:

1. **Add the project on the box**: done as soon as the box answers.
2. **Bootstrap the repository**: click `Run /brigade:init in the second`, type the command in
   the terminal that opens, then merge the pull request it opens on GitHub. Back in the app,
   click `The result of /brigade:init is merged onto the integration branch`.
3. **Verify the box**: `Verify` shows everything that is missing, word for word. Fix what it
   names, then verify again until nothing is missing.
4. **Declare the stations**: give each station a number of cooks, then `Declare the stations`.
5. **Protect the integration branch**: `Protect the integration branch`.
6. **Settle the decisions the start requires**: answer each question (a recommendation is
   shown), or skip the optional ones.
7. **Start the kitchen**: click `Start`. The app writes the service start into a shell without
   sending it: press Enter, and type your `sudo` password if the box asks.

**You see**: every step ticked. The **Rail** tab opens with its columns, and the **project**
switch at the head of the space reads `project on` (green): a project added from the app starts
on.

## 3. Open the ticket

1. On your throwaway repository, open a new issue with something small, for example the title
   `Add a CONTRIBUTING.md` and the body `Create a CONTRIBUTING.md with a three-line "how to
   propose a change" section.`
2. Put the label **`fire`** on it. `fire` is what puts a ticket on the rail. For a quick first
   run, also add `model:haiku` and `effort:low`.

If the labels do not exist in the repository, create them first (the guided installation or
`brigade <project> installation labels` does it).

**You see**: shortly after, in the app's **Rail** tab, the ticket as a card in **On the rail**.

## 4. Watch the cook work

1. The station takes the ticket: its card moves to **Taken**, with the cook's name and the time
   since it was taken.
2. Open **Cooks**. The station's block shows its state and the card of the ticket in flight; a
   click on the card opens its sheet.
3. Wait. The cook works in its own worktree, pushes a branch and opens a pull request.

**You see**: the card leave **Taken** for **Pass** once the pull request is open.

## 5. Review at the pass

The pass checks the delivery: it runs the gates and the review on the pull request, and writes
its verdict on the issue. Open the **Pass** card's pull request (its number opens it on GitHub)
to read the diff and the verdict.

**Do not wait for a button, and do not merge by hand, unless the pass stops.** A project added
from the app starts with the project switch on, and switching it on enables the `merge` grant
(`docs/runtime/exploitation.md`, "The project switch"). A green delivery is therefore merged by
the pass itself: you have nothing to click.

A delivery waits for you only in two cases, and then it shows in **TODO** with its decision as
buttons, `merge the PR` (recommended), `send back to the kitchen` and `remove from the rail`:

- the pass escalates it (a verdict it cannot settle alone);
- the project switch is off (`project off` at the head of the space), or you revoked the grant.
  Switch the project back on and the waiting deliveries are merged.

## 6. The PR is merged

For a green delivery, the pass merges the pull request. In the other case, click `merge the PR`
on the **TODO** line: the app posts the gesture, the box plays it at its next tick and answers
under it.

The card leaves **Pass** (or **TODO**) for **Served**; on GitHub, the pull request is merged
and the issue closed.

## What you get at the end

- **A merged pull request** on the integration branch of your throwaway repository, with the
  cook's commit and its `CONTRIBUTING.md`.
- **The ticket closed** on GitHub, with the pass's verdict and the merge written on it.
- **In the app**: the card is in the **Served** column of **Rail**, and counted in `served 24 h`
  on the project's tile and in the tickets table of **Cooks**. The Settings page of the project
  keeps the log of what happened.

To go further: [`docs/app.md`](../app.md) for every screen, [`docs/installer.md`](../installer.md)
for the install, [`docs/runtime/`](../runtime/README.md) for what the runtime does, and
[benomite/brigade](https://github.com/benomite/brigade) for the code.
