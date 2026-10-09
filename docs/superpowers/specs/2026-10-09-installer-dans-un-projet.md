# Installer brigade dans un projet — spec et plan (#173)

**Date** : 2026-10-09
**Statut** : livré côté dev ; trois critères restent à la recette du jalon 7, sur la box
**Issue** : #173 « Installer brigade dans un projet : un parcours court, vérifié, et réversible »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§Migration : conventions V1 conservées),
`2026-10-08-station-claude.md` (le clone réservé, le setup avant le cook),
`2026-10-08-pass-et-grant-merge.md` (les gates, le grant absent par défaut).

Le parcours, tel que le chef le vit, est dans `docs/installer.md` : c'est la doc vivante, ce
document ne la recopie pas.

---

## Ce qui était vrai avant de coder

- Ce qu'un dépôt doit porter se lisait en six endroits du code (`SCRIPT_GATES`, `SCRIPT_SETUP`,
  `LABEL`, `calibrage.ts`, `prio:` dans `alimenter.ts`, les lecteurs de configuration) et nulle
  part d'un seul tenant.
- Chaque lecteur de configuration refuse au **premier** défaut, et le runtime au premier lecteur :
  un projet mal installé se découvrait un manque par redémarrage, puis au premier cook.
- Le runtime ne lit pas les bindings : la branche d'intégration est écrite deux fois, sans que
  rien ne les compare.
- `CLAUDE.md` disait « cinq variables », `docs/runtime.md` « neuf » : le code en exige neuf.
- `/brigade:init` pose bindings, scripts et labels V1 — pas `fire`, `model:`, `effort:`.

## Ce qui est livré

Une commande du chef, `npm --prefix runtime run installation`, et quatre gestes :

| Geste | Effet | Écrit quelque chose ? |
|---|---|---|
| *(aucun argument)* | vérifie la machine, le dépôt et GitHub ; nomme **tout** ce qui manque ; sort en 1 s'il manque quelque chose | non |
| `labels` | crée les labels du rail absents du dépôt | sur GitHub, ce qui manque seulement |
| `setup [<cooks>]` | joue le setup à blanc dans un worktree de sonde, le mesure, dit s'il tient à `<cooks>` cooks | un worktree jetable, retiré |
| `desinstaller [--confirmer]` | retire le clone réservé et les worktrees | seulement avec `--confirmer` |

Aucun ne lance de cook, aucun n'ouvre le journal.

## Ce que le dev a tranché — contestable en review

1. **Un parcours, pas un installeur.** L'installation reste une suite de gestes écrits, dont la
   commande vérifie le résultat. Les gestes côté machine demandent `sudo` et un éditeur ; les
   gestes côté dépôt sont ceux de `/brigade:init`. Un script qui ferait tout aurait à connaître la
   machine — ce que brigade refuse de faire pour un projet.
2. **`/brigade:init` n'est pas modifié.** Les labels V2 sont créés par la commande du runtime, qui
   a déjà `gh` et le nom du dépôt ; `init` reste le chemin V1, et le miroir Codex n'est pas touché.
3. **Trois marques** : `ok`, `MANQUE` (retient : code 1), `à savoir` (ne retient pas). Un setup
   absent est un « à savoir » — le runtime le tolère ; des gates absentes sont un manque — la pass
   remonterait toute livraison.
4. **Les labels créés sont ceux que l'issue nomme** (`fire`, `prio:1`-`3`, `model:`, `effort:`).
   `epic`, `question`, `decision`, `blocked-on-human` ne sont que lus par le manager : ils restent
   au chef.
5. **La désinstallation garde le journal** et ne touche à rien du dépôt ni de GitHub. Elle retire
   ce que l'issue nomme — le clone réservé, les worktrees — et imprime les gestes `sudo` du
   service, qu'un process sous le compte du service ne peut pas faire. Elle demande
   `--confirmer` : c'est le seul geste destructif de la CLI.
6. **« Tient à 30 cooks »** = le setup finit sous la moitié du bail **et** trente worktrees
   tiennent sur le disque, réserve déduite. Le temps d'entrée est montré, pas jugé : un ticket qui
   attend n'échoue pas. Aucun cache partagé n'est construit (hors scope de l'issue).
7. **`BRIGADE_SYSTEMCTL_BIN`**, sur le modèle de `BRIGADE_GH_BIN` : les gates tournent aussi sur
   la box, où un vrai `systemctl` répondrait aux tests.
8. **`installation.ts` lance `git` et `gh` lui-même**, en lecture, alors que `depot.ts` et
   `github.ts` s'en disent seuls lanceurs : `github.ts` est fermé à ce ticket (#174 y travaille),
   et `Depot` ne sait ni lire un fichier de la base ni son mode. À replier dans ces deux modules
   une fois #174 mergé, si la review le veut.
9. **La constante `PART_DU_SETUP`** (la moitié du bail) est redite dans `installation.ts` :
   celle de `station.ts` n'est pas exportée, et `station.ts` est fermé à ce ticket.

## Ce qui n'est pas tenu ici

- Le parcours joué **de bout en bout sur `calculus`**, « rien dans le code de brigade n'a eu à
  changer », et le premier ticket servi sans grant : recette du jalon 7, par le chef, sur la box
  (`docs/installer.md`, « Recette du jalon 7 »).
- Le coût du setup **de `calculus`** : la commande le mesure, le chiffre se prend sur la box.
- La forme `env $(systemctl show …)` par laquelle la commande reçoit l'environnement du service
  n'a pas pu être éprouvée depuis un poste sans systemd.

## Plan suivi

1. Tests de la vérification (`runtime/test/installation.test.ts`), rouges ; puis `verifier`.
2. Tests des labels, de la mesure, de la désinstallation, de la CLI, rouges ; puis le reste de
   `runtime/src/installation.ts` et `installation-cli.ts`.
3. `docs/installer.md`, raccords dans `docs/runtime.md`, « neuf variables » dans `CLAUDE.md`.
