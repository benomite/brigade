# Les stations sont au chef : une app installée est une station, un projet choisit les siennes

*Spec produit, 2026-10-15. Dessinée avec le chef en session (le second). Elle dit le **quoi** ; le
**comment** est au manager.*

## Pourquoi

Le chef, le 2026-10-15 :

> il manque un endroit pour gérer les stations (la home de l'app). Je me dis qu'on pourrait
> globaliser le système de station. L'app installée sur le Mac = 1 station, l'app installée sur mon
> ordi Windows = 1 autre station, l'app installée sur mon serveur = 1 station, sur mon tel = 1
> station. Chaque projet déclare quelles stations il utilise et sur quelle station le manager est
> installé.

Deux usages concrets le motivent :

1. **`espace` a besoin d'un Windows de test**, sur lequel tourne un faux live OBS. Les tickets qui
   touchent à OBS ne peuvent pas être cuits sur la box.
2. **Brigade sans serveur** : un utilisateur qui n'a que son ordi installe l'app, déclare son ordi
   station principale du projet, et la cuisine démarre.

Et un constat de la veille : installer la box et un projet a demandé des dizaines de lignes
recopiées, et l'installation n'était « jamais finie » (#542). Une station qui se présente d'elle-même
et que le chef accepte d'un clic remplace ce parcours.

### Ce qui existe déjà (#399)

Un projet déclare ses stations dans `BRIGADE_STATIONS`
(`<machine>/<moteur>:<plafond de cooks>:<capacités>`), chacune annonce des **capacités**, et un
ticket peut **exiger** une capacité (`requiert`, sur sa fiche) : il ne part que dans une station qui
la fournit, sinon il est mis de côté (`no-station: <capacité>`). Cette spec garde ce modèle. Ce qui
change : **d'où viennent les stations** (l'app, plus un drop-in), **à qui elles sont** (au chef,
plus à un projet), et **qui fait tourner le manager** (une station principale, éventuellement un
ordi de bureau).

## Vocabulaire

| Mot | Ce que c'est |
|---|---|
| **station** | une machine où l'app brigade est installée et qui **cuit** : elle peut dépiler des tickets |
| **poste** | une app qui **pilote** sans cuire : voir la file, trancher ce qui attend, parler au second. Le téléphone est un poste ; le Mac peut être station et poste à la fois |
| **station principale** d'un projet | la station qui fait tourner son **runtime** : le manager, le rail, la pass. Une par projet |
| **capacité** | ce qu'une station sait faire au-delà du code : `obs`, `windows`, `acces-box-du-chef`… (#399) |

## Ce que le chef vit

### La home : ses stations

- **La home de l'app liste ses stations et ses postes** : chacun avec son nom, sa machine, s'il est
  joignable, ses capacités, s'il est cloisonné, et les projets qui l'utilisent.
- **Il y ajoute une station** :
  - **un ordi de bureau** (Mac, Windows) : il installe l'app dessus et y ajoute le projet par son
    dépôt git. La machine **se présente** ;
  - **un serveur sans écran** : la home lui donne **une seule commande** à lancer sur le serveur ;
    elle installe brigade et affiche **un code**, qu'il entre dans sa home. Le second peut lancer
    cette commande pour lui par `ssh`, mais c'est un raccourci, pas le chemin normal.
- **Une machine qui se présente apparaît « en attente » dans la home**, et le chef l'**accepte** d'un
  clic, avec ses capacités. Sans cette acceptation, elle ne cuit rien : avoir accès au dépôt ne
  suffit pas pour brancher une machine sur sa cuisine.
- **Il retire une station** de la home : elle ne prend plus aucun ticket, et les projets qui
  l'utilisaient le disent.

### Un projet choisit ses stations

- Dans les réglages du projet, le chef **coche les stations** que ce projet utilise, et **désigne sa
  station principale**.
- Plus aucune déclaration à la main : `BRIGADE_STATIONS` et le drop-in disparaissent du chemin
  normal.

### La station principale, et le mode mono-station

- **La station principale fait tourner le runtime du projet.** Quand elle est éteinte, **la cuisine
  du projet s'arrête** jusqu'à son retour. C'est le principe, assumé.
- **Mono-station** : un projet dont la seule station est l'ordi du chef. Brigade marche avec l'app
  seule, sans serveur.
- **L'app pousse vers une station toujours allumée** : tant que la principale d'un projet est un
  ordi de bureau, l'espace du projet le dit, en une ligne et avec un geste, par exemple « ta cuisine
  s'arrête quand ce Mac dort : ajoute un serveur pour qu'elle tourne en continu ».

### Toute station dépile, tout poste pilote

- **Toute station peut dépiler des tickets** des projets qui l'utilisent, dans la limite de ses
  capacités et de son plafond de cooks.
- **Toute station et tout poste peuvent ouvrir un second** sur un projet.
- **Le téléphone est un poste** : file, décisions, second. Il ne cuit pas.

### Les protections d'une station de bureau

Sur la box, un cook tourne dans une cloison (réseau en liste blanche, identifiants Max en lecture
seule, rien d'autre que son worktree). Sur un ordi de bureau, cette cloison n'existe pas d'office.

- **Une station sans cloison ne prend que les tickets qui exigent une de ses capacités** (la station
  Windows ne prend que les tickets `obs`). Le code ordinaire cuit sur une station cloisonnée.
- **Exception : la station principale d'un projet mono-station** cuit tout, puisqu'elle est seule.
- **Dans les deux cas, l'app le dit à l'acceptation de la station**, et dans la home : « sans
  cloison : les cooks de cette machine voient tout ce que ton compte voit ». C'est au chef de
  choisir ce qu'il y met (par exemple un compte Windows dédié aux tests).

## Le cas d'`espace`

1. Le chef installe l'app sur son Windows de test, et y ajoute `espace` par son dépôt.
2. Le Windows apparaît « en attente » dans sa home. Il l'accepte, avec la capacité `obs`.
3. Dans les réglages d'`espace`, il coche la station Windows. La box reste la principale.
4. Un ticket qui touche à OBS porte `requiert : obs` : il part sur le Windows. Les autres tickets
   cuisent sur la box, cloisonnés.
5. Le Windows éteint, les tickets `obs` attendent, et le disent ; le reste du rail avance.

## Critères de sortie

- **Le cas d'`espace` est joué de bout en bout** sur le vrai Windows du chef : un ticket `obs` est
  cuit sur le Windows, livré, et mergé.
- **Un projet mono-station** démarre sur un Mac neuf avec l'app seule, sans aucune ligne recopiée,
  et livre un premier ticket.
- **Un serveur s'ajoute par une commande et un code**, sans autre geste, et peut être désigné
  principal.
- **Aucune station n'est déclarée à la main** dans un drop-in.

## Hors-scope

- **Le téléphone qui cuit.**
- **Une cloison sur macOS ou Windows** : une station de bureau reste sans cloison, et le dit.
- **Une station principale qui passe la main** à une autre quand elle s'éteint : la cuisine
  s'arrête, c'est le principe.
- **Les stations partagées entre plusieurs humains** : une station est à un chef.

## Ce qui ne doit pas régresser

- **La cloison de la box** : un cook sur une station serveur reste cloisonné comme aujourd'hui.
- **Les capacités et `requiert`** (#399) : un ticket qui exige une capacité absente est mis de côté
  et le dit, sans tourner en boucle (#640).
- **Les projets déjà servis par la box** passent au nouveau modèle sans rien recopier : leurs
  stations actuelles deviennent des stations de la home, et la box reste leur principale.

## Liens

- #399 — les stations et leurs capacités.
- #542, #676 — l'installation qui doit avoir une fin, et son UX.
- #640 — un ticket mis de côté ne tourne pas en boucle.
- #700 — les terminaux sur n'importe quelle machine.
