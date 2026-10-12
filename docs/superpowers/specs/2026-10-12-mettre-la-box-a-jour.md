# Mettre une box à jour : un geste nommé, et deux dérives qui se lisent (#337)

## Le problème

Après un `git pull` dans `/opt/brigade`, deux choses restent celles d'avant sans que rien le dise :
**les unités posées** (des copies de `runtime/deploy/`, qu'un pull ne touche pas) et **le runtime
qui tourne** (`node` a lu son code en démarrant). Le geste qui met à jour n'était écrit que dans
une cellule du tableau « Piloter » de `docs/runtime.md`, et la vérification (`run installation`)
ne voyait ni l'une ni l'autre dérive.

## Ce qui est décidé

Cadrage du Manager, consigné sur l'issue (2026-10-12) ; les choix laissés au dev sont marqués.

- **Le geste se nomme là où est celui qui installe** : `docs/installer.md`, « Mettre brigade à
  jour », sous le geste 5. Il n'est pas numéroté — les dix gestes du parcours sont ceux d'une
  installation, et les renvois « geste N » restent justes. La cellule de « Piloter » devient un
  renvoi.
- **Les deux dérives sont deux constats de `verifier()`**, chacun un jugement pur (`jugerUnites`,
  `jugerCode`), sur le modèle de `jugerTemporaire`. **« À jour » est une ligne `ok`** pour chacun,
  pas l'absence de l'autre.
- **Ce sont des `à savoir`, pas des `MANQUE`** *(choix du dev)*. `MANQUE` veut dire « un cook
  lancé maintenant échouerait », et la commande sort alors en `1` : ce n'est pas le cas d'une box
  en retard, et le chef décide quand elle redémarre.
- **Où sont les unités posées** *(choix du dev)* : là d'où systemd charge l'unité du projet
  (`systemctl show -p FragmentPath`). Aucun chemin en dur, aucune variable de plus : la doublure
  de `systemctl` des tests le dicte.
- **Sur quel code le runtime tourne** *(choix du dev — le plus petit des deux)* : un fait que le
  runtime laisse à son démarrage dans `$BRIGADE_STATE_DIR` (`code-en-service`), et qui est
  **l'empreinte du contenu de `runtime/src/`**, pas un commit. Ce que ça supprime : `git` au
  démarrage (le clone de `/opt/brigade` est à `root`, le service tourne sous un autre compte — `git`
  y refuse un dépôt qui n'est pas au sien), toute comparaison d'horloges, et le faux positif d'un
  pull qui ne touche pas le runtime (doc, app, plugin). Ce que ça coûte : la ligne ne nomme pas de
  commit. « Le service tourne » se lit de systemd (`ActiveState`) : à l'arrêt, ce qu'il a laissé la
  dernière fois ne compte pas.
- **Un runtime qui tourne sans avoir rien laissé est périmé** : il date d'avant ce constat — c'est
  exactement le cas de la première mise à jour qui apporte ce ticket.
- **Une unité qui n'est pas posée n'est pas comparée** ; la ligne `ok` nomme ce qui l'a été.
- **`cloison.conf`** *(choix du dev)* est une copie, mais que la doc fait régler au chef
  (`BRIGADE_SANDBOX_HIDDEN`, `BRIGADE_SANDBOX_PRIVATE`). Elle se compare ces deux lignes mises à
  part, et son geste n'est pas un `cp` à l'aveugle : il dit de reporter les réglages.

## Hors scope

- Une commande qui *fait* la mise à jour, ou une mise à jour automatique.
- `app/` : son renvoi vers « Piloter » reste valable, la cellule y renvoie au geste.
- Le code sur lequel tournent la porte et l'arbitre : le geste redémarre la porte avec le runtime,
  et l'arbitre a son ticket (#321). Leurs **unités**, elles, se comparent.

## Plan

1. Tests (`runtime/test/installation.test.ts`, « la mise à jour de la box ») : unités à jour,
   périmées, cloison réglée puis périmée, systemd muet ; runtime à l'arrêt, à jour, périmé, sans
   empreinte ; l'empreinte ; la commande. `main.test.ts` : le runtime laisse son empreinte.
2. `runtime/src/code.ts` (l'empreinte, la laisser, la relire), `main.ts` (la laisser, verrou
   tenu), `installation.ts` (les deux jugements, branchés dans `verifier()`).
3. `docs/installer.md` (le geste, la sortie du geste 8, la recette de la vraie box),
   `docs/runtime.md` (le renvoi, le fichier d'état).
