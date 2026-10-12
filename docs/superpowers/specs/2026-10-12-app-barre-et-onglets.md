# L'app a sa barre d'icônes et ses onglets de contenu — spec (#344)

**Date** : 2026-10-12
**Statut** : décidé par le dev, **à contester en review** — l'issue fixait les critères et les
pièges, la spec V2 nommait les onglets (« Second (le terminal), Rail, Cooks, Grants, Log ») ; ce
qui restait, la forme à l'écran, a été tranché sans `question-spec`.
**Issue** : #344 (suite de #339, épique #294).

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« La barre d'icônes », « Les
onglets : Second, Rail, Cooks, Grants, Log ») : ce document ne le recopie pas.

## Ce que le dev a tranché

1. **Les onglets de contenu sont dans la bande d'onglets de l'espace**, à côté de Second — la
   lecture de la spec V2 — et prennent la place du terminal. Le panneau de droite ne bouge pas :
   c'est lui qui tient « le bloc `attend` reste visible sans changer d'onglet ».
2. **Le panneau ne lit plus que `status`** ; `grant` a son onglet. Sur le second, l'app lance donc
   un `ssh` par relève au lieu de deux ; sur un onglet de contenu, deux. Jamais quatre de plus.
3. **L'onglet a sa propre veille** (une seconde `ouvrirVeille`, réglée pareil), pas une commande
   de plus dans celle du panneau : une veille rend ses sorties ou la première erreur, et un
   `journal` refusé par un vieux runtime aurait retiré `status` et le bloc `attend` du panneau.
   `box.ts` ne change pas. Prix : deux connexions de front vers la même box, pour le seul projet
   affiché.
4. **Une erreur dans un onglet se lit avec les en-têtes et les renvois d'aujourd'hui**, tels
   quels — y compris « JOINT, MAIS PLUS PILOTABLE », qui peut voisiner un panneau `pilotable`.
   Chaque lecture dit ce que *sa* commande a rendu ; une formulation propre à l'onglet serait un
   huitième état.
5. **La vue nomme un onglet, pas une commande** : `onglets.ts` tient la correspondance, et un nom
   qui n'est pas le sien ne lance rien. Un test la tient contre `runtime/package.json`.
6. **Le monogramme vient du nom et de lui seul** : l'initiale des deux premiers mots, ou les deux
   premières lettres. Deux projets peuvent porter le même ; l'app ne les départage pas — le nom
   entier est au survol et en tête de l'espace, qui ne l'affichait plus nulle part ailleurs.
7. **La kitchen est une case ronde, `K`** ; le `+` est en pied. Aucune pastille, aucune couleur
   d'état : elles attendent la forme du runtime (#343, #346).
8. **Un projet qui ne s'ouvre pas garde ses quatre onglets** : sa box se lit. Son onglet Second
   montre la raison du refus.
9. **`Log` relaie `journal` sans argument**, relu en entier toutes les trente secondes. Le suivre
   en direct reste un geste de terminal.

## Plan

1. `app/test/barre.test.ts`, `app/src/barre.ts` : le monogramme ; la configuration telle que la
   vue la reçoit.
2. `app/test/onglets.test.ts`, `app/src/onglets.ts` : les quatre onglets, leurs commandes contre
   `runtime/package.json`, un nom inconnu, un seul `ssh` pour l'onglet affiché.
3. `main.ts`, `preload.cjs`, `pont.d.ts` : la seconde veille, le geste `onglet`, le canal `contenu`.
4. La vue : la barre, la bande d'onglets, la zone de contenu. Vérifiée en lançant l'app contre un
   faux `claude` et un faux `ssh`.
5. `docs/app.md`.
