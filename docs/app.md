# L'app

Une fenêtre sur le Mac : tes projets dans une barre d'icônes, et dans chacun un vrai terminal où
tourne le second. Tu n'ouvres plus un terminal, tu ne te places plus dans un dossier.

**Au centre de l'espace, le rail** : c'est la vue principale — cinq colonnes, et sur chaque carte ce
que la file dit du ticket. **À droite, les terminaux, en permanence** : le second, et à côté de
lui, au même niveau, les shells que tu ouvres — rien de ce que tu regardes au centre ne les cache.
**L'écran principal ne garde que trois choses : la bande d'alertes, le rail et les terminaux** ; il
n'y a rien en bas de la fenêtre. Le reste est derrière deux onglets, en haut, à côté du nom du
projet : **Coût** (le consommé) et **Paramètres** (l'état du projet, la sauvegarde et son
ancienneté, les réglages, le manager, les grants) — lus pour toi, sans rien taper. Leur page
s'ouvre **par-dessus le rail**, et le rail revient tel que tu l'avais laissé quand tu la fermes.
**Dans la bande d'alertes, chaque alerte tient en une ligne et un contrôle** (#907) : la ligne dit ce
qui ne va pas en une phrase, et son seul bouton fait le geste (ou écrit la demande dans le second —
« ask the second »). Rien d'autre n'est écrit à plat. **Le prix est dans la confirmation, au clic** :
un geste qui coûte ouvre sous la ligne sa confirmation, qui dit son prix en une ligne — une demande au
second aussi (`ask the second…` : « ask the second to lift it », ce que coûtera le lever, et `yes, write
the request`, qui l'écrit sans l'envoyer) ; un geste sans prix part au clic. **Ce que la box en dit mot
pour mot** et la raison **sont derrière « detail »**, au bout de la ligne : un clic les déplie dessous,
un second les replie, et une relecture de la bande ne les replie pas. Le geste, lui, n'y est jamais
écrit — ni commande à recopier ni mode d'emploi : le seul geste montré est le bouton de la ligne.
**Le grant `merge` est un interrupteur** (#907), à côté de celui du manager et du même rendu — `merge
on` ou `merge off` —, lu dans les lignes de tête de `status` : un clic ouvre la confirmation d'accorder,
ou de révoquer, qui dit ce que ça change. Éteint de lui-même (son échéance passée), il est cerné de
jaune, sa ligne de `status` au survol, et la bande n'en fait plus de ligne ; « bientôt éteint » reste
une ligne, à prolonger. **Le manager n'est pas une ligne de la bande :
c'est un interrupteur** (#906), en tête de l'espace, à droite des onglets — `manager on`, glissière verte
à droite, ou `manager off`, grise à gauche —, toujours en vue, et un clic le bascule : éteindre part
dans le second ; allumer ouvre sa confirmation dessous, qui dit son prix en une phrase avec le nombre
réel d'issues (`it will judge the 23 open issues`, ou `it will judge 21 of the 23 open issues — 2 carry
blocked-on-human`), ce qu'il engage au survol. Éteint, **la tête du rail est marquée à l'arrêt** — une
barre hachurée, `manager off — nothing new comes in` — : ce qui est déjà sur le rail continue, rien de
neuf n'y entre. La ligne `manager` de la box (`ÉTEINT since … (by chef) — …`) n'est plus qu'au survol
de l'interrupteur, et en entier dans l'onglet Manager. Pas encore lu, ou pas lu, l'interrupteur ne dit
ni l'un ni l'autre (`manager …`) et ne bascule rien ; une lecture qui échoue fait sa ligne « non
vérifié » dans la bande. Sur la barre, la case d'un projet au manager éteint garde son signal.
**« Tous les projets » est la vue d'ensemble de
brigade** : une ligne par projet, une par station, chacune avec sa pastille et ce qui s'y passe en
quelques mots, et un clic l'ouvre — on n'y agit pas, on y regarde, puis on va où ça se décide.
**Cost, la vérification d'un projet et Settings suivent les mêmes règles** : aucun mode d'emploi à plat
(l'explication d'un onglet, à quoi sert une étape de l'installation et ce qui arrive si on la saute vivent
au survol d'une icône « ? »), chaque geste est un bouton qui dit son mot — un geste qui écrit le début d'une
commande dans le second se nomme (« Set the cooks of a station… »), la commande n'est écrite nulle part —,
une lecture en échec tient en une ligne (le texte de `ssh`, le renvoi et le code de sortie au survol), et une
confirmation de geste coûteux dit son prix en une ligne, le reste et sa source au survol.
**Le journal n'est plus à l'écran** : c'est de l'outillage de panne, il s'ouvre par le geste
« journal », en tête de l'espace. Et en tête de la barre, l'écran **Tous les projets** : tes projets et tes
stations d'un coup d'œil, et la santé de Max et de GitHub en une ligne.

**L'app dit aussi quand son propre code est en retard.** Elle tourne sur le code d'un clone, et un
clone que personne ne met à jour, c'est une app qui montre moins que ce qui est livré : la case **T**
passe en jaune, son survol et les réglages de chaque projet disent de combien de commits son clone est
en retard sur son origine (voir
« Le code de l'app : à jour, ou en retard »). Et elle passe à la nouvelle version d'elle-même : à
sa prochaine ouverture, ou tout de suite d'un clic — sans terminal, sans commande à recopier.

Ce qui est **un tableau à états est dessiné** : une pastille par projet dans la barre, une carte
de cinq compteurs avec ses cooks en cours, le rail en cinq colonnes, et une bannière quand la cuisine est à l'arrêt. Le
reste — le journal, les grants, la station — reste du texte (voir « Ce qui est dessiné ») ; l'état
du manager et celui des grants sont lus dans ce texte, et posés au-dessus de lui.

L'app **n'ajoute rien au runtime** et ne double aucun geste : ce qui s'accorde, se règle ou se
relance se fait dans son terminal. Ses boutons **écrivent** la commande dans le second, et ne
l'envoient pas : c'est toi qui fais Entrée (voir « Les boutons écrivent, ils n'envoient pas »). Ce
qu'elle montre de la box, elle l'a lu en lançant à ta place les commandes qui existent.

**Deux gestes font exception, parce qu'ils n'engagent rien : éteindre le manager, vérifier
l'installation.** Ceux-là **partent** : leur commande est envoyée dans le second, et sa sortie se
lit dans son fil, sans que tu recopies rien. Et quand le second n'est pas libre, ils ne partent
pas en silence : l'app dit pourquoi, et que rien n'est parti (voir « Un geste direct part
vraiment — ou dit pourquoi il ne part pas »).

**Une seule chose part de l'app vers la box sans passer par ton terminal : ajouter un projet.**
L'écran d'ajout lance le geste d'installation de la box à ta place — aucune commande à coller,
aucun port à choisir (voir « Depuis l'app »). Ce qui reste ensuite — amorcer le dépôt, merger,
vérifier, démarrer — se suit dans l'espace du projet : l'app y ouvre la session, vérifie à ta
place, et **n'écrit le démarrage que si la box dit le projet prêt** (voir « Après l'ajout : la mise
en service »).

## L'app n'est pas la cuisine

**Ce qui travaille est sur la box**, projet par projet, et tourne sans l'app et sans toi.
**L'app est la fenêtre du Mac** : elle lit, elle affiche, elle écrit des commandes dans un
terminal. La fermer n'arrête rien sur la box, et arrêter la cuisine d'un projet ne ferme pas l'app.

**Une exception, et tu la déclares : les stations que ton poste joue.** Un ticket peut demander ce
que seul ton Mac fournit — ton Chrome connecté. La cuisine reste sur la box, avec son rail, ses
garde-fous et sa pass ; mais le cook de ce ticket-là tourne chez toi, lancé par l'app, tant qu'elle
est ouverte (voir « Le poste est une station »). Un projet qui ne déclare aucune station ne lance
rien sur ton poste.

Trois mots se ressemblent, et ne disent pas la même chose :

| Le mot | Ce qu'il désigne | Où il se lit |
|---|---|---|
| **Tous les projets** | **un écran de l'app**, l'accueil : la vue d'ensemble de brigade — tes projets, tes stations, la santé de Max et de GitHub —, en tête de la barre. Il ne lance et n'arrête rien | la case ronde **T** |
| **la cuisine** d'un projet | **un état du runtime, sur la box** : `ouverte`, `retenue`, `arrêtée`, `éteinte`. C'est elle que ton « stop » arrête, et elle seule | la pastille, la carte, la ligne `cuisine` de `status`, la bannière `CUISINE À L'ARRÊT` |
| **`en cuisine`** | **l'étape d'un ticket** : un cook le tient, entre `en attente` et `en pass` — ce que le rail appelle `pris`. Elle parle d'un ticket, pas du projet | la liste des tickets d'une épique, et `pass` |

Le journal dit `kitchen.stopped` et `kitchen.resumed` pour ton « stop » et ton « reprendre » :
c'est la cuisine du projet, l'état — pas l'écran.

## Dire où sont tes projets

Un seul fichier, hors du dépôt : `~/.config/brigade/app.json`. Tes box, déclarées une fois, et un
nom et un dossier par projet — avec, pour un projet servi par une box, laquelle. **Tu n'as pas à
l'écrire pour commencer** : l'app le crée, et tu y déclares une box et y ajoutes un projet depuis
l'app.

### Depuis l'app

Au premier lancement le fichier n'existe pas : l'app le crée, vide (`{ "projets": [] }`), et
s'ouvre sur **Ajouter un projet**. Ensuite, c'est le **+**, en pied de la barre.

**Ajouter un projet, c'est l'installer sur sa box** — un seul écran, sur une box déjà préparée :

| Ce que tu donnes | Comment |
|---|---|
| **Son dossier sur ce poste** | `Choisir…` ouvre le sélecteur de dossiers du Mac : il ne se tape pas |
| **Son nom** | proposé d'après le dossier, tant que tu n'en as pas tapé un autre. C'est aussi celui de son instance sur la box (voir plus bas) |
| **Son dépôt GitHub** | `<propriétaire>/<nom>` : c'est lui que la box clone. L'app le lit dans l'origine du dossier choisi (`git remote get-url origin`) et le propose ; corrige-le si ce n'est pas lui. Sans origine github.com lisible, le champ te le dit et reste à écrire |
| **Sa box** | à choisir parmi celles que tu as déclarées. Une seule déclarée : elle est déjà choisie |
| **Le calibrage du manager et du reviewer** | un modèle (`opus`, `sonnet`, `haiku`) et un effort (`low`, `medium`, `high`, `xhigh`, `max`) pour chacun : c'est ton quota. **Une valeur de départ est proposée**, avec sa provenance — tu la gardes ou tu la changes |
| **La destination de ses sauvegardes** | un répertoire **de la box**, propre à ce projet, en chemin absolu — sous la racine que la box autorise. **Proposée : `<racine>/<nom>`**, la racine étant celle que la box accepte |

**Ce qui est proposé se voit comme tel, et dit d'où il vient.** Un champ prérempli porte, sous
lui, `Proposé, pas choisi — <provenance>` ; la ligne disparaît dès que tu touches le champ — ce
qui part vers la box est alors ce que tu as choisi.

| Champ | Valeur proposée | Provenance dite à l'écran |
|---|---|---|
| Calibrage | celui du dernier projet que tu as ajouté depuis l'app (l'app le garde, avec le projet, dans `calibrage`) | `ce sur quoi « <projet> » tourne, le dernier projet que tu as ajouté ici` |
| Calibrage, faute d'un tel projet | `sonnet/medium`, la valeur mesurée sur la box de brigade | `la valeur mesurée sur la box de brigade, faute d'un autre projet ajouté ici…` |
| Sauvegardes | `<racine>/<nom>`, qui suit le nom tant que tu n'as pas touché le champ | `la racine que « <box> » accepte (<racine>, lue dans /etc/brigade-installer.conf), puis le nom du projet` |

**La racine n'est pas devinée : elle est lue.** Quand une box est choisie, l'app lit
`/etc/brigade-installer.conf` sur elle, par `ssh` (`cat`, ce fichier est lisible de tous) et en
prend la ligne `sauvegardes=`. Box pas jointe, ou réglage sans racine : le champ reste vide, et
dit pourquoi. **La racine, elle, garde son absence de défaut** : elle se pose une fois sur la box,
et l'app ne choisit jamais un disque.

**Une box se déclare une fois, pas par projet.** Sous la liste, `Déclarer une box` prend un nom —
celui par lequel ton `ssh` la joint, ce que tu tapes après `ssh` — et l'écrit dans `hotes`. Rien
n'est joint à ce moment : c'est un nom. Une deuxième box ne demande rien de plus qu'un deuxième nom.
Un fichier écrit avant cette liste n'a rien à y récrire : la box que tes projets nomment déjà
(`hote`) se propose aussi.

**Rien ne part tant qu'un champ manque.** Un champ qui se déduit ne commence pas vide, mais tu
peux le vider : `Installer sur la box, et ajouter` avec un calibrage ou une destination vide ne
joint personne, le champ est signalé, avec sa raison (`Le modèle du manager n'a pas de défaut :
c'est ton quota, choisis-le.`), et l'écran dit `Rien n'est parti vers la box`. **Le runtime, lui,
refuse toujours de démarrer sans ses cinq variables** (`docs/runtime.md`) : la valeur proposée est
écrite dans le drop-in comme une valeur choisie.

**Le nom est celui de l'instance** (`brigade@<nom>.service`), et l'écran le refuse **comme la box
le refuserait, avant de l'appeler** : minuscules, chiffres et tirets, sans tiret en tête, 63
caractères au plus. Le champ le dit à la saisie, avec la raison (`La box refuse ce nom — il
contient « C »…`). L'app ne corrige rien : tu choisis un autre nom.

**Ce qui part vers la box** — et tu n'as rien à coller : l'app lance, par `ssh`, le geste
d'installation (`docs/installer.md`, « Le geste d'installation ») :

```
ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> sudo -n /usr/local/bin/brigade-installer install <nom> --depot <propriétaire>/<nom> --sauvegardes <chemin> --manager-modele <modèle> --manager-effort <effort> --reviewer-modele <modèle> --reviewer-effort <effort>
```

**Aucun port n'est demandé ni envoyé** : la box attribue celui de la porte du projet, lit celui de
son arbitre, et les rend. La branche d'intégration n'est pas demandée non plus : la box prend la
branche par défaut de l'origine, et l'écran dit laquelle. Le clone se fait sur la box et peut
prendre quelques minutes ; l'app attend jusqu'à un quart d'heure.

**Installé, le projet est déclaré dans l'app** avec son `hote`, à la suite des autres, et l'écran
reste pour te montrer ce que la box a rendu :

```
« calculus » est installé sur la box « box », et déclaré dans l'app.
Ports attribués par la box — porte : 3129 · arbitre : 4100.
Branche d'intégration : `main`, lue par la box sur l'origine du dépôt.
Sauvegardes : /srv/sauvegardes/calculus, sur la box.
La box dit : le runtime du projet n'est pas démarré : vérifier d'abord (`brigade calculus installation`), puis `sudo systemctl enable --now brigade@calculus.service`
```

L'installation ne démarre pas le runtime. Sous ce que la box a rendu, l'écran dit ce qui reste —
amorcer le dépôt, merger, vérifier, démarrer — et porte le geste qui ouvre la suite : `Ouvrir
l'espace de « calculus » et y lancer /brigade:init` (voir « Après l'ajout : la mise en service »).

**Tant que la box n'a pas installé le projet, rien n'est déclaré dans l'app.** Ce que l'app a
obtenu est montré tel quel — la ligne lancée, ce que la box a écrit, le code de sortie — et dessous
ce qu'il y a à faire :

| Ce que l'écran dit | Ce qui s'est passé | Quoi faire, et où |
|---|---|---|
| `La box « … » n'a pas été jointe` | `ssh` n'a pas ouvert de session (code 255), ou n'a pas pu être lancé | `docs/installer.md`, « Joindre la box » — et « Ajouter un humain » si ta clé est refusée |
| `… a été jointe, et le geste d'installation n'y a pas répondu` | la box répond, mais `brigade-installer` n'y est pas posé — une box préparée avant lui —, ou sa règle sudoers ne le donne pas à ton compte | **l'app ne prépare pas une box** : `docs/installer.md`, « Préparer la box » — « Le geste d'installation », sur la box, par quelqu'un qui y a `sudo` |
| `… a refusé d'installer « … » (<motif>)` | le geste a répondu, et dit non : sa phrase est montrée mot pour mot — une destination hors de la racine autorisée, un réglage qui manque à la box, une installation commencée et défaite | ce que sa phrase nomme ; quand c'est la box qui n'est pas prête, « Préparer la box » |
| `« … » est déjà installé sur la box « … »` | la box n'a rien changé : ni calibrage, ni sauvegardes | s'il manque seulement à l'app, le bouton `Le déclarer dans l'app, tel qu'il est sur la box` l'écrit dans le fichier — **un second geste, le tien**, qui n'envoie rien à la box |
| `… n'a pas fini de répondre` | `ssh` a été arrêté au bout du quart d'heure : l'app ne sait pas où la box en était | rejouer l'ajout — une box qui avait fini dira le projet déjà installé, sans rien y changer |

Ce que tu as saisi reste à l'écran après un refus : tu rejoues l'ajout sans rien retaper.

Un projet que le fichier refuserait — `Pas ajouté — deux projets s'appellent « brigade »`, `dossier
introuvable : …` — est refusé **avant** la box : rien n'y est installé pour un projet que l'app ne
pourrait pas déclarer.

- **L'app n'écrit que le projet ajouté** — puis ses deux couleurs, tirées pour lui (voir « Les
  couleurs d'un projet »). Ce que tu as mis d'autre dans le fichier y reste — mais
  il est réécrit en entier, indenté de deux espaces : une mise en page à toi n'y survit pas.
- **Elle n'écrit pas dans un fichier qu'elle n'a pas compris** : `Pas ajouté — l'app n'écrit pas
  dans un fichier qu'elle n'a pas compris — JSON illisible : …`. Celui-là se répare à la main.
- **Renommer un projet se fait dans le fichier**, pas dans l'app. Le retirer se fait depuis
  l'app, et ce sont deux gestes : « Retirer un projet : de l'app, ou de sa box », plus bas. Le
  retirer du fichier à la main ne retire rien de la box non plus.
- **Un projet sans box ne s'ajoute pas depuis l'écran** : il s'écrit à la main, sans `hote`.

### Après l'ajout : la mise en service

Installé, un projet n'est pas encore servi. Quatre gestes restent, **dans cet ordre**, et l'app n'en
saute aucun. Ils sont dans l'espace du projet, en tête du panneau, sous **Mise en
service** — dépliée d'elle-même pour un projet que tu viens d'ajouter, repliée sur une ligne pour
les autres. Un projet sans `hote` n'en a pas.

| | Le geste | Ce que l'app fait | Ce qui reste à toi |
|---|---|---|---|
| 1 | **Amorcer le dépôt** — `Lancer /brigade:init dans le second` | ouvre le second de l'espace sur la session : `claude /brigade:init`, une conversation neuve dans le dossier du projet | la session elle-même : c'est une conversation Claude Code, pas une commande, l'app ne la joue pas à ta place |
| 2 | **Merger** — la case `Le résultat de /brigade:init est mergé sur la branche d'intégration` | le dit, en toutes lettres : `Le résultat de /brigade:init doit être mergé sur la branche d'intégration avant de continuer` | merger, puis cocher : **l'app ne sait pas si c'est fait, c'est toi qui le dis** |
| 3 | **Vérifier** | lance `installation` sur la box du projet, à ta place, et affiche **tout** ce qu'elle a rendu | régler ce qu'elle nomme, et vérifier de nouveau |
| 4 | **Démarrer** | ouvre un shell dans l'espace et y **écrit** le démarrage, sans l'envoyer | ton Entrée — et ton mot de passe, si `sudo` en veut un |

**Trois états, et le démarrage n'est possible que dans le dernier :**

| L'état | Ce qui se voit | `Vérifier` | `Démarrer` |
|---|---|---|---|
| **l'init n'est pas dit mergé** — le départ, toujours | la case n'est pas cochée | inactif : `Pas de vérification : le résultat de /brigade:init n'est pas dit mergé…` | inactif : `Pas de démarrage : le résultat de /brigade:init n'est pas dit mergé.` |
| **la vérification est incomplète** — dit mergé, et `installation` ne dit pas, ou pas encore, le projet prêt | `PAS PRÊT`, ou rien encore, ou ce que l'app a obtenu à la place | actif | inactif, avec sa raison : `la box n'a pas encore vérifié ce projet`, `la vérification est en cours`, `installation ne dit pas le projet prêt — ce qui manque est nommé ci-dessus…`, `installation n'a pas rendu son verdict…` |
| **tout est prêt** — `installation` est sortie en `0` | `PRÊT — vérifié à 14:32:07` | actif | **actif** |

Un bouton inactif a sa raison écrite dessous. Et ce n'est pas qu'un bouton grisé : le process
principal refuse de même — rien ne part vers la box tant que la case n'est pas cochée, et rien n'est
écrit dans aucun terminal tant qu'`installation` n'a pas dit le projet prêt.

**`/brigade:init` — l'app t'y met.** Si le second de l'espace ne tourne pas, il est lancé sur la
session, et la ligne sous les onglets de droite le dit (``session lancée sur `/brigade:init` : `claude
/brigade:init`, une conversation neuve dans ce dossier``). S'il tourne déjà — tu avais ouvert
l'espace —, il n'est pas remplacé : `/brigade:init` y est écrit, sans Entrée, comme par un bouton.
La session se rejoue sans dégât. Il faut le plugin brigade sur ton poste : sans lui, c'est `claude`
qui dit ne pas connaître la commande, dans le terminal.

**Merger, c'est toi.** La box ne voit du dépôt que ce que son origine porte : tant que le résultat
de l'init n'est pas sur la branche d'intégration, elle ne peut rien servir. Un dépôt **déjà amorcé
et mergé** n'a pas à rejouer la session : coche la case, et vérifie. Décocher la case ramène au
départ, et lâche le verdict d'avant. **Cocher sans avoir mergé ne démarre rien** : c'est
`installation` qui lit la branche d'intégration sur l'origine, et elle le dira (`MANQUE`, « Dans le
dépôt »).

**Vérifier lance la commande qui existe**, la même que la veille lance pour `status` :

```
ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> brigade <nom> installation
```

Elle ne lance ni cook ni setup, ne consomme aucun quota, et se rejoue autant qu'on veut
(`docs/installer.md`, « Vérifier que le projet est prêt »). L'app attend sa réponse deux minutes au
plus, et affiche **tout ce qu'elle a rendu, mot pour mot** — la ligne lancée, la sortie, le code :

```
PAS PRÊT — vérifié à 14:32:07
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade calculus installation

Dans le dépôt
  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`

Sur GitHub
  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …
            → la même commande, suivie de `labels`

brigade : projet « calculus » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste

→ code de sortie 1
```

**Chaque point qui n'est pas prêt est une ligne `MANQUE`, et la flèche dessous dit ce qui reste à
faire pour lui** : c'est `installation` qui les nomme, l'app n'en traduit ni n'en retire aucun. Elle
ajoute dessous ce que la box ne peut pas dire d'ici — comment « la même commande » se tape depuis
ton poste (`ssh box brigade calculus installation`, suivie de ce que la flèche nomme), et qu'un
manque « Dans le dépôt » est un résultat d'init qui n'est pas, ou pas en entier, sur la branche
d'intégration. Une ligne `à savoir` ne retient rien.

| Ce que l'app dit | Ce qui s'est passé | `Démarrer` |
|---|---|---|
| `PRÊT` | `installation` est sortie en `0`, avec sa ligne de verdict (`brigade : projet « <nom> » : prêt…`) | actif |
| `PAS PRÊT` | elle a été lancée, et il manque quelque chose (code `1`), ou elle a refusé son environnement (code `2`) : sa sortie le nomme | inactif |
| `PAS DE VERDICT` | un code `0` **sans** la ligne de verdict : ce n'est pas `installation` qui a répondu — un compte enfermé dans une commande forcée, par exemple | inactif |
| `PAS JOINT`, `JOINT, MAIS INCONNU DE LA BOX`, `JOINT, MAIS SANS LE DROIT DU GESTE`… | la commande n'a pas rendu son verdict : les mêmes cas, les mêmes mots et les mêmes renvois que sous `status` (« Ce que la box dit du projet ») | inactif |

Une vérification rejouée **retire le « prêt » d'avant** tant qu'elle n'a pas répondu : rien ne
démarre sur un verdict qu'on est en train de refaire.

**Démarrer écrit, il n'envoie pas** — comme les boutons, mais **dans un shell**, pas dans le second :

```
ssh -t <hote> sudo systemctl enable --now brigade@<nom>.service
```

C'est le geste de `docs/installer.md`, « Servir le premier ticket », celui que la box nomme en fin
d'installation. **Démarrer un service est un geste `root`**, et aucun des deux gestes de la box ne
le donne sans mot de passe : l'app ne le lance donc pas. Elle ouvre un shell de plus dans l'espace
(`shell 1`), y écrit la commande, et te le montre, à droite ; la ligne sous les onglets de droite dit ``écrit dans ce
shell, sans Entrée : `ssh -t box sudo systemctl enable --now brigade@calculus.service` — c'est la
tienne qui l'envoie…``. Un shell est un vrai terminal : `ssh -t` y porte le mot de passe que
`sudo` te demande sur la box — ce que le `!` du second ne ferait pas. Ensuite, le premier ticket se
sert sans grant `merge`, et la première sauvegarde se lance à la main : c'est toujours
`docs/installer.md`, « Servir le premier ticket ».

- **Rien n'est écrit pour un `nom` qui n'est celui d'aucune instance, ni pour un `hote` qui commence
  par un tiret ou porte un caractère de contrôle** : le bouton reste inactif, et dit pourquoi.
- **Un projet dont le dossier n'est pas là** n'a ni second ni shell : sa box se vérifie quand même,
  et le démarrage dit `« … » ne s'ouvre pas : dossier introuvable : …`.
- **La mise en service n'est gardée que tant que l'app est ouverte.** Relancée, l'app la reprend au
  départ, repliée : déplie-la, recoche la case, vérifie — la box redit tout. Un projet qui change
  de `hote`, ou qui quitte le fichier, repart de même : son « prêt » était celui d'une autre box.
- **L'app ne sait pas si le runtime a démarré** : c'est ton Entrée. La pastille du projet le dira à
  la lecture suivante — `éteinte` tant qu'il ne tourne pas.

### Retirer un projet : de l'app, ou de sa box

**Deux gestes, et ils ne se confondent jamais.** Ils sont dans l'espace du projet, dans le panneau
de droite, sous **Retirer ce projet** — une ligne repliée, sous la mise en service : un projet ne
se retire pas d'un clic perdu. Dépliée, elle montre deux blocs, chacun sous son libellé.

| | **Retirer de l'app** | **Désinstaller de la box** |
|---|---|---|
| Ce qui change | la ligne du projet quitte la barre et `app.json` — rien d'autre | ce que la box dit retirer : ses instances, leurs drop-ins, son clone réservé, ses worktrees |
| Ce qui part vers la box | **rien** — aucun `ssh` n'est lancé | son geste de désinstallation, `sudo brigade-installer uninstall <nom>`, lancé à ta place |
| Le journal du projet | intact : la box n'en sait rien | **gardé**, sauf si tu coches l'option qui le supprime |
| Après | le projet est toujours installé, et servi s'il l'était | le projet est toujours dans l'app, et n'y est plus pilotable |

**Retirer de l'app** tient en un clic. Les terminaux ouverts du projet sont arrêtés, son dossier
n'est pas touché, et un avis le redit par-dessus l'écran : `« calculus » est retiré de l'app.` —
`Rien n'a été envoyé à la box « box » : le projet y est toujours installé, et son journal n'a pas
été touché.` Pour le désinstaller ensuite, il faut le déclarer de nouveau (le **+** le trouve déjà
installé, et propose de le déclarer tel qu'il est), ou le faire sur la box, à la main.

**Désinstaller de la box** se fait en deux temps, et l'app n'en saute aucun :

1. **`Voir ce que la box retirerait`** lance `uninstall <nom> --plan`. La box répond, et **ne
   retire rien**. Ce qu'elle a écrit est affiché tel quel — `désinstaller « calculus » retirerait
   de cette box :`, puis une ligne par chose retirée, puis `Gardé :`. **L'app n'a aucune règle de
   suppression** : elle n'ajoute rien à ce plan et n'en retire rien. Dessous, une seule phrase est
   la sienne, lue dans l'objet du geste : où est le journal — gardé, ou dans ce qui serait retiré.
2. **Tu écris le nom du projet**, puis `Désinstaller de la box`. Le bouton reste inactif tant que
   la box n'a pas rendu son plan, et dit pourquoi. Un nom absent, incomplet ou d'une autre casse :
   `RIEN N'EST PARTI VERS LA BOX`, avec ce que tu as écrit et ce qui était attendu. Le bon nom :
   l'app lance `uninstall <nom> --confirmer <nom>`, et affiche ce que la box dit avoir retiré.

**Le journal survit, sauf demande.** La case `Supprimer aussi le journal du projet sur la box` est
**décochée** d'office, et son avertissement est écrit dessous avant qu'on y touche : cochée,
l'app ajoute `--supprimer-le-journal` au geste, et c'est sans retour. Sans elle, l'option n'est
jamais envoyée, et l'écran le dit après coup : `Le journal du projet existe encore sur la box :
/var/lib/brigade/calculus.` **Le plan ne vaut que pour le réglage avec lequel il a été demandé** :
cocher ou décocher la case le lâche, et la désinstallation redevient inactive jusqu'au plan
suivant — tu ne confirmes jamais un plan qui ne dit pas ce qui va partir. **Le nom que tu as écrit
ne vaut, lui aussi, que devant le plan affiché** : un plan redemandé, ou lâché, vide le champ.
Et **un plan ne sert qu'une fois** : dès que la box a pu changer — elle a retiré, commencé, ou
n'a pas répondu —, la désinstallation suivante en redemande un. Seul un refus d'avant son premier
geste le laisse valoir.

| Ce que l'écran dit | Ce qui s'est passé | Quoi faire |
|---|---|---|
| `CE QUE LA BOX « box » RETIRERAIT — rien n'est retiré` | la box a rendu son plan | le lire, puis écrire le nom du projet |
| `DÉSINSTALLÉ DE LA BOX « box »` | la box a retiré ce qu'elle liste | rien — ou le retirer de l'app, par l'autre geste |
| `LA BOX « box » A REFUSÉ (…) — rien n'est retiré` | le geste a dit non avant d'avoir rien retiré : un clone qui porte ce que l'origine n'a pas, un projet qu'elle ne connaît pas, un autre geste en cours | sa phrase est au-dessus, mot pour mot ; la régler, puis rejouer |
| `LA DÉSINSTALLATION S'EST ARRÊTÉE EN CHEMIN…` | elle avait commencé : la box dit ce qui est fait et ce qui reste | redemander le plan — il dit ce qui reste à retirer |
| `LA BOX « box » N'A PAS ÉTÉ JOINTE — rien n'est retiré` | au plan, `ssh` est sorti en erreur : un plan ne retire rien, jointe ou pas | `docs/installer.md`, « Joindre la box » |
| `` `ssh` A ÉCHOUÉ SANS LA RÉPONSE DE LA BOX « box » `` | à la désinstallation, `ssh` est sorti en erreur : session jamais ouverte, ou perdue en route — son code ne les sépare pas, et la box a pu commencer | redemander le plan : l'app ne dit ni « rien n'est retiré », ni « désinstallé » |
| `… SON GESTE N'A PAS RENDU SON PLAN` | la box répond, pas le geste : il n'y est pas posé, ou pas dans une version qui désinstalle | `docs/installer.md`, « Préparer la box » — « Le geste d'installation » |
| `LA BOX « box » N'A PAS FINI DE RÉPONDRE` | `ssh` a été arrêté au délai (trois minutes pour le plan, un quart d'heure pour le reste) | redemander le plan : l'app ne dit pas désinstallé un projet dont la box n'a pas répondu |

**Désinstallé, le projet n'est plus pilotable depuis l'app, et elle le dit.** Il reste dans la
barre, sans pastille et en pointillé ; sa ligne de « Tous les projets » le dit grisée
(`uninstalled from its box: nothing is read`), et son panneau et ses onglets affichent `DÉSINSTALLÉ DE LA BOX « box » — plus pilotable depuis l'app`, à la place de ce
que la box disait de lui. **L'app ne lit plus sa box** — ni `status`, ni `faits`, ni onglet —, ses
boutons et sa mise en service ne sont plus proposés : ce n'est pas `JOINT, MAIS PLUS PILOTABLE`,
qui dirait un runtime à remettre à niveau. Son second et ses shells, eux, restent : ils tournent sur
ton poste.

- **Un projet désinstallé reste dans l'app** tant que tu ne l'en retires pas : c'est l'autre geste.
- **Tant que la box n'a pas répondu d'une désinstallation en cours**, « Retirer de l'app » refuse :
  retiré, le projet n'aurait plus d'espace où lire ce qu'elle répond.
- **La désinstallation se rejoue** : journal gardé, tu peux cocher l'option et recommencer — le
  plan, puis la confirmation. Si cette seconde fois n'aboutit pas, le projet reste dit désinstallé,
  et l'app dit ne plus savoir où en est son journal : le plan de la box le redira.
- **Rien n'est gardé d'un lancement de l'app à l'autre.** Relancée, l'app relit la box, qui répond
  elle-même `projet inconnu sur cette box` : le panneau dit alors `JOINT, MAIS INCONNU DE LA BOX`,
  et rappelle que c'est ce qu'on attend d'un projet désinstallé.
- **Un projet sans box** n'a que le premier geste : il n'y a rien à désinstaller, et le bloc le dit.

### À la main

Le fichier reste le tien, et tu peux tout y faire :

```json
{
  "hotes": ["<le nom par lequel ton ssh joint ta box>"],
  "projets": [
    {
      "nom": "brigade",
      "dossier": "~/Dev/brigade",
      "hote": "<le nom par lequel ton ssh joint ta box>",
      "stations": ["mac/claude"]
    },
    { "nom": "parade", "dossier": "/Users/chef/Dev/parade", "couleurs": { "onglet": "#a98cf2", "accent": "#4fc7b5" } }
  ]
}
```

- `hotes` est la liste de tes box, et **chacune n'est qu'un nom** : celui par lequel **ton** `ssh`
  la joint. C'est elle que l'écran d'ajout propose ; une box de plus est un nom de plus. Elle est
  facultative : un fichier qui ne la porte pas est lu comme avant, et les box que ses projets
  nomment se proposent quand même. Un nom écrit deux fois n'en fait qu'une ; autre chose qu'une
  liste de textes non vides refuse le fichier (`« hotes » doit être une liste`, `hôte n° 2 : doit
  être un texte non vide…`).
- `dossier` est un chemin absolu, ou commence par `~/`.
- `couleurs` : **la couleur d'onglet et la couleur d'accent du projet** (voir « Les couleurs d'un
  projet »), chacune écrite `#rrggbb`. Tu n'as pas à l'écrire : **l'app la tire et l'écrit elle-même**
  pour un projet qui n'en a pas — à l'ajout, au lancement pour un projet déclaré avant qu'elles
  existent, ou dès qu'un projet écrit à la main entre dans le fichier. Une seule des deux écrite :
  l'autre est tirée. Autre chose qu'une couleur `#rrggbb` refuse le fichier (`projet n° 1 (parade) :
  « couleurs » : « onglet » doit être une couleur écrite `#rrggbb` — « rouge » n'en est pas une`).
- `hote` est facultatif, et c'est tout ce qu'un projet dit de sa box : le nom par lequel **ton**
  `ssh` la joint. Ce qui est écrit entre `< >` ci-dessus est à remplacer — voir « Ce que la box dit
  du projet ». Un projet écrit à la main sans `hote` a son terminal, et l'app ne lit rien de sa box.
- **`nom` est aussi le nom du projet sur la box** : c'est lui que l'app donne au geste de la box
  (le geste de la box : `ssh <hote> brigade <nom> status` depuis ton poste), donc celui de l'instance `brigade@<nom>.service`. Il n'y a pas de
  second nom à déclarer : un projet servi s'appelle dans l'app comme sur sa box.
- `stations` est facultatif : **les stations que ce poste joue pour le projet**, sous le nom que sa
  box leur donne dans ses stations (`station stations`), où elles sont déclarées `distante` (voir « Le poste est
  une station »). Sans elle, l'app ne lance aucun cook. Une station se joue auprès d'une box
  (`« stations » sans « hote »` refuse le fichier), s'écrit `<machine>/<moteur>`, et le poste ne
  lance qu'un moteur : `mac/codex` est refusé (`il ne lance que `claude``).
- **`commande` n'est plus lu.** Un fichier qui le porte encore est refusé, en le disant :
  `projet n° 1 (brigade) : « commande » n'est plus lu — retire-le : …`.
- La barre suit l'ordre du fichier. **Ranger les cases dans la barre** (voir « La barre d'icônes ») y
  change l'ordre des lignes de `projets`, et rien d'autre : un projet ajouté ensuite arrive à la fin.
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
| Un projet de plus, un `hote` ajouté ou retiré, une box de plus dans `hotes`, l'ordre | La barre et « Tous les projets » suivent. Les terminaux ouverts ne sont pas touchés ; l'écran affiché reste le même, sa lecture de box repart |
| Une station ajoutée à `stations`, ou retirée ; le `hote` ou le `dossier` d'un projet qui en joue | Une station de plus se manifeste auprès de la box, dans la minute. **Une station retirée est quittée, et son cook en cours est tué** : rien n'est rendu, son bail tombe de lui-même sur la box (voir « Le poste est une station ») |
| Un projet retiré, renommé, ou dont le `dossier` a changé | **Ses terminaux sont arrêtés** — second et shells : ils tournaient dans un dossier qui n'est plus le sien. La conversation reste à `claude` : au premier clic, le second reprend le fil du nouveau dossier. Si c'était l'écran affiché et que le projet n'est plus là, tu reviens à « Tous les projets » |
| Le fichier n'est plus lisible — un éditeur à mi-écriture, une virgule en trop, le fichier supprimé | **Rien ne disparaît** : les projets d'avant restent, leurs terminaux tournent. Un bandeau, en bas de la fenêtre, dit le chemin et la raison ; il s'en va à la première relecture réussie |

```
/Users/chef/.config/brigade/app.json a changé, et n'a pas pu être relu :
  → JSON illisible : Unexpected end of JSON input
Tes projets sont ceux d'avant, et rien n'est fermé. L'app le relit dès qu'il change.
```

Tant que le bandeau est là, **le `+` n'écrit rien, et n'installe rien** — ni projet, ni box : `Pas
ajouté — l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — …`. Écrire par-dessus, ce serait y perdre les projets qu'elle
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

*Ticket : #870.* L'app s'ouvre dessus, et la case ronde **T**, en tête de la barre, y ramène. C'est
**la vue d'ensemble de brigade** : ce qui est transverse, et rien d'autre. Ce qui tient à un projet —
une information, un réglage, un geste — est dans son espace ; ce qui tient à une station, sur sa page.

```
PROJECTS
● brigade     1 decision awaits you · #867 cooking                 ›
● espace      5 decisions await you, for 2 d                       ›
● calculus    base red · #655 being repaired                       ›

STATIONS
● parade-box  online · 2 cooks · brigade, espace, calculus         ›
○ Mac         offline for 12 min · no project                      ›
                                                          + station

● Max ✓  ·  GitHub ✓
```

- **Une ligne par projet**, dans l'ordre du fichier : son nom, sa pastille, et une phrase courte qui
  dit ce qui s'y passe — **ce qui bloque d'abord**, puis **ce qui t'attend** (combien de décisions,
  depuis quand), puis **ce qui cuit** (les tickets de ses cooks, ou ce qui est à la pass). Rien ne
  se passe : `nothing cooking, nothing waits for you`.
- **La pastille d'un projet** est **rouge** quand il est bloqué — base rouge, cuisine arrêtée ou
  retenue, runtime éteint, box injoignable —, **jaune** quand une décision t'attend, **verte**
  sinon. **Grise** tant que rien n'en est lu, ou quand rien ne peut l'être : un projet sans box, ou
  désinstallé de la sienne. Pas lu n'est jamais vert.
- **Une ligne par station appairée** : son nom, sa pastille, son état (`online`, ou
  `offline for 12 min`), ce qu'elle fait — ses cooks en cours, `saturated`, `update failed`,
  `Max connection lost`, ou `idle` — et les projets qu'elle porte. Sa machine (système, noyau) et sa
  version ne se lisent qu'**au survol**. Pastille **rouge** quand sa connexion Max est perdue,
  **jaune** quand elle est saturée ou qu'une mise à jour a raté, **verte** en ligne, **grise** hors
  ligne ou illisible.
- **Un clic n'importe où sur une ligne l'ouvre** : l'espace du projet, ou la page de la station
  (voir « Tes stations : appairées par un code, lues sur GitHub »). **Aucune ligne ne porte de
  geste** — ni merger, ni trier, ni retirer `fire` : les décisions se prennent dans le projet.
- **« + station »**, sous la liste des stations, ouvre le champ du code d'appairage — nulle part
  ailleurs sur l'accueil. Appairée, la station apparaît dans la liste et le champ se referme, sans
  message qui reste affiché ; « cancel » le referme, vide.
- **La ligne de santé**, en bas, résume la connexion Max et l'accès à GitHub. Tout va bien : verte
  et discrète, `Max ✓ · GitHub ✓`. Quand l'un des deux cloche, elle dit en une phrase ce qui ne va
  pas : `Max: token to redo within 20 d`, `Max: connection lost on Mac`,
  `GitHub limits calls, back around 3:16 PM`, `GitHub: this computer is not signed in`. Pas encore
  lu : `Max ?`, `GitHub ?`, et le survol dit pourquoi. Elle ne montre **aucune jauge de
  consommation** du compte (voir la maquette, `docs/maquettes/app/README.md`).
- **Aucune commande** (`brigade …`, `gh …`) **ni aucun texte brut d'erreur** ne s'y affiche : ce
  qu'une ligne tait — l'heure de la lecture, pourquoi une box n'a pas répondu —, son survol le dit
  dans les mots de l'app, et l'espace du projet le montre en entier.

**D'où ça vient** (`app/src/accueil.ts`). L'accueil ne demande rien de neuf à personne : il se dessine
de ce que l'app lit déjà. `faits` de chaque projet, toutes les trente secondes et quel que soit
l'écran, donne l'état de sa cuisine, ses décisions en attente et ses cooks ; `status`, lu pour chaque
projet tant que l'accueil est affiché, ajoute ce que `faits` ne porte pas — une base rouge et le
ticket qui la répare, la cause d'une cuisine retenue, depuis quand la plus ancienne décision attend, une
station saturée, l'échéance du jeton Max. Les stations et leur connexion Max viennent de leurs gists,
sur GitHub. Un `status` que l'accueil ne lit plus est lâché : la ligne redit ce que `faits` seul en dit.

**Ce qui a quitté l'accueil** : les blocs par projet (leur carte, le dernier événement, la sortie de
`status` et de `station`), le retard du code de l'app — dans les réglages de chaque projet, et au
survol de la case **T** (voir « Le code de l'app : à jour, ou en retard ») —, la liste « Projects on
your stations » et le parcours « add a project », sur la page d'une station.

### Le code de l'app : à jour, ou en retard

**En tête des réglages de chaque projet** (Paramètres, dans son espace) — et en une ligne, **au
survol de la case T** —, une ligne dit où en est le code sur lequel l'app tourne — celui du clone d'où tu l'as lancée —, avec l'heure de sa lecture :

```
le code de cette app est à jour avec origin/v2 — lu à 14:32:07, relu quand tu reviens à la fenêtre
```

Quand son clone est en retard sur la branche de l'origine qu'il suit, elle le dit en alerte, avec
le nombre de commits, et ce que cela veut dire :

```
LE CODE DE CETTE APP EST EN RETARD DE 39 COMMITS SUR origin/v2 — lu à 14:32:07, relu quand tu reviens à la fenêtre
  Ce que cette app montre peut être périmé : ce qui a été livré depuis n'y est pas — un écran, un geste, une lecture.
  Son clone : /Users/chef/dev/brigade, sur la branche v2.
  Un clic la met à jour et la relance sur la nouvelle version — sans terminal, rien à recopier. Sans clic, elle passe à la nouvelle version à sa prochaine ouverture.
  C'est aussi le clone du projet « brigade » : son second y lit le même code.
[mettre à jour et relancer l'app]
```

| À l'écran | Ce que l'app a lu | Ce qu'elle offre |
|---|---|---|
| `le code de cette app est à jour avec origin/v2`, discret | son clone a tous les commits de la branche qu'il suit | rien |
| `LE CODE DE CETTE APP EST EN RETARD DE 39 COMMITS SUR origin/v2`, en jaune, trait plein | l'origine a 39 commits que son clone n'a pas — le même nombre que `git status` après un `git fetch` | **un bouton**, « mettre à jour et relancer l'app » — ou, si son clone a des commits à lui, la commande `git -C <son clone> pull` à écrire dans un shell |
| `CETTE APP TOURNE SUR UN CODE PLUS ANCIEN QUE CELUI DE SON CLONE`, en jaune, trait plein | son clone n'est plus sur le commit de son lancement : il a été mis à jour pendant qu'elle tournait | **un bouton**, « relancer l'app » : elle ne change de code qu'à son lancement |
| `le retard du code de cette app sur son origine n'a pas été lu`, en jaune, trait pointillé | l'origine n'a pas répondu, le clone n'est sur aucune branche, sa branche ne suit rien — ou l'app n'est pas lancée d'un clone | la raison, avec ce que `git` en a dit. **Pas lu n'est jamais « à jour »** |

- **Au clic, elle se met à jour et repart.** Son clone avance jusqu'à la branche de l'origine qu'il
  suit, puis l'app se ferme et se relance d'elle-même sur la nouvelle version — par `npm start`
  quand c'est par là qu'elle est partie, pour que son lancement repose les dépendances si la
  nouvelle version les change (voir « Lancer l'app »). Comme quitter, se relancer arrête les
  terminaux de l'app. Pendant la mise à jour, le bouton dit `updating — the app relaunches itself…`.
- **Sans clic, à sa prochaine ouverture.** `npm --prefix app start` fait la même mise à jour avant
  d'ouvrir l'app, et le dit dans le terminal (voir « Lancer l'app »).
- **Rien que de l'avance rapide** (`git merge --ff-only`). Un clone qui a des commits que l'origine
  n'a pas, ou des changements que la nouvelle version écraserait, ne bouge pas : fusionner est ton
  geste. L'app dit pourquoi elle reste sur son code, sous la ligne ; un clone qui a des commits à lui
  n'a d'ailleurs pas de bouton, mais la commande `git -C <clone> pull`, **écrite** dans un shell sans
  être envoyée — la règle de tous les boutons. Un shell de l'app vit dans l'espace d'un projet :
  celui dont ce clone est le dossier, sinon le premier qui s'ouvre. Sans aucun projet qui s'ouvre,
  rien n'est écrit et la commande se recopie.
- **Le clone d'un projet, l'app ne le met pas à jour** : son bouton écrit `git -C <clone> pull`
  dans un shell, comme ci-dessus. Le clone de l'app, quand c'est aussi le dossier d'un projet, se
  met à jour avec elle : son second lit le nouveau code.
- **Elle le dit aussi pour le clone d'un projet, quand ce clone est celui de brigade** — un projet
  dont le dossier est un clone de la même origine que celui de l'app. Si c'est le même clone, il
  est nommé sous la ligne de l'app (`C'est aussi le clone du projet « brigade »`) ; si c'en est un
  autre, il a sa propre ligne, son nombre et son bouton : `LE CLONE DE « brigade » EST EN RETARD DE
  12 COMMITS SUR origin/v2`. Les clones des autres projets ne sont pas lus : leur retard est
  l'affaire de leur dépôt.
- **La case T de la barre passe en jaune** tant qu'un de ces clones est en retard ou que l'app est
  à relancer : quel que soit l'écran affiché, son survol dit quoi (`Tous les projets — le code de
  cette app est en retard de 39 commits sur origin/v2`).
- **Rien n'est veillé en continu** : une lecture au lancement, une à chaque fois que tu reviens à la
  fenêtre, une quand le fichier des projets change. Entre deux, l'heure affichée est celle de la
  dernière lecture — une app restée au premier plan toute une heure ne relit pas.
- **Lire n'écrit rien dans ton clone** — seule la mise à jour y écrit. L'app demande à l'origine le commit de la branche suivie
  (`git ls-remote`). Si ton clone ne l'a pas, elle rapatrie les commits qui manquent **dans un
  dossier jetable, hors du clone**, les compte, et le supprime : ni objet, ni branche suivie, ni
  `FETCH_HEAD` n'est posé chez toi — `git status` y dit après ce qu'il disait avant, et ton
  prochain `git fetch` rapatrie tout comme si l'app n'avait rien lu.
- **Elle ne demande jamais rien** : ni mot de passe au terminal, ni fenêtre. Ce que ton trousseau
  ou ton agent `ssh` savent déjà sert tel quel ; une origine qui réclame une saisie est une origine
  qui n'a pas répondu, et `git` est arrêté au bout de trente secondes. L'adresse de l'origine n'est
  jamais affichée : elle peut porter un jeton.
- **Ce que le nombre ne dit pas** : ce que ces commits changent. Trente-neuf commits de doc et un
  commit qui ajoute un onglet se lisent pareil — c'est `git log` qui le dit.

### Tes stations : appairées par un code, lues sur GitHub

**Sur l'accueil**, la liste « Stations » montre celles que tu as appairées, une ligne chacune —
son nom, son état, ce qu'elle fait et les projets qu'elle porte ; sa machine et sa version au survol
(voir « Tous les projets, d'un coup ») :

```
● box  online · idle · no project                         ›
○ box  offline for 4 min · brigade                        ›
```

**Un clic sur sa ligne ouvre la page de la station** : en tête, son nom, sa pastille et son état en
une phrase (#877) ; dessous, ses pannes avec leur bouton, les projets que l'app lui a ajoutés et le
parcours « add a project » (voir « Ajouter un projet à tes stations, sans terminal »).
« ‹ All projects » ramène à l'accueil, comme la case **T**.

```
box      ●  online · 2 cooks running   ?
atelier  ◆  saturated                  ?
mac      ○  offline for 12 min         ?
```

La phrase ne dit ni ses projets ni ce qui casse — ses pannes sont dessous —, et le système, le noyau
et la version de sa machine ne sont pas écrits dans la page : ils se lisent au survol du « ? ». Une
station saturée ne prend plus de ticket tant que ça dure : sa phrase ne dit que ça.

- **L'app ne joint aucune station.** Chaque station écrit son état dans un gist secret de ton
  compte GitHub ([docs/runtime.md](runtime.md), « Une station par machine »), et l'app le lit
  là, par ton propre `gh`, toutes les trente secondes (`app/src/stations/`). Le suivi se relève
  donc à la minute près, pas à la seconde.
- **Une station éteinte reste dans la liste**, hors ligne, avec depuis combien de temps : tout de
  suite quand elle s'est arrêtée proprement, après deux signes de vie manqués (un peu plus de
  deux minutes) quand elle s'est éteinte d'un coup. Une lecture de GitHub ratée garde la liste
  d'avant, et la ligne de santé le dit en une phrase (`GitHub could not be read`,
  `GitHub limits calls, back around 3:16 PM` — l'heure où GitHub rend les appels du compte se lit
  sans en dépenser un).
- **Appairer une station neuve** : « + station », sous la liste, ouvre le champ ; tapes-y le code
  qu'elle affiche (huit signes, comme `7KQ2-M9XD` — minuscules, blancs et tirets n'y font rien),
  puis « pair ». L'app cherche le gist qui publie ce code, y écrit l'appairage, le champ se referme
  et la station apparaît dans la liste. Un code mal formé, inconnu ou expiré est refusé en une ligne
  sous le champ, et rien n'est écrit ; quand c'est GitHub qui a manqué, ce qu'il a répondu se lit au
  survol de cette ligne.

**Quand ça casse**, sa ligne de l'accueil le dit en un mot (`update failed`, `Max connection lost`),
et la panne est dite sur la page de la station, en une ligne, avec un bouton — jamais une commande à
taper (`app/src/pannes/`, #798) :

```
box   ·  (en-tête : nom, pastille — l'état n'y est pas redit)
  offline for 12 min  [check again] ?

box   online · no cook running
  update to version 1.5.0 failed  [dismiss] ?
  Max connection lost 12 min ago  [log in] ?
```

Chaque panne est **une seule ligne** et **un seul bouton** ; l'explication (« box has given no sign
of life… », « nothing cooks on box until you log in »), puis ce que le bouton a rendu une fois
cliqué, ne se lisent qu'au survol du « ? ». Une panne que deux causes décrivent (hors ligne et plus
de signe de vie) ne se dit qu'une fois : l'en-tête de la page ne redit pas l'état quand la ligne
« offline for … » est dessous.

- **Station injoignable** : plus aucun signe de vie depuis dix minutes (un redémarrage, une mise à
  jour, tient en dessous). « check again » relit GitHub tout de suite : l'app ne joint pas la
  station, elle regarde si elle a reparlé.
- **Mise à jour ratée et revenue en arrière** : la version visée n'a pas démarré, la station est
  restée sur la sienne ; la suivante sera essayée seule. « dismiss » écarte la ligne, tant que
  l'app est ouverte. Le motif de l'échec n'est pas dit ici : il est dans la file des projets.
- **Connexion Max perdue** : plus rien ne cuit sur la station. « log in » lance `claude auth login`,
  qui ouvre la page de connexion dans ton navigateur ; la station voit la connexion rétablie dans
  la minute, et la cuisine reprend seule. **Seule la station de cet ordinateur** se reconnecte
  ainsi : le login d'une station serveur ne part pas encore de l'app, et le bouton le dit.
- Ce que l'app en sait, la station le publie dans son gist ([docs/runtime.md](runtime.md), « Une
  station par machine ») : des versions et des dates, ni motif ni commande. Une station hors ligne
  ne dit plus sa connexion — ce qu'elle en a publié avant de se taire n'est plus sûr.

**Sa ligne de mise à jour et son retrait** (#880). Sous l'en-tête de la page, une ligne unique dit
où en est la station : `up to date · on this version for 3 days`. Une station hors ligne n'est dite
à jour de rien : pas de ligne. Une mise à jour ratée est déjà dite par sa panne : la ligne ne la
répète pas et ne dit pas « up to date » par-dessus, elle ne garde que `on this version for 3 days`.
Le « depuis quand » n'est pas publié par la station : l'app le déduit du moment où elle l'a vue
passer à sa version, et le garde dans `versions-vues.json`, à côté de `app.json`. Elle ne sait pas
depuis quand une station est sur sa version à la première fois qu'elle la lit : la ligne dit alors
`up to date` et rien de plus, jusqu'à ce qu'elle voie la version changer. Une station mise à jour
pendant que l'app était fermée est datée de la première lecture qui suit.

En bas de la page, **« remove the station »** ouvre une confirmation dans l'app, en une ligne de prix :
la station quitte l'accueil et n'est plus lue, elle continue de tourner, et un code neuf l'appaire de
nouveau. « cancel » la referme et laisse la station en place ; « remove » ôte son appairage de son
gist (`brigade-appairage.json`, le seul fichier que l'app y écrit), ramène à l'accueil, et la station
n'est plus dans sa liste. Si GitHub ne peut pas être écrit, la station reste, et la page le dit en
une ligne.

### Cet ordinateur est une station ; un téléphone est un poste

*Spec : [la station refaite de zéro](superpowers/specs/2026-10-15-station-refonte-design.md) (#797).*

**Sur un ordinateur — Mac, Windows, Linux de bureau —, l'app installée est une station.** Ouverte,
elle lance la station de la machine : **la même que celle d'un serveur**, le même point d'entrée
(`runtime/src/station/main.ts`, celui que lance le service du paquet Debian), le même répertoire
tenu, la même configuration des projets (une ligne chacun, dans `projets`), la même présence sur
GitHub. Seule l'installation diffère : un paquet sur un serveur, l'app ici (`app/src/poste/`).

- **Son répertoire** est `station/`, à côté du fichier des projets (`~/.config/brigade/station`) —
  ou `BRIGADE_STATION_DIR`, s'il est posé. Elle tourne sous ton compte, avec ton `gh` et ton
  `claude`.
- **Elle s'appaire seule.** Comme sur un serveur, elle affiche son code dans son journal ; l'app le
  lit et le tape à ta place, par le même geste que « + station » sur l'accueil. La machine apparaît
  dans « Stations », comme les autres : `macbook  online · idle · no project`, sa machine et sa
  version (`code 1a2b3c4d5e6f`) au survol. GitHub qui ne montre pas encore son gist : le code est retapé toutes les trente
  secondes, et le refus dit une fois.
- **Un projet dont elle est la principale y cuit**, exactement comme sur un serveur : sa ligne
  dans `projets`, son état sous `etat/`, ses cooks lancés par la station.
- **Elle vit avec l'app.** Fermée — ou tuée net —, l'app ferme l'entrée de sa station, qui
  s'arrête comme sur un SIGTERM : ses projets s'arrêtent, et GitHub porte l'heure de son arrêt —
  l'accueil la dit hors ligne. **La cuisine des projets dont elle est la principale s'arrête donc
  avec l'app.** Morte d'elle-même, elle est relancée cinq secondes plus tard ; refusant de démarrer
  (code 2), elle ne l'est pas, et l'app dit pourquoi.
- **Une seule par machine et par compte.** Une deuxième app ouverte ne lance pas une deuxième
  station (`station/app.pid` nomme l'app qui la tient) : elle le dit, et la reprend quand la
  première se ferme.
- Ce que la station dit s'écrit tel quel dans le terminal qui a lancé l'app, comme son journal de
  service sur un serveur. Elle est jouée par le `node` de `npm start` (`BRIGADE_NODE_BIN` pour en
  donner un autre) : Electron n'en est pas un.

**Sur un téléphone, l'app est un poste** : elle pilote, elle ne cuit pas. Sa station n'y est pas
démarrée, et aucun projet n'y fait cuire — ni le sien, ni les stations que ses projets confient au
poste (« Le poste est une station »). C'est le seul endroit où la plateforme compte
(`app/src/poste/role.ts`) ; tout le reste est le même code. L'app d'un ordinateur est aussi un
poste, et le dit au lancement, quand le runtime n'est pas à côté d'elle, ou avec
`BRIGADE_APP_STATION=0`.

### Ajouter un projet à tes stations, sans terminal

**Sur la page d'une station**, « Projects » liste **tous** les projets qu'elle porte, une ligne
chacun : ceux que sa configuration sert — ajoutés depuis l'app ou écrits à la main dans `projets`,
elle les publie tous dans son gist —, puis ceux que l'app lui demande et qu'elle ne sert pas encore.
Chaque ligne porte sa marque : **`main`** quand la station fait tourner son manager et sa pass (elle
sert le projet), **`secondary`** sinon — et elle dit alors sur quelle station ils tournent. Puis ce
que la station en dit : `served`, `waiting for your authorization on GitHub`, `being prepared`,
`refused`. Au survol : son dépôt et sa branche, le motif d'un refus et, une fois servi, en combien
de temps depuis que tu as ouvert le parcours (`served by box 1 min 12 s after “add a project” was
opened`) — ou, pour un projet écrit à la main, `installed on this station outside the app`. **Un clic
ouvre le projet** : son espace s'il est dans ton fichier des projets, sinon « Add a project », où
tu le déclares. « no project on this station yet » ne se lit que sur une station qui n'en porte
vraiment aucun.

- **« + add a project »**, sur cette même page, ouvre le parcours : le **dépôt**, choisi parmi ceux que ton
  `gh` lit (les plus récents d'abord ; sa branche par défaut est proposée comme branche
  d'intégration) ; les **stations** qui le servent, et sa **principale** — celle de son manager et
  de sa pass. L'app propose d'office une **station serveur**, toujours allumée ; choisir l'app d'un
  ordinateur (Mac, Windows) dit tout de suite que la cuisine du projet s'arrête quand on ferme l'app.
  Puis le nombre de **cooks** à la fois et le **calibrage** du manager et du reviewer : rien n'y est
  choisi d'avance, ce sont tes décisions. « add » : ce qui manque est dit sous le formulaire, et rien
  n'est écrit.
- **Validé**, l'app écrit la demande dans le gist de chaque station choisie (`app/src/projets/`) ; la
  principale la lit dans la demi-minute, le prépare et l'ajoute à sa configuration
  ([docs/runtime.md](runtime.md), « Ajouter un projet à une station depuis l'app »). Si ses Apps
  GitHub doivent être autorisées sur le dépôt, un bouton **« authorize on GitHub »** par App ouvre
  la page de GitHub : un clic, et la station poursuit seule.
- **« remove »**, sous un projet ajouté depuis l'app, puis un second clic pour confirmer, retire le projet de la demande de chacune de
  ses stations : elles le retirent de leur configuration. Son état et son clone restent sur la machine.

## Une lecture de box : sept états

En tête du panneau de l'espace d'un projet, la lecture de sa box est dans **un de sept états**, qui ne se ressemblent pas :

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
- Un projet sans `hote` a son panneau aussi : `aucune lecture`, et ce qui lui manque — `hote`, le nom
  par lequel ton `ssh` joint ta box. Aucun bloc à coller.
- Les commandes d'une lecture partent **l'une après l'autre**, et la première qui échoue est
  l'erreur affichée : chaque écran dit ce que *ses* commandes ont rendu.

## La barre d'icônes

À gauche, une colonne de cases, façon Slack ou Discord :

| Case | Ce que c'est |
|---|---|
| **T**, ronde, en tête | l'écran « Tous les projets ». **En jaune** : le code de l'app, ou un clone de brigade parmi tes projets, est en retard sur son origine — le survol dit lequel, et de combien |
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
- **La forme dit l'état avant la couleur** : une pastille a la forme de son ton — disque plein,
  vert ; losange, jaune ; carré, rouge ; triangle, bleu ; anneau creux, gris. Même chose pour la
  ligne de pilotage (`pilotable` disque, `joint mais plus pilotable` losange, `pas joint` carré),
  la pilule de la cuisine, les grants, le manager, et la pilule `t'attend` des bons de T'attend.
  Le libellé de chaque état reste du texte ; rien n'est lu en plus de ce que la box dit.
- **Une pastille sans couleur n'est pas un état** : vide, c'est un mot que l'app ne connaît pas
  (il se lit au survol, tel quel) ; un `!`, l'app
  n'a lu aucun fait de ce projet, et le survol dit pourquoi (`aucun fait lu — PAS JOINT`). Un
  projet sans `hote` n'a pas de pastille.
- **Pas de compteur dans la barre** : les nombres sont dans la carte du projet.
- **Les cases se rangent en les glissant.** Prends la case d'un projet, glisse-la dans la barre :
  elle s'efface à demi, et **un trait d'accent dit où elle atterrira** — avant la case survolée si
  tu montes, après si tu descends ; rien sur sa propre case. Lâchée, elle prend cette place et les
  autres se décalent ; lâchée hors de la barre, elle reprend la sienne. Le nouvel ordre est écrit
  dans `app.json` — l'ordre des lignes de `projets`, rien d'autre — : tu le retrouves en rouvrant
  l'app, et **« Tous les projets » le suit**. Un projet ajouté ensuite arrive en fin de barre. Si
  le fichier ne peut pas être écrit (il ne se relit pas, il n'est pas inscriptible), la barre garde
  son ordre et la raison s'affiche par-dessus l'écran. Les cases **T** et **+** ne bougent pas.
- **Un clic reste un clic** : le glisser ne part qu'au-delà du seuil du système, et une case lâchée
  sur elle-même ouvre son projet, comme un clic.
- **Chaque case porte la couleur d'onglet de son projet** : sa lettre et son trait, et son fond
  quand c'est l'espace affiché (voir « Les couleurs d'un projet »). Un projet sans couleur — un
  fichier que l'app ne peut pas écrire — garde la case de la peau.
- Une case en pointillé est un projet dont le dossier n'est pas là — un fait de ce poste, pas de la
  box.

## Un espace par projet

Clique un projet : tu es dans son **second** — `claude`, lancé dans le dossier du projet avec le
rôle déjà actif, sur un vrai terminal. C'est une vraie session Claude Code : ton historique, tes
slash commands, et un `!` s'exécute sur le Mac, avec tes accès.

**Le second n'est pas un rôle neuf : c'est le PO, et l'app l'invoque pour toi.** Elle lance
`claude --continue /brigade:po` (ou `claude /brigade:po` quand il n'y a rien à reprendre) : tu
n'as rien à taper, et le second lit la file du projet dès l'ouverture — ce qui attend, et le geste
qui le débloque. Tu gardes la main : sors du rôle, ouvre des shells, fais ce que tu veux de la session.

**Chaque projet a son second, et les questions produit d'un projet se posent à *son* second.**
Trier les issues de `calculus` se demande dans l'espace de `calculus`, pas dans celui de `brigade` :
un second ne connaît que le produit de son dossier.

**Le second est à droite, en permanence — ce n'est pas une page.** C'est le seul agent du système
qui te parle : il a sa colonne, au bord droit de la fenêtre, sur toute sa hauteur — **l'espace des
terminaux**. En tête, une rangée d'onglets, au même niveau : le second, tes shells, et `+ shell` ;
dessous, une ligne qui dit ce qui vient d'être écrit dans le terminal montré, et ce terminal.
Changer de page au centre, ouvrir un shell, en refermer un : **le second ne se ferme ni ne se
vide**, c'est le même terminal, avec sa conversation. Et un clic à gauche — une carte du rail, un
bouton, un geste — écrit dans lui **sans que le centre change** : la page que tu regardais reste
ouverte, le rail reste où il est ; si un shell était montré à droite, le second reprend sa place,
pour que tu voies ce qui y a été écrit.

**Chaque shell porte un bandeau, en haut de son terminal : où il est, avec quel compte** —
`box parade-box · debian`, `this Mac · benoit`. Pour une machine distante, le compte est celui que
ton `ssh` donne à son nom (`ssh -G`, rien n'est joint) ; s'il ne le dit pas, le bandeau écrit
`account set by ssh`. Sa couleur est celle de l'onglet du projet : changer d'espace la change.

**Une session qui n'a pas le rôle ne s'appelle pas Second.** Quand l'app ouvre une session sur une
autre commande (`/brigade:init`, pour amorcer le dépôt), l'onglet du second s'appelle **Claude** ;
il redevient **Second** si tu le relances d'une touche, ce qui invoque `/brigade:po`.

- **`+ shell`** te demande **sur quelle machine** ouvrir un shell : **ce poste** (`this Mac`), **la
  box** du projet (`box <hote>`), et **chaque station que sa box déclare** (`station studio/claude`).
  Une station que la box fait tourner chez elle est sur la box, celle que ton poste joue est ton
  poste : elles sont nommées sur la ligne de leur machine. Les autres — des stations `distante`
  jouées par une autre machine — sont jointes par `ssh <machine>`, la machine étant ce qui précède
  la barre de leur nom : c'est sous ce nom que ton `ssh` doit la connaître. Les stations sont celles
  du dernier contrôle de la box (toutes les cinq minutes) : avant lui, seuls ce poste et la box
  sont proposés. Un projet sans box n'a que ce poste : rien n'est à choisir, le shell s'y ouvre.
- Ce shell est **persistant** : il vit dans une session `tmux` (ou `screen`, là où `tmux` manque)
  sur la machine choisie, sous ton compte — sur une machine distante, celui que ton `ssh` lui
  donne. Il s'ouvre **à droite, à côté du second** : il a son onglet (`shell 1`, `shell 2 ·
  parade-box`…) et se montre à la place du second, qui ne s'arrête pas pour autant. **Un shell ne
  remplace jamais le second** : un clic sur l'onglet du second le rend, avec sa conversation ; un
  clic sur celui d'un shell le remontre, tel que tu l'as laissé. Le terminal montré prend le
  clavier. Autant de shells que tu veux.
- **Fermer l'app ne ferme pas tes shells** : elle s'en détache. À la réouverture, le premier clic
  sur le projet les ramène, rattachés à leur session — la commande que tu y avais lancée tourne
  toujours, et ce qu'elle avait affiché est là. L'app s'en souvient dans `shells.json`, à côté du
  fichier des projets.
- **`close shell 1`**, au bout de la rangée, ferme le shell montré **pour de bon** : son onglet s'en
  va, sa session est détruite sur sa machine, et il ne revient plus. Si la machine ne répond pas,
  le shell est fermé quand même, et la ligne sous les onglets dit que sa session y reste. Un shell
  dont tu sors (`exit`) ferme lui aussi son onglet, et le second reprend sa place.
- **Une machine qui n'est plus joignable ne fait pas disparaître son shell.** Réseau perdu,
  machine éteinte, poste endormi : quand la connexion lâche — `ssh` laisse une machine qui ne
  répond pas à l'ouverture au bout de dix secondes, et une connexion établie qui ne répond plus au
  bout de trente —, le shell reste à sa place, et son terminal le dit, en jaune :
  ``[brigade] box parade-box is not reachable — session `brigade-parade-1` stays there, and this
  shell reattaches to it by itself as soon as the machine answers (a keypress tries now)``. Son
  bandeau le dit aussi (`box parade-box · debian — not reachable`). **Sa session tient, là-bas** :
  l'app ne la détruit pas, et s'en souvient.
  - **Il se reconnecte seul.** L'app demande à la machine si elle répond — `ssh -o BatchMode=yes
    -o ConnectTimeout=10 -- <hote> true`, qui ne lance rien et ne demande rien —, au bout de 2 s,
    puis 5, 10, 20, et toutes les 30 s tant qu'elle ne répond pas ; la ligne sous les onglets dit
    où elle en est, avec ce que `ssh` a répondu (`attempt 3: ssh: connect to host parade-box port
    22: Network is unreachable`). Dès qu'elle répond, le shell se rattache à sa session (`answers
    again — reattaching…`) : la commande que tu y avais lancée tourne toujours, et ce qu'elle
    affichait est là.
  - **Une touche essaie tout de suite**, sans attendre la prochaine sonde : c'est le rattachement
    lui-même, dans le terminal — un `ssh` qui veut un mot de passe te le demande là. La touche
    elle-même ne part pas. Toujours injoignable, le terminal le redit, et l'app reprend ses sondes.
  - **Au réveil du poste**, chaque shell distant se rattache aussitôt à sa session (`this Mac woke
    up — reattaching…`), sans attendre que `ssh` découvre que la connexion d'avant le sommeil est
    morte. Si le réseau n'est pas encore revenu, le terminal dit la machine injoignable, et la
    reconnexion se fait seule quand il revient.
  - Une machine qui a redémarré n'a plus la session : le rattachement en ouvre une neuve, vide.
    Les shells de ce poste et le second n'ont pas de connexion à perdre : rien de tout cela ne les
    touche.
- Le shell qu'un geste ouvre pour y écrire sa commande (un `sudo systemctl …`, un `git pull`) est,
  lui, un shell de connexion de ce poste, dans le dossier du projet : il finit avec l'app.
- **Changer de projet n'interrompt rien.** Chaque espace garde ses terminaux, leur contenu, la
  page et le terminal où tu l'avais laissé : les terminaux appartiennent à l'app, pas à ce qui est
  affiché. Revenir sur un projet te rend son second — ou le shell que tu regardais —, tel qu'il était.
- Le second d'un projet ne démarre qu'au premier clic sur ce projet.
- Un projet dont le dossier n'est pas là n'a pas de second : sa colonne dit pourquoi, à sa place.

### Les couleurs d'un projet

**Chaque projet a deux couleurs, pour que tu le reconnaisses sans lire son nom** : sa **couleur
d'onglet**, que porte sa case dans la barre, et sa **couleur d'accent**, que porte son espace — un
trait en tête de l'écran et du second, son nom, l'onglet ouvert, ce qui a le clavier. Hors d'un
espace (« Tous les projets », l'ajout), l'accent est celui de la peau.

- **Elles sont tirées pour toi** quand le projet entre dans le fichier des projets — ajouté depuis
  l'app, écrit à la main, ou déclaré avant que les couleurs existent (il reçoit les siennes au
  lancement suivant). Chacune est tirée parmi celles qu'**aucun autre projet ne porte dans le même
  rôle** : deux projets n'ont la même couleur d'onglet, ou d'accent, que quand la palette est
  épuisée. Elles sont **écrites dans `app.json`** (`couleurs`) : fermer et rouvrir l'app ne les
  change pas.
- **Tu les changes sous Paramètres → Réglages**, bloc « Couleurs » : une rangée pour l'onglet, une
  pour l'accent, une pastille par couleur de la palette, celle que porte le projet cerclée. Un clic
  l'écrit dans `app.json`, et **la barre et l'espace la prennent aussitôt**. Une couleur que tu as
  écrite à la main hors de la palette se montre au bout de sa rangée, cerclée.
- **La palette** : orange, violet, turquoise, rose, sable, indigo, orchidée (`app/src/couleurs.ts`).
  **Aucune n'est une couleur d'état** : le vert, le jaune, le rouge, le bleu et le gris de la peau —
  une alerte, un « non vérifié », un projet sain — ne changent pas d'un projet à l'autre, et aucune
  couleur de projet ne les remplace.

### Les onglets : Coût et Paramètres, et le journal par son geste

**Deux onglets seulement sont posés en haut, à côté du nom du projet : Coût et Paramètres.** **Coût** ouvre la lecture
Cooks (`station` : le plafond, les cooks, **le consommé**), **lue sur la box de chaque projet** (#908). **En tête,
trois chiffres** : les tokens que brigade a lancés sur **5 h, 24 h et 7 jours, tous projets confondus**, et sous
chacun **la part de chaque projet** — sa pastille, son nom, ses tokens, son pourcentage. Chaque chiffre est la
somme des fenêtres que le bloc `consommé` de `station` communique, projet par projet ; **une valeur que la box ne
communique pas s'affiche « not communicated » à la place du chiffre** — aujourd'hui 7 jours, que le runtime ne
compte pas, et tout projet dont la box n'a pas répondu. Une somme à laquelle un projet manque se dit « ≥ » et ne
donne pas de pourcentage. Seuls les projets qui ont une box, et qu'elle sert encore, y entrent. **Le quota du
compte Max n'y est pas** : brigade ne le connaît pas, et une seule ligne renvoie à `/usage`. Aucune phrase
d'explication : des libellés courts et des chiffres. Dessous, la sortie de `station` du projet affiché, repliée
sous « what the box said ». Le code de cette tête vit dans `app/src/vue/cost/`, où les blocs suivants de l'onglet
s'ajoutent. **Sous les trois chiffres, la courbe des derniers jours** (#909, `cost/courbe.js`) : les tokens lancés
chaque jour, **une ligne par projet**, à la teinte de sa pastille, sur les 14 derniers jours au plus ; un titre
court (« tokens per day »), le plus haut du tracé, les jours dessous, **une légende qui nomme chaque projet**, et
ce que chacun a lancé un jour au survol de sa colonne. Chaque série vient du même bloc `consommé` de `station` :
une ligne par jour, `AAAA-MM-JJ : … tokens` (ou `: rien`, un zéro) ; un jour qu'une série ne dit pas est un trou
dans sa ligne, jamais un zéro. **Le runtime n'écrit pas encore ces lignes** : tant qu'aucune box ne donne sa
série, la zone de la courbe dit **« not communicated »**, jamais un graphique vide ; un projet dont la série manque
alors que d'autres la donnent le dit sous son nom, dans la légende. **Paramètres** ouvre l'état du projet —
l'installation, **la sauvegarde et son ancienneté**, les pages servies, le retrait, les couleurs du projet, et
`status` tel que la box le rend —, avec dessous une rangée de lectures : Réglages, Rail, Manager,
Grants. Une ligne de la bande d'alertes dont la cause se règle là y mène en un clic. **Le journal
(Log) n'a pas d'onglet** : le bouton « journal », à côté des onglets, ouvre la fin du journal
par-dessus le rail ; le recliquer le ferme. Les cinq lectures ci-dessous sont celles de ces deux onglets et
de ce geste.

**Le rail dessiné n'est plus dans un onglet : il est au centre de l'espace, quel que soit celui que
tu regardes** (voir « Le rail »). **L'espace s'ouvre sans page** : le rail a tout le centre, sur
toute la hauteur. **Une page s'ouvre par-dessus le rail** : elle le couvre entier, sans le défaire —
il reste posé dessous, et relu, mais rien de lui ne se clique au travers. Recliquer l'onglet referme
la page, et **le rail revient tel que tu l'avais laissé**, défilé où il l'était. La bande d'alertes,
au-dessus, reste visible : aucune page ne la couvre, ni les terminaux, à droite.

Dans ces pages, cinq **lectures de contenu**. Une lecture relaie **en texte, mot pour mot,** la sortie d'une commande du runtime
(`docs/runtime.md`, « Piloter »). **Manager** montre d'abord l'état du manager, **Grants** celui
des grants :

| Onglet | La commande que l'app lance sur la box | Ce que tu y lis |
|---|---|---|
| **Rail** | `ssh <hote> brigade <nom> rail` | le texte de `rail`, tel que la box le rend : chaque ticket sur sa ligne, sa fiche dessous — le rail dessiné, lui, est au centre, sous la page |
| **Cooks** | `ssh <hote> brigade <nom> station` | la station : les cooks, la machine, le quota |
| **Manager** | `ssh <hote> brigade <nom> manager` | **l'état du manager** (voir « L'onglet Manager ») — allumé ou éteint, depuis quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi —, puis le texte de `manager`, qui dit aussi les épiques et ses réactions aux échecs |
| **Grants** | `ssh <hote> brigade <nom> grant` | **l'état des grants** (voir « L'onglet Grants ») — lequel est actif, son échéance avec la durée restante en tête, ses derniers usages, ce qu'aucun grant n'autorise —, puis le texte de `grant`, qui dit aussi les derniers gestes (accordé, prolongé, révoqué, éteint seul, refusé) |
| **Log** | `ssh <hote> brigade <nom> log --last 200` | la fin du journal : les 200 derniers événements, pas le journal entier — la ligne sous les onglets le dit |

- **Seul l'onglet affiché est lu** : sa commande part quand tu l'ouvres, puis toutes les trente
  secondes tant qu'il est à l'écran. En changer, le refermer ou quitter l'espace arrête sa
  lecture. Sans onglet de contenu ouvert, l'app ne lance donc pour ce projet que `status` ; avec
  un, `status` et la commande de l'onglet — jamais les cinq. S'y ajoute `faits`, lu pour
  **tous** les projets quel que soit l'écran : c'est lui que la barre dessine.
- **Ce qui t'attend reste sous tes yeux** : le panneau, entre le centre et le second — l'état du projet, le bloc
  `attend`, le reste de `status` — ne bouge pas quand tu changes d'onglet.
- **Un onglet a sa propre lecture**, avec son heure (`lu à 14:32:07`) et, si elle rate, son erreur :
  les mêmes en-têtes que le panneau (`PAS JOINT — …`, `JOINT, MAIS PLUS PILOTABLE — …`), et dessous
  ce que l'app a obtenu, tel quel. **Une commande qui échoue dans un onglet ne retire rien au
  panneau** — un runtime trop vieux pour `journal` laisse `status` lisible à côté — et l'inverse.
- Un runtime qui ne connaît pas encore `--last` rend son usage en erreur : il se lit dans l'onglet comme toute commande en échec.
- Sous les onglets, la ligne dit ce que tu lis : ``la sortie de `ssh <hote> brigade <nom> rail`, telle que la box la
  rend — relue seule toutes les trente secondes, tant que cet onglet est affiché``.
- Un projet sans `hote` a ses cinq onglets, et chacun dit `aucune lecture` et ce qui manque.
- **Rien n'y est dessiné** : seuls l'état du manager et celui des grants y sont posés
  au-dessus de leur texte. Rail, Cooks et Log sont du texte que tu peux sélectionner et copier, comme le
  texte de tout onglet. Les seuls boutons sont ceux qui écrivent une commande dans le second — sur
  **Grants** et **Cooks**, sous l'heure de la lecture (« Les boutons écrivent, ils n'envoient
  pas ») —, les deux gestes du manager et ceux de chaque grant, qui l'écrivent dans un shell
  (« L'onglet Manager », « L'onglet Grants »). Au-dessus, sur le rail, un numéro ouvre son issue.
- L'espace te rend l'onglet où tu l'avais laissé, onglet de contenu compris.

### L'onglet Manager

**Est-il allumé ?** C'est là que ça se lit, par projet. En tête de l'onglet, au-dessus du texte de
`ssh <hote> brigade <nom> manager`, l'app pose ce qu'elle a lu **dans cette sortie**, et rien
d'autre :

| Ce qui se lit | D'où ça vient |
|---|---|
| **`ALLUMÉ`** (pastille verte) ou **`ÉTEINT`** (grise), puis `depuis le <date> · par <qui>` | la ligne `manager` de la sortie. La date est celle de la dernière bascule, à l'heure de ton poste ; `par` est celui qui l'a faite. Un manager **jamais allumé** n'a ni l'une ni l'autre : la ligne dit `jamais allumé` |
| ce que le runtime en dit ensuite | la fin de la même ligne, mot pour mot (``il juge les issues ouvertes, pose `fire` et le calibrage``) |
| **dernières décisions**, la plus récente d'abord | les lignes sous `dernières décisions` — quinze au plus, c'est le runtime qui borne : l'issue, l'instant, et ce qu'il en a fait, mot pour mot (`sur le rail, haiku / low (posé : fire, effort:low) — …`, `refusée (une épique) — …`) |
| **écartées**, chacune avec son motif | les lignes sous `écartées` — dix au plus : l'issue, l'instant, **le motif**, et dessous ce que le runtime dit de ce qui la rend au manager (``pour la lui rendre : retire `blocked-on-human` : …``, ou `rien ne la rend au manager`) |

- **L'app n'y devine rien.** Une lecture ratée, ou une sortie sans ligne `manager` (un runtime
  d'avant le manager), ne dit **ni allumé ni éteint** : `l'état du manager n'a pas été lu : … Ce
  n'est pas « éteint »`, et ce que l'app a obtenu se lit dessous, comme dans tout onglet. Une
  section que la sortie n'a pas se dit `pas lues`, jamais `aucune` ; sans décision ni écart, c'est
  le mot du runtime qui se lit (`aucune`). Une ligne qui n'a pas la forme attendue reste **telle
  quelle**, à part, sous `ce que l'app n'a pas su lire`.
- **Ce que la sortie dit d'autre se lit dessous** : les épiques, les réactions aux échecs. L'app ne
  les pose pas à part. Une commande que le runtime cite dans un motif (`npm --prefix runtime run
  manager -- rendre 77`) est celle de la box : depuis ton poste, c'est `ssh <hote> brigade <nom>
  manager rendre 77` (`docs/runtime.md`, « Piloter »).
- **Lu tant que l'onglet est affiché**, comme les autres : à l'ouverture, puis toutes les trente
  secondes. Revenir sur l'onglet le relit aussitôt — rien n'y reste de la lecture d'avant.
- **Deux gestes, à côté de l'état : `allumer`, `éteindre`** — chacun sous ce que son clic fait.
  **`allumer` écrit** sa commande dans **un shell de l'espace**, ouvert pour elle, et **n'envoie
  rien** : l'app te mène sur ce shell, la commande à son invite, et c'est ton Entrée qui la fait
  partir. **`éteindre` est direct** : il n'engage rien, sa commande **part** dans le second, et sa
  sortie s'y lit (« Un geste direct part vraiment — ou dit pourquoi il ne part pas »).

  | Le geste | Ce qu'il écrit dans le shell, ou envoie dans le second |
  |---|---|
  | `allumer` | écrit : `ssh <hote> brigade <nom> manager on` |
  | `éteindre` | envoie : `!ssh <hote> brigade <nom> manager off` |

  C'est la commande de `docs/runtime.md`, « Piloter », dans sa forme de poste, mot pour mot : elle
  reste dans l'historique du shell et se rejoue à la main à l'identique. La ligne sous les onglets
  de droite dit ce qui a été écrit (``écrit dans ce shell, sans Entrée : `ssh box brigade parade manager on` — c'est la tienne qui l'envoie…``).
  **Allumer engage** : allumé, le manager juge tout le backlog ouvert, et ce qu'il juge exécutable
  part aussitôt en cuisine (`docs/runtime.md`, « Le manager ») — c'est pour cela que la commande
  s'écrit et se lit avant de partir. Envoyée, reviens sur **Manager** : l'état est relu.
- **Avec « allumer », l'app dit ce qu'il engage — et le chiffre.** Dès le clic, **au-dessus du
  shell** où la commande attend, se posent l'avertissement de `docs/runtime.md`, mot pour mot
  (« Allumé, il juge tout le backlog ouvert, et ce qu'il juge exécutable part aussitôt en cuisine.
  Avant d'allumer, pose `blocked-on-human` sur ce qui ne doit pas partir… »), puis **deux
  nombres**, dits en une phrase — ce qu'il va juger : `it will judge 9 of the 12 open issues — 3 carry
  blocked-on-human` (#906).

  | Ce qui se lit | D'où ça vient |
  |---|---|
  | l'avertissement | le texte de `docs/runtime.md`, « Le manager » — il est là dès le clic, avant toute lecture |
  | les deux nombres | la ligne `backlog` de `ssh <hote> brigade <nom> manager backlog`, que l'app lance **à ta place, une fois, après** avoir écrit le geste : la box compte sur GitHub les issues ouvertes du dépôt (PR écartées) et celles qui portent `blocked-on-human`, à l'instant. L'heure de la lecture et la commande sont dites dessous |
  | pourquoi ils manquent | la box pas jointe, GitHub pas lu par elle, un runtime d'avant cette lecture (« mets brigade à jour sur la box »), ou une sortie sans sa ligne `backlog` : l'app le dit, montre ce qu'elle a obtenu à la place, et **n'écrit jamais « 0 »** — ce n'est pas « aucune issue » |

  **Ce n'est pas une confirmation.** La commande est déjà écrite dans le shell quand les nombres
  sont demandés : l'avertissement ne retient rien, ne pose aucune question et n'a aucun bouton. Tu
  peux faire Entrée avant qu'ils n'arrivent — quelques secondes, le temps d'un `ssh` et d'une
  lecture de GitHub —, ou effacer la commande. « éteindre » n'affiche rien de tel.
  **Aucune permission de plus sur la box** : `manager backlog` est une commande du runtime comme
  `manager` ou `status`, lancée par le même geste (`brigade <projet> <commande>`) sous le même
  droit — elle ne fait que lire. Il lui faut seulement un runtime qui la connaît.
- Les deux gestes sont offerts quel que soit l'état lu — et même sans lui : ils n'attendent rien
  de la lecture, et le runtime répond `déjà allumé` ou `rien à éteindre` s'il n'y a rien à faire.
  Un projet **sans `hote`** n'en a pas ; un `hote` qui commence par un tiret, ou un projet dont le
  dossier n'est pas là, n'a rien d'écrit — aucun shell n'est ouvert, et la ligne sous les onglets
  de droite dit pourquoi.

### L'onglet Grants

**Un grant est-il actif, et jusqu'à quand ?** C'est l'autorisation la plus lourde du système —
sous grant `merge`, du code écrit par un cook atterrit sur la branche d'intégration sans toi
(`docs/runtime.md`, « Le grant `merge` ») —, et c'est là qu'elle se lit, par projet. En tête de
l'onglet, au-dessus du texte de `ssh <hote> brigade <nom> grant`, l'app pose ce qu'elle a lu **dans
cette sortie**, et rien d'autre — un bloc par grant :

| Ce qui se lit | D'où ça vient |
|---|---|
| **`grant merge`**, puis **`ACTIF`** (pastille verte), **`ÉTEINT SEUL`** (jaune), **`RÉVOQUÉ`** ou **`ABSENT`** (grises), puis `depuis le <date> · par <qui>` | la ligne `grant merge` de la sortie. La date est celle de son dernier changement, à l'heure de ton poste. Un grant **jamais donné** n'a ni date ni auteur ; un grant éteint seul n'a pas d'auteur — la suite de la ligne dit qui l'avait accordé. Un grant actif à moins d'une heure de son échéance, ou à un seul usage, porte en plus **`BIENTÔT ÉTEINT`**, et sa pastille est jaune |
| **son échéance : `encore 2 h 10`**, puis `jusqu'au 13 oct. 18:40 UTC` | la même ligne. **La durée restante est en tête**, avant l'heure : c'est la box qui l'a comptée, avec son horloge, à l'heure de la lecture (`lu à 14:32:07`, dans le titre) — l'app n'en recalcule aucune. L'heure est celle de la box, **en UTC, écrit en lettres** : elle n'est pas convertie à l'heure de ton poste. À côté, ce que la ligne dit d'autre de ce qu'il en reste, mot pour mot : `encore 9 usages, dont 1 retenu par un merge en cours`, ou `sans échéance` |
| ce que le runtime en dit ensuite | la fin de la même ligne, mot pour mot (`une pass verte est mergée sans toi`, `la pass s'arrête à la PR ouverte`) |
| **derniers usages du grant**, le plus récent d'abord | les lignes sous `derniers usages` qui nomment ce grant — dix au plus, c'est le runtime qui borne : l'issue, l'instant, ce que le merge est devenu (`mergée`, `non mergée`, `merge en cours`), la branche, la PR, le commit et le numéro du verdict qui l'a autorisé |
| **ce qu'aucun grant n'autorise** | les lignes sous `jamais accordé` : chaque action, et ce qu'elle interdit, mot pour mot (`identifiants-max — lire les identifiants du compte Max`, `acces-prod — toute action sur la production d'un projet`). La liste est celle du runtime, et ne se change par aucune commande |
| **les livraisons arrêtées faute de grant** | la ligne `sans grant, N livraisons vertes arrêtées : …`, telle quelle — le chiffre sur lequel accorder. Absente tant qu'aucune livraison n'a été arrêtée |

- **Une échéance dépassée ne se lit jamais comme une durée.** Passé son heure, le runtime ne dit
  plus le grant actif, que le journal l'ait déjà écrit ou non : la ligne dit `ÉTEINT SEUL depuis le
  <échéance> — son échéance est passée`, et c'est ce que l'app pose. Aucune durée restante n'est
  gardée de la lecture d'avant.
- **L'app n'y devine rien.** Une lecture ratée, ou une sortie sans ligne `grant <nom>` (un runtime
  d'avant les grants, un journal qui n'en a pas encore l'état), ne dit **ni actif ni absent** :
  `l'état des grants n'a pas été lu : … Ce n'est pas « aucun grant actif »`, et ce que l'app a
  obtenu se lit dessous, comme dans tout onglet. Un état que l'app ne connaît pas laisse la ligne
  du grant **telle quelle**, en alerte. Une section que la sortie n'a pas se dit `pas lus`, jamais
  `aucun` ; sans usage, c'est le mot du runtime qui se lit (`aucun`). Une ligne qui n'a pas la
  forme attendue reste telle quelle, à part.
- **Ce que la sortie dit d'autre se lit dessous** : les `derniers gestes` — qui a accordé, prolongé,
  révoqué, ce qui s'est éteint seul, ce qui a été refusé. L'app ne les pose pas à part.
- **Lu tant que l'onglet est affiché**, comme les autres : à l'ouverture, puis toutes les trente
  secondes — la durée restante a donc au plus trente secondes de retard, et l'heure de la lecture
  est dans le titre. Revenir sur l'onglet le relit aussitôt.
- **Deux gestes par grant, à côté de son état : `accorder merge`, `révoquer merge`.** Chacun
  **écrit** sa commande dans **un shell de l'espace**, ouvert pour elle, et **n'envoie rien** :
  l'app te mène sur ce shell, la commande à son invite, et c'est ton Entrée qui la fait partir.

  | Le geste | Ce qu'il écrit dans le shell |
  |---|---|
  | `accorder merge` | `ssh <hote> brigade <nom> grant enable merge` |
  | `révoquer merge` | `ssh <hote> brigade <nom> grant revoke merge` |

  C'est la commande de `docs/runtime.md`, « Piloter », dans sa forme de poste, mot pour mot : elle
  reste dans l'historique du shell et se rejoue à la main à l'identique. **`merge` est le grant le
  plus lourd, et il s'écrit comme les autres** : aucune boîte de confirmation ne s'ouvre. Ce qui te
  protège, c'est que la commande **se lit et se corrige avant de partir** — tu peux lui ajouter une
  échéance (`--for 4h`, `--until 18h30`, `--uses 10`) avant de faire Entrée ; sans elle, le
  grant est accordé **sans échéance**. Envoyée, reviens sur **Grants** : l'état est relu.
- Les deux gestes sont offerts quel que soit l'état lu — et même sans lui : ils n'attendent rien
  de la lecture, et le runtime répond `déjà actif` ou `rien à révoquer` s'il n'y a rien à faire. Ils
  ne sont offerts que pour un grant que la doc nomme (`merge`). Un projet **sans `hote`** n'en a
  pas ; un `hote` qui commence par un tiret, ou un projet dont le dossier n'est pas là, n'a rien
  d'écrit — aucun shell n'est ouvert, et la ligne sous les onglets de droite dit pourquoi.
- **Les boutons d'avant sont toujours là**, sous l'heure de la lecture : `grant activer merge`,
  `grant prolonger merge …`, `grant revoquer merge` écrivent dans **le second**, précédés du `!`
  (« Les boutons écrivent, ils n'envoient pas »). Prolonger n'a que ce bouton.

## Les boutons écrivent, ils n'envoient pas

Un bouton de l'app **n'agit pas**. Il écrit sa commande dans le **second** de l'espace, curseur
après, et s'arrête là : tu la lis, tu la corriges ou tu la complètes, et **c'est ton Entrée qui
l'envoie**. Devant l'invite de `claude`, un `stop` ne part donc pas d'un clic de travers — devant
un autre écran, lis « La limite » plus bas.

**Un bouton qui arrête dit ce qu'il arrête.** `garde-fous stop` n'existe que dans le panneau d'un
projet, et n'arrête que **la cuisine de ce projet-là** : la commande qu'il écrit le nomme
(`!ssh <hote> brigade <nom> guardrails stop`), et tu la lis avant de l'envoyer. Il ne ferme pas l'app, et ne
touche à aucun autre projet. **Aucun bouton n'arrête tous les projets** : « Tous les projets » n'en
a aucun.

| Où | Le bouton | Ce qu'il écrit dans le second |
|---|---|---|
| le panneau d'état, sous l'heure de la lecture | `garde-fous stop` | `!ssh <hote> brigade <nom> guardrails stop` |
| | `garde-fous reprendre` | `!ssh <hote> brigade <nom> guardrails resume` |
| l'onglet **Grants** | `grant activer merge` | `!ssh <hote> brigade <nom> grant enable merge` |
| | `grant prolonger merge …` | `!ssh <hote> brigade <nom> grant extend merge ` — l'échéance reste à taper (`--for 2h`, `--uses 3`…) |
| | `grant revoquer merge` | `!ssh <hote> brigade <nom> grant revoke merge` |
| l'onglet **Cooks** | `station cooks …` | `!ssh <hote> brigade <nom> station cooks ` — le nombre reste à taper |

- **C'est la commande de la doc, mot pour mot** : la forme de `docs/runtime.md`, « Piloter »,
  depuis ton poste (`ssh <box> brigade <projet> <commande>`), avec ton `hote` et ton `nom`. Le `!`
  devant est celui qui lance une commande sur le Mac depuis une session `claude`. Elle reste dans
  l'historique du second, et se rejoue à la main à l'identique.
- **L'app n'écrit pas d'Entrée** : ce qui est écrit ne porte ni retour chariot ni saut de ligne.
  Une commande qui en porterait un — un `nom` ou un `hote` qui en contient — **n'est pas écrite**,
  et la ligne sous les onglets de droite le dit.
- **La limite : l'app ne voit pas ce que `claude` affiche.** Elle écrit les caractères de la
  commande, et c'est l'écran du moment qui les reçoit. Devant l'invite, ils s'y posent. Devant
  **un dialogue à choix numérotés** (une permission d'outil, la confiance du dossier), ce sont des
  touches : un chiffre de ton `hote` ou de ton `nom` (`box2`, une IP, `projet-1`) peut y choisir
  une option. En **mode vim, hors insertion**, les lettres sont des commandes d'édition. L'app ne
  peut ni le savoir ni l'empêcher : ne clique un bouton que lorsque le second est à son invite, et
  regarde-le avant de valider.
- **La commande t'attend dans le second, à droite** — le centre ne change pas —, et la ligne sous
  son titre dit ce qui vient de se passer :
  ``écrit dans le second, sans Entrée : `!ssh box brigade parade guardrails stop` — devant l'invite de `claude`, elle attend la tienne, à la suite de ta frappe si tu tapais. Devant un autre écran (un choix à faire, le mode vim), ces caractères sont des touches : regarde le second avant de valider``.
- **Si tu étais en train de taper**, l'app ne le sait pas : elle ne lit pas ton terminal. Elle écrit
  **à la suite** de ta frappe, sans rien effacer, et le dit (ci-dessus). Pareil pour deux
  clics de suite : la seconde commande s'écrit après la première. Efface la ligne (`Ctrl+U`), et
  reclique.
- **Si le second ne tourne pas** — tu as quitté `claude` — le bouton **le lance d'abord**, et
  n'écrit rien : un `claude` qui démarre prendrait la commande pour des touches. La ligne dit
  ``le second ne tournait pas : lancé (`claude --continue /brigade:po`) — la commande n'est pas écrite dans un second qui démarre, reclique quand il est prêt``.
- **Toujours dans le second, jamais dans un shell** ouvert à côté. Deux exceptions, et chacune
  ouvre son propre shell : `Démarrer`, qui a besoin d'un vrai terminal (« Après l'ajout : la mise en
  service »), et le geste `allumer` du manager (« L'onglet Manager »).
- **Un `hote` qui commence par un tiret** (`-box`) n'a pas de commande écrite : dans la forme de la
  doc, `ssh` le lirait comme une option. Le bouton n'écrit rien, et la ligne sous les onglets de droite
  dit pourquoi — la lecture de la box, elle, n'en souffre pas.
- **Un bouton qui n'a rien pu écrire le dit** sous les onglets de droite : `rien n'est écrit : …`
  — par exemple quand le projet vient de quitter le fichier.
- Un projet **sans `hote`** n'a aucun bouton : il n'y a pas de commande à écrire. Un projet dont le
  dossier n'est pas là n'a pas de second : sa colonne dit pourquoi (`dossier introuvable : …`).
- **Seuls ces six boutons existent**, chacun là où se lit ce qu'il change — et, à part, les deux
  gestes du manager : `allumer`, qui écrit dans un shell, et `éteindre`, qui part (« L'onglet Manager »). Le
  reste de « Piloter » (`manager rendre`, `base rejouer`…) se tape. « Tous les projets » n'en a
  aucun. La mise en service d'un projet qu'on vient d'ajouter a les siens, à part : `installation`
  y est lancée pour toi, et `Démarrer` écrit dans un shell.
- **La bannière d'arrêt reprend `garde-fous reprendre`** : le même bouton, la même commande écrite,
  posé là où l'arrêt se lit (« Ce qui est dessiné », « La bannière d'arrêt »).

### Les gestes de la cuisine et de l'installation

Sous la carte du projet — l'état de la cuisine, du « stop » et du disjoncteur que `status` relaie —,
trois gestes du socle (`gestes.ts`) : **`reprendre la cuisine`**, **`arrêter la cuisine`**,
**`vérifier l'installation`**. Les deux premiers, comme ceux des grants, **écrivent** leur commande
dans **un shell de l'espace**, ouvert pour elle, et **n'envoient rien** : c'est ton Entrée qui la
fait partir. **`vérifier l'installation` est direct** : il ne fait que lire, sa commande **part**
dans le second (« Un geste direct part vraiment — ou dit pourquoi il ne part pas »). Les deux
formes sont posées à part, chacune sous son libellé :

```
écrire dans un shell de l'espace, sans envoyer :  [reprendre la cuisine] [arrêter la cuisine]
envoyer dans le second — part aussitôt, s'il est libre :  [vérifier l'installation]
```

| Le geste | Ce qu'il écrit dans le shell, ou envoie dans le second |
|---|---|
| `reprendre la cuisine` | écrit : `ssh <hote> brigade <nom> guardrails resume` |
| `arrêter la cuisine` | écrit : `ssh <hote> brigade <nom> guardrails stop` |
| `vérifier l'installation` | envoie : `!ssh <hote> brigade <nom> installation` |

- **En tête du rail, plus de phrase technique ni de bouton d'arrêt.** Le rail commence par ses
  colonnes. Une seule mention discrète peut le précéder : `up to date 3 min ago — …`, **visible
  seulement quand la lecture a plus de deux minutes** (ou n'a pas abouti). D'où viennent les données
  (les commandes, l'heure de chaque lecture) se lit dans **Paramètres**, sous « where the rail's data
  comes from ». **`stop the kitchen` est rangé dans Paramètres** aussi, sous sa forme à lui — un
  carré plein rouge devant le mot, un trait rouge — ; sa confirmation, qui dit le prix, est inchangée.
- **Arrêter la cuisine est dangereux** : tous les cooks en cours sont arrêtés, et plus aucun n'est
  lancé jusqu'à « reprendre ». **L'app n'ajoute aucune confirmation** : la commande se lit, et se
  corrige, dans le shell avant Entrée.
- Offerts quel que soit l'état lu. Un projet **sans `hote`** n'en a pas ; un `hote` qui commence par
  un tiret, ou un projet dont le dossier n'est pas là, n'a rien d'écrit — la ligne sous les onglets
  de droite dit pourquoi. Les deux boutons du panneau d'état (`garde-fous stop`, `garde-fous reprendre`) et
  celui de la bannière d'arrêt restent : eux écrivent dans le second.

## Un geste direct part vraiment — ou dit pourquoi il ne part pas

Un geste **sans jugement**, qui ne détruit ni n'engage rien, n'a pas à attendre ton Entrée : sa
commande **part**. Elle est envoyée dans le **second** — préfixée du `!` qui la lance sur le Mac
depuis la session `claude` —, **sa sortie se lit dans son fil**, à droite, sans que le centre
change. La ligne sous le titre du second dit ce qui est parti :

```
parti dans le second : `!ssh box brigade parade installation` — `claude` s'est mis en mode shell, l'app a fait Entrée. Sa sortie se lit dans son fil, et le second la lit aussi
```

| Le geste direct | Où | Ce qui part |
|---|---|---|
| `éteindre` | l'onglet **Manager** | `!ssh <hote> brigade <nom> manager off` |
| `vérifier l'installation` | sous la carte du projet | `!ssh <hote> brigade <nom> installation` |

**Les autres gestes restent écrits** — arrêter et reprendre la cuisine, accorder et révoquer un
grant : ils détruisent ou engagent, et se lisent avant de partir. **Allumer le
manager** aussi, pour l'instant : il engage, et son avertissement se pose sur la commande écrite.
**Un geste avec jugement** — la carte de T'attend — écrit une demande dans le second et s'arrête :
sans ton Entrée, rien n'est transmis.

### Ce que devient une commande écrite dans la saisie du second

C'est ce qu'il fallait savoir avant de faire partir quoi que ce soit, et c'est mesuré : un vrai
`claude` (2.1.296) dans un pty, le 2026-10-13, une commande `!…` écrite dans sa saisie.

| L'état du second | Ce que devient la commande |
|---|---|
| **libre** — à son invite, saisie vide | suivie d'Entrée, elle s'exécute aussitôt, et **sa sortie s'affiche dans le fil**. Le second en tire ensuite **un court tour à lui** : il la commente en une ou deux lignes |
| **occupé** — en plein tour | elle n'est **ni perdue, ni exécutée** : `claude` la met en file, et elle part **seule, à la fin du tour** — quand tu ne regardes plus |
| **devant un dialogue** — une permission, `/model` | ses caractères sont des touches : écrite d'un bloc elle n'y fait rien, mais **une Entrée y valide le choix montré** |
| **une frappe en cours** | elle s'écrit à sa suite, et le tout part comme **un message au second** — qui tente alors de lancer la commande lui-même |

**Écrire à l'aveugle n'est donc pas envoyer.** L'app ne porte pas pour autant son propre champ de
saisie : tu parles toujours au second dans son terminal. Elle ne lit pas non plus son écran. Elle
tient **trois témoins**, et ne le dit libre que s'ils s'accordent :

| Le témoin | Ce qu'il dit | D'où il vient |
|---|---|---|
| **ses tours** | un tour est en cours, ou fini | `claude` l'annonce lui-même : l'app le lance avec trois crochets (`--settings` : `UserPromptSubmit`, `PreToolUse`, `Stop`), qui écrivent un mot dans un fichier temporaire, propre à ce second. Devant un dialogue de permission, le tour **n'est pas fini** |
| **son titre** | il attend (`✳ …`), ou il tourne (`◐ …`) | le titre que `claude` donne à son terminal, lu dans sa sortie. Il tourne aussi pour une commande `!` et pour un tour qu'il lance de lui-même — que les crochets n'annoncent pas |
| **ta frappe** | ta saisie est vide, ou pas | l'app relaie ce que tu tapes dans le second : tant que ta dernière touche n'est pas **Entrée**, ta saisie n'est pas dite vide |

**Et une preuve, avant l'Entrée.** Libre, l'app **écrit** la commande, puis attend que `claude` se
montre en **mode shell** (sa légende `! for shell mode`) : c'est la preuve que la commande est
seule dans sa saisie, à son invite. **Alors seulement** elle fait Entrée. Sans preuve au bout de
cinq secondes — ou si tu tapes entre-temps —, elle ne fait pas Entrée, et le dit :

```
écrit dans le second, mais pas parti : `!ssh box brigade parade installation` — `claude` ne s'est pas montré en mode shell (« ! for shell mode »), l'app n'a donc pas fait Entrée. Sa saisie n'était pas vide, ou il montrait autre chose que son invite : regarde le second, et efface ce qui y est écrit
```

### Quand il ne part pas, il le dit

**Rien n'est écrit dans un second qui n'est pas dit libre**, et la ligne sous les onglets de droite dit
pourquoi — toujours suivie de ``— la commande n'est pas partie, et rien n'est écrit : `!ssh …` `` :

| Ce que la ligne dit | Ce qui se passe | Quoi faire |
|---|---|---|
| `le second est occupé : il est en plein tour` | il répond, ou une commande tourne | attends la fin du tour, et reclique |
| `le second n'est pas à son invite : il attend ta réponse — une permission, une question —, ou son dernier tour a été interrompu…` | un dialogue est ouvert ; ou tu as interrompu son tour (Échap), et l'app ne le saura libre qu'à la fin du prochain | réponds-lui, ou parle-lui : le tour suivant, fini, le dit libre |
| `ta saisie dans le second n'est pas dite vide : ta dernière touche n'y est pas Entrée…` | tu tapais, ou une touche est passée (une flèche, Échap) | envoie ou efface ta frappe ; saisie vide, **une Entrée dans le second** le dit à l'app |
| `la saisie du second n'est pas dite vide : l'app y a écrit sans envoyer…` | une demande de carte, ou une commande restée sans preuve, y est peut-être encore | envoie-la ou efface-la, puis une Entrée |
| `une commande de l'app est déjà en route dans le second` | tu viens de cliquer | attends qu'elle ait tourné |
| `le second n'a encore fini aucun tour depuis son lancement : il démarre…` | il démarre ; ou ses crochets sont coupés (`disableAllHooks`) | attends la fin de son premier tour |
| `l'app ne sait pas si le second est libre : …` | `claude` ne donne pas de titre à son terminal, ou pas l'un des deux que l'app connaît | — voir ci-dessous |

- **Le second ne tournait pas** : le geste le lance, n'y écrit rien, et le dit — reclique quand son
  premier tour est fini.
- **Le second commente la sortie.** Sur `claude` 2.1.296, une commande `!` lui fait tirer un court
  tour : il la résume en une ou deux lignes. Elle entre dans son contexte — c'est ce qui lui permet
  de savoir ce que tu as fait —, et chaque tour suivant la paie en entrée : un geste direct doit
  sortir court.
- **Tout cela tient à ce que `claude` montre aujourd'hui** : le glyphe de son titre, sa légende du
  mode shell, ses crochets. Qu'une version les change, et **plus aucun geste direct ne part** — il
  dit pourquoi, il ne devine pas. La commande est dans le refus : elle se tape.
- **Les réglages de l'app s'ajoutent aux tiens** : ses trois crochets n'écrivent qu'un mot dans son
  fichier, et rien sur leur sortie — `claude` n'en lit rien. Tes propres crochets tournent toujours.

## Ce qui est dessiné

Quatre choses, et elles seules, parce qu'elles sont un **tableau à états** : la pastille de la
barre, la carte de projet, le rail, la bannière d'arrêt. L'app ne les tire d'aucune phrase : elle
lance `ssh <hote> brigade <nom> facts`, la commande par laquelle le runtime donne ses faits comme des faits
(`docs/runtime.md`, « Les faits, pour un programme ») — un état est **un mot lu**, un compteur **un
nombre lu**. Pour tous les projets qui ont un `hote`, toutes les trente secondes, quel que soit
l'écran.

### La carte de projet

En tête du panneau, dans l'espace du projet :

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
| les cooks en cours | `cooks` : un par ligne, dans l'ordre de la box — son ticket, le titre de ce ticket, sa station. Ce sont ceux que `station` montre sous « cooks en cours » : ni les relectures du reviewer, ni les jugements du manager. Un titre trop long passe à la ligne, rien n'est coupé ; il est vide si le ticket a quitté le rail pendant la cuisson. `aucun cook en cours` quand la box n'en donne aucun |
| `dernier événement` | son type **tel quel** — l'app ne le traduit pas —, son ticket s'il en a un, et son âge à la lecture. `aucun : le journal est vide` sur un journal vide |

Les âges se comptent entre deux heures **de la box** : l'horloge de ton poste n'y entre pas.

**Une box dont le runtime ne donne pas encore ses cooks** — un runtime d'avant ce champ de
`faits` — n'est pas une box qui ne rend pas ses faits : la carte se dessine, et dit à leur place
`cooks en cours : pas lus — le runtime de cette box ne les donne pas encore dans faits`. **Ce n'est
pas « aucun cook »** : `station` les montre, dans l'onglet **Cooks** de l'espace. Le runtime mis à jour, la ligne s'en va seule.

**Un cook n'a ni jauge ni couleur** : ses tours, sa durée, ses tokens, son inactivité sont dans
`status`, et `faits` ne les porte pas. Son numéro ne s'ouvre pas non plus — le ticket s'ouvre
depuis le rail.

### Le rail

**C'est la vue principale de l'espace : au centre de l'écran, sous le nom du projet, quel que soit
l'onglet affiché dessous** — le second, un shell, la sortie d'une commande. **Cinq colonnes**, un
ticket par carte : ce qui va se passer (Sur le rail), ce qui se passe (Au travail, Pass), ce que tu
dois faire (T'attend), ce qui est fini (Livré). La spec est
`docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md` ; la langue visuelle reste celle
de `docs/maquettes/app/Brigade.dc.html`.

```
● Sur le rail  2       ● Au travail  1        ● Pass  1            ● T'attend  1          ● Livré  1
  #22 en attente         #14 pris               #15 en pass          #21 BLOQUÉ             #9 servi
  Connexion par…         Formulaire…            Export PDF…          L'export du journal    Validation SIRET
  after #14              écrit les tests        relecture en cours   Merge it yourself.     servi à 14:02 ·
                         · 12 min               · 1 min                                     Le champ SIRET…
```

**Une carte tient en deux lignes** (#622) : son numéro, son état et son titre, puis **une phrase en mots
simples** qui dit ce qui se passe, et au plus **une ligne de signal** quand quelque chose demande ton
attention. Chaque phrase est écrite d'après les faits que la file donne déjà de la carte
(`app/src/ligne-carte.ts`), un test par état :

| État de la carte | Sa phrase | Son signal |
|---|---|---|
| au travail (`pris`) | ce que le cook fait, et depuis combien de temps : `écrit les tests · 12 min` (`rail[].activite`) ; sans activité, `in the kitchen` et un repère `…` | — |
| en pass | de même : `relecture en cours · 1 min` ; sans activité, `review in progress` et le repère | — |
| en attente | `after #14, #15` quand `status` dit les tickets qui la retiennent ; sinon ce qui la retient, tel quel ; sinon `ready, waits for a place in the kitchen` | — |
| `BLOQUÉ` | de même, ou `blocked` et le repère | `blocked` |
| mise de côté (`86`) | sa raison en clair, celle que le runtime donne (`attente.raison`) ; le mot `86` s'affiche `set aside` | `set aside` |
| chez un tiers (WAITING) | `waiting for <quoi> · from <qui>` | `follow-up date passed` quand la relance est passée |
| t'attend | ce qu'on attend de toi, en une phrase (`decision.ts`) ; pour un ticket retenu par `blocked-on-human`, la question qu'on te pose | — |
| livrée | `served at 14:02 · <première phrase du résumé de la relecture>` ; sans résumé, l'heure et le repère | — |

**Ni « bail », ni « 86 », ni « non communiqué » sur une carte.** Quand une information manque, un
petit repère `…` le signale, discret ; la carte ne dresse jamais la liste de ce qu'elle ne sait pas.
Ce qui ne change pas ce que tu fais — qui tient le ticket, depuis quand, son bail, ce qu'il brûle, ce
qui le bloque, `en ce moment` — est dans **la fiche**, qu'un clic sur la carte ouvre (`app/src/bon.ts`,
`dit`), avec ce qui a été livré et ses remarques dépliables pour un ticket livré. La ligne brute que
`status` écrit du ticket n'est nulle part sur la carte ni sur la fiche : elle se lit entière dans
Paramètres. Les captures d'un ticket d'interface livré restent sur la carte.

**La fiche porte, elle, ce que la file dit du ticket** (`app/src/bon.ts`) — cinq choses, dans cet ordre,
et `en ce moment` (ce que la cuisine en fait, `rail[].activite`, voir « Ce que fait un cook en ce moment »
dans `docs/runtime.md`) en tête :

| Sur la fiche | Ce que c'est | D'où ça vient |
|---|---|---|
| `tient` | la station qui tient le ticket | `cooks`, dans `faits` ; à défaut, sa ligne de `status` (`par <station> …`) |
| `depuis` | depuis quand il est dans cet état — pris, en attente, en pass, servi | sa ligne sous `rail`, dans `status` |
| `bail` | son bail, avec les mots du runtime : `sans progrès depuis 3 min, bail encore 27 min`, `COINCE : …`, `bail échu depuis 5 min` | de même |
| `brûle` | ce que son cook a dépensé — jamais écrit tant que ni `faits` ni `status` ne le donnent | — |
| `bloque` | en clair, ce qui le retient : `zone tenue par #14 (app/src)`, `attend #12, #13`, `#17 abandonné (…)`, `aucune station déclarée` | sa ligne sous `rail`, dans `status` |

S'y ajoute, pour un ticket en pass ou servi, `cuisiné par` : qui l'a cuisiné n'est pas qui le tient.

- **Ce que la file ne dit pas n'est pas affiché** (#747) — ni la carte ni la fiche n'écrivent « non communiqué
  par la file : … » à la place d'une information : une chose absente n'a pas de ligne. Ni « personne »,
  ni « 0 », ni un tiret non plus. (Le modèle garde `sans`, que la vue ne pose plus.)
- **Un ticket d'interface livré montre ses captures, sans un clic** (#842) : pour chaque écran
  changé, la capture avant et la capture après côte à côte, chacune sous sa légende (`fiche — before`,
  `fiche — after`), sur sa carte en Pass comme en Livré. Elles viennent de `captures`, dans `faits`,
  chacune par son adresse sur GitHub au commit livré : l'adresse reste au process principal, qui lit
  l'image par le `gh` du poste — un dépôt privé compris — et la rend à la vue en `data:` (la page ne
  demande rien au réseau : `img-src data:`). Une capture illisible dit `not available` à sa place, son
  pourquoi au survol. **Une livraison d'interface qui ne les porte pas toutes est dite incomplète**, en
  une ligne en tête de ses captures (`incomplete delivery: screenshots missing — the after screenshot
  of fiche`), où les poser au survol ; une capture absente garde sa place, et dit `missing`. **Un
  ticket qui n'est pas d'interface n'a pas de `captures`** : sa carte n'en dit rien, pas même une zone
  vide (`captures.ts`).
- **Toute carte porte son titre.** Celui que la box donne ; à défaut — un ticket hors rail, que le
  journal ne connaît pas —, celui de son issue, lu une fois par le `gh` du poste à l'adresse que la box
  a rendue (`question.ts`, `titreDe`). Illisible, la carte n'a pas de titre : rien n'est écrit à sa place.
- **Un ticket retenu par `blocked-on-human` dit la question qu'on me pose** : en une ou deux lignes,
  tirée du commentaire du manager qui l'a posée (`question.ts`, `resumeDe`), avec qui l'a écrite et
  quand. Elle remplace la ligne brute de la file ; tant qu'elle n'est pas lue, la ligne brute reste.
  Sur sa fiche, deux boutons lèvent la retenue sans commande à recopier : **retirer le label** — le
  manager juge l'issue à son prochain tour — ou **fermer l'issue** (un second clic confirme), par le `gh`
  du poste, à ton nom (`question.ts`, `lever`). Rien ne part pour un ticket que le bloc `attend` ne
  dit pas retenu.
- **Une livraison qui t'attend pour merger s'explique en deux lignes, en tête de sa fiche**
  (`decision.ts`, `teteDe`) : ce qu'elle fait — la première phrase du résumé de sa relecture, ligne
  absente quand la relecture n'en donne pas — et pourquoi elle t'attend : `Green, but it touches the
  judges: review it.`, `Red after 2 returns: ` suivi du premier constat bloquant (ou `Red, the manager
  gave up: …`), `Green, the CI did not conclude.` Quand elle touche aux juges (`.claude/brigade/`,
  `.github/workflows/`), leurs fichiers suivent, un par ligne, avec les lignes ajoutées et retirées —
  rien de rédigé. Tout vient de `attend[].livraison` dans `faits`, ce que la pass a consigné
  (`runtime/src/attend.ts`, `Livraison` ; `judges` du `pass.judged`) ; sans rien de consigné, la
  phrase d'avant reste seule. Les boutons « merger » et « retirer du rail » sont dessous.
- **Chaque valeur est un morceau de ce que la box a écrit, ou un nombre qu'elle a donné.** L'app ne
  compte aucune durée (hors l'âge de `en ce moment`, ci-dessus) et n'additionne rien : deux cooks en vol sur le même ticket se lisent chacun
  sous son run.
- **La ligne lue est celle que `status` écrit sous sa ligne `rail`** —
  `  #<ticket>  <état>  <priorité>  <détail>  <titre>` (`runtime/src/etat.ts`, `decrireEtat`). C'est,
  avec le numéro en tête d'une ligne du bloc `attend`, **la seconde chose
  que l'app lit hors de la forme de `faits`**, et un contrat de plus sur un texte. Elle est bornée
  par l'état et le titre que `faits` donne pour ce ticket, et son détail n'est découpé que s'il a la
  forme que le runtime écrit pour cet état. **Sinon rien n'en est tiré : la ligne est relayée sur la
  carte, entière et mot pour mot**, sous ``non communiqué par `faits`, et pas lu par l'app dans ce que
  `status` écrit de ce ticket, relayé dessous tel quel``. C'est le cas d'un `86` et d'un mot d'état
  inconnu, dont le détail n'est pas découpé. Si le runtime reformule cette ligne, les cartes ne
  mentent pas : elles la relaient. Et un test de l'app fait écrire `status` et `faits` par le
  runtime lui-même, du même état, et rougit les gates avant (`app/test/bon.test.ts`).
- **Dans T'attend, ce qui bloque le ticket est ce que le bloc `attend` en dit** : posé sur la carte
  sous un trait de coupe, **mot pour mot** — sa ligne et, dessous, les lignes plus en retrait qui la
  précisent, dans leurs blancs, ni tronquées ni remises en forme. Une ligne trop longue passe à la
  suivante ; rien n'est coupé.

| Colonne | Ce qui y est | D'où ça vient |
|---|---|---|
| **Sur le rail** | les tickets `en attente` et `BLOQUÉ` | le mot d'état de `faits` |
| **Au travail** | les tickets `pris` | de même |
| **Pass** | les tickets `en pass` | de même |
| **T'attend** | les tickets qui attendent une décision de toi : ceux que le bloc `attend` de `status` nomme, dans l'ordre du bloc — le plus ancien d'abord —, puis ceux que `faits` nomme seul | **`attend`, dans `faits`**, qui dit qui attend ; et **le numéro en tête d'une ligne du bloc** (voir « Le numéro qu'elle y lit »), qui dit en plus ce qu'on attend de lui |
| **Livré** | les tickets servis dans les 24 h, **le plus récent en haut** — que leur issue soit fermée ou non : autant de cartes que le compteur `livrés 24 h` | **`livres`, dans `faits`** ; d'une box qui ne le donne pas encore, les tickets `servi` du rail |

- **Un ticket mis de côté (`86`) n'est jamais hors colonne.** Le runtime donne, dans `rail[].attente`
  de `faits`, sa raison en clair (« attend : setup du projet impossible ») et la colonne où il attend ;
  l'app le range là — à défaut d'une colonne qu'elle connaisse, dans **Sur le rail** — et sa carte
  porte la raison en une ligne (`set aside`), jamais la ligne brute de `status`
  (`86 prio:1 … (setup-failed), retour dans …`). Seul un ticket d'un état inconnu, sans `attente`
  (une box d'avant ce champ), reste rendu à part sous le rail.

- **Un ticket livré reste dans Livré 24 h, issue fermée ou non.** Le merge ferme l'issue, le ticket
  quitte le rail quelques secondes plus tard : la colonne ne le lit plus sur le rail, mais dans
  `livres`, que la box relit à son journal. Sa carte porte son numéro (qui ouvre l'issue), son titre,
  `livré` — son âge à la lecture, sur l'horloge de la box —, `cuisiné par` — la station —, et **un
  bouton « ouvrir la PR mergée »**, qui l'ouvre dans le navigateur : l'adresse reste au process
  principal, comme celle de l'issue. Un ticket servi sans merge n'a pas de PR : la carte le dit
  (`PR  aucune — servi sans merge`). Une issue fermée **sans** avoir été servie — abandonnée,
  écartée — n'y est pas.
- **Sous son titre, la carte dit ce qui a été livré : le résumé de la relecture, mot pour mot.** Le
  titre dit ce qui était demandé ; le résumé, ce que le reviewer a lu dans ce qui a été servi — celui
  qu'il a écrit sur l'issue. Il est posé en entier, dans ses mots : ni coupé, ni reformulé, et une
  ligne trop longue passe à la suivante. Dessous, **le nombre de ses constats, en clair** —
  `aucune remarque`, `4 remarques`, ou `2 remarques, dont 1 bloquante` pour une livraison mergée à la
  main malgré une relecture rouge. **Un clic sur ce nombre les déplie** sur la carte, chacun dans son
  ordre, avec le fichier qu'il nomme et son texte tel que le reviewer l'a écrit ; un second clic les
  replie. Ils viennent de `relecture`, dans `livres` (`docs/runtime.md`, « Les faits, pour un
  programme »).
- **Sans relecture, la carte le dit, et n'invente rien** : `ce qui a été livré : non communiqué —
  aucune relecture lisible ne porte sur cette livraison (mergée à la main, servie sans passer à la
  pass, ou d'avant la relecture)`. D'une box dont le runtime ne donne pas encore la relecture, elle
  dit ``ce qui a été livré : non communiqué — le runtime de cette box ne donne pas encore la relecture
  dans `faits` ``. Le titre de l'issue n'est jamais mis à la place du résumé.
- **Vide, la colonne le dit : « rien livré depuis 24 h ».** Ce n'est pas « aucun ticket » : rien n'a
  été servi.
- **Longue, elle défile dans sa hauteur** : ses cartes ne poussent rien sous la grille, et les autres
  colonnes restent en vue à côté d'elle.
- Un ticket `servi` encore sur le rail, servi il y a plus de 24 h, n'est plus dans Livré : il est
  rendu à part, sous la grille. Un ticket livré que le rail porte de nouveau sous un autre mot —
  repris depuis, `86` — est dans Livré et là où ce mot le range.

- **Un ticket qui attend une décision est dans T'attend, et nulle part ailleurs** — un `BLOQUÉ` quitte
  Sur le rail, une livraison verte non mergée quitte Pass : c'est l'information qui décide d'un
  geste. Sa carte garde son mot d'état, et porte **ce que sa ligne du bloc dit, mot pour mot** : le
  geste y est, tel que le runtime l'écrit.
- **Il y est dès que `faits` le nomme dans `attend`**, sans attendre `status` : `faits` est lu pour
  tous les projets, quel que soit l'écran. Tant que le bloc n'a pas été lu, sa carte est dans
  T'attend sans les mots du bloc — elle écrit que ce qui le bloque n'est pas communiqué, et n'offre
  pas « demander au second », qui se compose de ces mots.
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
- **T'attend peut ne pas être lue**, et la colonne le dit (`?`, `pas lue : le runtime de cette box
  ne donne pas `attend` dans `faits`, et le bloc `attend` de `ssh <hote> brigade <nom> status` n'a
  pas été pris pour ce projet`) : un runtime d'avant `attend` dans `faits`, dont `status` n'est pas
  encore lu, est raté, ou n'a pas de bord. Ce n'est pas « rien ne t'attend » — les tickets restent
  alors dans la colonne de leur mot d'état. La colonne ne dit jamais elle-même que rien ne
  t'attend : vide, elle dit `aucun ticket en tête d'une ligne du bloc `attend`` — ou, avant que le
  bloc soit lu, ``aucun ticket dans `attend`, d'après `faits` `` —, et c'est le bloc qui dit le
  reste : une connexion, la base attendent aussi, et n'ont pas de carte.
- **Un ticket `86` qui ne t'attend pas** — sa station lui a donné une heure de retour — **n'est
  d'aucune colonne**, comme un ticket dont l'app ne connaît pas le mot d'état : il se lit **sous les
  colonnes**, sous le titre `hors des cinq colonnes`, avec son mot — et sa ligne de `status`, relayée telle
  quelle sur sa carte, dit quand il revient ; la lecture Rail, dans Paramètres, relaie ce que `rail` en dit. Un `86` sans heure de retour, ou remonté par la pass, est dans le bloc : donc dans
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
- **Ce qu'une carte porte de `status` ne vaut que pour un projet dont `status` est lu** — celui qui
  est affiché, ou tous dans « Tous les projets ». Quand tu quittes un projet, ce que `status` en a
  rendu est lâché : à ton retour ses cartes disent ce que `faits` donne seul le temps de la première
  lecture, plutôt que de poser sur des faits frais une ligne d'il y a une heure.
- **Deux lectures, deux heures** : les colonnes datent de la dernière lecture de `faits` ; ce que
  le bloc dit et ce que les cartes portent, de celle de `status`. La provenance, dans Paramètres
  (« d'où viennent les lectures du rail »), porte les deux commandes et les deux heures, et elles peuvent différer de trente secondes : un ticket qui vient de bouger peut, le temps d'une
  lecture, se lire avec un mot d'état d'une lecture et une ligne de l'autre. Sa ligne ne se découpe
  alors pas — son état n'est plus celui de `faits` — : elle est relayée telle quelle.
- **Une carte de T'attend porte « demander au second »** (`app/src/demande.ts`). Le clic écrit
  dans le second une demande en prose — une phrase, pas une commande — et l'affiche : elle nomme
  le ticket, le projet, son titre s'il y en a un, et ce que le bloc `attend` en dit, mot pour mot,
  donc le geste que la file nomme (répondre sur l'issue, fermer, retirer et reposer `fire`, un
  `86`, une remontée de pass : chaque entrée a le sien, l'app n'en invente aucun). Elle demande au
  second de lire l'issue, d'expliquer, puis de répondre ou de faire le geste avec toi une fois que
  tu as décidé. **Rien n'est envoyé : c'est toi qui fais Entrée.** Il n'y a pas d'agent de popup :
  le second a la file, son historique et son rôle, et c'est lui qui répond sur l'issue quand tu
  passes par lui. Une question du manager se répond aussi sans lui, sur la fiche (ci-dessous).
  - **Le second est celui du projet**, affiché comme pour un bouton. Un second arrêté est lancé, et
    rien n'y est écrit : reclique quand il est prêt. La phrase est composée par le process
    principal du bloc qu'il tient, pas d'un texte venu de la vue ; un ticket que le bloc ne nomme
    plus n'écrit rien.
  - **Un caractère de contrôle refuse tout** — un retour chariot, un saut de ligne, un Ctrl-C dans
    ce que la file dit : rien n'est écrit, la note le dit. Aucun clic ne fait donc Entrée à ta place.
  - **Une ligne, qui disparaît à l'envoi.** La note d'une demande écrite tient en une ligne, sans
    recopier la demande (elle est dans le terminal) : « demande écrite dans le second — appuie sur
    Entrée pour l'envoyer ». Elle disparaît dès ton Entrée dans le second. L'avertissement sur les
    dialogues n'y figure que si le second attendait vraiment une réponse (une permission, un
    choix) quand l'app a écrit, et tient lui aussi en une ligne. L'app ne lit pas l'écran de
    `claude` : elle le sait par les tours et le titre du second (saisie.ts).
- **La question qui t'attend, posée telle quelle, sans LLM** (`app/src/question.ts`, #681). Quand
  le manager pose une question sur une issue — avant de découper une épique —, le clic de sa carte
  ouvre sa fiche, et la fiche la pose : l'app lit l'issue à l'ouverture et montre **le commentaire
  du manager mot pour mot**, sans ses marqueurs cachés (`<!-- brigade:… -->`) — ni résumé, ni
  reformulation, ni second. Dessous, ce qui a été écrit sur l'issue depuis, s'il y a quelque chose :
  tu vois qu'on y a déjà répondu.
  - **Ses choix sont des boutons.** Une question qui propose `(a) … (b) … (c) …` dans sa phrase, ou
    une liste `a)`, `(b)`, `c.`, `d :` en tête de ligne — des lettres qui se suivent depuis `a`,
    deux au moins —, a un bouton par choix : `b) il s'ouvre par-dessus`. **Un clic, et c'est
    répondu** : la lettre et le texte du choix, tels que la question les écrit, partent en
    commentaire. Une question sans choix lisibles n'a pas de bouton : elle se répond en une phrase.
  - **Une phrase, dans le champ dessous**, part par son bouton « post this answer », telle que tu
    l'as écrite. Entrée n'envoie rien ; une phrase vide ne part pas ; ce que tu écris reste quand la
    fiche se redessine.
  - **La réponse est postée sur l'issue par ton `gh`** — celui du poste, connecté à ton compte, le
    même que le second utilise : elle est signée de toi, et le manager la lit comme une réponse du
    chef, à son prochain tick ; la carte quitte T'attend quand il l'a fait. La fiche dit
    `answer posted on #<n>, in your name: “…”` et n'offre plus rien à poster. Aucun geste de la
    box ne lit ni n'écrit les commentaires d'une issue : c'est pour cela que l'app joint GitHub
    ici, et seulement ici — `gh issue view <issue> --json comments` à l'ouverture,
    `gh issue comment <issue> --body-file -` au clic.
  - **Rien ne part sans ton geste** : ni réponse d'office, ni choix par défaut. Et rien ne part sur
    une question qui n'est plus celle que tu as lue : l'issue est relue juste avant d'écrire. Si le
    manager en a posé une autre entre-temps, rien n'est posté, la fiche le dit et pose la nouvelle.
    Un ticket que le bloc `attend` ne nomme plus ne se répond plus d'ici.
  - **Une question n'est prise que de ceux qui ont la main sur le dépôt** (propriétaire, membre,
    collaborateur), comme le manager les lit : un marqueur recopié par un autre n'ouvre rien.
  - **Une issue sans question du manager n'ajoute rien à la fiche** : les autres entrées de T'attend
    — merge à la main, `86`, base rouge, label `question` ou `decision` posé à la main… — gardent leur
    geste à elles. **Une issue qui n'a pas pu être lue** — `gh` absent du poste, pas connecté, pas de
    réponse en trente secondes — le dit sur la fiche, avec ce que `gh` a rendu ; ce n'est pas
    « aucune question ».
  - **« ask the second » reste sur la fiche**, sous la question, pour celles qui méritent une
    explication : il écrit la même demande qu'avant.
- **Ce qui n'est pas encore sur le rail** (`app/src/amont.ts`, #697). Un rail vide ne veut pas
  dire un projet fini : en tête du rail, un nombre — `23 upcoming` — compte les issues ouvertes du
  dépôt que le rail ne porte pas. Il vient de `ssh <hote> brigade <nom> manager upstream`
  (`docs/runtime.md`, « En amont du rail »), lu **pour le projet affiché seulement**, une fois par
  minute : la box lit GitHub à chaque fois. Un clic déplie la liste, **regroupée par ce qui leur
  arrive**, dans les mots de la box :
  - `not yet read by the manager` ; `epic, not yet split` ; `awaiting your answer — it is also in
    TODO` ; `set aside by the manager` (avec sa raison en une ligne) ; `off the rail — still
    open` (`fire` retiré, ou `hors-cuisine` posé) ;
  - puis trois passages, quand il y en a : `on its way to the rail` (elle porte `fire`, ou le
    manager l'y a mise), `epic split — its tickets carry the work`, `served — its issue is still open`.

  Chaque issue porte son numéro, son titre et ce que la box en dit, mot pour mot. **Un clic l'ouvre
  sur sa fiche**, par-dessus le rail — son titre, sa priorité (le `prio:` que la box donne), le lien
  vers l'issue ; celle de sa carte de T'attend, si elle en a une. **Rien sur le rail** — aucune
  carte hors de Livré —, le rail le dit en clair : `nothing on the rail, nothing upcoming` quand il
  n'y a rien non plus en amont ; sinon combien sont à venir, groupe par groupe, et ce que le manager
  en fait, d'après son état lu (`manager`) : allumé, il les lit à chaque réveil ; éteint, il n'en
  lit aucune et rien de neuf n'entre ; pas lu, l'app le dit au lieu de le deviner. **L'app n'y
  déduit rien** : elle compte ce que la box liste et range chaque issue sous le mot qu'elle porte.
  Une lecture ratée — box pas jointe, GitHub pas lu par la box, un runtime d'avant `upstream`
  (« update brigade on the box ») — ne donne jamais de nombre : le bouton dit `upcoming: not read`,
  la liste dépliée dit pourquoi, et ce n'est pas « rien à venir ».
- **Les colonnes tiennent dans la fenêtre à sa taille d'ouverture** ; plus étroite, elles défilent.
  Le rail et ce que l'onglet affiché montre dessous se partagent la hauteur, moitié-moitié ; le
  rail défile dans la sienne. Un projet sans `hote` n'a pas de rail — rien n'est lu de lui — et
  son terminal prend toute la hauteur.

### La bannière d'arrêt

Quand la box dit la cuisine `arrêtée` — ton « stop » —, l'espace du projet le dit en tête, au-dessus
des onglets, quel que soit l'onglet :

```
CUISINE À L'ARRÊT — ton « stop » tient
Tous les cooks en cours ont été arrêtés, et plus aucun n'est lancé — redémarrage du runtime
compris, jusqu'à « reprendre ».
écrire la relance dans le second, sans envoyer :  [garde-fous reprendre]
```

- **Le bouton écrit la relance, il ne relance pas** : `!ssh <hote> brigade <nom> guardrails resume`
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
de la carte, ce qu'elle a obtenu ; dans la barre, un `!` sans couleur ; à la place du rail, une
ligne qui dit le cas et renvoie au panneau. Et **`status` reste lisible dessous** : `faits` est lu à part, son
échec ne retire rien au reste.

**À part, mais pas de front** : `faits`, `status` et la commande d'un onglet sont trois lectures,
et pour un même projet elles passent **l'une après l'autre** — un projet n'ouvre qu'une connexion
`ssh` à la fois, quel que soit le nombre de lectures qui l'attendent. Dans « Tous les projets », une box
reçoit donc au plus une connexion par projet qu'elle sert, pas deux.

| À l'écran | Ce que l'app a obtenu | Ce qu'elle montre dessous |
|---|---|---|
| ``JOINT, MAIS `faits` N'A PAS RÉPONDU — essai de …`` | `ssh` a joint la box, et la commande y a échoué sans que son code dise un cas. **Un runtime d'avant `faits` est le cas attendu** | la commande lancée, ce qu'elle a écrit, son code — puis le geste : mettre le runtime à jour sur sa box (`docs/runtime.md`, « Piloter ») |
| `JOINT, MAIS INCONNU DE LA BOX`, `… SANS LE DROIT DU GESTE`, `… UNE COMMANDE MANQUE SUR LA BOX`, `… LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME` | le geste de la box a refusé (codes 65, 68, 69 ou 127, 70) : **le même cas que sous `status`**, avec les mêmes mots | ce que la box en a dit, tel quel — puis **le renvoi de ce cas**, celui du tableau de « Une lecture de box : sept états ». Pas de mise à jour du runtime : ce n'est pas lui qui est vieux |
| ``LA BOX N'A PAS RENDU LA FORME DE `faits` — essai de …`` | la commande a abouti, et sa sortie n'est pas la forme : pas du JSON, un champ qui manque, un compteur qui n'est pas un nombre entier | **la sortie, mot pour mot**, puis ce qui n'est pas la forme (`« compteurs.rail » n'est pas un nombre entier positif`) |
| `PAS JOINT — essai de …` | rien qui prouve que la box a été jointe | le message de `ssh`, tel quel — le même que sous `status`, où ses renvois sont donnés |

Un champ qui manque refuse la forme **entière** : l'app ne complète rien. Un champ de plus est
laissé de côté.

### Ce qui n'est pas dessiné, et ne le sera pas ici

- **Le journal, les grants, la sortie de `station`** restent du texte : ce sont des flux, pas des
  tableaux à états. L'état des grants, comme celui du manager, n'est pas dessiné depuis `faits` : il
  est lu dans ce texte, et posé au-dessus de lui (« L'onglet Grants »).
- **Aucune jauge chiffrée**, ni du quota ni de la machine : le runtime ne connaît pas la
  consommation du compte (`/usage` la donne) et ne chiffre la machine que lorsqu'elle sature. Les
  lignes `quota` et `machine` de `station` se lisent telles quelles, dans Cooks.
- **Pourquoi** une cuisine est retenue, ce qu'un ticket attend, qui le tient : c'est `status` et
  `rail`, en texte, juste dessous.

## Ce que la box dit du projet

À droite du terminal, sans rien taper, et quel que soit l'onglet : la carte du projet, puis **ce
qui t'attend, mis à part**, puis la sortie de `ssh <hote> brigade <nom> status`, **mot pour mot**. (Les grants ont leur onglet.) L'app n'y lit rien
et n'en redit rien — si la formulation d'une commande change, ce que tu vois change avec elle. Elle
n'en découpe qu'une chose, par son bord : le bloc `attend`.

### Ce qui t'attend, mis à part

En tête du panneau, sur son propre fond : **le bloc
`attend` de `status`**, tel que le runtime l'a écrit, de sa ligne `attend` à sa ligne `fin attend`.
Tu n'as plus à le chercher dans la sortie.

```
ce qui t'attend — le bloc `attend` de `ssh <hote> brigade <nom> status`
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
- **Le numéro qu'elle y lit** — pour ranger le rail (« Le rail », colonne T'attend) — c'est tout ce
  qu'elle lit dans le bloc : **le numéro de ticket en tête d'une ligne du bloc**. Les lignes plus en
  retrait posées sous une entrée — ce qui la précise — lui restent attachées, telles quelles. La forme est celle que `status`
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
  Rien n'a pu être mis à part : la sortie de `ssh <hote> brigade <nom> status` n'a pas le bloc que l'app sait prendre — une seule ligne qui commence par `attend`, une seule ligne `fin attend`.
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

**Ce que l'app affiche se recopie.** Tout geste que l'app nomme — dans une ligne d'onglet, un
titre d'échec, un panneau, ce que les boutons écrivent — est le *geste de poste*,
`ssh <hote> brigade <nom> <commande>`, avec ton `hote` et le `nom` du projet : c'est ce que tu tapes
sur ton Mac. `brigade <nom> <commande>` seul est le *geste de box*, celui de la box elle-même
(`docs/runtime.md`, « Piloter ») : tapé sur le Mac, il rend `command not found`, et l'app ne pose
rien sur ton poste pour l'éviter. Sous le nom du projet, `<hote>` et `<nom>` sont à remplacer par
les deux champs de ton fichier.

Tu ne dictes plus aucune commande. L'app lance **le geste de la box**, joint par `ssh` : `ssh <hote> brigade <nom> status` —
et, pour l'onglet de contenu affiché, `ssh <hote> brigade <nom> rail`, `station`, `grant` ou `journal`
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
COMMANDE MANQUE SUR LA BOX — …` (les états de « Une lecture de box : sept états », dits pareil ici), et dessous il n'y a
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
  chez lui, sans rien retirer à l'autre.
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
événements), dans l'onglet **Log**. Pour le suivre en direct : `ssh <hote> brigade <nom> status -- --follow`, dans un shell de l'espace.

## La peau

L'app a une langue visuelle, et une seule : celle de la maquette (`docs/maquettes/app/`). Elle
habille **le cadre**, jamais le contenu.

- **Un fond sombre, des cartes dessus.** Tout ce qui se lit d'un bloc a sa carte : les listes de
  « Tous les projets », la carte de projet, la mise en service d'un projet ajouté, le retrait, les pages servies,
  l'état du manager, celui des grants, le formulaire d'ajout. Une colonne du rail est une carte,
  un ticket y est un **bon** — du papier clair sur le sombre —, et ce qui t'attend a la sienne, la
  même que le bloc soit plein ou vide. Il n'y a qu'un thème, sombre, et aucun réglage.
- **Une palette, écrite à un seul endroit** : `app/src/vue/jetons.css`. Chaque couleur y est une
  variable, et sa valeur est une couleur de la maquette ; `vue.css` et `vue.js` ne nomment que ces
  variables, le terminal y lit les siennes. Une couleur d'état reste celle de son mot (« Ce qui est
  dessiné ») : sur un bon, où une couleur claire ne se lirait pas en lettres, elle est dans la
  pastille qui précède le mot, et le mot est à l'encre. **Seules les couleurs d'un projet viennent
  d'ailleurs** — sa couleur d'onglet et sa couleur d'accent, tirées dans la palette de
  `app/src/couleurs.ts` et écrites dans `app.json` (« Les couleurs d'un projet ») : la vue les pose
  sur deux variables, `--teinte` et `--accent`, et jamais sur une couleur d'état.
- **Deux polices, embarquées** (`app/src/vue/polices/`, sous licence OFL) : rien n'est demandé au
  réseau, la page ne s'ouvre aucune origine. **Archivo** pour l'interface. **JetBrains Mono** pour
  ce qui se recopie tel quel — un numéro de ticket, un identifiant de run, un port, le nom d'un
  projet, une commande — et pour ce que la box a rendu. **Le monospace est une information, pas un
  style** : un bouton est en monospace si ce qu'il affiche est la commande qu'il écrira, et ce que
  l'app dit elle-même, même sur plusieurs lignes, est en Archivo.
- **Ce que la box a rendu est dans un cadre à lui**, sombre, en monospace : la sortie d'une
  commande, le message de `ssh`, ce que le geste d'installation a répondu. **Mot pour mot** : ses
  blancs et ses lignes sont les siens, une ligne trop longue passe à la suivante, rien n'est coupé,
  caché ni récrit. Ce que l'app en dit est dessous, hors du cadre : on ne confond pas ses mots avec
  ceux de la box. Rien ne se coupe dans toute l'app : le titre d'un ticket sur la ligne d'un cook en
  cours passe à la ligne, comme le reste. La fenêtre ne se réduit pas sous 640 px de large (la moitié
  de son ouverture) ; en deçà de 1280, les onglets et les colonnes du rail défilent, rien ne se chevauche.

## Le poste est une station

Un ticket peut demander une capacité que la box n'a pas — `chrome-connecté`, ton navigateur, avec
tes sessions. Le projet déclare alors sur sa box une station qui la fournit et qui **ne tourne pas
sur la box** : `mac/claude:1:chrome-connecté:distante` (`docs/runtime.md`, « Une station distante
tire son travail »). **C'est l'app qui la joue**, pour les projets qui le lui demandent :

```json
{ "nom": "brigade", "dossier": "~/Dev/brigade", "hote": "ma-box", "stations": ["mac/claude"] }
```

Tant que l'app est ouverte, elle fait pour chaque station ce que la box attend d'elle, par le geste
de la box et rien d'autre (`ssh <hote> brigade <nom> pull <station> …`) :

| Ce qu'elle fait | Quand | Ce qui part vers la box |
|---|---|---|
| **s'annoncer** | au lancement, puis toutes les trente secondes tant que tous ses cooks sont pris | `pull mac/claude announce` |
| **réclamer** un ticket | toutes les trente secondes tant qu'il lui reste de la place | `pull mac/claude claim` |
| **cuisiner** | à chaque ticket reçu : un worktree dans le dossier du projet, sur la branche que la box nomme, et `claude` dedans, avec les arguments que la box a remis | rien |
| **renouveler** son bail | toutes les trente secondes par cook | `pull mac/claude renew <run> [--proof <empreinte>] --turns <n> --tokens <n>` |
| **rendre** | quand le cook a fini : sa branche poussée sur l'origine, puis son dernier message à la box | `git push` vers l'origine ; `pull mac/claude return <run> --end livre\|echec …` |

Le pas est de trente secondes, moins si la box annonce un délai de présence ou un bail plus courts.

**Tout part de ton poste, rien n'y arrive.** L'app n'écoute aucun port pour ce travail et n'ouvre
aucun serveur ; elle ne dit à la box ni son nom ni son adresse, et n'ouvre aucun transfert de
port : un `ssh` sortant par demande, un `git` vers l'origine, et `claude`. La box, de son côté, n'a
aucun chemin vers ton Mac (`runtime/test/architecture.test.ts`). Côté app, `app/test/runner.test.ts`
le tient : ce que le runner importe, les trois programmes qu'il lance, et chaque ligne passée à
`ssh` pendant un service complet.

**App fermée, la station est absente — et ce n'est pas une panne.** Passé le délai de présence de
la box (deux minutes par défaut), les tickets qu'elle seule peut cuisiner sont `86`, « station
absente », et `status` le dit ; les autres partent sur la box comme avant. Rouvre l'app : ils
repartent seuls, à sa première demande. Il n'y a rien à faire sur la box, et l'app ne fait rien de
spécial en fermant.

**Les tickets ordinaires, depuis les réglages du projet (#852).** Sur un Mac, dans Settings › General
d'un projet dont ce poste joue une station (`stations`), le bloc « Ordinary tickets on this Mac » porte
l'option « Take the ordinary tickets too » et le champ « Cooks at once », la limite de cooks du Mac. Une
seule ligne, à côté, dit ce que ça implique : les cooks du Mac tournent dans le bac à sable de Claude
Code, avec écriture limitée à leur worktree et réseau limité à la liste du projet. Les deux valeurs
s'écrivent dans le fichier des projets (`"ordinaires": true`, `"limiteCooks": 2`) et se relisent à
chaque ouverture ; une valeur mal écrite à la main refuse le fichier. **Hors d'un Mac, ou sans station
jouée, le bloc n'existe pas.** L'état du bac à sable est lu dans `facts` (champ `stations`,
[docs/runtime.md](runtime.md), « Les tickets ordinaires sur le poste du chef ») : quand la station le
dit indisponible, le bloc l'écrit à côté de l'option, avec la raison que la station donne, et précise
que le Mac ne prend aucun ticket ordinaire. Tant qu'elle n'en a rien dit, l'app ne devine rien. Le bloc
règle ce que l'app garde ; la déclaration `distante+ordinaires` de la box reste celle du chef.

**Où cuit chaque ticket (#853).** La box n'envoie un ticket ordinaire au Mac que quand elle sature
(docs/runtime.md, même section). Sur le rail, la carte d'un ticket en cours dit donc, sous « taken by »,
**« cooks on : box »** ou **« cooks on : Mac »** — Mac pour une station distante, d'après le champ
`stations` de `facts`. Une station que `facts` ne donne pas — un runtime d'avant ce champ — ne fait rien
dire : l'app ne devine pas d'après son nom.

**Un cook sur ton poste n'est pas un cook privilégié.** Ce que la box tient pour les siens, elle le
tient pour lui, et l'app ne contourne rien :

- **Les mêmes arguments.** `claude` est lancé avec ceux que la box a remis, tels quels : même
  consigne, même calibrage, mêmes outils interdits (ni `git push`, ni `gh pr merge`).
- **Aucun grant de plus.** Son environnement est celui du terminal qui a lancé l'app, trié comme la
  box trie celui des siens : sans les variables `BRIGADE_…`, sans rien qui détourne `claude` de sa
  connexion (`ANTHROPIC_API_KEY`…), sans mémoire automatique. L'app n'y ajoute ni jeton, ni secret
  du projet, ni grant — la box n'en remet aucun. Ce que ton poste sait faire par ailleurs (ton
  `gh`, ton navigateur) est à toi : c'est pour ça que le ticket vient ici.
- **Le même bail, sur preuve de travail.** À chaque renouvellement l'app envoie ce que le cook a
  consommé, et l'empreinte de son worktree **si elle a bougé depuis qu'il y est entré** : un
  worktree intact n'est présenté comme la preuve de rien. La box ne renouvelle que sur une
  empreinte qui a changé ; sinon le bail tombe à son échéance, et le cook est arrêté.
- **Les mêmes plafonds.** Tours, jetons, durée, inactivité : la box les juge sur ce que l'app
  rapporte et sur sa propre horloge. Dès qu'elle répond `stopped` — un plafond, le bail, ton
  « stop », un redémarrage du runtime —, l'app arrête son cook (`SIGTERM`, puis `SIGKILL` cinq
  secondes après) et ne rend rien : la box ne recevrait plus rien de lui.
- **Une box muette ne laisse pas un cook sans garde.** Si aucun renouvellement n'a été accepté
  pendant la durée du bail — la box ne répond plus, ou refuse —, l'app arrête le cook d'elle-même.
- **Le même journal.** La prise, le lancement, le relevé, la fin et le compte-rendu du cook sont
  écrits par la box, dans son journal, comme pour un cook à elle (`cook.launched` porte
  `remote: true`) ; chaque demande de l'app y est aussi, avec sa réponse.
- **La même pass.** Le cook ne pousse pas : c'est l'app qui pousse sa branche sur l'origine, et la
  box la rapatrie de là — mêmes gates, même reviewer, même grant `merge`, mêmes renvois. Un renvoi
  de la pass revient sur la même branche, telle que l'origine la porte.

**Ce qu'un cook d'ici livre** se juge dans son worktree, comme sur la box :

| Il a conclu, et… | Ce que l'app fait | Ce que la box en retient |
|---|---|---|
| sa branche porte des commits | ce qui traîne non commité est commité à sa place, la branche est poussée, `return --end livre` | `done` : PR, compte-rendu, pass |
| aucun commit, worktree intact | rien n'est poussé, `return --end livre` avec son dernier message | `done`, `no-diff`, s'il y a délimité un livrable ; sinon `no-deliverable` |
| aucun commit, des fichiers écrits | `return --end echec --reason no-commit` | `failed` |
| il a quitté sa branche | `return --end echec --reason off-branch` | `failed` |
| il n'a pas conclu (code de sortie, quota, session perdue, refus du modèle) | `return --end echec`, avec la raison | `failed` |

**Ce que ça écrit dans le dossier du projet.** Le dossier est ton clone : l'app y ajoute un
worktree par cook, hors du dossier (`~/.config/brigade/stations/<projet>/<run>`), et sa branche
`cook/<run>`. Ce qu'elle rapatrie de l'origine va dans des références à part
(`refs/brigade/origine/…`) : **ta branche, tes branches de suivi et tes tags ne bougent pas.** Le
cook fini, le worktree est retiré ; la branche part aussi, sauf si elle porte ce qui n'est pas sur
l'origine — un cook en échec ou arrêté qui avait commité, ou laissé des fichiers : ils sont commités
dessus, et la branche **reste dans ton clone**, jamais poussée. L'app le dit, et c'est à toi de la
supprimer. Il faut donc que le dossier soit un clone du dépôt, dont `origin` est l'origine que la
box sert, et que ton poste puisse y pousser.

**Où ça se lit.** Sur la box : `station` montre la présence de `mac/claude` sur sa ligne
`présence` (onglet Cooks), et `status` les tickets qui l'attendent (le panneau du projet). Sur ton
poste : l'app écrit dans le terminal qui l'a lancée ce que chaque station fait, une ligne par
changement.

```
brigade : station mac/claude de « brigade » — présente — fournit chrome-connecté
brigade : station mac/claude de « brigade » — cuisine le ticket #16 (16-9f494a1d)
brigade : station mac/claude de « brigade » — ticket #16 rendu : done
brigade : station mac/claude de « brigade » — refusée par la box — le projet ne déclare aucune station mac/claude : …
```

Une station que la box refuse — elle ne la déclare pas, ou pas `distante` — redemande toutes les
cinq minutes, sans rien lancer.

**Ce qui n'est pas garanti.**

- **Fermer l'app tue ses cooks**, sans rien rendre : le ticket reste pris jusqu'à l'échéance de son
  bail, puis revient au rail (`guard.tripped`, `reason: lease`) — un échec compté par le
  disjoncteur, comme pour tout cook dont le bail tombe. Le worktree reste, et il est retiré au
  lancement suivant ; ce que le cook avait commité reste sur sa branche, dans ton clone.
- **Une app tuée net** (pas fermée) peut laisser un `claude` tourner : rien ne le surveille plus.
  Son worktree est retiré au lancement suivant.
- **Le setup du worktree du projet n'est pas joué** (`.claude/brigade/worktree-setup.sh`) : sur la
  box, la station le joue avant le cook ; ici, c'est au cook de le lancer s'il en a besoin.
- **Un cook d'ici en échec ne livre rien**, même s'il avait commité : sur la box, ses commits
  partent quand même en pass (« récolté ») ; ici ils restent sur sa branche, chez toi.
- **Le quota épuisé de ton poste est un échec** pour la box, pas un `86` à heure de retour : le
  geste `pull` ne sait dire que « livré » ou « échec ».
- **Le flux brut du cook n'est pas gardé** sur ton poste : la box n'en reçoit que son dernier
  message, et ce qu'il a consommé.
- **Deux apps ouvertes sur le même fichier des projets** jouent deux fois la même station, et
  chacune retire au lancement les worktrees que l'autre a posés.

## Fil repris, ou session neuve : l'app le dit

Sous les onglets, une ligne dit ce qui est affiché. Pour le second, elle prend l'une
de ces trois formes :

| La ligne | Ce qui s'est passé |
|---|---|
| `fil repris : `claude --continue`, la dernière conversation de ce dossier — quelle qu'elle soit, pas forcément celle d'un second ; `/brigade:po` y est invoqué` | Le second a été lancé par `claude --continue /brigade:po`, et il tourne : tu retrouves ton fil, et le rôle y est invoqué. |
| `session neuve : `claude --continue` est sorti en code 1, le fil n'a pas été repris — `claude /brigade:po`` | `claude --continue` est sorti en erreur — le plus souvent parce que ce dossier n'a encore aucune conversation. L'app a lancé `claude /brigade:po`, **une fois**. Ce que `claude` a dit en sortant reste lisible dans le terminal. |
| `le second s'est arrêté (code 0) — une touche le relance` | Tu as quitté `claude`, ou la session neuve n'a pas tenu. Rien n'est relancé d'office : une touche dans le terminal relance le second, en reprenant le fil et en invoquant le rôle. |

À savoir :

- « Le fil » est **la dernière conversation de ce dossier**, telle que `claude --continue` la
  choisit — y compris une conversation que tu as eue dans un autre terminal, ou celle d'un dev ou
  d'un manager : l'app ne peut pas garantir que c'est celle d'un second, et ne le prétend pas —
  elle invoque `/brigade:po` dans ce fil, et la ligne le dit. L'app ne tient
  aucun registre de sessions à elle.
- La ligne dit `fil repris` dès le lancement ; si `claude --continue` n'a rien à reprendre, elle
  passe à `session neuve` dans l'instant où il sort.
- Dans un dossier que `claude` ne connaît pas encore, il te demande d'abord si tu lui fais
  confiance : c'est lui qui demande, dans le terminal, comme partout ailleurs.

## Fermer l'app

Fermer la fenêtre quitte l'app, et quitter **arrête tous ses terminaux** — seconds et shells — et
les lectures de box en cours. Les shells ouverts par `+ shell` ne font que s'en détacher : leurs
sessions tiennent, et ils reviennent au premier clic sur leur projet (voir plus haut). **Et les cooks de ses stations** : fermée, l'app n'en joue plus
aucune, et la box les dit absentes (voir « Le poste est une station »).
Les conversations, elles, sont gardées par `claude` : à la réouverture, le premier clic sur un
projet reprend son fil, et la ligne sous les onglets de droite te dit si c'est bien le cas.

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
- **Avant tout, `start` passe à la nouvelle version.** Si la branche de l'origine que suit ce clone
  a avancé, le clone avance avec elle (avance rapide seulement), puis les dépendances sont reposées
  si elle les change, et l'app s'ouvre sur la nouvelle version :
  `brigade: the app is updated — 5 commits from origin/v2 (3ba369f → e5123e1), in /Users/chef/dev/brigade. It opens on the new version.`
  Déjà à jour, rien n'est dit. Une origine muette (au bout d'une minute), une branche qui ne suit
  rien, un clone qui a des commits à lui ou des changements qui seraient écrasés : le clone ne bouge
  pas, la raison est dite, et l'app s'ouvre sur le code qu'elle a — jamais une mise à jour ratée ne
  l'empêche de s'ouvrir.
- **L'app tourne sur le code de ce clone, tel qu'il était à son lancement.** Quand une nouvelle
  version arrive pendant qu'elle tourne, la case **T** passe en jaune, les réglages de chaque projet
  le disent, et un clic l'y fait passer (voir « Le code de l'app : à jour, ou en retard »).

Lancée depuis un terminal, l'app hérite de son environnement : le `PATH` qui trouve `claude`, tes
accès.

## Pour qui développe l'app

| Geste | Commande |
|---|---|
| Tests | `npm --prefix app test` |
| Contrôle de types | `npm --prefix app run typecheck` |
| Lancer sans consommer de quota | `BRIGADE_CLAUDE_BIN="$PWD/app/test/aides/faux-claude.sh" BRIGADE_APP_CONFIG=<fichier d'essai> npm --prefix app start` |
| … et sans box | ajouter `BRIGADE_SSH_BIN=<un script qui imprime une sortie de status>` — et, pour voir ce qui se dessine, l'exemple de `docs/runtime.md` quand ses arguments finissent par `faits` |
| … et sans que ta machine devienne une station | ajouter `BRIGADE_APP_STATION=0` |

**L'app ouverte est une station** (voir « Cet ordinateur est une station ») : elle crée son gist
sur ton compte GitHub par ton `gh`, et cuit les projets de son `station/projets`.
`BRIGADE_APP_STATION=0` l'en empêche ; `BRIGADE_APP_CONFIG` déplace aussi son répertoire, à côté du
fichier d'essai.

**Un projet qui déclare `stations` lance de vrais cooks sur ton poste** dès que l'app est ouverte
et que sa box a un ticket pour eux — sur ton quota, sans demande de permission, dans un worktree de
son dossier. Pour l'essayer sans box ni quota : pas de `stations` dans le fichier d'essai, ou les
deux doublures ci-dessus.

**Sans `BRIGADE_SSH_BIN`, ajouter un projet installe pour de bon** : l'écran d'ajout lance le vrai
geste d'installation sur la box choisie. Pour l'essayer sans box, le faux `ssh` rend l'objet du
geste quand sa ligne porte `brigade-installer` (une ligne `{"ok":true,"ports":{"porte":3129,"arbitre":null},…}`).
Pour la mise en service : la sortie d'`installation` quand ses arguments finissent par
`installation` — avec, pour un « prêt », la ligne `brigade : projet « <nom> » : prêt` et un code 0.
Le faux `claude` dit `reçu : /brigade:init` quand il est ouvert sur la session.
**Et « Désinstaller de la box » désinstalle pour de bon** : pour l'essayer sans box, le faux `ssh`
rend, quand sa ligne porte `uninstall`, les phrases du geste sur sa sortie d'erreur et son objet
sur sa sortie standard — `{"ok":true,"action":"uninstall","fait":"plan","projet":"<nom>",…}` pour
`--plan`, `"fait":"desinstalle"` pour `--confirm`.

- **Pas de build.** Le process principal est du TypeScript exécuté tel quel par Electron (son
  Node efface les types, comme celui du runtime) ; la vue est du JavaScript contrôlé par `tsc`
  (`// @ts-check`), qui importe xterm.js par une *import map* — ni bundler ni étape de
  compilation.
- **Shift+Entrée revient à la ligne.** xterm.js l'envoie comme Entrée ; la vue l'intercepte
  (`attachCustomKeyEventHandler`) et écrit à la place `ESC` + `\r` dans le second (l'Alt+Entrée de
  `claude`) ou un saut de ligne cité `^V` `^J` dans un shell. Entrée, Ctrl+C et le collage ne
  passent pas par là.
- **Option/Cmd/Ctrl/Shift + flèche et Option/Cmd/Ctrl + ⌫ déplacent ou effacent.** xterm.js les
  envoie en `CSI 1;<mod>` ou en `DEL` nu, que le shell et `claude` écrivent comme des caractères. La
  même interception les traduit, dans le second comme dans un shell : Option/Ctrl + ←/→ → `ESC b` /
  `ESC f` (un mot), Cmd + ←/→ → `^A` / `^E` (la ligne), Option + ⌫ → `ESC DEL` (un mot), Cmd + ⌫ →
  `^U` (jusqu'au début de ligne), Ctrl + ⌫ → `^W`. Shift seul n'a rien à sélectionner : la flèche
  part nue.
- **Aucun test ne lance Electron.** Ce qui se prouve vit dans vingt modules joués par
  `node --test` : `config.ts` (le fichier des projets : le lire, le créer, y ajouter un projet, en
  ranger un à une autre place, y déclarer une box — et les box que l'écran d'ajout propose), `nom.ts` (la forme du nom, tenue
  contre la règle du geste d'installation : le test appelle `lireDemande` de
  `runtime/src/installateur.ts`), `installation.ts` (l'ajout d'un projet : les champs sans défaut,
  ce qui part vers la box — relu par le même `lireDemande` —, et ce que l'app fait de chaque
  réponse, contre un faux `ssh` et le vrai fichier des projets), `service.ts` (la mise en service :
  ses trois états — init non mergé, vérification incomplète, tout prêt —, ce que `Vérifier` lance
  et ce qu'il fait de chaque code de sortie, contre un faux `ssh` ; et que `Démarrer` n'écrit rien
  dans aucun terminal tant que la box ne dit pas le projet prêt, sur le registre et de faux pty — la
  ligne de verdict se compare à `runtime/src/installation-cli.ts`, le démarrage à `docs/installer.md`),
  `retrait.ts` (retirer un projet : que « Retirer de l'app » ne lance aucun `ssh` et laisse le
  journal de la box tel qu'il est ; que la désinstallation ne part ni sans le plan de la box, ni
  sans le nom du projet, ni avec l'option du journal si elle n'est pas cochée — contre un faux `ssh`
  qui tient lieu de box, dont les phrases sont celles de `direDesinstallation` et les arguments
  relus par `lireRetrait`, de `runtime/src/desinstallateur.ts`),
  `suivi.ts` (le même fichier relu quand il change, sur de vrais fichiers et la vraie veille du
  système), `lancement.ts` (ce que `start` pose avant Electron — les commandes y sont relevées,
  pas lancées), `terminaux.ts` (le registre : qui est
  lancé, gardé, relancé, et ce que l'app en dit — et le geste direct : second libre, il part ;
  occupé, rien n'est écrit et le refus le dit ; un prompt rempli n'est pas envoyé), `saisie.ts`
  (ce que l'app sait de la saisie du second : ses tours — les crochets joués par un vrai `sh` —,
  son titre, la frappe du chef, la preuve du mode shell ; les signes sont ceux relevés sur le vrai
  `claude`, rejoués sans en lancer aucun), `pty.ts` (le vrai pty, contre un faux `claude`),
  `box.ts` (la veille des box et ses états, contre un faux `ssh` que chaque test écrit : ni
  réseau ni box), `attend.ts` (le bloc `attend` pris par son bord, sur des sorties recopiées du
  runtime ; et le numéro en tête d'une ligne, sur le bloc que le runtime écrit lui-même — le test
  appelle `decrireAttentes` de `runtime/src/attend.ts`), `barre.ts` (le monogramme d'un projet), `couleurs.ts`
  (les couleurs d'un projet : tirées sans doublon tant que la palette n'est pas épuisée, écrites
  dans le fichier — et seulement celles qui manquent —, changées une à une ; dans la vue jouée, la
  case teinte, l'accent de l'espace, le choix sous Réglages ; aucune n'est une couleur d'état), `onglets.ts` (les cinq onglets de contenu :
  chacun relaie un script qui existe dans `runtime/package.json`, et seul l'affiché est lu),
  `boutons.ts` (ce que chaque bouton écrit, comparé à « Piloter » de `docs/runtime.md` — et, dans
  le registre et sur le vrai pty, que rien n'est envoyé), `gestes.ts` (les gestes qui s'écrivent
  dans un shell de l'espace, et les deux qui partent dans le second : chaque commande comparée,
  caractère pour caractère, à « Piloter », que rien n'envoie un geste écrit, et qu'aucun geste
  n'expose de shell, de `sudo` ni de commande libre), `manager.ts` (l'état du manager lu dans la sortie de `manager` : allumé,
  éteint, jamais allumé, sans décision, avec ses décisions et ses écarts — sur des sorties que le
  test fait écrire par `runtime/src/manager-cli.ts` lui-même, sur un vrai journal ; ce qui n'a pas
  la forme n'est jamais lu comme « éteint »), `allumage.ts` (ce qu'engage l'allumage : son
  avertissement comparé à celui de `docs/runtime.md`, et les deux nombres lus sur un backlog
  connu — la ligne est écrite par `manager backlog` de `runtime/src/manager-cli.ts` lui-même,
  devant un faux `gh`, puis rendue par un faux `ssh` ; une box pas jointe, un runtime d'avant la
  commande ou une sortie sans la ligne ne donnent jamais « 0 »), `amont.ts` (ce qui n'est pas encore sur le
  rail : la sortie écrite par `manager upstream` de `runtime/src/manager-cli.ts` lui-même, sur un
  vrai journal et devant un faux `gh`, comptée et rangée en groupes sans rien y ajouter ; ce qui
  n'a pas la forme, une box pas jointe ou un runtime d'avant la commande ne donnent jamais de
  nombre ; et, vue jouée, le nombre en tête du rail, la liste qu'il déplie, la fiche qu'une issue
  ouvre, et ce que dit un rail vide), `faits.ts` (ce qui se dessine : la
  forme lue champ pour champ sur l'exemple de `docs/runtime.md`, ce qui n'est pas elle refusé sans
  un zéro, une couleur sur les seuls mots des listes fermées, l'adresse d'une issue, la bannière —
  le rail rangé en cinq colonnes, T'attend d'après `attend` de la forme et le bloc `attend` tenu à côté des faits —
  la vue en reçoit un tableau prêt à poser, et n'y calcule rien), `bon.ts` (ce qu'une carte du rail porte : la ligne de
  chaque ticket sous `rail`, tenue contre `status` et `faits` écrits par le runtime lui-même du même
  état ; les cinq choses dites, ou écrites manquantes, sur chaque ticket ; une ligne reformulée relayée
  entière, jamais devinée), `rail.test.ts` (le rail au centre, posé quel que soit l'onglet ; ce que le
  bloc dit d'un ticket restitué mot pour mot, long et sur plusieurs lignes ; le clic d'une carte de
  T'attend), `retard.ts` (le retard d'un clone
  sur son origine : compté contre le vrai `git`, sur des dépôts d'essai dont l'origine est un dossier
  voisin — et que le clone lu est le même après qu'avant, fichier par fichier, à l'octet et à
  l'instant près, même réglé pour élaguer et étiqueter à chaque `git fetch` ; ce qui ne se lit pas
  n'est jamais rendu comme un zéro ; la commande écrite dans un shell, jamais lancée),
  `rattrapage.ts` (l'app passe à la nouvelle version : le clone avance en avance rapide, ou ne bouge
  pas et dit pourquoi — commits à lui, changement qui serait écrasé, origine muette ; à l'ouverture,
  avant les dépendances, qui sont reposées si la nouvelle version les change ; au clic, une seule
  relance, par `npm start`),
  `runner.ts` (le poste joue une station, de bout en bout contre une box de test : la cuisine des
  tests du runtime — rail, garde-fous, stations, pass —, sur un vrai dépôt git, jointe par un faux
  `ssh` qui lance le vrai `runtime/src/tirer-cli.ts` dans son process, et un faux `claude` pour
  cook ; le ticket part, sa livraison passe la pass, son chemin au journal est celui d'un cook de
  la box ; app arrêtée il est `86`, relancée il repart ; le bail ne se renouvelle que sur un
  worktree qui a bougé, et tombe sinon ; chaque ligne passée à `ssh` est comparée à la forme du
  geste `pull` — et, pièce par pièce, la lecture du flux contre `superviser` et `lireFlux` du
  runtime, l'environnement du cook contre son `environnementCook`).
  `main.ts` et la vue ne font que brancher ; ils se vérifient en lançant l'app. **La peau, elle,
  se prouve sans la lancer** (`peau.test.ts`) : `vue.js` y est joué tel qu'il est devant un faux
  document (`app/test/aides/fausse-vue.ts` — juste ce que la vue en touche, et un faux pont), et
  `vue.css` y est lu règle par règle. Ce qui s'y tient : qu'un texte relayé de la box est posé mot
  pour mot sur les six onglets et l'écran d'ajout — « Tous les projets » n'en relaie rien —, et qu'aucune règle ne le
  coupe ; qu'aucune couleur ne s'écrit hors de `jetons.css`, et que chacune est une couleur de la
  maquette — hors celles d'un projet, que la vue reçoit du fichier (`couleurs.test.ts`) ; qu'une case
  de la barre se range en la glissant — le trait qui dit où elle atterrira, la place qu'elle prend,
  le clic qui reste un clic, ce qui est glissé d'ailleurs et n'est pas reçu (`rangement.test.ts`) ; que les polices sont des fichiers de l'app ; qu'un numéro de ticket ou un port est en
  monospace partout où il se pose ; que rien du parking de la maquette n'apparaît. **Ce qui se
  peint ne s'y voit pas** : un faux document ne mesure ni ne dessine rien — la peau se regarde en
  lançant l'app.
- **Lancée d'un clone, l'app joint son origine** : un `git ls-remote` au lancement et à chaque
  retour à la fenêtre, et un `git fetch` vers un dossier jetable quand le clone est en retard.
  **`npm start` met le clone à jour** s'il suit une branche de l'origine qui a avancé — un worktree
  de dev sur une branche qui ne suit rien n'est pas touché (`start` le dit, et l'app dit `pas lu`).
- **`BRIGADE_CLAUDE_BIN`** remplace `claude`, comme pour le runtime ; **`BRIGADE_SSH_BIN`**
  remplace `ssh` ; **`BRIGADE_GH_BIN`** remplace le `gh` qui lit et répond la question d'une issue
  (« La question qui t'attend ») ; **`BRIGADE_APP_CONFIG`** remplace le chemin du fichier des
  projets. Aucune des quatre n'est à poser pour un usage réel.
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

- Montrer dans la fenêtre les stations que le poste joue, et leurs cooks : c'est dans le terminal
  qui a lancé l'app, et sur la ligne `présence` de `station`. Ni les déclarer depuis un écran :
  `stations` s'écrit dans le fichier.
- Jouer le setup du worktree avant un cook du poste, garder son flux brut, ou reprendre un cook
  après une fermeture : « Le poste est une station », « Ce qui n'est pas garanti ».
- Jouer une station sur un autre moteur que `claude`.
- Préparer une box, ou y poser le geste d'installation : c'est une fois par box, sur elle, à la
  main (`docs/installer.md`, « Préparer la box »). L'app dit quoi faire et où, elle ne le fait pas.
- Démarrer le runtime à ta place : c'est un geste `root`, qu'aucun geste de la box ne donne sans mot
  de passe. L'app écrit la commande dans un shell, et ne l'écrit que si `installation` dit le projet
  prêt ; l'Entrée est la tienne.
- Savoir si le résultat de `/brigade:init` est mergé, ou si la session a abouti : tu le dis, et
  `installation` le constate sur l'origine.
- Régler ce qu'`installation` nomme — créer les labels, protéger la branche : elle affiche la flèche,
  le geste se tape (`docs/installer.md`, « Vérifier que le projet est prêt »).
- Garder une mise en service d'un lancement à l'autre : elle repart du départ, et la box redit tout.
- Garder d'un lancement à l'autre qu'un projet a été désinstallé de sa box : relancée, l'app relit
  la box, qui le dit inconnu.
- Retirer ce que la désinstallation laisse sur la box — les sauvegardes du projet, les gabarits
  d'unités, le geste : `docs/installer.md`, « Désinstaller ».
- Demander la branche d'intégration : la box prend la branche par défaut de l'origine. Un projet
  dont ce n'est pas la bonne s'installe à la main, ou se corrige dans son drop-in.
- Ajouter depuis l'écran un projet sans box, ou servi depuis ton poste.
- Une jauge chiffrée du quota ou de la machine : le runtime dit `disponible` et `tient`, pas un
  niveau. Si ça manque, c'est à lui de le dire.
- Dire *pourquoi* une cuisine est retenue, ou ce qu'un ticket attend, autrement qu'en texte : la
  forme de `faits` ne le porte pas, et l'app ne lit de la sortie de `status` que le bord du bloc
  `attend` et le numéro en tête de ses lignes.
- Mettre le runtime à jour : la box passe à la station, une fois, par son paquet, qui se met
  ensuite à jour seul ([`bascule.md`](bascule.md)) — l'app n'en a aucun geste.
- Répondre depuis la fiche à autre chose qu'une question du manager, ou retirer un label à ta
  place : une issue qui porte `question` ou `decision` se tranche sur GitHub, ou avec le second.
- Dire qu'un runtime ne bat plus : elle affiche l'écart entre son dernier tick et la lecture, sans
  seuil ni couleur.
- Montrer dans la barre *combien* de décisions t'attendent : le nombre est dans la carte.
- Montrer l'état du manager hors de son onglet — dans la barre, la carte ou « Tous les projets » :
  il se lit dans l'onglet **Manager**, tant qu'il est affiché.
- Dire, au moment d'allumer le manager, combien d'issues ouvertes il va juger : le geste écrit la
  commande, et `docs/runtime.md`, « Le manager », dit ce qu'elle engage.
- Suivre le journal en direct hors d'un terminal : l'onglet **Log** relit sa fin, toutes les
  trente secondes.
- Lire ce que le second affiche : l'app ne lit pas le terminal. Un bouton écrit à la suite de ta
  frappe, n'écrit pas dans un second qu'il vient de lancer, et écrit dans un dialogue ou un mode
  vim comme dans l'invite — ses caractères y sont des touches (« Les boutons écrivent, ils
  n'envoient pas », « La limite »). Seul un geste direct s'en garde : il ne part que d'un second
  dit libre, d'après ses tours, son titre et ta frappe (« Un geste direct part vraiment — ou dit
  pourquoi il ne part pas »).
- Porter son propre champ de saisie pour le second : tu lui parles dans son terminal.
- Renommer un projet, régler quoi que ce soit d'autre : l'app ajoute un projet et le retire, le
  reste se fait dans le fichier.
- Fusionner : un clone qui a des commits à lui, ou des changements que la nouvelle version
  écraserait, ne bouge pas — l'app le dit, et écrit `git pull` à la demande. Mettre à jour le clone
  d'un projet : pareil, il n'est mis à jour qu'avec l'app, quand c'est le sien.
- Dire le retard d'un clone sans que tu reviennes à sa fenêtre, ou ce que les commits qui manquent
  changent : elle lit au lancement et au retour, et rend un nombre.
- Dire le retard du clone d'un projet qui n'est pas un clone de brigade, ou comparer la version du
  plugin installée chez toi à celle qui est publiée.
- S'installer comme une app (empaquetage, signature, mise à jour) : lancée depuis le Finder, elle
  n'aurait d'ailleurs pas le `PATH` de ton terminal — et, hors d'un clone, elle dirait son retard
  `pas lu`.

## La bande ne clignote pas (#721)

La bande ne dit que ce qui est établi. Une lecture en cours n'affiche rien (« première lecture en
cours » ne se montre jamais) ; une ligne « non vérifié » n'apparaît que si la lecture dont elle vient
a raté **deux fois de suite** (`LECTURES_POUR_ETABLIR`) — une lecture ratée puis réussie au tour
suivant ne montre rien, une box injoignable se dit une fois et reste. Le compte est celui de **cette
lecture seule** : pour un sujet lu par deux sources (la cuisine, la station, la box), les réceptions de
l'autre source ne l'établissent ni ne le défont (#746). Une ligne dite reste au moins
`AFFICHAGE_MINIMUM` (20 s) ; elle part à la première réception qui suit, `faits` étant relu toutes les
30 s. Une alerte vérifiée, lue d'une lecture réussie, se dit tout de suite. Un contenu identique d'une
lecture à l'autre ne redessine pas la bande. Les deux seuils sont des constantes de `app/src/alertes.ts`.

## Le renouvellement qui échoue se dit avant l'échéance (#760)

Quand le renouvellement de la session Max rate **deux passages de suite** (`ECHECS_POUR_ALERTER`, dans
`app/src/alertes.ts`), la bande d'un projet installé dit « Max renewal failing », avec la cause que la
box en donne (la ligne `renouvellement` de `installation`, que la sonde du runtime écrit). Un seul
échec ne dit rien. La ligne reste tant que le contrôle (relu toutes les 5 min) dit l'échec, et sort au
premier passage réussi. Une session déjà tombée se dit d'elle-même par la station déconnectée.
