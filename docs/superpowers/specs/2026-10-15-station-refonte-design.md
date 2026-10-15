# La station, refaite de zéro : une installation par machine, puis des projets, et plus jamais de commande

*Spec produit, 2026-10-15. Dessinée avec le chef en session (le second). Elle dit le **quoi** ; le
**comment** est au manager. Elle prime sur [la spec des stations du même jour](2026-10-15-stations-globales-design.md)
partout où elles diffèrent ; ce que celle-ci ne dit pas (vocabulaire station / poste, capacités,
`requiert`, cloison des stations de bureau, cas d'`espace`) reste valable.*

## Pourquoi

Le 2026-10-15, aucune mise en service de brigade n'a réussi seule. Chacune a buté sur autre chose —
le réseau, le mot de passe sudo, des réglages restés dans le drop-in, une unité systemd changée
(deux fois, dont une pour un commentaire) — et a fini en commandes recopiées par le chef, parfois en
root. La session Max s'est perdue toutes les huit heures parce que son renouvellement, livré, n'avait
jamais été activé, et rien ne l'avait dit.

Le chef :

> vu que y'a pas une seule mise en service qui a fonctionné toute seule on peut peut-être admettre
> que ton système fonctionne PAS DU TOUT

> la prio 1 c'est de revoir de 0 le système de station, surtout la station serveur.

> les stations, c'est 1 install, et après on ajoute les projets, on installe pas 6 fois la station
> pour 6 projets (donc pas 6 mises à jour à chaque fois — on a pas installé 6 fois l'app Mac à ce
> que je sache)

> la logique doit être la même pour Windows et mobile (et autres futurs)

L'étude #739 ([2026-10-15-etude-brigade-sur-hermes.md](2026-10-15-etude-brigade-sur-hermes.md)) a
écarté Hermes, mais conclu dans le même sens : la tuyauterie générique (installation, service, mise
à jour) est ce qui nous coûte le plus, et elle doit s'acheter en outils standard plutôt que
s'écrire à la main.

## Les trois principes

1. **Une installation par machine, puis on lui ajoute des projets.** Un projet n'est pas une
   installation : c'est une ligne de configuration d'une station. Une machine a une seule version
   de brigade, et une seule mise à jour, quel que soit le nombre de projets qu'elle sert.
2. **Un seul système de stations, la même logique sur toutes les plateformes** : Linux, Mac,
   Windows, téléphone, et celles qui viendront. Aucune plateforme n'a un chemin à part ; ce qui
   change d'une plateforme à l'autre, c'est seulement ce qu'on installe (un paquet, l'app).
3. **Après l'installation, plus aucune commande dans un terminal** — ni pour mettre à jour, ni
   pour ajouter un projet, ni pour réparer. Un geste du chef est un bouton, ou un login.

## Ce qu'est une station

- **Une station s'installe une fois par machine.**
  - Sur un serveur : un **paquet du système** (Debian d'abord), installé par **une seule commande**
    tirée d'un **guide d'installation global**, hors de tout projet. Le guide peut être accompagné
    par un LLM.
  - Sur un ordinateur (Mac, Windows, Linux de bureau) : **l'app**. Une app installée est une
    station.
  - Sur un téléphone : l'app aussi. Le téléphone est un **poste** — il pilote, il ne cuit pas
    (tranché dans la spec des stations) — mais il suit la même logique : une installation, puis
    les projets.
- **Un seul service brigade par machine, pour tous ses projets.** Ajouter ou retirer un projet ne
  touche à aucun fichier du système.
- **La station se met à jour seule**, comme un navigateur : quand une version sort, elle y passe ;
  les cooks en cours finissent ; la file le dit (« passée en version X à 14 h 02 »). Le chef peut
  **geler la version** d'une station, par un réglage dans l'app. Tout ce que le système porte —
  unités de service, droits, minuteur de renouvellement — vient avec le paquet et suit ses mises à
  jour : **aucun geste root après l'installation**, jamais.
- **Une mise à jour ratée revient seule** à la version d'avant, et le dit en une ligne.
- **La connexion Max** se fait une fois, pendant l'installation guidée. La station la renouvelle
  ensuite elle-même ; si elle se perd, le seul geste demandé est un login, et la cuisine reprend
  seule dans la minute.
- **Pas de liaison directe entre machines.** Tout passe par **GitHub**, où le rail est déjà : les
  stations y prennent leurs tickets et y écrivent où elles en sont ; l'app et le téléphone le lisent
  là. Le rail reste visible quand une station est éteinte. Le prix, accepté : le suivi d'un cook en
  cours se relève à la minute près, pas à la seconde.
- **La station principale d'un projet** — celle qui fait tourner son manager et sa pass — se
  choisit **par projet**, dans l'app. L'app **recommande une station serveur**, toujours allumée.
  Si la principale est l'app d'un ordinateur, la cuisine du projet s'arrête quand on ferme l'app,
  et l'app le dit au moment du choix.

## Le parcours du chef

1. **Installer une station serveur** : le chef ouvre le guide global, colle une commande sur le
   serveur, se connecte à Max sur place. Le serveur affiche un code ; le chef le tape dans l'app.
   La station apparaît sur la home : « en ligne · version X · aucun projet ».
2. **Installer une station de bureau** : installer l'app. La machine apparaît dans la même liste.
3. **Ajouter un projet** : dans l'app, le chef choisit le dépôt GitHub, ses stations, sa
   principale (le serveur proposé d'office). GitHub demande d'autoriser brigade sur ce dépôt, en un
   clic sur sa page. C'est tout.
4. **Le premier ticket de la cuisine prépare le dépôt** : ses vérifications (gates), la
   préparation de ses tickets (setup de worktree), les sites qu'il a le droit de joindre. Un cook
   l'écrit et l'**éprouve sur la vraie station**, là où il tournera ; le chef le merge en un clic.
   Le rail démarre ensuite.
5. **La vie courante** : ni commande, ni mise à jour à lancer. Seules les décisions du chef
   l'attendent, chacune avec son bouton.

**Quand ça casse**, la panne est dite en une ligne, avec un bouton, sur la station concernée :
station injoignable (« la box ne donne plus signe de vie depuis 10 min »), mise à jour ratée et
revenue en arrière, connexion Max perdue (un login). Jamais une suite de commandes.

## La bascule depuis aujourd'hui

- Sur la box actuelle, le chef fait l'installation neuve **une fois** (la commande, le code).
- Brigade y reprend **seul** les trois projets (`brigade`, `espace`, `calculus-workspace`) : leur
  journal, leurs décisions, leurs tickets en cours. Rien ne se perd ; la cuisine s'arrête quelques
  minutes.
- Les trois services `brigade@<projet>`, la mise en service maison (`brigade-mise-en-service`,
  `brigade-bascule`), leurs règles sudoers et les réglages restés dans les drop-ins sont
  **retirés** par cette installation.

## Critères de sortie

- **Trois versions de suite passent seules** sur la box, dont une qui change une unité de
  service, sans aucun geste du chef.
- **Ajouter un quatrième projet** prend moins de 10 minutes, sans terminal.
- **Une session Max qui expire** ne demande qu'un login ; la cuisine repart seule.
- **Installer une station sur une deuxième machine** (un Mac ou un second serveur) suit le même
  parcours, et un projet peut y cuire.
- La box sert ses trois projets avec **une seule installation et une seule version**.

## Hors périmètre

- La station Windows d'`espace` (OBS) : même logique, après cette refonte.
- Les notifications vers le téléphone (piste ntfy de l'étude #739).
- Le contenu des cartes du rail et de l'écran « Vérifier » : leurs propres tickets (#622, #674,
  #747).

## Ce qui disparaît

L'installation par projet, `brigade-mise-en-service`, `brigade-bascule`, les règles sudoers et leur
doc — de l'ordre de 7 000 lignes d'après l'étude #739. Les tickets ouverts qui réparent ce chemin
(#474, #560, #743, #756 et ceux de l'épique #602) sont fermés comme remplacés par cette spec, au
moment où le manager la découpe.

## Non-régressions

- La **cloison** des cooks sur une station serveur, la **porte** réseau, les jetons GitHub d'une
  heure qu'aucun cook ne reçoit : inchangés.
- La **pass**, le **grant** `merge`, les zones, le journal en ajout seul : inchangés.
- Le cook en vol pendant une mise à jour **finit** son travail (#704).
- Le **quota Max** reste consommé par le binaire `claude` officiel, jamais autrement.
