# Changelog

Changes to the public interface of brigade — the commands of the box (`brigade <project> <command>`), their options, and what the roles cite. Newest first.

## 2026-10-15 — `manager upstream` (#697)

New subcommand: `brigade <project> manager upstream` lists, as one line of JSON, every open issue of the repository that is not on the rail, and what happens to each — one word of a closed list (`attend`, `en-route`, `sortie`, `servie`, `decoupee`, `epique`, `ecartee`, `non-lue`), with its priority and one line the box says about it. It only reads: GitHub, then the log, read-only. The app counts it next to the rail. The contract is in `docs/runtime.md`, « En amont du rail ». No old name.

## 2026-10-15 — box commands in English (#535)

The commands of the box, their subcommands and their options take the English names fixed in `docs/glossary.md`. `brigade <project> help` (or `--help`) lists them, in English only.

**Transition.** Until **2027-01-14**, every old French name still works: an old command name runs the command under its new name, and an old subcommand or option is replaced by its new one. Each time, one line on standard error names the new name and this date; the exit code is the command's own. **From 2027-01-14, the old names no longer answer**: an old command name is refused as an unknown command, an old subcommand or option as a malformed command (exit code 2).

The lines that `status` writes, and its `attend` … `fin attend` block, are unchanged for now.

### Commands

| Old name | New name | Old name answers until |
|---|---|---|
| `faits` | `facts` | 2027-01-14 |
| `journal` | `log` | 2027-01-14 |
| `attente` | `waiting` | 2027-01-14 |
| `garde-fous` | `guardrails` | 2027-01-14 |
| `mise-en-service` | `deploy` | 2027-01-14 |
| `mesures` | `measures` | 2027-01-14 |
| `fermeture` | `closing` | 2027-01-14 |
| `sauvegarder` | `backup` | 2027-01-14 |
| `restaurer` | `restore` | 2027-01-14 |
| `tirer` | `pull` | 2027-01-14 |
| `cloison` | `partition` | 2027-01-14 |
| `arbitre` | `arbiter` | 2027-01-14 |
| `porte` | `door` | 2027-01-14 |
| `tenir-arbitre` | `hold-arbiter` | 2027-01-14 |

Unchanged: `status`, `rail`, `pass`, `station`, `manager`, `grant`, `base`, `installation`. New: `help`.

### Subcommands and options

| Command | Old | New | Old answers until |
|---|---|---|---|
| `status` | `--suivre` | `--follow` | 2027-01-14 |
| `log` | `--derniers` | `--last` | 2027-01-14 |
| `station` | `retirer` | `remove` | 2027-01-14 |
| `station` | `aide` | `help` | 2027-01-14 |
| `manager` | `allumer` | `on` | 2027-01-14 |
| `manager` | `eteindre` | `off` | 2027-01-14 |
| `manager` | `rendre` | `return` | 2027-01-14 |
| `grant` | `activer` | `enable` | 2027-01-14 |
| `grant` | `prolonger` | `extend` | 2027-01-14 |
| `grant` | `revoquer` | `revoke` | 2027-01-14 |
| `grant` | `--jusqu-a` | `--until` | 2027-01-14 |
| `grant` | `--pour` | `--for` | 2027-01-14 |
| `grant` | `--usages` | `--uses` | 2027-01-14 |
| `grant` | `--sans-echeance` | `--no-expiry` | 2027-01-14 |
| `waiting` | `poser` | `set` | 2027-01-14 |
| `waiting` | `reprendre` | `resume` | 2027-01-14 |
| `waiting` | `arrive` | `arrived` | 2027-01-14 |
| `waiting` | `--quoi` | `--what` | 2027-01-14 |
| `waiting` | `--de` | `--from` | 2027-01-14 |
| `waiting` | `--relance` | `--remind` | 2027-01-14 |
| `guardrails` | `reprendre` | `resume` | 2027-01-14 |
| `base` | `rejouer` | `replay` | 2027-01-14 |
| `deploy` | `--couper` | `--interrupt` | 2027-01-14 |
| `deploy` | `annuler` | `cancel` | 2027-01-14 |
| `deploy` | `voir` | `show` | 2027-01-14 |
| `installation` | `desinstaller` | `uninstall` | 2027-01-14 |
| `installation` | `--confirmer` | `--confirm` | 2027-01-14 |
| `measures` | `--par` | `--by` | 2027-01-14 |
| `closing` | `ecrire` | `write` | 2027-01-14 |
| `closing` | `annuler` | `cancel` | 2027-01-14 |
| `pull` | `annoncer` | `announce` | 2027-01-14 |
| `pull` | `reclamer` | `claim` | 2027-01-14 |
| `pull` | `renouveler` | `renew` | 2027-01-14 |
| `pull` | `rendre` | `return` | 2027-01-14 |
| `pull` | `--preuve` | `--proof` | 2027-01-14 |
| `pull` | `--tours` | `--turns` | 2027-01-14 |
| `pull` | `--jetons` | `--tokens` | 2027-01-14 |
| `pull` | `--fin` | `--end` | 2027-01-14 |
| `pull` | `--raison` | `--reason` | 2027-01-14 |
| `partition` | `eprouver` | `probe` | 2027-01-14 |
| `arbiter` | `poids` | `weight` | 2027-01-14 |
| `arbiter` | `retirer` | `remove` | 2027-01-14 |

`deploy --interrupt` (formerly `--couper`) is accepted and has no effect: a deploy no longer waits for the rail to drain.
