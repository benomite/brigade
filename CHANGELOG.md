# Changelog

Changes to the public interface of brigade — the commands of the box (`brigade <project> <command>`), their options, and what the roles cite. Newest first.

## 2026-10-19 — the output of the operation commands in English (#933)

What `installation` (`labels`, `setup`, `uninstall`, `--json`), `closing` (`write`, `cancel`), `backup`, `restore`, `measures`, `partition` (`probe`), `pull` (`announce`, `claim`, `renew`, `return`), `door`, `hold-arbiter` and `help` write — lines, refusals, errors and usage, plus the errors of the entry point (unknown command, old name redirected) — is English, in the words of `docs/glossary.md`. This closes the criterion of #536: no output of the box keeps a French word. `runtime/test/exploitation-en-anglais.test.ts` plays every command of `COMMANDES` on the example state of the bottom of `status`, with its subcommands and at least one refusal, and fails if a line carries a word of the French column of the glossary; a command added to `COMMANDES` without a path there fails the first test. The keys of the `--json` outputs do not change, nor do the names of the log's events and of the decisions. The old command names and words still answer, saying the new one, until **2027-01-14**.

## 2026-10-18 — the output of the chef's commands in English, all five families (#932)

What `manager` (`on`, `off`, `return`, `backlog`, `upstream`), `grant` (`enable`, `extend`, `revoke`), `station`, `guardrails` (`stop`, `resume`), `base` (`replay`) and `arbiter` (`weight`, `remove`) write — lines, refusals, errors and usage — is English, in the words of `docs/glossary.md`; this closes the epic (#950, #951, #952 and #953, after #931). `runtime/test/sorties-du-chef-en-anglais.test.ts` plays each of them, refusals included, on an example state and checks that no line keeps a word of the French column of the glossary. The same file mounts a log, a unit drop-in and a state file written in French before the epic and checks they are shown and applied without editing: decisions and grants set earlier keep their effect, the old command words (`allumer`, `eteindre`, `rendre`, `activer`, `prolonger`, `revoquer`, `reprendre`, `retirer`, `aide`) still answer, saying the new one, until **2027-01-14**, and a station declaration keeps its words `distante` and `ordinaires`. The names of the decisions, the keys of the JSON of `manager upstream` and `pass --json`, and the event names of the log do not change.

## 2026-10-18 — the output of `station` in English (#953)

What `station` writes — the view (stations, `simultaneous cooks`, `Max connection`, `withholding`, `cooks running`, `latest cooks`, `consumed`, `chef's decisions`), `cooks <N>`, a decision, `remove` and `help` — lines, refusals, errors and usage, is English, in the words of `docs/glossary.md`. That includes the refusals that come from the decisions (`BRIGADE_STATIONS invalid: station no. 1 …`, `… invalid: “x” — expected opus, sonnet or haiku`) and the form of a station declaration (`<machine>/<engine>:<cooks cap>:<capability>+<capability>[:distante[+ordinaires]]`; the words `distante` and `ordinaires` are still the ones you type). The names of the decisions (`seuil-ticket`, `manager-modele`, `closer-retraits`…) do not change, nor do the old words `retirer` and `aide`, which still answer and say the new one. Decisions written to the log before this change keep their effect and are shown as they were set. The app reads `station` in both languages, so a box that has not been updated yet is still read.

## 2026-10-18 — the output of `rail`, `pass`, `log` and `waiting` in English (#931)

What `rail` (with `remove`, `priority`, `merge`), `pass` (with `issue`, `comment`, `ask`), `log` and `waiting` (`set`, `resume`, `arrived`) write — lines, refusals, errors and usage — is English, in the words of `docs/glossary.md`. The typed forms do not change (`--remind 7j` still reads), nor do the keys of `pass --json` and the event names of the log. Free text written to the log by others (a reviewer's finding, a gate's failure, an unreadable card's reason) is shown as it was written. Two shared messages follow: `no log in <dir>` (any command that opens the log) and the `BRIGADE_GITHUB_REPO` / `BRIGADE_LEASE_SECONDS` / `BRIGADE_COMMON_PATHS` configuration errors. `grant`, `base` and the other commands keep their wording until their own tickets.

## 2026-10-16 — session renewal is off on a station with a long-lived token (#818)

When `BRIGADE_CLAUDE_TOKEN_FILE` is set, the runtime no longer follows the Max session renewal (#508): it does not read the renewal state file, writes no `session.observed` / `session.restored`, the station's connection watch draws no loss (`session-refusee`…) from it, and the « session Max près de son échéance » line stays out of the queue. Without a token, nothing changes.

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
