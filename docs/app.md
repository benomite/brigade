# L'app

Une fenêtre sur le Mac : tes projets dans une barre d'icônes, et dans chacun un vrai terminal où
tourne le second. Tu n'ouvres plus un terminal, tu ne te places plus dans un dossier.

À côté du terminal, **ce que la box dit du projet** : ce qui t'attend et l'état de la cuisine dans
un panneau, et le rail, les cooks, les grants et le journal chacun dans son onglet — lu pour toi,
sans rien taper. Et en tête de la barre, l'écran **Tous les projets** : la même lecture pour tous tes projets
d'un coup, avec, pour chacun, si tu peux encore le piloter d'ici.

Ce qui est **un tableau à états est dessiné** : une pastille par projet dans la barre, une carte
de cinq compteurs avec ses cooks en cours, le rail en cinq colonnes, et une bannière quand la cuisine est à l'arrêt. Le
reste — le journal, les grants, la station — reste du texte (voir « Ce qui est dessiné »).

L'app **n'ajoute rien au runtime** et ne double aucun geste : ce qui s'accorde, se règle ou se
relance se fait dans son terminal. Ses boutons **écrivent** la commande dans le second, et ne
l'envoient pas : c'est toi qui fais Entrée (voir « Les boutons écrivent, ils n'envoient pas »). Ce
qu'elle montre de la box, elle l'a lu en lançant à ta place les commandes qui existent.

## L'app n'est pas la cuisine

**Ce qui travaille est sur la box**, projet par projet, et tourne sans l'app et sans toi.
**L'app est la fenêtre du Mac** : elle lit, elle affiche, elle écrit des commandes dans un
terminal. La fermer n'arrête rien sur la box, et arrêter la cuisine d'un projet ne ferme pas l'app.

Trois mots se ressemblent, et ne disent pas la même chose :

| Le mot | Ce qu'il désigne | Où il se lit |
|---|---|---|
| **Tous les projets** | **un écran de l'app** : la vue d'ensemble, en tête de la barre. Il ne lance et n'arrête rien | la case ronde **T** |
| **la cuisine** d'un projet | **un état du runtime, sur la box** : `ouverte`, `retenue`, `arrêtée`, `éteinte`. C'est elle que ton « stop » arrête, et elle seule | la pastille, la carte, la ligne `cuisine` de `status`, la bannière `CUISINE À L'ARRÊT` |
| **`en cuisine`** | **l'étape d'un ticket** : un cook le tient, entre `en attente` et `en pass` — ce que le rail appelle `pris`. Elle parle d'un ticket, pas du projet | la liste des tickets d'une épique, et `pass` |

Le journal dit `kitchen.stopped` et `kitchen.resumed` pour ton « stop » et ton « reprendre » :
c'est la cuisine du projet, l'état — pas l'écran.

## Dire où sont tes projets

Un seul fichier, hors du dépôt : `~/.config/brigade/app.json`. Un nom et un dossier par projet —
et, pour un projet servi par une box, où elle est. **Tu n'as pas à l'écrire pour commencer** :
l'app le crée, et tu y ajoutes un projet depuis l'app.

### Depuis l'app

Au premier lancement le fichier n'existe pas : l'app le crée, vide (`{ "projets": [] }`), et
s'ouvre sur **Ajouter un projet**. Ensuite, c'est le **+**, en pied de la barre.

| Ce que tu donnes | Comment |
|---|---|
| **Son dossier sur ce poste** | `Choisir…` ouvre le sélecteur de dossiers du Mac : il ne se tape pas |
| **Son nom** | proposé d'après le dossier, tant que tu n'en as pas tapé un autre. Si une box sert le projet, c'est sous ce nom (voir plus bas) |
| **Sa box** — facultatif | le nom par lequel ton `ssh` la joint. Vide : le projet a son terminal, et l'app ne lit rien de sa box |

`Ajouter` écrit le projet **à la suite des autres**, dans la forme ci-dessous, et tu arrives sur
« Tous les projets », où il figure. Un projet refusé n'est pas écrit, et l'écran dit pourquoi, avec les mots
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
  barre et « Tous les projets » suivent ; rien n'est à relancer (voir « Quand le fichier change »).
- **Le second lit le même fichier.** Le second, c'est le rôle PO : une session `/brigade:po`
  ouverte dans le `dossier` d'un projet y prend `nom` et `hote`, et lance à l'ouverture, une fois, le même geste que l'app :
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
| Un projet de plus, un `hote` ajouté ou retiré, l'ordre | La barre et « Tous les projets » suivent. Les terminaux ouverts ne sont pas touchés ; l'écran affiché reste le même, sa lecture de box repart |
| Un projet retiré, renommé, ou dont le `dossier` a changé | **Ses terminaux sont arrêtés** — second et shells : ils tournaient dans un dossier qui n'est plus le sien. La conversation reste à `claude` : au premier clic, le second reprend le fil du nouveau dossier. Si c'était l'écran affiché et que le projet n'est plus là, tu reviens à « Tous les projets » |
| Le fichier n'est plus lisible — un éditeur à mi-écriture, une virgule en trop, le fichier supprimé | **Rien ne disparaît** : les projets d'avant restent, leurs terminaux tournent. Un bandeau, en bas de la fenêtre, dit le chemin et la raison ; il s'en va à la première relecture réussie |

```
/Users/chef/.config/brigade/app.json a changé, et n'a pas pu être relu :
  → JSON illisible : Unexpected end of JSON input
Tes projets sont ceux d'avant, et rien n'est fermé. L'app le relit dès qu'il change.
```

Tant que le bandeau est là, **le `+` n'écrit rien** : `Pas ajouté — l'app n'écrit pas dans un
fichier qu'elle n'a pas pu relire — …`. Écrire par-dessus, ce serait y perdre les projets qu'elle
affiche encore. Un fichier supprimé pendant que l'app est ouverte n'est donc pas recréé dans ton
dos : remets-le, ou relance l'app, qui le crée vide.

Un fichier que l'app **n'a pas pu créer** au lancement (un dossier sans droits, un lien qui ne mène
nulle part) garde sa raison à l'écran, et l'app retente chaque fois que tu reviens à sa fenêtre :
réparer suffit, sans la relancer.

Un projet dont le dossier n'est pas là (disque débranché, dossier déplacé) **reste dans la
barre**, grisé, sa case en pointillé : au clic, l'app dit `dossier introuvable : …` au lieu d'ouvrir
un terminal. Sa box, elle, se lit : le panneau et les onglets de contenu répondent. Les autres
projets ne sont pas touchés.

## Tous les projets, d'un coup

L'app s'ouvre dessus, et la case ronde **T**, en tête de la barre, y ramène. Un bloc par projet,
dans l'ordre du fichier : son nom, **sa carte** — l'état de sa cuisine en un mot, cinq compteurs,
ses cooks en cours, le dernier événement (voir « Ce qui est dessiné ») —, puis **l'état de sa lecture en toutes lettres
avec son heure**, puis **ce qui t'attend, mis à part**, puis le reste de la sortie de `run status`
et celle de `run station`, mot pour mot.

- **Ce qui t'attend, projet par projet** : le bloc `attend` de chaque `status`, en tête de son
  projet, sur son propre fond — et `rien n'attend le chef` quand c'est ce que le runtime dit (voir
  « Ce qui t'attend, mis à part »).
- **Ce qui avance, ce qui coince** : c'est `status` qui le dit, là où il le dit — le tableau de
  « Ce que la box dit du projet » vaut ici tel quel.
- **Le quota et la machine** : les lignes `quota` (`disponible`, ou `86 — épuisé, retour à …`) et
  `machine` (`tient`, ou `SATURÉE depuis … — charge de 14,2 pour 12 au plus`) de `station`. Le
  runtime ne dit la mesure de la machine que lorsqu'elle sature : l'app n'en invente pas une.
- **Rien ne s'y clique.** Ce que tu y vois se traite dans l'espace du projet, par la barre — la
  bannière d'arrêt et son bouton y sont aussi.

Sous sa carte, la lecture de chaque projet est dans **un de sept états**, qui ne se ressemblent pas :

| À l'écran | Ce que l'app a obtenu | Ce qu'elle montre dessous |
|---|---|---|
| `pilotable — lu à 14:32:07` | les commandes ont abouti | leurs sorties. **Un projet où rien ne se passe est ici** : un `status` calme, pas une erreur |
| `JOINT, MAIS PLUS PILOTABLE — essai de …`, en jaune, trait pointillé | `ssh` a joint la box, et une commande y a échoué (un code autre que 255) ou n'a rien rendu en trente secondes (`ssh`, connecté, arrêté au délai) | la commande lancée, ce qu'elle a écrit, son code — puis **le geste** : mettre le runtime à jour sur sa box (`docs/runtime.md`, « Piloter ») |
| `JOINT, MAIS INCONNU DE LA BOX — essai de …`, en jaune, trait plein | `ssh` a joint la box, et son geste a refusé le projet (code 65) : elle ne sert aucun projet sous ce nom | **ce que le geste en a dit**, tel quel — puis le nom que l'app lui a donné, et d'où il vient (`nom`, dans `app.json`) |
| `JOINT, MAIS SANS LE DROIT DU GESTE — essai de …`, en jaune, trait plein | `ssh` a joint la box, et son geste a refusé ton compte (code 68) : il n'est pas de ceux qui peuvent le lancer | **ce que le geste en a dit**, tel quel — puis où est écrit le geste qui donne ce droit, sur la box (`docs/installer.md`, « Ajouter un humain ») |
| `JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX — essai de …`, en jaune, trait plein | `ssh` a joint la box, et une commande n'y a pas été trouvée : le shell de la box le dit (code 127), ou le geste, pour `sudo` (code 69) | **ce que la box en a dit**, tel quel — puis où ces commandes se posent (`docs/installer.md`, « Préparer la box ») |
| `JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME — essai de …`, en jaune, trait plein | `ssh` a joint la box, et son geste a refusé de lancer le runtime (code 70) : `node` n'y démarre pas dans l'environnement de l'unité, ou n'est pas la version réclamée | **ce que le geste en a dit**, tel quel — puis où se pose `node` (`docs/installer.md`, « Préparer la box »). Pas de mise à jour du runtime : ce n'est pas lui qui est vieux |
| `PAS JOINT — essai de …`, en rouge, trait plein | rien qui prouve que la box a été jointe : `ssh` lui-même a échoué (code 255), n'a pas pu être lancé, ou a été arrêté au délai sans avoir dit jusqu'où il était allé | **le message de `ssh`**, tel quel, et son code — puis où ses phrases sont expliquées (`docs/installer.md`, « Joindre la box »), et où se donne l'accès quand c'est ta clé qu'il refuse (« Ajouter un humain »). Ou le délai, dit par l'app, sans renvoi |

- **L'app rapporte, elle ne devine pas.** « Plus pilotable » ne dit pas *pourquoi* la commande a
  échoué : un runtime trop vieux pour ce qu'elle lui demande est le cas attendu, et le conseil de
  mise à jour n'est donné que là. Ce qu'elle a obtenu est sous tes yeux. **Le code de sortie ne
  choisit que l'en-tête et le renvoi** : 65, le projet est inconnu de la box ; 68, le droit du
  geste te manque ; 69 ou 127, une commande manque à la box ; 70, le `node` de la box ne convient pas au runtime ; tout autre code qui en vient, plus
  pilotable. Le texte dessous n'est jamais traduit.
- **Un lecteur sans accès le lit comme tel**, sous deux formes que l'app ne confond pas avec une
  panne. *Joint, sans le droit du geste* : un état à lui (68). *Clé refusée* : `ssh` sort en 255,
  comme pour une box introuvable, et **seul son message les sépare** — l'app ne le lit pas. Elle
  reste donc à `PAS JOINT`, montre ce que `ssh` a écrit, et nomme où le lire. Dans les deux cas
  elle dit où est écrit le geste qui donne l'accès, et ne le rejoue pas : il se joue sur la box.
- **« Une commande manque » ne dit pas laquelle.** 127 est le code du shell de la box pour toute
  commande introuvable : le geste pas posé (`brigade: command not found`) est le cas attendu, et
  c'est la box qui le nomme, au-dessus.
- **Le code 255 est celui de `ssh`.** Une commande distante qui sortirait elle-même en 255 se
  lirait « pas joint ».
- **Un projet muet ne retient pas les autres** : chaque projet est lu pour lui-même, toutes les
  trente secondes, et porte sa propre heure.
- Un projet sans `hote` y figure aussi : `aucune lecture`, et ce qui lui manque — `hote`, le nom
  par lequel ton `ssh` joint ta box. Aucun bloc à coller.
- Les commandes d'un projet partent **l'une après l'autre**, et la première qui échoue est
  l'erreur affichée. Un projet peut donc être pilotable dans son espace (`status`) et ne plus
  l'être dans « Tous les projets » (`status`, `station`) : chaque écran dit ce que *ses* commandes ont
  rendu.

## La barre d'icônes

À gauche, une colonne de cases, façon Slack ou Discord :

| Case | Ce que c'est |
|---|---|
| **T**, ronde, en tête | l'écran « Tous les projets » |
| un **monogramme** par projet, dans l'ordre du fichier | son espace. Deux caractères tirés du `nom` : l'initiale de ses deux premiers mots (`brigade-site` → `BS`), ou ses deux premières lettres s'il n'en a qu'un (`brigade` → `BR`) |
| **+**, en pointillé, en pied | ajouter un projet |

- **Le nom entier se lit au survol** de la case, et **en tête de l'espace** une fois dedans, à
  gauche des onglets.
- **Deux projets peuvent porter le même monogramme** (`parade`, `partage` : `PA`). L'app ne les
  départage pas : c'est le nom qui le fait, et l'ordre de la barre, qui est celui de ton fichier.
- **Au coin de chaque case, une pastille : l'état de la cuisine du projet, lu sur sa box** — pas
  déduit. Verte, `ouverte` ; jaune, `retenue` ; rouge, `arrêtée` ou `éteinte`. Le mot se lit au
  survol, après le nom (`parade — arrêtée`). Elle est relue toutes les trente secondes, pour tous
  les projets, quel que soit l'écran.
- **Une pastille sans couleur n'est pas un état** : vide, c'est un mot que l'app ne connaît pas
  (il se lit au survol, tel quel) ; en pointillé, la première lecture est en cours ; un `!`, l'app
  n'a lu aucun fait de ce projet, et le survol dit pourquoi (`aucun fait lu — PAS JOINT`). Un
  projet sans `hote` n'a pas de pastille.
- **Pas de compteur dans la barre** : les nombres sont dans la carte du projet.
- Une case en pointillé est un projet dont le dossier n'est pas là — un fait de ce poste, pas de la
  box.

## Un espace par projet

Clique un projet : tu es dans son **second** — `claude`, lancé dans le dossier du projet, sur un
vrai terminal. C'est une vraie session Claude Code : ton historique, tes slash commands, et un `!`
s'exécute sur le Mac, avec tes accès.

**Le second n'est pas un rôle neuf : c'est le PO.** Tape `/brigade:po` dans ce terminal, et tu as
devant toi le rôle que tu connais de la V1, sous le nom que la V2 lui donne. Il n'y a rien à
quitter pour « passer au second », ni commande nouvelle à apprendre. La V2 n'y a changé qu'une
chose : il lit la file du projet à l'ouverture. L'app, elle, lance `claude` et rien d'autre : la
commande reste à toi.

- **`+ shell`** ouvre un shell de plus dans le même espace (ton shell de connexion, dans le
  dossier du projet). Autant que tu veux ; l'onglet **Second** te ramène au second, tel que tu
  l'as laissé. Un shell dont tu sors (`exit`) ferme son onglet.
- **Changer de projet n'interrompt rien.** Chaque espace garde ses terminaux, leur contenu, et
  l'onglet où tu l'avais laissé : les terminaux appartiennent à l'app, pas à ce qui est affiché.
- Le second d'un projet ne démarre qu'au premier clic sur ce projet.

### Les onglets : Second, Rail, Cooks, Grants, Log

À droite du nom du projet, dans cet ordre : **Second**, puis quatre **onglets de contenu**, puis
tes shells et `+ shell`. Un onglet de contenu prend la place du terminal — qui continue de tourner
derrière — et relaie **en texte, mot pour mot,** la sortie d'une commande du runtime
(`docs/runtime.md`, « Piloter »). **Rail** montre d'abord le rail dessiné :

| Onglet | La commande que l'app lance sur la box | Ce que tu y lis |
|---|---|---|
| **Rail** | `brigade <nom> rail` | **le rail dessiné** (voir « Ce qui est dessiné »), puis le texte de `rail` — qui dit ce que le dessin ne dit pas : qui tient un ticket, depuis quand, ce qu'il attend |
| **Cooks** | `brigade <nom> station` | la station : les cooks, la machine, le quota |
| **Grants** | `brigade <nom> grant` | les grants, et l'usage qui en a été fait |
| **Log** | `brigade <nom> journal --derniers 200` | la fin du journal : les 200 derniers événements, pas le journal entier — la ligne sous les onglets le dit |

- **Seul l'onglet affiché est lu** : sa commande part quand tu l'ouvres, puis toutes les trente
  secondes tant qu'il est à l'écran. En changer, revenir au second ou quitter l'espace arrête sa
  lecture. Sur le second, l'app ne lance donc pour ce projet que `status` ; sur un onglet de
  contenu, `status` et la commande de l'onglet — jamais les quatre. S'y ajoute `faits`, lu pour
  **tous** les projets quel que soit l'écran : c'est lui que la barre dessine.
- **Ce qui t'attend reste sous tes yeux** : le panneau de droite — l'état du projet, le bloc
  `attend`, le reste de `status` — ne bouge pas quand tu changes d'onglet.
- **Un onglet a sa propre lecture**, avec son heure (`lu à 14:32:07`) et, si elle rate, son erreur :
  les mêmes en-têtes que le panneau (`PAS JOINT — …`, `JOINT, MAIS PLUS PILOTABLE — …`), et dessous
  ce que l'app a obtenu, tel quel. **Une commande qui échoue dans un onglet ne retire rien au
  panneau** — un runtime trop vieux pour `journal` laisse `status` lisible à côté — et l'inverse.
- Un runtime qui ne connaît pas encore `--derniers` rend son usage en erreur : il se lit dans l'onglet comme toute commande en échec.
- Sous les onglets, la ligne dit ce que tu lis : ``la sortie de `run rail`, telle que la box la
  rend — relue seule toutes les trente secondes, tant que cet onglet est affiché``.
- Un projet sans `hote` a ses quatre onglets, et chacun dit `aucune lecture` et ce qui manque.
- **Seul le rail y est dessiné.** Cooks, Grants et Log sont du texte que tu peux sélectionner et
  copier. Les seuls boutons sont ceux qui écrivent une commande dans le second — sur **Grants** et
  **Cooks**, sous l'heure de la lecture (« Les boutons écrivent, ils n'envoient pas ») — et les
  numéros du rail, qui ouvrent une issue.
- L'espace te rend l'onglet où tu l'avais laissé, onglet de contenu compris.

## Les boutons écrivent, ils n'envoient pas

Un bouton de l'app **n'agit pas**. Il écrit sa commande dans le **second** de l'espace, curseur
après, et s'arrête là : tu la lis, tu la corriges ou tu la complètes, et **c'est ton Entrée qui
l'envoie**. Devant l'invite de `claude`, un `stop` ne part donc pas d'un clic de travers — devant
un autre écran, lis « La limite » plus bas.

**Un bouton qui arrête dit ce qu'il arrête.** `garde-fous stop` n'existe que dans le panneau d'un
projet, et n'arrête que **la cuisine de ce projet-là** : la commande qu'il écrit le nomme
(`brigade <nom> garde-fous stop`), et tu la lis avant de l'envoyer. Il ne ferme pas l'app, et ne
touche à aucun autre projet. **Aucun bouton n'arrête tous les projets** : « Tous les projets » n'en
a aucun.

| Où | Le bouton | Ce qu'il écrit dans le second |
|---|---|---|
| le panneau d'état, sous l'heure de la lecture | `garde-fous stop` | `!ssh <hote> brigade <nom> garde-fous stop` |
| | `garde-fous reprendre` | `!ssh <hote> brigade <nom> garde-fous reprendre` |
| l'onglet **Grants** | `grant activer merge` | `!ssh <hote> brigade <nom> grant activer merge` |
| | `grant prolonger merge …` | `!ssh <hote> brigade <nom> grant prolonger merge ` — l'échéance reste à taper (`--pour 2h`, `--usages 3`…) |
| | `grant revoquer merge` | `!ssh <hote> brigade <nom> grant revoquer merge` |
| l'onglet **Cooks** | `station cooks …` | `!ssh <hote> brigade <nom> station cooks ` — le nombre reste à taper |

- **C'est la commande de la doc, mot pour mot** : la forme de `docs/runtime.md`, « Piloter »,
  depuis ton poste (`ssh <box> brigade <projet> <commande>`), avec ton `hote` et ton `nom`. Le `!`
  devant est celui qui lance une commande sur le Mac depuis une session `claude`. Elle reste dans
  l'historique du second, et se rejoue à la main à l'identique.
- **L'app n'écrit pas d'Entrée** : ce qui est écrit ne porte ni retour chariot ni saut de ligne.
  Une commande qui en porterait un — un `nom` ou un `hote` qui en contient — **n'est pas écrite**,
  et la ligne sous les onglets le dit.
- **La limite : l'app ne voit pas ce que `claude` affiche.** Elle écrit les caractères de la
  commande, et c'est l'écran du moment qui les reçoit. Devant l'invite, ils s'y posent. Devant
  **un dialogue à choix numérotés** (une permission d'outil, la confiance du dossier), ce sont des
  touches : un chiffre de ton `hote` ou de ton `nom` (`box2`, une IP, `projet-1`) peut y choisir
  une option. En **mode vim, hors insertion**, les lettres sont des commandes d'édition. L'app ne
  peut ni le savoir ni l'empêcher : ne clique un bouton que lorsque le second est à son invite, et
  regarde-le avant de valider.
- **Le bouton te ramène sur l'onglet Second**, où la commande t'attend, et la ligne sous les onglets
  dit ce qui vient de se passer :
  ``écrit dans le second, sans Entrée : `!ssh box brigade parade garde-fous stop` — devant l'invite de `claude`, elle attend la tienne, à la suite de ta frappe si tu tapais. Devant un autre écran (un choix à faire, le mode vim), ces caractères sont des touches : regarde le second avant de valider``.
- **Si tu étais en train de taper**, l'app ne le sait pas : elle ne lit pas ton terminal. Elle écrit
  **à la suite** de ta frappe, sans rien effacer, et le dit (ci-dessus). Pareil pour deux
  clics de suite : la seconde commande s'écrit après la première. Efface la ligne (`Ctrl+U`), et
  reclique.
- **Si le second ne tourne pas** — tu as quitté `claude` — le bouton **le lance d'abord**, et
  n'écrit rien : un `claude` qui démarre prendrait la commande pour des touches. La ligne dit
  ``le second ne tournait pas : lancé (`claude --continue`) — la commande n'est pas écrite dans un second qui démarre, reclique quand il est prêt``.
- **Toujours dans le second, jamais dans un shell** ouvert à côté.
- **Un `hote` qui commence par un tiret** (`-box`) n'a pas de commande écrite : dans la forme de la
  doc, `ssh` le lirait comme une option. Le bouton n'écrit rien, et la ligne sous les onglets dit
  pourquoi — la lecture de la box, elle, n'en souffre pas.
- **Un bouton qui n'a rien pu écrire le dit** sous les onglets, là où tu es : `rien n'est écrit : …`
  — par exemple quand le projet vient de quitter le fichier.
- Un projet **sans `hote`** n'a aucun bouton : il n'y a pas de commande à écrire. Un projet dont le
  dossier n'est pas là n'a pas de second : le bouton te montre pourquoi (`dossier introuvable : …`).
- **Seuls ces six boutons existent**, chacun là où se lit ce qu'il change. Le reste de « Piloter »
  (`manager`, `base rejouer`, `installation`…) se tape. « Tous les projets » n'en a aucun.
- **La bannière d'arrêt reprend `garde-fous reprendre`** : le même bouton, la même commande écrite,
  posé là où l'arrêt se lit (« Ce qui est dessiné », « La bannière d'arrêt »).

## Ce qui est dessiné

Quatre choses, et elles seules, parce qu'elles sont un **tableau à états** : la pastille de la
barre, la carte de projet, le rail, la bannière d'arrêt. L'app ne les tire d'aucune phrase : elle
lance `brigade <nom> faits`, la commande par laquelle le runtime donne ses faits comme des faits
(`docs/runtime.md`, « Les faits, pour un programme ») — un état est **un mot lu**, un compteur **un
nombre lu**. Pour tous les projets qui ont un `hote`, toutes les trente secondes, quel que soit
l'écran.

### La carte de projet

En tête de chaque projet dans « Tous les projets », et en tête du panneau de droite dans son espace :

```
● ouverte   lu à 14:32:07 · dernier tick 9 s avant la lecture
  2        1            1            1           3
  rail     au travail   à la pass    t'attend    livrés 24 h
#14  Le journal en ajout seul                      box/claude
dernier événement — merge.done · #216 · 13 s avant la lecture
```

| Ce que tu lis | D'où ça vient |
|---|---|
| la pastille et le mot | `etat` : `ouverte` (verte), `retenue` (jaune), `arrêtée` ou `éteinte` (rouges) — ce que chacun veut dire est dans `docs/runtime.md`. *Pourquoi* la cuisine est retenue se lit dans `status`, dessous |
| `lu à …` | l'heure de ton poste à la lecture |
| `dernier tick … avant la lecture` | l'écart entre le dernier tick du runtime et l'heure de la box à la lecture. **L'app l'affiche et n'en conclut rien** : `ouverte` avec un tick vieux de dix minutes est un runtime à aller voir (`systemctl status brigade@<projet>`), et c'est toi qui le dis. `aucun tick` : runtime arrêté, ou pas encore de tick depuis son démarrage |
| les cinq nombres | `rail` (en attente, `BLOQUÉ` compris), `au travail` (`pris`), `à la pass`, `t'attend` (les décisions du bloc `attend`), `livrés 24 h` |
| les cooks en cours | `cooks` : un par ligne, dans l'ordre de la box — son ticket, le titre de ce ticket, sa station. Ce sont ceux que `station` montre sous « cooks en cours » : ni les relectures du reviewer, ni les jugements du manager. Un titre trop long est coupé (il se lit en entier au survol) ; il est vide si le ticket a quitté le rail pendant la cuisson. `aucun cook en cours` quand la box n'en donne aucun |
| `dernier événement` | son type **tel quel** — l'app ne le traduit pas —, son ticket s'il en a un, et son âge à la lecture. `aucun : le journal est vide` sur un journal vide |

Les âges se comptent entre deux heures **de la box** : l'horloge de ton poste n'y entre pas.

**Une box dont le runtime ne donne pas encore ses cooks** — un runtime d'avant ce champ de
`faits` — n'est pas une box qui ne rend pas ses faits : la carte se dessine, et dit à leur place
`cooks en cours : pas lus — le runtime de cette box ne les donne pas encore dans faits`. **Ce n'est
pas « aucun cook »** : `station` les montre, dessous dans « Tous les projets », dans l'onglet
**Cooks** de l'espace. Le runtime mis à jour, la ligne s'en va seule.

**Un cook n'a ni jauge ni couleur** : ses tours, sa durée, ses tokens, son inactivité sont dans
`status`, et `faits` ne les porte pas. Son numéro ne s'ouvre pas non plus — le ticket s'ouvre
depuis le rail.

### Le rail

Dans l'onglet **Rail**, au-dessus du texte de `run rail` : **cinq colonnes**, un ticket par carte —
son numéro, son état, son titre. C'est l'écran `docs/maquettes/app/Brigade.dc.html`.

```
● Sur le rail  2   ● Au travail  1   ● Pass  1      ● T'attend  2             ● Livré  1
  #16 en attente     #14 pris          #15 en pass    #21 BLOQUÉ                #9 servi
  Récapitulatif…     Formulaire…       Export PDF…    L'export du journal       Validation SIRET
  #22 en attente                                      depuis 3 h 02  BLOQUÉ :
  Connexion par…                                      #17 abandonné (…) — à
                                                      débloquer : …
```

| Colonne | Ce qui y est | D'où ça vient |
|---|---|---|
| **Sur le rail** | les tickets `en attente` et `BLOQUÉ` | le mot d'état de `faits` |
| **Au travail** | les tickets `pris` | de même |
| **Pass** | les tickets `en pass` | de même |
| **T'attend** | les tickets que le bloc `attend` de `status` nomme, dans l'ordre du bloc — le plus ancien d'abord | **le numéro en tête d'une ligne du bloc** (voir « Le numéro qu'elle y lit ») |
| **Livré** | les tickets `servi` | le mot d'état de `faits` |

- **Un ticket que le bloc nomme est dans T'attend, et nulle part ailleurs** — un `BLOQUÉ` quitte
  Sur le rail, une livraison verte non mergée quitte Pass : c'est l'information qui décide d'un
  geste. Sa carte garde son mot d'état, et porte **ce que sa ligne du bloc dit, mot pour mot** : le
  geste y est, tel que le runtime l'écrit.
- **Un ticket que le bloc nomme sans qu'il soit sur le rail** — une issue que le manager a écartée,
  une épique sur laquelle il pose une question — a sa carte dans T'attend : son numéro et sa ligne.
  Pas d'état, que `faits` ne donne pas pour lui ; **son titre seulement si `faits.attend` en porte
  un** — le journal ne le connaît pas pour une issue écartée, et aucun appel de plus ne va le chercher : la
  ligne du bloc dit déjà ce que c'est. **Son numéro ouvre l'issue** à l'adresse que `faits.attend`
  donne — la box connaît le dépôt, l'app n'en compose aucune. Sans cette adresse (un runtime d'avant
  ce champ, ou une box qui ne connaît pas son dépôt), il n'ouvre rien, et son survol le dit.
- **Une ligne sans numéro n'est dans aucune colonne** : la station sans connexion Max, le bilan des
  arrêts faute de grant. Elles restent dans le bloc, à droite. Le compteur `t'attend` de la carte de
  projet compte les décisions, la colonne compte ses cartes : une station déconnectée fait l'écart.
- **T'attend peut ne pas être lue**, et la colonne le dit (`?`, `pas lue : le bloc `attend` de
  `run status` n'a pas été pris pour ce projet`) : `status` pas encore lu, raté, ou sans bord. Ce
  n'est pas « rien ne t'attend » — les tickets restent alors dans la colonne de leur mot d'état.
  La colonne ne dit jamais elle-même que rien ne t'attend : vide, elle dit `aucun ticket en tête
  d'une ligne du bloc `attend``, et c'est le bloc qui dit le reste.
- **Un ticket `86` qui ne t'attend pas** — sa station lui a donné une heure de retour — **n'est
  d'aucune colonne**, comme un ticket dont l'app ne connaît pas le mot d'état : il se lit **sous les
  colonnes**, sous le titre `hors des cinq colonnes`, avec son mot ; `run rail`, dessous, dit quand
  il revient. Un `86` sans heure de retour, ou remonté par la pass, est dans le bloc : donc dans
  T'attend.
- **Un numéro ouvre l'issue** dans ton navigateur. L'adresse est celle que la box donne pour ce
  ticket — celle de son issue, telle que le runtime l'a reçue de GitHub pour le dépôt que le
  projet lui déclare. L'app n'en compose aucune. **Seule une adresse en `https` s'ouvre** : sinon le numéro n'est pas un lien, et
  son survol le dit.
- **Une couleur par état** : `en attente` gris, `pris` bleu, `en pass` jaune, `servi` vert,
  `BLOQUÉ` et `86` rouges. Le point d'une colonne a celle de son état ; celui de T'attend est rouge.
- **Pas de tags sur les cartes** : le ticket s'ouvre sur son issue, où ses labels sont, à jour.
- Une box qui rend un rail vide dessine cinq colonnes vides (`aucun ticket`) — un fait, pas une
  lecture manquée. Une box qui ne rend pas `faits` ne dessine pas de rail : le titre dit le cas.
- **T'attend ne vaut que pour un projet dont `status` est lu** — celui qui est affiché, ou tous
  dans « Tous les projets ». Quand tu quittes un projet, son bloc est lâché : à ton retour la
  colonne dit `?` le temps de la première lecture, plutôt que de ranger des faits frais d'après un
  bloc d'il y a une heure.
- **Trois lectures, trois heures** : les colonnes datent de la dernière lecture de `faits`,
  T'attend de celle de `status`, le texte dessous de celle de `rail`. Le titre du rail porte les
  deux premières, et elles peuvent différer de trente secondes : un ticket qui vient de bouger peut,
  le temps d'une lecture, se lire dans T'attend avec un mot d'état qui n'attend plus.
- **Les colonnes tiennent dans la fenêtre à sa taille d'ouverture** ; plus étroite, elles défilent.

### La bannière d'arrêt

Quand la box dit la cuisine `arrêtée` — ton « stop » —, l'espace du projet le dit en tête, au-dessus
des onglets, quel que soit l'onglet :

```
CUISINE À L'ARRÊT — ton « stop » tient
Tous les cooks en cours ont été arrêtés, et plus aucun n'est lancé — redémarrage du runtime
compris, jusqu'à « reprendre ».
écrire la relance dans le second, sans envoyer :  [garde-fous reprendre]
```

- **Le bouton écrit la relance, il ne relance pas** : `!ssh <hote> brigade <nom> garde-fous reprendre`
  dans le second, sans Entrée — tout ce que « Les boutons écrivent, ils n'envoient pas » dit vaut
  ici.
- **Elle part d'elle-même** à la première lecture qui ne dit plus `arrêtée` : trente secondes au
  plus après ton « reprendre ».
- **`éteinte` n'a pas de bannière** : un runtime arrêté ne se relance pas par un geste de
  « Piloter » (`sudo systemctl start brigade@<projet>`, sur la box). Sa pastille est rouge, et
  `status` dit le reste.

### Un mot que l'app ne connaît pas

Les deux listes d'états sont fermées, et c'est sur elles seules que l'app pose une couleur. Si le
runtime en gagne un — de projet ou de ticket —, **il s'affiche tel quel, sans couleur** : pastille
vide, mot nu. L'app ne le range dans aucune des couleurs qu'elle connaît.

### Une box qui ne rend pas ses faits

**L'app ne dessine alors rien de ce projet — jamais un tableau vide, jamais des zéros.** À la place
de la carte, ce qu'elle a obtenu ; dans la barre, un `!` sans couleur ; dans l'onglet Rail, une
ligne qui renvoie au panneau. Et **`status` reste lisible dessous** : `faits` est lu à part, son
échec ne retire rien au reste.

**À part, mais pas de front** : `faits`, `status` et la commande d'un onglet sont trois lectures,
et pour un même projet elles passent **l'une après l'autre** — un projet n'ouvre qu'une connexion
`ssh` à la fois, quel que soit le nombre de lectures qui l'attendent. Dans « Tous les projets », une box
reçoit donc au plus une connexion par projet qu'elle sert, pas deux.

| À l'écran | Ce que l'app a obtenu | Ce qu'elle montre dessous |
|---|---|---|
| ``JOINT, MAIS `faits` N'A PAS RÉPONDU — essai de …`` | `ssh` a joint la box, et la commande y a échoué sans que son code dise un cas. **Un runtime d'avant `faits` est le cas attendu** | la commande lancée, ce qu'elle a écrit, son code — puis le geste : mettre le runtime à jour sur sa box (`docs/runtime.md`, « Piloter ») |
| `JOINT, MAIS INCONNU DE LA BOX`, `… SANS LE DROIT DU GESTE`, `… UNE COMMANDE MANQUE SUR LA BOX`, `… LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME` | le geste de la box a refusé (codes 65, 68, 69 ou 127, 70) : **le même cas que sous `status`**, avec les mêmes mots | ce que la box en a dit, tel quel — puis **le renvoi de ce cas**, celui du tableau de « Tous les projets ». Pas de mise à jour du runtime : ce n'est pas lui qui est vieux |
| ``LA BOX N'A PAS RENDU LA FORME DE `faits` — essai de …`` | la commande a abouti, et sa sortie n'est pas la forme : pas du JSON, un champ qui manque, un compteur qui n'est pas un nombre entier | **la sortie, mot pour mot**, puis ce qui n'est pas la forme (`« compteurs.rail » n'est pas un nombre entier positif`) |
| `PAS JOINT — essai de …` | rien qui prouve que la box a été jointe | le message de `ssh`, tel quel — le même que sous `status`, où ses renvois sont donnés |

Un champ qui manque refuse la forme **entière** : l'app ne complète rien. Un champ de plus est
laissé de côté.

### Ce qui n'est pas dessiné, et ne le sera pas ici

- **Le journal, les grants, la sortie de `station`** restent du texte : ce sont des flux, pas des
  tableaux à états.
- **Aucune jauge chiffrée**, ni du quota ni de la machine : le runtime ne connaît pas la
  consommation du compte (`/usage` la donne) et ne chiffre la machine que lorsqu'elle sature. Les
  lignes `quota` et `machine` de `station` se lisent telles quelles, dans « Tous les projets » et dans Cooks.
- **Pourquoi** une cuisine est retenue, ce qu'un ticket attend, qui le tient : c'est `status` et
  `rail`, en texte, juste dessous.

## Ce que la box dit du projet

À droite du terminal, sans rien taper, et quel que soit l'onglet : la carte du projet, puis **ce
qui t'attend, mis à part**, puis la sortie de `run status`, **mot pour mot**. (Les grants ont leur onglet.) L'app n'y lit rien
et n'en redit rien — si la formulation d'une commande change, ce que tu vois change avec elle. Elle
n'en découpe qu'une chose, par son bord : le bloc `attend`.

### Ce qui t'attend, mis à part

En tête du panneau, et en tête de chaque projet dans « Tous les projets », sur son propre fond : **le bloc
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
- **Pour le mettre à part, l'app ne lit que le bord** : la seule ligne de la sortie qui commence
  par `attend`, la seule qui vaut `fin attend` (`docs/runtime.md`, « Ce qui attend le chef »). Rien
  de ce que le bloc porte n'est compté ni reformulé. Elle ne sait donc pas *si* quelque chose
  t'attend : le bloc plein et le bloc vide ont le même fond, pas de couleur d'alerte, aucun compteur
  dans la barre.
- **Le numéro qu'elle y lit** — une chose, et une seule, pour ranger le rail (« Le rail », colonne
  T'attend) : **le numéro de ticket en tête d'une ligne du bloc**. La forme est celle que `status`
  écrit : deux espaces, `#`, des chiffres, puis deux espaces ou la fin de la ligne (`  #12  depuis
  2 j  …`). **C'est un contrat de plus entre le runtime et l'app, sur un texte** : le reste de la
  ligne n'est pas lu — il est posé sur la carte, mot pour mot —, un numéro ailleurs qu'en tête (le
  ticket qu'un `BLOQUÉ` attend, celui d'une PR) ne l'est pas non plus, et une ligne qui ne commence
  pas ainsi n'est à aucun ticket. Si le runtime écrit cette tête autrement, T'attend se vide sans
  le dire, et les tickets se lisent dans leurs colonnes d'état : c'est pourquoi un test de l'app
  fait écrire le bloc par le runtime lui-même, une attente de chaque sorte, et rougit les gates
  avant (`app/test/attend.test.ts`).
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

Tu ne dictes plus aucune commande. L'app lance **le geste de la box**, `brigade <nom> status` —
et, pour l'onglet de contenu affiché, `brigade <nom> rail`, `station`, `grant` ou `journal`
(`docs/runtime.md`, « Piloter ») : le compte, l'installation et
l'environnement se lisent sur la box, dans l'unité du projet. Le geste doit donc y être posé, et
permis à ton compte sans mot de passe (`docs/installer.md`, « Préparer la box »).

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
le projet, ou chacun dans « Tous les projets » ; changer de projet lit le nouveau tout de suite. **Une lecture
ne s'affiche que dans l'écran qui l'a demandée** : celle de « Tous les projets », encore en route quand tu
ouvres un espace, n'y est pas montrée — et l'inverse. En tête du
panneau, **l'état du projet et l'heure de la dernière lecture** (`pilotable — lu à 14:32:07`) :
ce sont les seuls faits que l'app ajoute. Les durées affichées dessous sont celles que `status`
comptait à cette heure-là.

**Quand la box n'est pas lue, c'est une erreur, et elle prend toute la place.** L'en-tête passe à
`PAS JOINT — essai de 14:32:37, le prochain suit seul`, à `JOINT, MAIS PLUS PILOTABLE — …` ou à
`JOINT, MAIS INCONNU DE LA BOX — …`, `JOINT, MAIS SANS LE DROIT DU GESTE — …` ou `JOINT, MAIS UNE
COMMANDE MANQUE SUR LA BOX — …` (les états de « Tous les projets », dits pareil ici), et dessous il n'y a
plus que ce que l'app a obtenu — la commande lancée, ce qu'elle ou `ssh` a écrit, et le code de
sortie — puis, quand le code le permet, où est écrit le geste qui y répond.

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade status
ssh: connect to host box port 22: Operation timed out

→ code de sortie 255

`ssh` n'a pas ouvert de session sur la box, et il a dit pourquoi : son message est ci-dessus. L'app ne le lit pas.
Ce que chacune de ses phrases veut dire, et le geste qui y répond :
(docs/installer.md, « Joindre la box »)

S'il dit ta clé refusée (`Permission denied`), la box répond et c'est l'accès qui te manque. Il se donne sur la box :
(docs/installer.md, « Ajouter un humain »)
```

Un lecteur que la box joint mais à qui le geste n'a pas été donné lit ceci, sous `JOINT, MAIS
SANS LE DROIT DU GESTE` :

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade status
brigade : « lecteur » n'a pas le droit de lancer le geste sur cette box — sans terminal, `sudo` ne le lui donne pas sous le compte « brigade » sans mot de passe (docs/installer.md, « Ajouter un humain »)

→ code de sortie 68

La box a été jointe, et son geste a refusé le compte par lequel ton `ssh` la joint : ce qu'il en a dit est ci-dessus.
Ce n'est ni une panne ni un runtime à mettre à jour : c'est un droit qui manque à ce compte.

Il se donne sur la box, par quelqu'un qui y a `sudo` — l'app ne le fait pas à ta place :
(docs/installer.md, « Ajouter un humain »)
```

- **Rien n'est gardé de la lecture d'avant** : pas d'état périmé à côté de l'erreur. Une
  micro-coupure remplace donc l'écran par une erreur, jusqu'à la lecture suivante.
- **L'app ne devine pas la cause.** Un code 255 vient de `ssh` : pas joint. Un autre code vient
  de la box, dont le message est affiché (`brigade : …`) : 65, le geste ne connaît pas le projet ;
  68, il te refuse ; 69 ou 127, une commande manque à la box ; 70, son `node` ne convient pas au runtime ; un autre, joint, mais plus
  pilotable.
- Le panneau et l'onglet de contenu affiché sont lus chacun pour soi : l'erreur de l'un s'affiche
  chez lui, sans rien retirer à l'autre. Dans « Tous les projets », où un projet a deux commandes, une seule
  en échec et c'est l'erreur qui s'affiche, sans la sortie de l'autre.
- Un `ssh` qui n'a rien rendu en trente secondes est arrêté, et l'app dit ce qu'elle en sait :
  - `→ aucune réponse en 30 s : ssh arrêté` — `ssh` était connecté (il sort alors de lui-même,
    en 255) et c'est la commande qui n'a rien rendu : « joint, mais plus pilotable ».
  - `→ aucune réponse en 30 s : ssh arrêté, sans avoir dit s'il avait joint la box` — `ssh` est
    mort du signal, sans code : rien ne dit jusqu'où il était allé. Ses dix secondes pour joindre la box
    (`ConnectTimeout`) ne couvrent pas ce qui suit la connexion : un agent ssh qui attend une
    confirmation (Touch ID, 1Password, `ssh-add -c`) le retient sans limite. L'app ne sait pas
    où il en était : elle l'affiche « pas joint », sans le geste de mise à jour du runtime —
    rien ne dit qu'il y a un runtime à relancer — et sans renvoi à la doc : `ssh` n'a rien écrit
    qui s'y lise.

Le journal se lit dans `derniers événements`, rafraîchi avec le reste, et, pour sa fin (les 200 derniers
événements), dans l'onglet **Log**. Pour le suivre en direct : `run status -- --suivre`, dans un shell de l'espace.

## Fil repris, ou session neuve : l'app le dit

Sous les onglets, une ligne dit ce qui est affiché. Pour le second, elle prend l'une
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
| … et sans box | ajouter `BRIGADE_SSH_BIN=<un script qui imprime une sortie de status>` — et, pour voir ce qui se dessine, l'exemple de `docs/runtime.md` quand ses arguments finissent par `faits` |

- **Pas de build.** Le process principal est du TypeScript exécuté tel quel par Electron (son
  Node efface les types, comme celui du runtime) ; la vue est du JavaScript contrôlé par `tsc`
  (`// @ts-check`), qui importe xterm.js par une *import map* — ni bundler ni étape de
  compilation.
- **Aucun test ne lance Electron.** Ce qui se prouve vit dans onze modules joués par
  `node --test` : `config.ts` (le fichier des projets : le lire, le créer, y ajouter un projet),
  `suivi.ts` (le même fichier relu quand il change, sur de vrais fichiers et la vraie veille du
  système), `lancement.ts` (ce que `start` pose avant Electron — les commandes y sont relevées,
  pas lancées), `terminaux.ts` (le registre : qui est
  lancé, gardé, relancé, et ce que l'app en dit), `pty.ts` (le vrai pty, contre un faux `claude`),
  `box.ts` (la veille des box et ses états, contre un faux `ssh` que chaque test écrit : ni
  réseau ni box), `attend.ts` (le bloc `attend` pris par son bord, sur des sorties recopiées du
  runtime ; et le numéro en tête d'une ligne, sur le bloc que le runtime écrit lui-même — le test
  appelle `decrireAttentes` de `runtime/src/attend.ts`), `barre.ts` (le monogramme d'un projet), `onglets.ts` (les quatre onglets de contenu :
  chacun relaie un script qui existe dans `runtime/package.json`, et seul l'affiché est lu),
  `boutons.ts` (ce que chaque bouton écrit, comparé à « Piloter » de `docs/runtime.md` — et, dans
  le registre et sur le vrai pty, que rien n'est envoyé), `faits.ts` (ce qui se dessine : la
  forme lue champ pour champ sur l'exemple de `docs/runtime.md`, ce qui n'est pas elle refusé sans
  un zéro, une couleur sur les seuls mots des listes fermées, l'adresse d'une issue, la bannière —
  le rail rangé en cinq colonnes, T'attend d'après le bloc `attend` tenu à côté des faits —
  la vue en reçoit un tableau prêt à poser, et n'y calcule rien).
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
- Dire *pourquoi* une cuisine est retenue, ou ce qu'un ticket attend, autrement qu'en texte : la
  forme de `faits` ne le porte pas, et l'app ne lit de la sortie de `status` que le bord du bloc
  `attend` et le numéro en tête de ses lignes.
- Ouvrir l'issue d'un ticket qui t'attend sans être sur le rail (une issue écartée par le manager,
  une épique en question) : `faits` ne donne d'adresse que pour les tickets du rail, et l'app n'en
  compose aucune.
- Dire qu'un runtime ne bat plus : elle affiche l'écart entre son dernier tick et la lecture, sans
  seuil ni couleur.
- Montrer dans la barre *combien* de décisions t'attendent : le nombre est dans la carte.
- Suivre le journal en direct hors d'un terminal : l'onglet **Log** relit sa fin, toutes les
  trente secondes.
- Savoir si tu es en train de taper dans le second, s'il est prêt, ou ce qu'il affiche : l'app ne
  lit pas le terminal. Un bouton écrit à la suite de ta frappe, n'écrit pas dans un second qu'il
  vient de lancer, et écrit dans un dialogue ou un mode vim comme dans l'invite — ses caractères y
  sont des touches (« Les boutons écrivent, ils n'envoient pas », « La limite »).
- Retirer ou renommer un projet, régler quoi que ce soit d'autre : l'app ajoute un projet, le
  reste se fait dans le fichier.
- S'installer comme une app (empaquetage, signature, mise à jour) : lancée depuis le Finder, elle
  n'aurait d'ailleurs pas le `PATH` de ton terminal.
