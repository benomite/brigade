# The newcomer path, step by step (#1912)

Status: **the walk itself is not done.** It needs a machine that has never seen Brigade and a GitHub
account and a Claude account that are not the chef's. A station has neither, so no capture is taken
here, and none is claimed. This page holds what a station could do: the steps to walk, with the
capture each one owes, and the places where the README or the app still ask for ssh, a host, a path
or a config file.

## Steps to walk (source: README, "Try it")

For each step, take `docs/captures/1912/<step>-avant.png` and `<step>-apres.png`. No capture may show
parade-box, the chef's Mac, a host, the V1 plugin or a chef project (espace, calculus, mirror*).

| # | Step | Capture owed | Done |
|---|---|---|---|
| 1 | Download the app from the releases page, open it past the unsigned-app warning | `telechargement`, `ouverture` | no |
| 2 | Sign in with GitHub (code shown in the app, typed on GitHub) | `connexion-github` | no |
| 3 | Sign in with Claude | `connexion-claude` | no |
| 4 | Pick the stranger's own repository (`owner/repo`, "open this project") | `choix-depot` | no |
| 5 | "Who cooks <owner/repo>?": this computer, "Start the kitchen" | `choix-station` | no |
| 6 | Wait for the setup pull request | `pr-de-mise-en-place` | no |
| 7 | Cook a first ticket with the second; link its PR on the stranger's repository | `premier-ticket`, `pr-livree` | no |

## Where the README and the app still ask for something else than the app and the README

Found by reading `README.md`, `docs/installation.md` and the user-facing strings of `app/src/vue/`.

1. **README step 1, Mac "damaged" case**: asks to open Terminal and run
   `xattr -dr com.apple.quarantine /Applications/Brigade.app`. A command and a path, only in the
   fallback case. Blocker to confirm on a real Mac.
2. **README step 4**: the person types `owner/repo`. Said openly in the README; not a path, host or ssh.
3. **App, "station refused the project" message** (`app/src/vue/vue.js`, `GESTE`): prints
   `sudo git -C <brigade clone> pull` and `sudo systemctl restart brigade@<project>`. It shows when
   a joined box does not answer as expected, so a newcomer on "this computer" should not meet it.
   To confirm on the walk.
4. **App, projects-file messages** (`app/src/vue/vue.js`, `inconnu`, "does not say where its station
   is", "could not be re-read", "could not read your projects file"): each prints the path of the
   projects file (`configuration.chemin`), and the last one shows its shape to copy. They only appear
   when that file is wrong or changed by hand, so a newcomer who edits nothing should not meet them.
   To confirm on the walk.
5. **`docs/installation.md`**: its own status note says the path "has not been replayed end to end on
   a clean machine by a person". That is this ticket. It also says the app finds `git`, `gh` and
   `claude` through the shell's `PATH`; the README says the app guides an install when one is missing.

Nothing else matched in the README or in the install guide.

## What remains

- Walk the seven steps on a clean machine with third-party accounts, take the captures, link the
  first ticket's PR. This is human work; it should be its own ticket with an empty `capacites` list.
- During that walk, check items 1, 3 and 4 above: each is either never met (no blocker) or a blocker
  to list with its capture.
