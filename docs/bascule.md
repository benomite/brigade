# The switchover: the box moves to the station, once

The box served its three projects (`brigade`, `espace`, `calculus-workspace`) each through its
unit `brigade@<project>.service` and its door `brigade-porte@<project>.service`, with their
drop-ins, its command and their sudoers rules. **Installing the station package takes them
over**: log, decisions and tickets in flight stay where they are, each project's door is taken
over by the station's — same port, same allowlist —, the kitchen stops for a few minutes, and
what the old installation had put in the system goes away. It is a chef's action, once, after the
merge — never replayed by a cook on the box.

## The chef's action: the command, the code

1. **The command**, on the box — the one from [`installation-station.md`](installation-station.md),
   "1. The command":

   ```sh
   curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
   ```

   The package plays the switchover before starting the station (`runtime/paquet/debian/postinst`,
   `runtime/src/bascule/`). The `brigade` account and its Max connection are kept: the command
   does not ask for a login again.
2. **The code**: the started station shows it in its service log
   (`journalctl -u brigade-station`) — `brigade : station à appairer — tape ce code dans l'app :
   7KQ2-M9XD …` —, and you type it in the app, on "All projects" ([`runtime/`](runtime/station-machine.md),
   "Une station par machine").

What the command says during the switchover:

```
bascule : arrêt des anciennes unités — brigade@brigade.service, … ; leurs cooks en vol continuent, la station les reprendra
bascule : arrêt des anciennes portes — brigade-porte@brigade.service, … ; celles de la station reprennent leurs ports
bascule : brigade — repris par la station (benomite/brigade, branche main), son état laissé dans …
bascule : brigade — sa porte reprise par la station : même port (127.0.0.1:…), même liste blanche, lue à son journal
bascule : retiré — /etc/systemd/system/brigade@.service
…
bascule : /usr/local/bin/brigade pointe sur le geste du paquet (/usr/lib/brigade-station/brigade) : l'app lit ses projets comme avant
bascule : cuisine reprise par la station — brigade, calculus-workspace, espace ; arrêtée 1 min 12 s, de 08:00:03 à 08:01:15
```

**The last line measures the interruption**, and `/var/lib/brigade-station/bascule.json` keeps it
(`arretee`, `reprise`). If the station does not serve every taken-over project after three
minutes, the line says which ones and points to `journalctl -u brigade-station`; the installation
itself is done.

**Switchover refused** (`bascule refusée — rien n'a changé : …`): a project the station could not
take over — the line says which and why. The old units still serve; once it is sorted out, rerun
the same command. **Failed** along the way (`bascule en échec — …`): rerunning the same command
resumes where it stopped.

## What is checked afterwards

- **Nothing left of the old installation**: no `brigade@<project>` or
  `brigade-porte@<project>` unit, no drop-in, no old command or its sudoers rule —
  `systemctl list-unit-files 'brigade@*' 'brigade-porte@*'` returns nothing.
- **Each project goes out through its door, and only that**: when the station starts, each project
  says `réseau — liste blanche, par la porte 127.0.0.1:<port> — un envoi direct est refusé par le noyau :
  l'unité filtre` (`journalctl -u brigade-station`), each with the port that
  `/var/lib/brigade/portes.json` gives it — that of its old door. A host outside its list
  gets a `403`, and the refusal is in the project's log ([`runtime/paquet/README.md`](../runtime/paquet/README.md),
  "La porte réseau").
- **Three versions in a row go through on their own**, one of which changes a service unit, with
  no chef action: each project's queue says so, one line per version — `passée en version … à …`
  ([`installation-station.md`](installation-station.md), "6. Updating, on its own").
- **A fourth project is added in under 10 minutes**, from the app, without a terminal
  ([`runtime/`](runtime/station-machine.md), "Ajouter un projet à une station depuis l'app, sans terminal").

The takeover is tested, before the merge, on a test installation — never on the box: three
projects served the old way, a cook in flight, the real package installed, log, decisions and
tickets compared before and after (`runtime/test/bascule/machine.test.ts`).

## The brigade command

`/usr/local/bin/brigade` stays: it is how the chef drives the box's projects, over
`ssh` — `brigade <project> <command> [arguments…]`, as before (the desktop app does not use it: it runs no `ssh`). The switchover points it at the
package's command, `/usr/lib/brigade-station/brigade`, and keeps the sudoers rule that gives it
to humans ([`installer.md`](installer.md), "Add a human"). It runs the command under the
account and in the environment of `brigade-station.service`, with what the station gives the
project.

| Code | What it says | The action |
|---|---|---|
| 64 | the project or the command is missing | `brigade <project> help` |
| 65 | unknown project on this station | the project has no line in `/var/lib/brigade/projets` |
| 66 | the command is not a runtime command | the refusal names the station's commands |
| 67 | systemd did not answer for the station's unit | `systemctl status brigade-station` |
| 68 | whoever runs it does not have the right to the command | their sudoers rule — "Add a human" |
| 69 | `sudo` is missing on the machine | `apt install sudo` |
| 70 | the package's `node` or runtime is missing, or does not start | what the line says: `sudo apt install libatomic1`, or `sudo apt install --reinstall brigade-station` |

Any other code is the command's own.
