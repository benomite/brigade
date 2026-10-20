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
- **Chaque minute**, elle regarde si son état a changé (sans appel GitHub), et ne réécrit
  `brigade-station.json` — son nom, sa machine et ses cœurs, sa version, les projets qu'elle sert,
  son dernier signe de vie — que sur changement, ou en battement toutes les 5 minutes. Deux écritures, y
  compris celle que la station demande après l'écriture d'un projet, sont distantes d'au moins
  60 s : une demande trop proche est retenue, puis écrite à l'échéance. **Arrêtée** (SIGTERM), elle
  y écrit tout de suite l'heure de son arrêt — la seule écriture que l'écart de 60 s ne retient
  pas : l'état final ne se perd pas. Elle publie `cadenceMs` = 285 s ; l'app la dit hors ligne
  après 2 × `cadenceMs` + 30 s, soit 10 min au plus (`app/src/stations/stations.ts`).
- **Ses cœurs** (`coeurs`, ceux que voit `os.availableParallelism()`) : l'app en tire le nombre de
  cooks qu'elle propose quand le chef confie un projet à cette station (#1107) — la règle même du
  plafond par défaut, `max(1, ⌊(cœurs − 2) / 2⌋)` (#1079, [« Plusieurs cooks à la fois »](station.md)). Une
  station plus ancienne ne les publie pas : l'app propose alors 2, et le dit.
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

**Le délai de détection** d'un arrêt brutal (la station tuée sans préavis) se lit donc entre 5 et
10 min : son dernier signe de vie date de 5 min au plus, au battement, et l'app la dit hors ligne
2 × 285 s + 30 s après ce signe.

## Le budget d'appels à GitHub, et l'attente de limite

*Code : `runtime/src/limite-github.ts` (#873, #874).*

Chaque appel de la station et de ses projets à GitHub — le sondage des issues (`github.ts`), le
canal du gist (`appairage/canal.ts`) — prend un jeton du budget avant que `gh` ne parte.

- **Le budget** : **2 500 appels par heure glissante**, soit la moitié de la limite du compte
  (5 000 par heure). Un appel refusé ne part pas et n'est pas compté ; l'appelant échoue comme sur
  une panne de GitHub, et son tour suivant le rattrape. Le message dit quand le prochain appel se
  libère : `budget GitHub épuisé : 2500 appels sur l'heure glissante, appel refusé — le prochain se
  libère dans N s`.
- **Partagé, pas découpé.** Le compteur est une base SQLite dans le répertoire de la station,
  `<BRIGADE_STATION_DIR>/appels-github/compteur.db`. La station et chacun de ses projets la tiennent
  ensemble, comme un runtime ou une commande lancés avec son environnement : une transaction tranche
  entre deux process qui prennent le dernier appel au même instant. Un process hors de toute station
  (le poste de dev, un test) compte seul, en mémoire, sous le même budget.
- **Plus de trois projets** : rien à régler. Le budget n'est pas réparti entre les projets : un
  projet qui sonde beaucoup prend ce qu'un autre ne dépense pas, et le plafond tient quel que soit
  leur nombre. Ce qui grossit avec les projets, c'est la consommation : chacun ajoute ses sondages
  au même compte.
- **Le régler** : il n'y a **pas de variable d'environnement**. Le plafond est la constante
  `BUDGET_PAR_HEURE` de `runtime/src/limite-github.ts` (la fenêtre, `FENETRE_MS`, est d'une heure) ;
  il se change dans le code, et se vérifie avec les tests de `runtime/test/limite-github.test.ts`.
- **La ligne horaire** : une fois par heure, depuis le démarrage de la station, son journal de
  service écrit `brigade : N appels GitHub sur l'heure écoulée`, N étant le compte de la dernière
  heure, tous process confondus. Si la lecture du compteur échoue, la ligne le dit à la place :
  `brigade : appels GitHub de l'heure écoulée non comptés — <erreur>`.
- **La limite de GitHub atteinte** (son 429, ou son 403 « rate limit ») n'est pas un refus comme
  un autre : un 403 d'un merge interdit, lui, reste un refus. La station cesse alors tout appel
  et pose une pause sur le compteur, partagée par tous ses process, jusqu'à la fin de la fenêtre.
  Elle la lit dans `retry-after`, sinon `x-ratelimit-reset`, sinon `gh api rate_limit`, sinon 60 s.
  Pendant la pause, aucun appel ne part et rien n'est compté. Le journal de service le dit une
  fois : `brigade : station — GitHub a atteint sa limite d'appels : plus aucun appel ne part avant
  la fin de la fenêtre, puis ils reprennent seuls`.
- **Ce que le chef en voit.** Pendant la pause, `status` écrit une ligne de tête
  `github     GitHub is rate-limiting calls, back around HH:MM` (en français avant #940), et `faits` porte `limiteGithub` (l'instant
  de reprise, en ISO ; absent hors limite). Les deux lisent la pause sur le compteur, en lecture
  seule, par `BRIGADE_STATION_DIR` : le ssh ne dépend pas de GitHub, la file reste lisible. Le texte
  de `gh` n'y paraît jamais, et la ligne tombe d'elle-même à la fin de la pause. L'app la montre en
  une ligne de la bande d'alertes de chaque projet — à l'heure locale du chef : tirée de `faits`, ou
  de sa propre erreur de limite quand c'est elle que GitHub refuse.
- **La reprise** est automatique : à la fin de la pause, les appels reprennent sans geste. Pendant
  l'attente, la station n'écrit pas son état sur GitHub, et l'app la dit hors ligne au bout de
  2 × `cadenceMs` + 30 s, le temps que la fenêtre se ferme.

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
  raté, ligne à la main, refus de la station) ou `secondaire` ; et, à côté de la liste, l'**onboarding**
  de chaque projet dont elle est la principale — voir plus bas.
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

La recette (`runtime/test/0-en-premier/recette.test.ts`) mesure, sur une vraie station de test, le temps
entre l'ouverture du parcours et le projet publié dans la liste de la station : la spec le borne à
dix minutes ; la station y met au plus sa cadence, trente secondes, plus le clone.

### L'onboarding : où en est un projet neuf

*Ticket #1110.* Entre « projet ajouté » et « premier ticket servi », la station calcule où en est
chaque projet dont elle est la principale (`runtime/src/onboarding/`), et le publie dans son suivi,
sous `onboarding`, par nom de projet — c'est là que l'app le lit. Un projet repris d'une autre
station (`reprise`) n'en a pas : il n'est pas neuf. L'état se calcule de ce que la station sait
déjà — son suivi du projet, son clone, le ticket de préparation noté — et du journal du projet, lu
en lecture seule ; rien n'est écrit pour lui.

- **Quatre étapes, dans l'ordre** (`etapes`) : `depot` (les Apps de brigade autorisées sur le
  dépôt, et son clone), `machine` (la station qui le cuit, sa cuisine ouverte), `preparation` (le
  ticket « Préparer le dépôt », mergé), `premier-ticket` (un ticket du chef sur le rail). Chacune
  porte son `titre`, son `etat` — `faite`, `courante` ou `a-venir` —, une phrase en anglais
  (`dit`), et, si elle est la courante et attend le chef, son `geste` : `quoi`, `ou`, et les
  `liens` où le faire (les pages d'autorisation des Apps, la PR de préparation, la page d'une
  nouvelle issue). `courante` nomme la première qui n'est pas faite.
- **La préparation** (`preparation`) : le numéro du ticket, son lien, et son `etat` — `en-cours`
  (sur le rail, ou entre les mains d'un cook), `en-echec` (mis de côté : `raison`, en une phrase,
  et `prochainEssai`, l'heure à laquelle il repart seul, nulle s'il ne repart pas seul), `a-relire`
  (à la pass, avec sa `pr` ; arrêtée faute de grant ou remontée au chef, le geste est de la relire
  et la merger), `suspendu` (son label `fire` retiré), `faite`, ou `abandonne` (fermé sans merge :
  le rail ne l'attend plus). Nulle tant que le ticket n'est pas ouvert.
- **Sans bac à sable** (`sansBacASable`) : vrai si la cuisine du projet a noté au journal que ses
  cooks tournent sans bac à sable (`isolation.configured`, `sandbox: null`) ; nul tant qu'elle
  n'a rien noté.
- **Prêt** : les trois premières étapes faites, le premier ticket peut être posé — `etat` vaut
  `pret`, et `termine` est vrai : l'onboarding est fini. Un projet qui servait déjà des tickets
  avant que le ticket de préparation existe est prêt d'emblée.

Le cas « aucune station choisie » se calcule aussi (l'étape `machine` courante, le geste de choisir
une station dans l'app) ; mais une station ne publie que les projets qu'on lui demande : ce cas-là,
seule l'app le voit.
