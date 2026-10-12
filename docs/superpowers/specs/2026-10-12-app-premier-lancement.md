# Ouvrir l'app la première fois : un geste, et pas de JSON — spec (#313)

**Date** : 2026-10-12
**Statut** : décidé par le dev, **à contester en review** — l'issue fixait les critères, les
pointeurs et les pièges ; ce qui restait, la forme de l'ajout et le sort d'un projet qui quitte
le fichier, a été tranché sans `question-spec`.
**Issue** : #313.

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« Dire où sont tes projets »,
« Quand le fichier change », « Lancer l'app ») : ce document ne le recopie pas.

## Ce que le dev a tranché

1. **Le seul geste est `npm --prefix app start`.** Son `prestart` (`src/lancement.ts`, joué par
   Node seul) pose les dépendances si elles manquent — ou si le verrou est plus récent que la
   trace que npm laisse dans `node_modules` — puis le binaire d'Electron, et dit chaque pose en
   une ligne. Rien à poser : rien de dit. Une pose en échec arrête le lancement.
2. **Le fichier qui manque est créé au lancement**, vide. Une liste vide n'est donc plus un
   refus : c'est « aucun projet encore », et l'app s'ouvre sur l'ajout.
3. **L'ajout est un écran, pas des réglages** : le dossier se choisit dans le sélecteur du Mac,
   le nom en est proposé, la box est facultative. L'entrée `+ projet` reste en pied de barre.
   Après l'ajout, la kitchen — pas l'espace du projet : y entrer lance un `claude`, et ce geste
   reste un clic du chef.
4. **Les règles de l'ajout sont celles de la lecture**, sans copie : le fichier candidat est
   passé au même lecteur avant d'être écrit. Un projet qui ne s'ouvrirait pas (dossier
   introuvable) n'est pas ajouté.
5. **L'app n'écrit que si elle avait compris le fichier**, et y laisse ce qu'elle n'y lit pas
   (clés inconnues). Elle le réécrit en entier, indenté de deux espaces : la mise en page à la
   main n'est pas gardée. Elle écrit en place, sans fichier temporaire renommé — un renommage
   remplacerait un lien symbolique (un `app.json` tenu dans des dotfiles) par un fichier.
6. **La relecture est une veille du dossier** (`fs.watch`), pas une horloge : un éditeur qui
   remplace le fichier reste suivi. Revenir à la fenêtre relit aussi — la veille n'est pas seule.
7. **Une relecture refusée ne retire rien** : les projets d'avant restent, leurs terminaux
   tournent, et un bandeau dit le chemin et la raison. Seul un fichier refusé *au lancement*
   donne l'écran sans projet d'aujourd'hui.
   Tant qu'il n'est pas relu, **l'ajout n'y écrit pas** : recréer un fichier supprimé pour y
   poser un seul projet ferait partir tous les autres, terminaux compris (review, renvoi 1).
   Une création refusée au lancement garde sa raison et se retente à chaque relecture.
8. **Un projet qui quitte la liste perd ses terminaux** — retiré, renommé, ou déplacé de
   dossier. Les garder serait laisser tourner un `claude` que plus rien n'affiche ; la
   conversation, elle, reste à `claude`. C'est le point le plus contestable : un renommage tue
   un second en cours.
9. **Retirer ou renommer depuis l'app est hors scope** (issue) : cela se fait dans le fichier.

## Plan

1. `app/test/config.test.ts`, `app/src/config.ts` : créer, ajouter, liste vide.
2. `app/test/suivi.test.ts`, `app/src/suivi.ts` : relire au changement, garder sur un refus, dire
   les projets partis — sur de vrais fichiers, en attendant un fait.
3. `app/test/terminaux.test.ts`, `app/src/terminaux.ts` : `quitter(projet)`.
4. `app/test/lancement.test.ts`, `app/src/lancement.ts`, `package.json` : le geste unique.
5. `main.ts`, `preload.cjs`, `pont.d.ts`, la vue : le branchement, vérifié en lançant l'app
   (faux `claude`, fichier d'essai) et en lisant ses écrans par le port de débogage.
6. `docs/app.md`.
