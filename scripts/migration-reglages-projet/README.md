# migration-reglages-projet — les réglages de la box passent dans le dépôt

Geste du chef, **sur la box**, une fois par projet (épique #1301). Il lit ce que la box tient d'un projet — la branche d'intégration, les calibrages par défaut du manager et du reviewer, le plafond de calibrage, posés au journal du projet — et propose de les écrire dans `.claude/brigade/projet.json` du dépôt, **une PR par dépôt**. Il passe par l'écrivain du runtime (`runtime/src/reglages-projet/reglages.ts`), qui refuse tout secret, chemin ou limite de la machine : seuls ces trois réglages peuvent partir, et un test le prouve.

## Le fichier de la box

Un JSON qui dit où est chaque projet sur la box (`branch` et `repo` ne servent que si le clone ne les dit pas : ligne « Branche d'intégration » de son `CLAUDE.md`, `origin` sur github.com) :

```json
{
  "projects": [
    { "name": "brigade",   "stateDir": "/var/lib/brigade/etat/brigade",   "clone": "/var/lib/brigade/brigade/depot" },
    { "name": "espace",    "stateDir": "/var/lib/brigade/etat/espace",    "clone": "/var/lib/brigade/espace/depot" },
    { "name": "calculus",  "stateDir": "/var/lib/brigade/etat/calculus",  "clone": "/var/lib/brigade/calculus/depot" },
    { "name": "mirrorlab", "stateDir": "/var/lib/brigade/etat/mirrorlab", "clone": "/var/lib/brigade/mirrorlab/depot" }
  ]
}
```

Les chemins sont à adapter à la box. `gh` doit y être connecté.

## Les deux commandes

```sh
# À blanc (par défaut) : par projet, le dépôt visé et le fichier proposé. Ne change rien.
node scripts/migration-reglages-projet/migrer.ts --config projets.json

# Pour de bon : une PR par projet qui a un écart.
node scripts/migration-reglages-projet/migrer.ts --config projets.json --apply
```

La commande est la même pour brigade, espace, calculus et mirrorlab : les quatre sont dans `projets.json`.

## Ce qu'il fait et ne fait pas

- Un projet dont `origin/<branche d'intégration>` porte déjà le fichier est **sauté** ; un projet dont une PR de migration (branche `brigade/migration-reglages-projet`) est déjà ouverte aussi : un second passage ne fait rien.
- Un calibrage dont la box ne tient que la moitié (modèle sans effort) n'est pas repris ; un plafond d'une seule dimension prend le défaut du runtime pour l'autre (`opus` / `high`).
- Il lit `origin/<branche>` tel que le dernier `fetch` du clone l'a vu ; `--apply` fait ce `fetch` avant d'écrire.
- Un projet refusé (clone absent, branche inconnue, réglage refusé) est dit, et la commande sort en 1.
- Le merge de la PR reste au chef. Tant qu'elle n'est pas mergée, la box garde la main sur ses réglages.

## Tests

`cd scripts/migration-reglages-projet && npm test` — de vrais dépôts git locaux et un `gh` de doublure : rien ne sort de la machine. Le typecheck (`npm run typecheck`) réutilise les dépendances de `runtime/`.
