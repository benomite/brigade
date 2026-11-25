# The newcomer path, step by step (#1912)

Status: **the walk itself is not done, and is tracked in #4205.** It needs a machine that has never
seen Brigade and a GitHub account and a Claude account that are not the chef's. A station has
neither, so no capture is taken here, and none is claimed. Whether any step needs ssh, a host, a path
or a hand-edited config file is neither confirmed nor ruled out until that walk.

This page holds what a station could do: the steps to walk with the capture each one owes, and the
places where the README or the app may ask for more than the app and the README.

## Steps to walk (source: README.md, "Try it")

For each step, take `docs/captures/1912/<step>-avant.png` and `<step>-apres.png`. No capture may show
parade-box, the chef's Mac, a host, the V1 plugin or a chef project (espace, calculus, mirror*).
Once the walk is done, drop this table and keep the captures and findings.

| # | Step | Capture owed | Done |
|---|---|---|---|
| 1 | Download the app, open it past the unsigned-app warning | `telechargement`, `ouverture` | no |
| 2 | Sign in with GitHub | `connexion-github` | no |
| 3 | Sign in with Claude | `connexion-claude` | no |
| 4 | Pick the stranger's own repository | `choix-depot` | no |
| 5 | Choose who cooks it: this computer, start the kitchen (the button label differs between README.md and docs/installation.md) | `choix-station` | no |
| 6 | Wait for the setup pull request | `pr-de-mise-en-place` | no |
| 7 | Cook a first ticket; link its PR on the stranger's repository | `premier-ticket`, `pr-livree` | no |

## Places that may ask for ssh, a host, a path or a config file

Found by reading `README.md`, `docs/installation.md` and the user-facing strings of `app/src/vue/`.
Each is a blocker candidate: to be confirmed or ruled out on the walk, with a capture.

1. **README.md, step 1, Mac "damaged" case**: asks for a Terminal command that removes the
   quarantine flag on the installed app. Only in the fallback case.
2. **`app/src/vue/vue.js`, `GESTE`, "station refused the project"**: prints `sudo` commands to update
   the clone and restart the station service. It shows only when a joined box does not answer as
   expected; a newcomer on "this computer" should not meet it.
3. **`app/src/vue/vue.js`, projects-file messages** (`inconnu` and the "could not read / re-read"
   messages): print the path of the projects file and its shape. They show only when that file is wrong
   or changed by hand.
4. **`docs/installation.md`**: its own status note says the path has not been replayed end to end on a
   clean machine by a person. That is this ticket. It also says the app finds `git`, `gh` and `claude`
   through the shell's `PATH`, where the README says the app guides an install when one is missing.

(The README's `owner/repo` entry in step 4 is a repository name, not a path, host or ssh.)
