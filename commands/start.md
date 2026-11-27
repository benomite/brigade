---
description: What brigade is, whether this computer and this repository are ready for it, and where to download the app
allowed-tools: Bash(gh --version), Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh release list:*), Bash(gh release view:*), Bash(git rev-parse:*), Bash(git remote:*), Bash(uname:*)
---

You start a user on **brigade**. This command only **reads** and **answers**: it installs nothing, writes no file, creates no label, opens nothing on GitHub.

**Answer in the user's language**: the language they write in this session. If they have not written anything yet, use the language of their system or of the project's README; English when nothing tells.

## 1. Say what brigade is, in five lines

Say it in your own words, in at most five short lines, with these four words in bold:

- brigade is a team of AI agents that works your GitHub tickets: **you decide, the kitchen ships**;
- the **rail** is the line of your tickets, from queued to served;
- a **cook** is a Claude session that takes one ticket, works it in its own git worktree and opens its pull request;
- the **pass** judges that pull request (gates, CI, an independent review) and merges it;
- the **second** is your product assistant: you tell it what to change, it writes the ticket and puts it on the rail.

## 2. Check `gh`

Brigade reads and writes everything through GitHub, with the GitHub CLI.

- `gh --version`: missing? Say that brigade needs it and give its install page, <https://cli.github.com>.
- `gh auth status`: not logged in? Give the one command to type, `gh auth login`.

Report one line: `gh` installed (its version) and logged in (as whom), or what is missing.

## 3. Check this repository

- `git rev-parse --show-toplevel`: not inside a git repository? Say that brigade works on a GitHub repository, and that the app clones one for you (step 4). Go on to step 4.
- `gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission,isPrivate`: not a GitHub repository (or `gh` cannot read it)? Say so, and why, in one line.
- Otherwise report the repository as `owner/repo`, its default branch, and whether you can push to it (`viewerPermission` is `ADMIN`, `MAINTAIN` or `WRITE`). Without push access, a kitchen cannot open its pull requests there: say so.
- Whether brigade already knows this repository: it does if the checkout has `.brigade/kitchen.json`, or a `CLAUDE.md` with a `## Équipe multi-agents` section (read them with your file tools). If not, say that the app prepares it when you open the project: a **setup pull request** comes first, before your first ticket.

## 4. Give the app download for this computer

The kitchen runs from the desktop app. Its builds are the assets of the newest `app-v*` release of `benomite/brigade`.

1. The operating system: the platform Claude Code runs on, confirmed by `uname -sm` (`Darwin`, `Linux`, or `MINGW`/`MSYS`/`CYGWIN` for Windows) and the architecture.
2. The newest app release:
   `gh release list --repo benomite/brigade --limit 50 --json tagName,publishedAt --jq '[.[] | select(.tagName | startswith("app-v"))] | sort_by(.publishedAt) | last | .tagName'`,
   then its files: `gh release view <tag> --repo benomite/brigade --json assets --jq '.assets[].name'`.
3. Name the one file for this computer, with its link `https://github.com/benomite/brigade/releases/download/<tag>/<file>`:
   - **macOS on Apple silicon** (`Darwin arm64`): `Brigade-<version>-mac-arm64.dmg`. Drag Brigade into Applications, right-click it, **Open**, then **Open** again (macOS 15 and later: also **Open Anyway** in System Settings > Privacy & Security). The app is not signed.
   - **Linux x64** (`Linux x86_64`): `brigade-<version>-linux-x64.AppImage`, then `chmod +x` it and run it.
   - **Windows x64**: `Brigade-<version>-windows-x64-setup.exe`. When SmartScreen says "Windows protected your PC", **More info**, then **Run anyway**.
   - Any other system or architecture (an Intel Mac, Linux on ARM…): there is no build for it; say so plainly.

   The newest release may not have this system's file yet (its builds are still uploading): then take the newest `app-v*` release that has it — the same list sorted by `publishedAt`, read from the end.

   If `gh` cannot read the releases, give the releases page instead: <https://github.com/benomite/brigade/releases/latest>.

## 5. End with the next step

One line: what the user does now — install what is missing (step 2), or download and open the app, sign in with GitHub and Claude in it, and open this repository as `owner/repo`. Then `/brigade:ask <number>` answers on any ticket, from any session of the project.

Keep the whole answer short: the five lines, the checks as a short list, the download, the next step. No preamble.
