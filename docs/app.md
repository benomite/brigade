# L'app

Une fenêtre sur le Mac : tes projets dans une barre latérale, et dans chacun un vrai terminal où
tourne le second. Tu n'ouvres plus un terminal, tu ne te places plus dans un dossier.

À côté du terminal, **ce que la box dit du projet** : ce qui t'attend, le rail, les cooks, les
grants — lu pour toi, sans rien taper. Et en tête de la barre, la **kitchen** : la même lecture
pour tous tes projets d'un coup, avec, pour chacun, si tu peux encore le piloter d'ici.

L'app **n'ajoute rien au runtime** et ne double aucun geste : ce qui s'accorde, se règle ou se
relance se tape dans son terminal. Ce qu'elle montre de la box, elle l'a lu en lançant à ta place
les commandes qui existent.

## Dire où sont tes projets

Un seul fichier, hors du dépôt : `~/.config/brigade/app.json`. Un nom et un dossier par projet —
et, pour un projet servi par une box, où elle est. **Tu n'as pas à l'écrire pour commencer** :
l'app le crée, et tu y ajoutes un projet depuis l'app.

### Depuis l'app

Au premier lancement le fichier n'existe pas : l'app le crée, vide (`{ "projets": [] }`), et
s'ouvre sur **Ajouter un projet**. Ensuite, c'est l'entrée **+ projet**, en pied de la barre.

| Ce que tu donnes | Comment |
|---|---|
| **Son dossier sur ce poste** | `Choisir…` ouvre le sélecteur de dossiers du Mac : il ne se tape pas |
| **Son nom** | proposé d'après le dossier, tant que tu n'en as pas tapé un autre. Si une box sert le projet, c'est sous ce nom (voir plus bas) |
| **Sa box** — facultatif | le nom par lequel ton `ssh` la joint. Vide : le projet a son terminal, et l'app ne lit rien de sa box |

`Ajouter` écrit le projet **à la suite des autres**, dans la forme ci-dessous, et tu arrives sur la
kitchen, où il figure. Un projet refusé n'est pas écrit, et l'écran dit pourquoi, avec les mots
du fichier : `Pas ajouté — deux projets s'appellent « brigade »`, `… « dossier » manque`,
`dossier introuvable : …`.

- **L'app n'écrit que le projet ajouté.** Ce que tu as mis d'autre dans le fichier y reste — mais
  il est réécrit en entier, indenté de deux espaces : une mise en page à toi n'y survit pas.
- **Elle n'écrit pas dans un fichier qu'elle n'a pas compris** : `Pas ajouté — l'app n'écrit pas
  dans un fichier qu'elle n'a pas compris — JSON illisible : …`. Celui-là se répare à la main.
- **Retirer ou renommer un projet se fait dans le fichier**, pas dans l'app.

### À la main

Le fichier reste le tien, et tu peux tout y faire :

```json
{
  "projets": [
    {
      "nom": "brigade",
      "dossier": "~/Dev/brigade",
      "hote": "<le nom par lequel ton ssh joint ta box>"
    },
    { "nom": "parade", "dossier": "/Users/chef/Dev/parade" }
  ]
}
```

- `dossier` est un chemin absolu, ou commence par `~/`.
- `hote` est facultatif, et c'est tout ce que tu dis de la box : le nom par lequel **ton** `ssh`
  la joint. Ce qui est écrit entre `< >` ci-dessus est à remplacer — voir « Ce que la box dit du
  projet ».
- **`nom` est aussi le nom du projet sur la box** : c'est lui que l'app donne au geste de la box
  (`brigade <nom> status`), donc celui de l'instance `brigade@<nom>.service`. Il n'y a pas de
  second nom à déclarer : un projet servi s'appelle dans l'app comme sur sa box.
- **`commande` n'est plus lu.** Un fichier qui le porte encore est refusé, en le disant :
  `projet n° 1 (brigade) : « commande » n'est plus lu — retire-le : …`.
- La barre suit l'ordre du fichier.
- **L'app relit ce fichier dès qu'il change** — et chaque fois que tu reviens à sa fenêtre. La
  barre et la kitchen suivent ; rien n'est à relancer (voir « Quand le fichier change »).
- **Le second lit le même fichier.** Une session `/brigade:po` ouverte dans le `dossier` d'un projet
  y prend `nom` et `hote`, et lance à l'ouverture, une fois, le même geste que l'app :
  `ssh … <hote> brigade <nom> status`. Elle relaie ce qui t'attend, mot pour mot. Un `nom` que la
  box ne connaît pas, c'est le geste qui le refuse, et le second le dit en une ligne ; un projet
  sans `hote` n'a pas de file à lire, et il le dit de même. Il n'y a pas d'autre endroit où
  déclarer la box.

Si le fichier est refusé au lancement, l'app n'affiche aucun projet : elle montre le
chemin du fichier, la raison (`JSON illisible`, `projet n° 2 (parade) : « dossier » manque`,
`deux projets s'appellent « brigade »`…) et la forme du fichier, où chaque valeur à remplacer est écrite entre `< >`. Un fichier refusé l'est en
entier, et **l'app n'y touche pas** : il n'y a pas d'ajout possible depuis l'app tant qu'il n'est
pas réparé. Répare-le, elle suit sans être relancée. Pareil pour un fichier qu'elle n'a pas pu
créer (`ce fichier n'a pas pu être créé : …`).

### Quand le fichier change

| Ce qui a changé | Ce que l'app fait |
|---|---|
| Un projet de plus, un `hote` ajouté ou retiré, l'ordre | La barre et la kitchen suivent. Les terminaux ouverts ne sont pas touchés ; l'écran affiché reste le même, sa lecture de box repart |
| Un projet retiré, renommé, ou dont le `dossier` a changé | **Ses terminaux sont arrêtés** — second et shells : ils tournaient dans un dossier qui n'est plus le sien. La conversation reste à `claude` : au premier clic, le second reprend le fil du nouveau dossier. Si c'était l'écran affiché et que le projet n'est plus là, tu reviens à la kitchen |
| Le fichier n'est plus lisible — un éditeur à mi-écriture, une virgule en trop, le fichier supprimé | **Rien ne disparaît** : les projets d'avant restent, leurs terminaux tournent. Un bandeau, en bas de la fenêtre, dit le chemin et la raison ; il s'en va à la première relecture réussie |

```
/Users/chef/.config/brigade/app.json a changé, et n'a pas pu être relu :
  → JSON illisible : Unexpected end of JSON input
Tes projets sont ceux d'avant, et rien n'est fermé. L'app le relit dès qu'il change.
```

Un fichier supprimé pendant que l'app est ouverte n'est pas recréé dans ton dos : il l'est au
prochain lancement, ou au prochain ajout depuis l'app.

Un projet dont le dossier n'est pas là (disque débranché, dossier déplacé) **reste dans la
barre**, grisé : au clic, l'app dit `dossier introuvable : …` au lieu d'ouvrir un terminal. Les
autres projets ne sont pas touchés.

## La kitchen : tous les projets d'un coup

L'app s'ouvre dessus, et l'entrée **Kitchen**, en tête de la barre, y ramène. Un bloc par projet,
dans l'ordre du fichier : son nom, **son état en toutes lettres avec l'heure de sa lecture**, puis
**ce qui t'attend, mis à part**, puis le reste de la sortie de `run status` et celle de
`run station`, mot pour mot.

- **Ce qui t'attend, projet par projet** : le bloc `attend` de chaque `status`, en tête de son
  projet, sur son propre fond — et `rien n'attend le chef` quand c'est ce que le runtime dit (voir
  « Ce qui t'attend, mis à part »).
- **Ce qui avance, ce qui coince** : c'est `status` qui le dit, là où il le dit — le tableau de
  « Ce que la box dit du projet » vaut ici tel quel.
- **Le quota et la machine** : les lignes `quota` (`disponible`, ou `86 — épuisé, retour à …`) et
  `machine` (`tient`, ou `SATURÉE depuis … — charge de 14,2 pour 12 au plus`) de `station`. Le
  runtime ne dit la mesure de la machine que lorsqu'elle sature : l'app n'en invente pas une.
- **Rien ne s'y clique.** Ce que tu y vois se traite dans l'espace du projet, par la barre.

Chaque projet est dans **un de quatre états**, qui ne se ressemblent pas :

| À l'écran | Ce que l'app a obtenu | Ce qu'elle montre dessous |
|---|---|---|
| `pilotable — lu à 14:32:07` | les commandes ont abouti | leurs sorties. **Un projet où rien ne se passe est ici** : un `status` calme, pas une erreur |
| `JOINT, MAIS PLUS PILOTABLE — essai de …`, en jaune, trait pointillé | `ssh` a joint la box, et une commande y a échoué (un code autre que 255) ou n'a rien rendu en trente secondes (`ssh`, connecté, arrêté au délai) | la commande lancée, ce qu'elle a écrit, son code — puis **le geste** : mettre le runtime à jour sur sa box (`docs/runtime.md`, « Piloter ») |
| `JOINT, MAIS INCONNU DE LA BOX — essai de …`, en jaune, trait plein | `ssh` a joint la box, et son geste a refusé le projet (code 65) : elle ne sert aucun projet sous ce nom | **ce que le geste en a dit**, tel quel — puis le nom que l'app lui a donné, et d'où il vient (`nom`, dans `app.json`) |
| `PAS JOINT — essai de …`, en rouge, trait plein | rien qui prouve que la box a été jointe : `ssh` lui-même a échoué (code 255), n'a pas pu être lancé, ou a été arrêté au délai sans avoir dit jusqu'où il était allé | **le message de `ssh`**, tel quel, et son code — ou le délai, dit par l'app |

- **L'app rapporte, elle ne devine pas.** « Plus pilotable » ne dit pas *pourquoi* la commande a
  échoué : un runtime trop vieux pour ce qu'elle lui demande est le cas attendu, mais une box
  où le geste n'est pas posé, ou pas permis à ton compte, s'y lit pareil. Ce qu'elle a obtenu est
  sous tes yeux. **Le code de sortie ne choisit que l'en-tête** : 65, le projet est inconnu de la
  box ; tout autre code qui en vient, plus pilotable. Le texte dessous n'est jamais traduit.
- **Le code 255 est celui de `ssh`.** Une commande distante qui sortirait elle-même en 255 se
  lirait « pas joint ».
- **Un projet muet ne retient pas les autres** : chaque projet est lu pour lui-même, toutes les
  trente secondes, et porte sa propre heure.
- Un projet sans `hote` y figure aussi : `aucune lecture`, et ce qui lui manque — `hote`, le nom
  par lequel ton `ssh` joint ta box. Aucun bloc à coller.
- Les commandes d'un projet partent **l'une après l'autre**, et la première qui échoue est
  l'erreur affichée. Un projet peut donc être pilotable dans son espace (`status`, `grant`) et ne
  plus l'être dans la kitchen (`status`, `station`) : chaque écran dit ce que *ses* commandes ont
  rendu.

## Un espace par projet

Clique un projet : tu es dans son **second** — `claude`, lancé dans le dossier du projet, sur un
vrai terminal. C'est une vraie session Claude Code : ton historique, tes slash commands, et un `!`
s'exécute sur le Mac, avec tes accès.

- **`+ shell`** ouvre un shell de plus dans le même espace (ton shell de connexion, dans le
  dossier du projet). Autant que tu veux ; l'onglet **Second** te ramène au second, tel que tu
  l'as laissé. Un shell dont tu sors (`exit`) ferme son onglet.
- **Changer de projet n'interrompt rien.** Chaque espace garde ses terminaux, leur contenu, et
  l'onglet où tu l'avais laissé : les terminaux appartiennent à l'app, pas à ce qui est affiché.
- Le second d'un projet ne démarre qu'au premier clic sur ce projet.

## Ce que la box dit du projet

À droite du terminal, sans rien taper : **ce qui t'attend, mis à part**, puis la sortie de
`run status` et celle de `run grant`, **mot pour mot**. L'app n'y lit rien et n'en redit rien — si
la formulation d'une commande change, ce que tu vois change avec elle. Elle n'en découpe qu'une
chose, par son bord : le bloc `attend`.

### Ce qui t'attend, mis à part

En tête du panneau, et en tête de chaque projet dans la kitchen, sur son propre fond : **le bloc
`attend` de `status`**, tel que le runtime l'a écrit, de sa ligne `attend` à sa ligne `fin attend`.
Tu n'as plus à le chercher dans la sortie.

```
ce qui t'attend — le bloc `attend` de `run status`
attend     2 décisions attendent le chef — la plus ancienne depuis 2 j
  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : …
  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : …
fin attend
```

- **Quand rien ne t'attend, c'est le runtime qui le dit**, au même endroit — un bloc de deux
  lignes, `rien n'attend le chef` sur la première, `fin attend` sur la seconde. L'app n'écrit pas
  cette phrase et n'en écrit pas d'autre : si le runtime la change, elle change ici.
- **L'app ne lit que le bord** : la seule ligne de la sortie qui commence par `attend`, la seule
  qui vaut `fin attend` (`docs/runtime.md`, « Ce qui attend le chef »). Rien de ce que le bloc
  porte n'est lu, compté ni reformulé. Elle ne sait donc pas *si* quelque chose t'attend : le bloc
  plein et le bloc vide ont le même fond, pas de couleur d'alerte, aucun compteur dans la barre.
- **Le reste de `status` suit, mot pour mot**, sous un titre qui dit ce qui lui manque (« sans son
  bloc `attend`, mis à part ci-dessus ») : le bloc n'est pas montré deux fois.
- **Une sortie sans ce bord reste entière**, et l'app le dit à la place du bloc, en jaune :

  ```
  Rien n'a pu être mis à part : la sortie de `run status` n'a pas le bloc que l'app sait prendre — une seule ligne qui commence par `attend`, une seule ligne `fin attend`.
  Ce n'est pas « rien ne t'attend » : ce qui t'attend, s'il y a quelque chose, est dans la sortie ci-dessous, entière.
  ```

  Le cas attendu est un runtime d'avant ce bord — le geste est alors de le mettre à jour sur sa box
  (`docs/runtime.md`, « Piloter ») — mais l'app ne le devine pas : elle dit ce qu'elle n'a pas
  trouvé. Le projet reste `pilotable` : `status` a répondu.
- Une lecture ratée n'a rien à mettre à part : l'erreur prend toute la place, comme avant.

### Ce que `status` dit du reste

Ce qui demande ton attention sans t'attendre est là où `status` le met, et dit comme il le dit
(voir « L'état de la cuisine » dans `docs/runtime.md`) :

| Ce que tu cherches | Où `status` le dit |
|---|---|
| Un ticket qui ne progresse plus | `COINCE`, sur sa ligne du `rail` et sur la ligne `cooks` ; chaque ticket pris porte `sans progrès depuis <durée>` — une durée, pas une date à comparer |
| Un grant qui va s'éteindre | `BIENTÔT ÉTEINT`, sur la ligne `grant` de l'en-tête |
| Un cook arrêté | aucune ligne à lui : `derniers événements` (`guard.tripped`, `cook.exited`), et le disjoncteur sur la ligne `cuisine` |

L'app **ne prononce jamais elle-même** « rien ne t'attend » : un écran calme est un bloc `attend`
qui dit `rien n'attend le chef`, et un `status` sans `COINCE` ni `BIENTÔT ÉTEINT`.

**Dire où est la box.** Un seul champ sur le projet, dans `app.json` :

- `hote` : le nom par lequel **ton** `ssh` joint ta box — un nom de ton `~/.ssh/config`, ou
  `compte@machine`. Il n'y a pas de valeur à recopier : c'est ce que tu tapes après `ssh`.

Tu ne dictes plus aucune commande. L'app lance **le geste de la box**, `brigade <nom> status`
puis `brigade <nom> grant` (`docs/runtime.md`, « Piloter ») : le compte, l'installation et
l'environnement se lisent sur la box, dans l'unité du projet. Le geste doit donc y être posé, et
permis à ton compte sans mot de passe (`docs/runtime.md`, « Installer »).

**Le nom qui part vers le geste est le `nom` du projet dans `app.json`**, tel quel. Si la box ne
sert aucun projet sous ce nom, le geste le refuse et l'app l'affiche — `JOINT, MAIS INCONNU DE LA
BOX`, avec ce qu'il en a dit :

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade status
brigade : projet inconnu sur cette box — « parade » n'a pas de drop-in (`sudo systemctl edit brigade@<projet>.service`, docs/installer.md)

→ code de sortie 65
```

Le geste n'accepte que des minuscules, des chiffres et des tirets : un `nom` écrit autrement
(`Parade`, `mon projet`) lui arrive entier, cité, et il le dit inconnu.

L'app lance `ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> 'brigade <nom> status'` : ta
clé, ta configuration ssh, aucun port ni API. `BatchMode` : `ssh` ne peut rien te demander depuis
l'app — une clé qui réclame sa phrase de passe doit être dans ton agent. `ConnectTimeout` : une
box muette, c'est `ssh` qui le dit au bout de dix secondes, avec ses mots. Un projet sans `hote`
n'est pas lu, et l'app le dit à la place de l'état.

**Ça se rafraîchit seul**, toutes les trente secondes, pour ce qui est affiché et rien d'autre —
le projet, ou tous dans la kitchen ; changer de projet lit le nouveau tout de suite. **Une lecture
ne s'affiche que dans l'écran qui l'a demandée** : celle de la kitchen, encore en route quand tu
ouvres un espace, n'y est pas montrée — et l'inverse. En tête du
panneau, **l'état du projet et l'heure de la dernière lecture** (`pilotable — lu à 14:32:07`) :
ce sont les seuls faits que l'app ajoute. Les durées affichées dessous sont celles que `status`
comptait à cette heure-là.

**Quand la box n'est pas lue, c'est une erreur, et elle prend toute la place.** L'en-tête passe à
`PAS JOINT — essai de 14:32:37, le prochain suit seul`, à `JOINT, MAIS PLUS PILOTABLE — …` ou à
`JOINT, MAIS INCONNU DE LA BOX — …` (les états de la kitchen, dits pareil ici), et dessous il n'y a plus que ce que l'app a
obtenu : la commande lancée, ce qu'elle ou `ssh` a écrit, et le code de sortie.

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade status
ssh: connect to host box port 22: Operation timed out

→ code de sortie 255
```

- **Rien n'est gardé de la lecture d'avant** : pas d'état périmé à côté de l'erreur. Une
  micro-coupure remplace donc l'écran par une erreur, jusqu'à la lecture suivante.
- **L'app ne devine pas la cause.** Un code 255 vient de `ssh` : pas joint. Un autre code vient
  de la box, dont le message est affiché (`brigade : …`) : 65, le geste ne connaît pas le projet ;
  un autre, joint, mais plus pilotable.
- Une seule des deux commandes en échec, et c'est l'erreur qui s'affiche, sans la sortie de l'autre.
- Un `ssh` qui n'a rien rendu en trente secondes est arrêté, et l'app dit ce qu'elle en sait :
  - `→ aucune réponse en 30 s : ssh arrêté` — `ssh` était connecté (il sort alors de lui-même,
    en 255) et c'est la commande qui n'a rien rendu : « joint, mais plus pilotable ».
  - `→ aucune réponse en 30 s : ssh arrêté, sans avoir dit s'il avait joint la box` — `ssh` est
    mort du signal, sans code : rien ne dit jusqu'où il était allé. Ses dix secondes pour joindre la box
    (`ConnectTimeout`) ne couvrent pas ce qui suit la connexion : un agent ssh qui attend une
    confirmation (Touch ID, 1Password, `ssh-add -c`) le retient sans limite. L'app ne sait pas
    où il en était : elle l'affiche « pas joint », sans le geste de mise à jour du runtime —
    rien ne dit qu'il y a un runtime à relancer.

Le journal se lit dans `derniers événements`, rafraîchi avec le reste. Pour le suivre en direct :
`run status -- --suivre`, dans un shell de l'espace.

## Fil repris, ou session neuve : l'app le dit

Sous les onglets, une ligne dit ce qu'est le terminal affiché. Pour le second, elle prend l'une
de ces trois formes :

| La ligne | Ce qui s'est passé |
|---|---|
| `fil repris : `claude --continue`, la dernière conversation de ce dossier` | Le second a été lancé par `claude --continue`, et il tourne : tu retrouves ton fil. |
| `session neuve : `claude --continue` est sorti en code 1, le fil n'a pas été repris` | `claude --continue` est sorti en erreur — le plus souvent parce que ce dossier n'a encore aucune conversation. L'app a lancé `claude` tout court, **une fois**. Ce que `claude` a dit en sortant reste lisible dans le terminal. |
| `le second s'est arrêté (code 0) — une touche le relance` | Tu as quitté `claude`, ou la session neuve n'a pas tenu. Rien n'est relancé d'office : une touche dans le terminal relance le second, en reprenant le fil. |

À savoir :

- « Le fil » est **la dernière conversation de ce dossier**, telle que `claude --continue` la
  choisit — y compris une conversation que tu as eue dans un autre terminal. L'app ne tient
  aucun registre de sessions à elle.
- La ligne dit `fil repris` dès le lancement ; si `claude --continue` n'a rien à reprendre, elle
  passe à `session neuve` dans l'instant où il sort.
- Dans un dossier que `claude` ne connaît pas encore, il te demande d'abord si tu lui fais
  confiance : c'est lui qui demande, dans le terminal, comme partout ailleurs.

## Fermer l'app

Fermer la fenêtre quitte l'app, et quitter **arrête tous ses terminaux** — seconds et shells — et
les lectures de box en cours.
Les conversations, elles, sont gardées par `claude` : à la réouverture, le premier clic sur un
projet reprend son fil, et la ligne sous les onglets te dit si c'est bien le cas.

## Lancer l'app

Il n'y a pas encore d'app empaquetée : elle se lance depuis un clone du dépôt.

```bash
npm --prefix app start
```

**C'est le seul geste, la première fois comme les suivantes.** Ce qui manque, `start` le pose
avant de lancer l'app, et le dit :

```
brigade : je pose les dépendances de l'app (`npm ci --ignore-scripts`) — elles ne sont pas encore là.
brigade : je pose Electron — téléchargé la première fois sur ce poste, 311 Mo sur le disque.
```

- Les dépendances sont reposées quand `app/package-lock.json` a changé depuis leur pose — après
  un `git pull` qui les touche — et la ligne le dit. Sinon `start` ne pose rien et ne dit rien.
- Une pose qui échoue arrête tout, avec son code : `brigade : `npm ci --ignore-scripts` a échoué
  (code 1) — l'app n'est pas lancée.` Ce que `npm` a écrit est au-dessus.
- Il faut Node 26 et `npm` ; rien d'autre n'est à installer d'avance (voir « Ce que ça pèse »).

Lancée depuis un terminal, l'app hérite de son environnement : le `PATH` qui trouve `claude`, tes
accès.

## Pour qui développe l'app

| Geste | Commande |
|---|---|
| Tests | `npm --prefix app test` |
| Contrôle de types | `npm --prefix app run typecheck` |
| Lancer sans consommer de quota | `BRIGADE_CLAUDE_BIN="$PWD/app/test/aides/faux-claude.sh" BRIGADE_APP_CONFIG=<fichier d'essai> npm --prefix app start` |
| … et sans box | ajouter `BRIGADE_SSH_BIN=<un script qui imprime une sortie de status>` |

- **Pas de build.** Le process principal est du TypeScript exécuté tel quel par Electron (son
  Node efface les types, comme celui du runtime) ; la vue est du JavaScript contrôlé par `tsc`
  (`// @ts-check`), qui importe xterm.js par une *import map* — ni bundler ni étape de
  compilation.
- **Aucun test ne lance Electron.** Ce qui se prouve vit dans sept modules joués par
  `node --test` : `config.ts` (le fichier des projets : le lire, le créer, y ajouter un projet),
  `suivi.ts` (le même fichier relu quand il change, sur de vrais fichiers et la vraie veille du
  système), `lancement.ts` (ce que `start` pose avant Electron — les commandes y sont relevées,
  pas lancées), `terminaux.ts` (le registre : qui est
  lancé, gardé, relancé, et ce que l'app en dit), `pty.ts` (le vrai pty, contre un faux `claude`),
  `box.ts` (la veille des box et ses états, contre un faux `ssh` que chaque test écrit : ni
  réseau ni box), `attend.ts` (le bloc `attend` pris par son bord, sur des sorties recopiées du
  runtime).
  `main.ts` et la vue ne font que brancher ; ils se vérifient en lançant l'app.
- **`BRIGADE_CLAUDE_BIN`** remplace `claude`, comme pour le runtime ; **`BRIGADE_SSH_BIN`**
  remplace `ssh` ; **`BRIGADE_APP_CONFIG`** remplace le chemin du fichier des projets. Aucune des
  trois n'est à poser pour un usage réel.
- **node-pty** est le seul module natif. Il est livré compilé pour macOS et passe par N-API : le
  même binaire sert Node (les tests) et Electron (l'app), rien ne se recompile. Sur Linux il
  n'est pas livré compilé : les tests sur un vrai pty y sont **sautés, en le disant** ; le
  registre et la configuration y sont joués.

### Ce que ça pèse

Mesuré le 2026-10-11 (Mac arm64, Electron 44.7.0, node-pty 1.1.0).

| | Durée | Disque, par worktree |
|---|---|---|
| Setup de worktree (`npm ci --ignore-scripts`, cache npm chaud) | ≈ 1 s (5 s à froid) | 115 Mo, dont 62 de node-pty |
| Premier `npm --prefix app start` de la machine (télécharge Electron) | ≈ 25 s | + 311 Mo |
| Premier `start` d'un autre worktree (Electron déjà dans le cache du poste) | ≈ 1 s | + 311 Mo |

Le setup ne télécharge donc jamais Electron : seul celui qui lance l'app le paie. Le cache du
poste (`~/Library/Caches/electron`) pèse 129 Mo, une fois.

## Ce que l'app ne fait pas encore

- Une jauge chiffrée du quota ou de la machine : le runtime dit `disponible` et `tient`, pas un
  niveau. Si ça manque, c'est à lui de le dire.
- Résumer un projet en une ligne dans la kitchen : il faudrait lire la sortie de `status`.
- Dire d'un coup d'œil *si* quelque chose t'attend — une couleur, un compteur dans la barre : il
  faudrait lire ce que le bloc `attend` dit, et l'app n'en lit que le bord.
- Suivre le journal en direct hors d'un terminal.
- Retirer ou renommer un projet, régler quoi que ce soit d'autre : l'app ajoute un projet, le
  reste se fait dans le fichier.
- S'installer comme une app (empaquetage, signature, mise à jour) : lancée depuis le Finder, elle
  n'aurait d'ailleurs pas le `PATH` de ton terminal.
