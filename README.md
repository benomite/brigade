<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/brigade-logo-sombre.svg">
    <img src="docs/logo/brigade-logo-clair.svg" alt="" height="40" align="absmiddle">
  </picture>
  brigade — a team of AI agents that works your GitHub tickets
</h1>

You write a ticket and put the label `fire` on it. A **cook** (a `claude` session) takes it in its own git worktree, implements it and opens a pull request. The **pass** judges that pull request — gates, CI, an independent review — and merges it. You decide what matters; brigade does the cooking.

![The brigade app: your stations, and the cooks working on them](docs/captures/1598/accueil-stations-apres.png)

A desktop app shows all of it: your projects, the **rail** of tickets (queued, taken, in the pass, served), the cooks in flight, and a terminal where **the second** — your product assistant — helps you write and prioritize tickets. Everything the system knows lives in durable artifacts (issues, labels, branches, pull requests, a local journal), never in a session's memory: if a cook dies, the committed work survives and the next one picks up from there.

## Try it

You need two accounts:

- a **GitHub account**, with a repository you can push to (a throwaway one is fine for a first run);
- a **Claude account**: the cooks run on a Claude Max session, and an API key does not fit.

From download to a first pull request:

1. **Download the app** (macOS, Apple silicon, or Windows x64) from the **[releases page](https://github.com/benomite/brigade/releases)** and open it.
2. **Sign in with GitHub**: on its first screen, the app offers a button that opens the GitHub page and shows you a code to type there.
3. **Sign in with Claude**: if the app says the Claude connection is missing, click its **log in** button and sign in with your Max account in the browser.
4. **Pick your repository**: type it as `owner/repo` and click **open this project**. The app clones it, prepares it with a ticket of its own, and tells you when it is ready.
5. **Cook a first ticket**: on GitHub, open an issue in that repository and put the label `fire` on it. A cook takes it, opens a pull request, and the pass judges it and merges it.

The app does not ask you to type a command or to edit a file. Every screen of this path is described in **[docs/installation.md](docs/installation.md)**.

## Where to read next

- [`docs/installation.md`](docs/installation.md) — install and cook your first ticket.
- [`docs/app.md`](docs/app.md) — the app, screen by screen.
- [`docs/runtime/README.md`](docs/runtime/README.md) — the runtime (station, rail, pass): index of its pages.
- [`docs/glossary.md`](docs/glossary.md) — the word for each object of the product (*cook*, *rail*, *station*, *pass*, *served*…).

## Contributing and project files

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to propose a change.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed, release by release.
- [`LICENSE`](LICENSE) — MIT.

The code, the docs and the issues are in English; the dialogue with the agents is in French.
