# La bascule : déployer à côté, basculer après un démarrage réel, revenir seul (#354)

## Le problème

La spec V2, § « Le serpent qui se mord la queue », exige deux garde-fous avant qu'un cook puisse
modifier le runtime qui l'exécute : le contrôle qui compte est **un démarrage réel**, et la version
est **déployée à côté, basculée après un démarrage réussi, revenue seule en cas d'échec**. Aucun
n'existait : mettre à jour, c'était `git pull` dans le clone partagé puis `systemctl restart`
(#337) — un runtime qui refuse de démarrer restait à terre, et le code d'avant n'était plus nulle
part.

## Ce qui est décidé

Six décisions, validées par le Manager sur l'issue (2026-10-12).

1. **Où vit le code en service d'un projet.** Le clone `/opt/brigade` reste la source. La bascule
   en exporte `runtime/` à un commit (`git archive`) sous `<clone>-versions/<projet>/<commit>/` ;
   le lien `en-service` désigne la version servie, `precedente` celle à quoi revenir. Deux versions
   gardées. **Le gabarit ne change pas** : un drop-in d'instance (`code.conf`) pose
   `WorkingDirectory` sur le lien. Le geste `brigade` lit déjà ce répertoire dans l'unité. Une box
   déjà installée n'a rien à migrer : un projet prend son drop-in à sa première bascule, et
   `installation` dit `pas encore basculé` d'ici là.
2. **« Après un démarrage réussi » n'est pas « deux runtimes à la fois ».** Un démarrage réel prend
   le verrou du projet : l'ancien runtime est arrêté pour l'essai, ses cooks en vol interrompus.
   La version est posée sans toucher à l'ancienne, essayée, **confirmée** au fait du démarrage ;
   sinon le lien revient et l'ancienne est relancée. Un démarrage à blanc, à côté et sans verrou,
   serait un chemin que la version cassée implémente elle-même : il ne prouverait rien.
3. **Le fait « démarré »** : l'unité est `active` et le runtime a laissé son témoin
   (`code-en-service`), désormais écrit **en fin** de `main.ts`, une fois tout branché. Le fait
   « raté » : le process est sorti (`failed`, `inactive`), ou systemd le relançait (`NRestarts`,
   `SubState=auto-restart`). Une garde (120 s, `BRIGADE_BASCULE_GARDE`) ne vaut que pour le runtime
   qui ne fait ni l'un ni l'autre.
4. **Le retour se lit dans `installation`**, pas dans `status` : la bascule laisse un compte rendu
   à côté des versions (`bascule`, `essai.journal`), le dit elle-même et sort non nul.
5. **Une version qui change une unité est refusée** avant de rien arrêter : les unités valent pour
   toute la box et aucun retour ne les couvre. Le pas manuel est nommé.
6. **Porte, arbitre, sauvegarde : non touchés**, ils restent sur le clone.

## Choix du dev

- **Un script bash de `runtime/deploy/`, lancé en root du clone** (`brigade-bascule`), comme le
  geste `brigade` : il n'y a rien à installer, et il ne dépend pas du runtime qu'il bascule.
- **La bascule n'exécute jamais le code qu'elle pose.** Elle tourne en root, et ce code vient d'être
  livré par un cook. Elle ne calcule donc pas l'empreinte de la version (il faudrait lancer `node`
  dessus) : elle **retire le témoin** avant l'essai, runtime arrêté — celui qui reparaît est
  nécessairement celui de ce démarrage. C'est la même preuve que « le témoin à l'empreinte
  posée », sans rien exécuter.
- **Le compte rendu vit à côté des versions**, à root, pas dans le répertoire d'état : la bascule
  n'écrit rien dans l'état du projet, elle n'y retire que le témoin.
- **Un commit nommé** (`brigade-bascule <projet> <commit>`) : c'est le retour à la main, et le
  filet de la première bascule (`ORIG_HEAD`, le code d'avant le pull).
- **`runtime périmé` garde son constat, et change de geste** : la bascule, plus `systemctl restart`.

## Ce qui n'est pas tenu

- **La première bascule d'un projet n'a pas de version à quoi revenir** : ratée, elle le remet sur
  le clone, qui porte le même code. La doc donne le geste qui lui pose un filet d'abord.
- **Une version qui démarre puis se conduit mal** n'est pas vue : le témoin dit « démarré, tout
  branché », rien de plus. Le retour à la main est la même bascule.
- **La porte et la sauvegarde tournent sur le code du clone**, sans essai ni retour.
- **Rien de systemd n'est prouvé ici** : la recette est dans `docs/installer.md`, « Ce que seule une
  vraie box prouvera ».
