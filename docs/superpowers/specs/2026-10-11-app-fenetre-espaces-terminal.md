# Une fenêtre, un espace par projet, un vrai terminal dedans — spec (#295)

**Date** : 2026-10-11
**Statut** : décidé par le dev, **à contester en review** — l'issue et la qualification de l'épique
(#294) fixaient l'enveloppe, la zone et les pièges ; ce qui restait à trancher l'a été sans
`question-spec`, parce que rien n'y était une décision de produit que l'issue n'ait pas déjà prise.
Les choix visibles du chef sont listés d'un bloc ci-dessous pour être relus d'un bloc.
**Issue** : #295 (jalon 6, épique #294)

Le comportement, tel que le chef le vit, est dans `docs/app.md` : c'est la doc vivante, ce document
ne la recopie pas.

---

## Ce qui a été éprouvé avant de coder

Par de petits scripts jetables, sur le Mac (Node 26.8.1, Electron 44.7.0, `claude` 2.1.286).

- **Electron exécute le TypeScript du process principal tel quel** (`"main": "src/main.ts"`) : son
  Node (24.21) efface les types. Pas de build côté principal.
- **node-pty 1.1.0 est livré compilé pour macOS et passe par N-API** : le même binaire se charge
  sous Node 26 et sous Electron 44. Le piège « il se compile pour l'ABI d'Electron » ne mord donc
  pas, et rien ne se compile au setup.
- **node-pty 1.1.0 livre `spawn-helper` sans bit d'exécution** : tout lancement échoue par
  `posix_spawnp failed`. `pty.ts` le rétablit au chargement.
- **`claude --continue` dans un dossier sans conversation** écrit `No conversation found to
  continue` et sort en **1**. Il ne démarre jamais une session neuve en silence.
- **Dans un dossier jamais ouvert**, `claude` — avec ou sans `--continue` — pose d'abord sa
  question de confiance.
- **Un `await` au premier niveau du module principal bloque Electron** : « prêt » n'est annoncé
  qu'une fois le module chargé. D'où `app.whenReady().then(…)`.

## Ce que le dev a tranché

1. **Le fichier** : `~/.config/brigade/app.json`, `{ "projets": [ { "nom", "dossier" } ] }`. Un
   objet plutôt qu'une liste nue, pour que #296 puisse y ajouter ce qu'il lui faut sans changer de
   forme. L'app ne l'écrit jamais ; absent ou refusé, elle montre son chemin, la raison et un
   exemple. Lu au démarrage seulement.
2. **Un fichier invalide est refusé en entier ; un dossier absent ne grise que son projet.** La
   première faute est une faute de frappe à corriger, la seconde un disque débranché.
3. **Fil repris ou session neuve, sans lire les fichiers de `claude`.** L'app lance toujours
   `claude --continue` ; s'il sort en erreur, elle lance `claude`, une fois, et le dit. Écarté :
   regarder sous `~/.claude/projects/` s'il existe une conversation — c'est dépendre d'un
   rangement privé de `claude` ; et reconnaître son message d'erreur — c'est dépendre d'une
   phrase. Le code de sortie suffit. **Conséquence assumée** : un fil repris qui *plante* (code
   non nul) après des heures est suivi d'une session neuve, annoncée comme telle avec le code.
4. **Un second arrêté n'est pas relancé d'office** : il est dit arrêté, et une touche le relance.
   Relancer seul bouclerait sur un `claude` cassé.
5. **Fermer la fenêtre quitte l'app et arrête les terminaux.** Les pty vivent dans le process
   principal — c'est ce qui rend le changement d'espace sans effet — mais une app sans fenêtre qui
   garderait des `claude` vivants serait un état que rien ne montre.
6. **Le second ne démarre qu'au premier clic** sur son projet : ouvrir l'app ne lance pas quinze
   sessions.
7. **`claude` est lancé directement**, avec l'environnement de l'app. Lancée par `npm start`, elle
   a celui du terminal ; les variables `npm_*` en sont retirées. Le `PATH` d'une app lancée du
   Finder est le problème de l'empaquetage, hors scope.

## Comment c'est fait

| Fichier | Rôle | Prouvé par |
|---|---|---|
| `app/src/config.ts` | lire le fichier des projets | `test/config.test.ts` |
| `app/src/terminaux.ts` | le registre : un second par projet, ses shells, reprise ou session neuve, ce que l'app en dit | `test/terminaux.test.ts` (faux pty) |
| `app/src/pty.ts` | le vrai pty (node-pty) | `test/pty.test.ts` (faux `claude`) |
| `app/src/main.ts`, `preload.cjs` | la fenêtre, et sept gestes entre la vue et le registre | en lançant l'app |
| `app/src/vue/` | barre, onglets, un xterm par terminal, caché quand il n'est pas affiché | en lançant l'app |

- **La vue ne garde aucun historique côté principal.** Chaque terminal a son xterm, gardé tant que
  l'app est ouverte ; changer d'espace le cache. Pas de tampon à rejouer : il n'y a qu'une
  fenêtre, et la fermer quitte.
- **La vue est en JavaScript** (`// @ts-check`, contrôlée par `tsc`) : un navigateur n'efface pas
  les types, et un bundler serait une étape de build pour deux cents lignes. xterm.js s'importe
  par son nom grâce à une *import map*.
- **Gates** : l'étape du runtime est devenue une fonction, jouée pour `runtime/` puis pour `app/`
  — mêmes tests, même garde d'horloge, même journal gardé, même contrôle de types. Les mesures
  `tests` et `tests_s` additionnent les deux zones.
- **Setup** : `npm ci --ignore-scripts --prefix app`. Sans scripts, donc sans le binaire d'Electron
  ni tentative de compilation sur Linux. Le coût est dans `docs/app.md`, « Ce que ça pèse ».

## Ce qui n'est pas prouvé par un test

La vue et `main.ts`. Ils ont été vérifiés à la main le 2026-10-11, contre le faux `claude` : deux
projets, session neuve dans l'un, fil repris dans l'autre, un shell ouvert, aller-retour entre
espaces et onglets sans perte, projet au dossier absent. Pas contre le vrai `claude` : cela reste
au chef.
