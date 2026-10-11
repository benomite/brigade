# La kitchen : tous les projets, et ceux qu'on ne pilote plus — spec (#297)

**Date** : 2026-10-11
**Statut** : décidé par le dev, **à contester en review** — l'issue, le commentaire du PO (pas de
numéro de version) et la qualification du Manager fixaient les moyens, les trois états et les
pièges ; ce qui restait a été tranché sans `question-spec`.
**Issue** : #297 (jalon 6, épique #294)

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« La kitchen ») : ce document ne
le recopie pas.

## Ce qui a été éprouvé avant de coder

Contre un vrai OpenSSH (client du Mac, `sshd` jetable sur `127.0.0.1`), lancé par `execFile` avec
un délai de 3 s :

| Cas | Ce que Node rend |
|---|---|
| Commande distante qui pend (`sleep 60`), `ssh` connecté | `killed: true`, **`code: 255`**, pas de signal |
| Hôte muet (`10.255.255.1`), sans `ConnectTimeout` | `killed: true`, `code: null`, `SIGTERM` |
| Hôte muet, `ConnectTimeout=1` | `killed: false`, `code: 255`, `ssh: connect to host … Operation timed out` |

Le finding de revue de #296 est donc **vrai** : connecté, `ssh` attrape le signal du délai et sort
de lui-même en 255. `killed && code === null` ratait ce cas, qui se lisait « code de sortie 255 ».

## Ce que le dev a tranché

1. **Le délai se reconnaît à `killed`, quel que soit le code**, et `ssh` reçoit
   `ConnectTimeout=10` (le délai est de 30 s). Une box muette est alors dite par `ssh` lui-même,
   en 255 et avec son message ; un `ssh` encore là au délai avait joint la sienne. Le délai se
   range donc dans « joint, mais plus pilotable ».
2. **Les trois états se lisent du seul code** : abouti → pilotable ; 255, ou `ssh` impossible à
   lancer → pas joint ; tout autre code, ou le délai → joint, mais plus pilotable.
3. **Les jauges sont les lignes `quota` et `machine` de `run station`.** C'est la seule commande
   qui dit les deux à chaque fois, et que la `commande` du chef sait lancer. `arbitre` réclame
   l'environnement de son unité (`BRIGADE_ARBITER_PORT`) et ne parle pas du quota ; `status` ne
   dit la machine que saturée. Aucune commande n'imprime la charge mesurée hors saturation : la
   kitchen montre un état (`tient` / `SATURÉE … charge de X pour Y`), pas un niveau.
4. **La kitchen lance `status` puis `station`** ; l'espace d'un projet garde `status` puis `grant`
   (#296). Conséquence assumée : un runtime sans `station` est pilotable dans son espace et « plus
   pilotable » dans la kitchen — chaque écran rapporte ce que ses commandes ont rendu.
5. **Les commandes d'un projet partent l'une après l'autre**, plus de front : la kitchen lit tous
   les projets à la fois, et `sshd` refuse au hasard les connexions non encore authentifiées
   au-delà de dix (`MaxStartups`) — ce qui se lirait « pas joint », à tort.
6. **Le bloc d'un projet est la sortie entière de `status`**, pas un résumé (qualification :
   « pas un second résumé »). Le coup d'œil tient à l'en-tête d'état et à ce que `status` met en
   tête ; pour deux à cinq projets, la page défile.
7. **Le geste nommé** est la mise à jour du runtime (`docs/runtime.md`, « Piloter »), toujours le
   même : l'app ne choisit pas un geste selon une cause qu'elle ne connaît pas.
8. **L'app s'ouvre sur la kitchen**, à la place de « Choisis un projet dans la barre ».
9. **L'en-tête du panneau d'un projet dit les mêmes trois états** que la kitchen : une seule
   fonction de rendu pour les deux.
