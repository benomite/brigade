# L'app comme poste de travail : le rail au centre, le second à droite, des alertes qui se taisent

**2026-10-13.** Dessinée avec le chef, en session. Elle ne remplace pas la maquette
(`docs/maquettes/app/`) : elle en garde **toute la langue visuelle** — palette, Archivo +
JetBrains Mono, formes d'état, posées par #470, #471, #472 — et elle en change **la structure**.

## Ce qui a motivé cette spec

Cinq phrases du chef dans une seule journée :

| Ce qu'il a dit | Ce qu'il demandait |
|---|---|
| « le rail est vide, je vois rien » | *qu'est-ce qui se passe ?* |
| « à quoi sert la colonne de droite ? » | *pourquoi tu me montres ça ?* |
| « une card m'attend, qu'est-ce que je dois faire ? » | *que dois-je faire maintenant ?* |
| « je sais toujours pas comment lancer/arrêter le manager » | *où est le bouton ?* |
| « toujours en attente d'un truc, c'est relou » | *pourquoi je suis le goulot ?* |

**Cinq questions, une seule forme : « et maintenant ? »** L'app répond chaque fois par un **état**,
jamais par un **geste**.

La cause : **l'app est rangée comme la machine** — rail, cooks, consommé, journal, gestes en
panneau. Ce sont les concepts du runtime. Le chef, lui, fait trois choses : **décider**,
**regarder ce qu'il construit**, **surveiller ce que ça coûte**. Aucune des trois n'avait d'écran.

Et quatre pannes silencieuses le même jour, toutes de la même forme — *le rail avait l'air normal
et ne tournait pas* :

- le **manager éteint** : le chef a demandé deux fois comment l'allumer ;
- la **version** du runtime 26 merges en arrière, qui se déclarait à jour (elle se comparait à son
  propre clone, que personne n'avait rafraîchi) ;
- la **cuisine gelée** après une mise en service, faute de station déclarée ;
- le **grant** éteint seul la veille, deux livraisons vertes restées en plan.

## Le modèle, en quatre règles

1. **Un seul écran, trois zones.** Une bande d'alertes en haut, le rail au centre, le second à
   droite. On ne change jamais d'écran, donc on ne perd jamais le contexte.
2. **Un clic appelle un LLM, ou il n'en appelle pas.** S'il faut lire, juger, rédiger ou arbitrer :
   un **prompt rempli** dans le second, **qui ne part pas** — le chef fait Entrée. Sinon : la
   commande **part** (`!`), et sa sortie se lit dans le même fil.
3. **Un geste destructif ou lourd demande « oui » avant** — une confirmation, **pas** un LLM. Et
   elle dit **ce qu'elle va faire**, pas « es-tu sûr ? » : la convention est déjà celle du geste de
   désinstallation (#394).
4. **Les alertes se taisent.** En marche normale, la bande est vide. Ce qui n'a rien à dire ne
   prend pas de place — c'est déjà la convention de la file (`dérive`, `worktrees`, `stations`,
   `connexion`, `grant` : *« absents quand il n'y a rien à dire »*).

## Les trois zones

### La bande d'alertes

Elle répond à une seule question : **est-ce que ça peut tourner ?** Son test d'admission :

> **Ce qui décide si — et comment — ça tourne sans le chef.**

Quatre choses y entrent, et ce sont les quatre pannes du jour : **le manager** (éteint, rien
n'avance), **la version en service** (périmée, on regarde le produit d'hier), **la cuisine**
(arrêtée ou sans station, le rail est un décor), **le grant** (actif, ça merge sans lui ; éteint,
tout s'arrête en pass).

C'est **par projet**, pas par app : un manager par projet, une version par projet. Une bande d'app
mentirait dès le deuxième projet déclaré.

Chaque alerte porte **son geste** et, quand il en a un, **son prix** : « mettre en service — 1 cook
en vol sera interrompu, son ticket repart de zéro ».

**La discipline, sans laquelle la bande meurt :**

> **Une alerte est une chose à faire, jamais une chose à savoir.**
> Le test : *est-ce que ça change ce que je fais dans les cinq minutes ?*

`aucune station déclarée` → oui, rien ne part. `une version attend depuis 5 h` → oui.
`sauvegarde il y a 10 h` → non, c'est Paramètres. `transcripts : 162 gardés, 60 Mo` → non.

**Et le silence doit être prouvé, jamais supposé.** C'est la condition de tout le reste :

| Ce qui doit alerter | La file sait-elle le dire ? |
|---|---|
| La version périmée | **oui** — bloc `version`, comparé contre l'origine (#476). Et `null` n'y vaut pas « à jour » : il vaut « rien n'a été comparé » |
| Le grant éteint | **oui** — absent tant qu'aucun grant ne vaut ni ne s'est éteint seul |
| La cuisine arrêtée, sans station | **oui** |
| **Le manager éteint** | **non. Aucun bloc `manager` dans la file.** Son état vit dans `run manager`, à part |

Le dernier est le trou, et c'est le plus gros : **#438** le porte déjà.

### Le rail, au centre

**C'est la vue principale.** Elle montre ce qui se passe, ce qui va se passer, ce que le chef doit
faire, et ce qui est fini — ses cinq colonnes existent : **Sur le rail · Au travail · T'attend ·
Pass · Livré**.

Une carte porte ce que la file dit déjà : qui la tient, depuis quand, le bail, **ce qu'elle brûle
en direct**, et en clair ce qui la bloque (« zone tenue par #465 »). Son geste est un **prompt** :
« explique-moi ce ticket », déjà livré pour `T'attend` par #452.

**`T'attend` remplace tout bloc séparé de ce qui attend** — mais la colonne a deux limites, que le
code dit lui-même : elle ne dit jamais « rien ne t'attend », et **une carte est un ticket**. Une
ligne du bloc `attend` sans numéro n'a aucune carte possible. Il en existe déjà une : la **version
qui attend**. Elle va donc dans la bande d'alertes, pas dans une colonne.

**Un seuil de coût franchi entre dans `T'attend`** : ce n'est pas une mesure à consulter, c'est une
proposition de fermeture, donc une décision — le mécanisme est livré (#464).

### Le second, à droite, en permanence

Il n'est plus un onglet. Raison : **c'est le seul agent du système qui parle au chef.** Le manager
écrit des issues, les cooks du code, le reviewer des remarques — aucun ne lui adresse la parole.
Ranger son interlocuteur dans un tiroir qu'il faut aller chercher, c'est perdre le fil à chaque
geste.

**Ce qu'on gagne à passer par lui, c'est le jugement, pas la frappe.** Exemple vécu le 2026-10-13 :
pour mettre le runtime en service, le second a lu l'état, **attendu que le rail soit calme**,
basculé, vérifié, puis rendu compte. Un shell aurait exécuté la ligne et tué deux cooks (456 075
tokens en vol).

**Une action directe rend compte à gauche ou par sa propre sortie — jamais par le récit du second.**
Sinon il raconte ce qu'il n'a pas fait, et le fil se remplit de bruit machine.

### Deux onglets

**Coût** — le relevé, les tokens par ticket, les tickets payés plusieurs fois, les seuils, le
calibrage. De la consultation : un seuil *franchi*, lui, est une alerte.

**Paramètres** — l'intendance (installation, sauvegarde, transcripts), les stations, les grants
(révoquer, modifier), le projet. **On règle ici, on voit là-haut** : le grant se règle en
Paramètres et son état s'affiche dans la bande.

## Ce qu'un clic fait, geste par geste

| Geste | Ce qui part |
|---|---|
| allumer / éteindre le manager | **direct** |
| vérifier l'installation | **direct** |
| ouvrir une livraison d'interface dans le navigateur | **direct** |
| mettre le code de l'app à jour | **direct** |
| poser un seuil, changer le calibrage | **direct** |
| `stop` / reprendre la cuisine | **confirmé** — dit les cooks en vol et leurs tokens |
| activer / révoquer le grant `merge` | **confirmé** — dit « une pass verte sera mergée sans toi » |
| mettre en service | **confirmé** — dit ce qu'il interrompt |
| « cette carte m'attend, explique et débloque » | **prompt** |
| répondre à une question du manager sur une issue | **prompt** |
| transformer un retour terrain en ticket | **prompt** |

**Une action directe qui rencontre une condition s'arrête et demande** — elle ne choisit pas à la
place du chef. La mise en service est directe, sauf s'il y a des cooks en vol : alors elle dit ce
qu'elle tuerait et attend son mot. C'est #477.

## Entre projets

Une alerte sur un projet que le chef ne regarde pas se signale **sur sa case de la barre
d'icônes**, et mène à **« Tous les projets »** (`#tous`, livré par #364) pour le contexte global.

Conséquence assumée : **l'app interroge toutes les box déclarées**, pas seulement celle du projet
ouvert.

## Ce que cette spec ne fait pas

- **Elle ne demande aucun fait nouveau au runtime**, sauf l'état du manager dans la file (#438). Si
  un état ne peut pas être montré parce que la box ne le dit pas, c'est un ticket pour le runtime —
  jamais une déduction de l'app.
- **Elle n'envoie jamais un prompt à la place du chef.** Un clic avec jugement remplit et s'arrête.
- **Elle ne met pas le journal à l'écran** : c'est de l'outillage de panne, il vit derrière un
  geste.
- **Elle ne crée pas de boîte de réception.** Le chef n'est pas une machine qui tire du travail :
  ce qui l'attend est déjà sa file.
- **Elle ne touche pas au thème** : la maquette est sombre, un choix de thème est un autre sujet.
- **Elle ne rend rien moins lisible qu'avant.** Le relais mot pour mot de la box n'est ni tronqué
  ni reformaté : c'est le seul endroit où une « jolie » mise en forme serait une régression.

## Ce dont elle dépend

| | |
|---|---|
| **#438** | l'état du manager et des grants dans l'app — **le trou de la bande d'alertes** |
| **#475 → #479** | le geste de mise en service, nommé, sans `sudo`, avec son avertissement |
| **#483** | les décisions du chef posées par un geste, pas par un `sudo` dans un drop-in |
| **#404**, #406 | regarder une livraison d'interface avant qu'elle soit mergée |
| #452, #464, #476, #364 | livrés : le clic d'une carte, la proposition de fermeture, le bloc `version`, l'écran de tous les projets |

## Ce qu'il reste à éprouver avant de dessiner

**Une seule chose, et elle décide si « ça part » est une promesse ou un espoir.**

Aujourd'hui l'app n'envoie **jamais** — parce qu'elle écrit dans un pty à l'aveugle et ne sait pas
ce qu'il affiche. Son propre code l'avoue : *« devant un dialogue ou en mode vim, ce qui est écrit
est pris pour des touches ; la note ne promet donc pas que rien n'est parti. »*

Cette spec demande l'inverse pour les gestes directs. **Personne ne sait ce que devient un `!`
envoyé dans la saisie d'un second occupé** — mis en file, ou avalé. À éprouver avant de dessiner,
et deux conséquences possibles :

- l'app doit porter un **vrai champ de saisie** pour le second, qu'elle contrôle, plutôt que
  d'écrire en aveugle dans un terminal ;
- ou le geste direct doit savoir si le second est libre, et le dire quand il ne l'est pas.

**Et un critère produit qui en découle : les gestes directs doivent sortir court.** La sortie d'un
`!` entre dans le contexte du second — c'est voulu, c'est ce qui lui permet de savoir ce que le
chef a fait sans qu'on le lui dise — mais chaque tour suivant la paye en entrée. Un `!` qui crache
quinze événements et leurs JSON coûte pour le reste de la session.
