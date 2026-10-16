# Le runtime de la V2 — index des pages

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive — à commencer par le **rail**, la file des tickets à servir. Il vit
dans `runtime/`, s'exécute avec Node 26 sans build, et ne dépend d'aucun paquet à l'exécution.

Ce document dit ce qu'il fait, comment le piloter et le recetter. **Installer brigade** — sur un
serveur, pour un projet — est un parcours à part, et un seul document : [`installer.md`](../installer.md). Les décisions et leurs raisons
sont dans les specs, [`superpowers/specs/`](../superpowers/specs/) — ici, seulement la consigne.

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal, écrit `runtime.started`, puis ce qui a changé de ses plafonds (`guard.configured`) et de sa cloison (`isolation.configured`), annonce les stations que le projet déclare (`station.announced` ; `stations.undeclared` s'il n'en déclare aucune), demande à `claude` si la machine a une session, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde et se réveille au tick, toutes les 60 s. À chaque réveil : les garde-fous guettent le « stop », la station prend ce que ses bornes permettent, la pass juge ce qui est livré, le manager — s'il est allumé — juge, découpe et réagit. À chaque tick : `runtime.ticked`, sondage de GitHub, baux échus rendus, progrès des worktrees regardé, worktrees rangés, relevé de chaque cook (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Lâche les cooks en cours — un relais les porte, le runtime suivant les reprend ; **l'unité ne les signale pas** (`KillMode=process`) — et tue les gates en train de se jouer, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

**Il lance des cooks**, plusieurs à la fois, par le binaire `claude` sous la connexion Max de la
machine : **chaque cook consomme du quota Max**, comme chaque appel du **manager** (court, sans
outil) et chaque relecture du **reviewer** de la pass (en lecture seule). Ses autres sous-processus
sont `gh`, `git`, et **les gates du projet** (`.claude/brigade/gates.sh`). **Sous grant `merge`, il
merge lui-même** ce que sa pass juge vert. Il n'écoute sur aucun port. **Rien de ce qu'il lance
n'est cloisonné tant que tu n'as pas posé la cloison** (voir « La cloison ») : il te le dit à chaque
démarrage. Tout part sous le compte GitHub de la machine — ou, avec des Apps, **sous une identité
par rôle**, avec des jetons d'une heure qu'aucun cook ne reçoit (voir « Une identité GitHub par
rôle »).

## Où trouver quoi

Le runtime est documenté en pages thématiques, dans ce dossier. **Une section se cite par son titre** (« Piloter », « Le grant `merge` »…) : le tableau dit dans quelle page elle se lit.

| Page | Ce qu'elle dit | Sections |
|---|---|---|
| [`journal-et-rail.md`](journal-et-rail.md) | Le journal et le rail | « Le journal », « Le rail » |
| [`garde-fous.md`](garde-fous.md) | Les garde-fous | « Les garde-fous » |
X
| [`station.md`](station.md) | La station : déclarer, plusieurs cooks, setup, fiche, capacités, station distante, zones, ce qu'un cook charge | « La station » (début) |
| [`station-livraison.md`](station-livraison.md) | La station : la récolte du livrable, le refus du modèle, le quota, la connexion Max, voir la station | « La station » (fin : « Le cook ne livre pas, la station récolte » → « Voir la station ») |
| [`station-machine.md`](station-machine.md) | Une station par machine, et l'ajout d'un projet depuis l'app | « Une station par machine : sa présence sur GitHub, et son appairage par un code », « Ajouter un projet à une station depuis l'app, sans terminal » |
| [`station-navigateur.md`](station-navigateur.md) | Voir une livraison d'interface dans le navigateur | « Regarder une livraison d'interface dans mon navigateur » |
| [`manager.md`](manager.md) | Le manager | « Le manager » |
| [`pass.md`](pass.md) | La pass | « La pass » |
| [`etat-et-mesures.md`](etat-et-mesures.md) | L'état de la cuisine et les mesures | « L'état de la cuisine », « Le relevé des mesures » |
| [`fermeture.md`](fermeture.md) | La fermeture | « La fermeture qui observe », « La fermeture qui écrit » |
| [`identites-et-isolation.md`](identites-et-isolation.md) | Identités, secrets, cloison et arbitre | « Une identité GitHub par rôle », « Les secrets du projet », « La cloison », « L'arbitre entre projets » |
| [`exploitation.md`](exploitation.md) | Variables, sauvegarde, poste de dev et box | « Cinq variables, aucun défaut », « Sauvegarder et restaurer », « Sur le poste de dev », « Sur la box » |
