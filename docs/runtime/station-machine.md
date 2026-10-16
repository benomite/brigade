# Une station par machine, et l'ajout d'un projet

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

## Une station par machine : sa présence sur GitHub, et son appairage par un code

*Spec : [la station refaite de zéro](../superpowers/specs/2026-10-15-station-refonte-design.md) (#794).*

La station d'une machine (`runtime/src/station/main.ts`, un seul process pour tous ses projets)
n'a **aucune liaison directe** avec l'app du chef : elle n'ouvre aucun port, et l'app ne la joint
jamais. Tout passe par **GitHub**, où elle écrit son état — dans un **gist secret** du compte du
`gh` de la machine, qui doit être celui du chef (`runtime/src/appairage/`).

- **Au premier démarrage**, elle crée son gist, y publie l'**empreinte** d'un code neuf — jamais le
  code lui-même —, et affiche le code dans son journal de service :
  `brigade : station à appairer — tape ce code dans l'app : 7KQ2-M9XD (valable jusqu'à 14:32)`.
  Huit signes de l'alphabet de Crockford (ni I, ni L, ni O, ni U), valables un quart d'heure ; échu,
  elle en tire un autre et le dit, et l'empreinte de l'ancien reste publiée comme échue — l'app dit
  alors « expiré », pas « inconnu ».
- **Le chef tape le code dans l'app** (« Tous les projets », [docs/app.md](../app.md)) : l'app trouve le
  gist qui publie cette empreinte et y écrit `brigade-appairage.json`. La station l'y lit à son
  signe de vie suivant, et n'affiche plus de code (`brigade : station appairée à l'app`).
- **Chaque minute**, elle réécrit `brigade-station.json` : son nom, sa machine, sa version, les
  projets qu'elle sert, son dernier signe de vie. **Arrêtée** (SIGTERM), elle y écrit l'heure de
  son arrêt. L'app la dit hors ligne dès qu'elle s'est arrêtée, ou dès qu'elle a manqué deux signes
  de vie.
- **Ses pannes y vont aussi** (`appairage/etats.ts`, #798) : `miseAJour`, sa dernière mise à jour
  quand elle a raté et qu'elle est revenue en arrière (version visée, version restaurée, l'heure,
  et si le retour a raté lui aussi — lue dans `BRIGADE_MISE_A_JOUR_DIR`), et `connexionMax`,
  l'état de sa connexion Max et depuis quand. Ni le motif d'un échec, ni la raison d'une perte,
  ni un geste : l'app en fait chacune une ligne et un bouton ([docs/app.md](../app.md)). Une lecture
  qui lève ne prive pas la station de son signe de vie : elle publie alors ces deux champs nuls.
- Ce qu'elle garde d'une fois sur l'autre — son gist, son code, son appairage — est dans
  `<BRIGADE_STATION_DIR>/appairage.json`. **Un gist supprimé** sur GitHub la remet à zéro : un
  gist neuf, un code neuf, un appairage à refaire. **GitHub muet** : la panne est dite une fois,
  son retour aussi, et elle réessaie à chaque minute.

Trois réglages, tous facultatifs : `BRIGADE_GH_BIN` (le `gh` de la machine, `gh` à défaut),
`BRIGADE_STATION_NOM` (son nom sur la home — à défaut, celui de la machine), et
`BRIGADE_STATION_VERSION` (la version qu'elle annonce — posée par son paquet ; à défaut,
l'empreinte de son code, `code 1a2b3c4d5e6f`).

## Ajouter un projet à une station depuis l'app, sans terminal

*Spec : [la station refaite de zéro](../superpowers/specs/2026-10-15-station-refonte-design.md) (#795).*

Un projet n'est qu'une ligne de la configuration de la station. Le chef l'ajoute depuis l'app
([docs/app.md](../app.md), « Ajouter un projet à tes stations ») ; l'app écrit sa demande dans le gist
de chaque station qu'il a choisie, et la station l'y lit — toujours sans liaison directe
(`runtime/src/projets/`).

- **Ce que l'app écrit** : `brigade-projets.json` — par projet, son nom (tiré du dépôt), son dépôt,
  sa branche d'intégration, si cette station en est la **principale** (celle qui fait tourner son
  manager et sa pass), son plafond de cooks et le calibrage du manager et du reviewer, choisis par
  le chef dans le parcours.
- **Toutes les trente secondes** (ou sur `SIGHUP`), une station appairée relit cette demande. Pour
  chaque projet dont elle est la principale :
  1. **ses Apps GitHub** (`BRIGADE_GITHUB_APPS_DIR`, s'il est posé) doivent être installées sur le
     dépôt ; sinon elle publie, pour chaque App, la page où le chef l'installe en un clic
     (`https://github.com/apps/<app>/installations/new`), et attend. Sans Apps, elle agit sous le
     compte de son `gh` : rien à autoriser ;
  2. elle **clone** le dépôt par son `gh` (`gh repo clone`) dans `<BRIGADE_STATION_DIR>/clones/<projet>` ;
  3. elle **pose au journal du projet** les décisions du parcours, sous le nom du chef —
     `BRIGADE_STATIONS` (`<station>/claude:<cooks>:code+raisonnement`), le calibrage du manager et
     du reviewer —, seulement celles qui n'y sont pas déjà : une décision changée depuis n'est pas
     écrasée ;
  4. elle **ouvre sur GitHub le premier ticket du projet**, « Préparer le dépôt » — voir plus bas ;
  5. elle écrit sa **ligne** (`<projet> <dépôt> <branche>`) dans sa configuration, dans un bloc
     qu'elle tient seule, entre deux commentaires — les lignes écrites à la main, hors du bloc, ne
     sont jamais touchées ; un projet qui y a déjà une ligne à la main la garde, et le suivi le dit.
     Elle relit aussitôt sa configuration et publie sa présence : le projet est dans sa liste sur la
     home (« 1 project »).
- **Ce qu'elle en dit** : `brigade-projets-suivi.json`, réécrit quand il change — par projet, `servi`
  (et depuis quand), `a-autoriser` (avec ses pages), `en-preparation`, `refuse` (et pourquoi : clone
  raté, ligne à la main, refus de la station) ou `secondaire`.
- **Retiré depuis l'app**, le projet quitte la demande : la station retire sa ligne du bloc et ne le
  sert plus. Son état et son clone restent sur la machine.
- **Une station qui n'est pas la principale** d'un projet ne lui écrit aucune ligne et le dit
  `secondaire` : faire cuire une station secondaire viendra avec la station de bureau (#797).

### Le premier ticket : préparer le dépôt

*Ticket #796.* Avant d'écrire la ligne d'un projet ajouté depuis l'app, la station ouvre sur son
dépôt, par son `gh`, l'issue « Préparer le dépôt : gates, setup de worktree, sites autorisés »
(`runtime/src/preparation-depot/`). Elle porte `fire`, `model:opus` et `effort:high` : elle entre
sur le rail comme n'importe quel ticket, et un cook la cuit. Son corps dit au cook :

- **quoi livrer** : `.claude/brigade/gates.sh`, `.claude/brigade/worktree-setup.sh` et
  `.claude/brigade/reseau` (les sites que le projet a le droit de joindre), chacun avec son contrat
  et ce que la branche d'intégration en porte déjà (« absent : à écrire », « déjà sur `main` : à
  éprouver ») ;
- **où l'éprouver** : sur la station qui le cuit — celle qui servira le projet —, pas sur un poste de
  dev : le setup s'exécute dans son worktree, les gates y passent ;
- **les critères observables** : gates vertes sur la station, setup exécuté dans un worktree neuf,
  liste de sites présente, et, dans le compte-rendu, ce qui a été lancé et ce qui en est sorti.

Son numéro est gardé dans l'état du projet (`<état>/preparation-depot.json`) : la station ne l'ouvre
qu'une fois, même si le projet est retiré puis rajouté ; créé sans avoir pu être noté, elle le
retrouve parmi les issues ouvertes par son marqueur (`<!-- brigade:preparation-depot -->`), s'il a
été posé par quelqu'un qui a la main sur le dépôt. GitHub muet : la ligne n'est pas écrite, le suivi
dit `en-preparation`, et la station réessaie à la cadence suivante.

**Tant qu'il n'est pas servi, la cuisine du projet ne prend que lui** — la même restriction que
celle d'une base rouge, qui ne laisse partir que sa réparation, et que les stations distantes
subissent comme celles d'ici. Le journal de service le dit une fois : `le rail attend #<n>
(préparer le dépôt) — aucun autre ticket ne part avant son merge`. **Une fois servi, le rail
démarre seul** (`#<n> (préparer le dépôt) est servi — le rail démarre`). Fermé par le chef ou
disparu, il libère aussi le rail ; son label `fire` retiré, il le retient encore. Un projet écrit
à la main dans la configuration, ou ajouté avant ce ticket, n'a pas de ticket de préparation : son
rail est celui de toujours.

La recette (`runtime/test/projets/recette.test.ts`) mesure, sur une vraie station de test, le temps
entre l'ouverture du parcours et le projet publié dans la liste de la station : la spec le borne à
dix minutes ; la station y met au plus sa cadence, trente secondes, plus le clone.

