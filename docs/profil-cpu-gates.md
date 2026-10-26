# Profil CPU des gates

Les gates (`.claude/brigade/gates.sh`) se règlent au temps **processeur**, pas à l'horloge : l'horloge dépend de la charge de la box (plusieurs passages en même temps), le processeur presque pas. Cette page dit comment le mesurer, comment comparer deux passages, et garde la mesure de départ.

## Reproduire

Un seul script, en arrière-plan (une quarantaine de minutes), sur un poste aussi calme que possible :

```sh
BRIGADE_GATES_DELAI_TESTS=1200 scripts/mesure-cpu-gates/mesure-cpu-gates.sh .brigade-state/mesure
```

L'argument est le dossier de sortie, facultatif (défaut : `<worktree>/.brigade-state/mesure-cpu-gates/`). `BRIGADE_GATES_DELAI_TESTS=1200` est déjà la valeur par défaut du script : les gates coupent leur suite à 300 s d'horloge, et sur un poste chargé une mesure coupée ne vaut rien. Le script ne modifie ni `gates.sh` ni aucun test. Il :

1. joue `.claude/brigade/gates.sh` une fois et écrit dans `mesure.txt` le CPU total (utilisateur, système, somme, process fils compris), l'horloge, le code des gates, la charge (`uptime`) et `nproc`, relevés avant et après chaque mesure ;
2. joue ensuite chaque fichier de test seul, runtime puis app, avec les options de `npm test` de sa zone et le reporter TAP. Il écrit `profil-cpu.tsv` (`cpu_s user_s sys_s horloge_s code fichier`, trié par `cpu_s` décroissant) et `tests.txt` ;
3. imprime le résumé et les 15 fichiers les plus coûteux.

`tests.txt` a une ligne par test : `fichier<TAB>nom complet` (les suites imbriquées jointes par ` > `), suivi de `<TAB>SKIP` si le test est sauté. Il est trié avec `LC_ALL=C sort`. Les sorties brutes sont dans `sorties/`. Les briques : `mesure.py` (CPU d'une commande via `getrusage(RUSAGE_CHILDREN)`) et `releve-tap.py` (relève les tests d'une sortie TAP).

## Comparer deux passages

Lance le script avant et après le changement, chacun dans son dossier, puis :

```sh
diff avant/tests.txt apres/tests.txt        # vide : exactement les mêmes tests, sautés compris
head -15 avant/profil-cpu.tsv apres/profil-cpu.tsv
cat avant/mesure.txt apres/mesure.txt       # CPU total, charge et nproc
```

`diff` vide veut dire qu'aucun test n'a disparu ni changé de nom, ni été sauté de plus. Compare le CPU (`cpu_s`), pas l'horloge ; rejoue la mesure de départ sur la même box avant de conclure, le CPU varie de quelques pour cent d'un passage à l'autre. Réduire l'horloge sans réduire le CPU (jouer les deux zones en même temps) ne baisse pas le coût.

## Mesure de départ

Prise sur `v2` à `6e165c3`, sur la parade-box, **nproc 8**. D'autres cooks tournaient pendant la mesure : la charge est celle relevée par le script.

| Mesure | Valeur |
|---|---|
| **Gates complètes, vert** | **1022.1 s de CPU** (837.9 utilisateur + 184.3 système), 429.8 s d'horloge |
| Charge avant les gates (1, 5, 15 min) | 20.00, 17.96, 20.85, nproc 8 |
| Charge après les gates (1, 5, 15 min) | 21.34, 18.23, 19.66, nproc 8 |
| Charge avant le profil par fichier | 21.34, 18.23, 19.66, nproc 8 |
| Charge après le profil par fichier | 22.99, 14.08, 16.43, nproc 8 |
| Somme des fichiers joués seuls, runtime | 727.8 s de CPU (247 fichiers) |
| Somme des fichiers joués seuls, app | 175.1 s de CPU (140 fichiers) |
| Tests relevés | 5097 dont 12 sautés |

Les fichiers joués seuls paient chacun leur démarrage de Node et ne comptent ni les contrôles de types ni les gates elles-mêmes : leur somme n'est pas celle des gates.

### Les 15 fichiers les plus coûteux

| cpu_s | horloge_s | fichier |
|---:|---:|---|
| 71.9 | 10.8 | `runtime/test/commandes.test.ts` |
| 46.0 | 19.1 | `runtime/test/station.test.ts` |
| 41.8 | 21.6 | `runtime/test/pass.test.ts` |
| 34.2 | 15.8 | `runtime/test/main.test.ts` |
| 27.6 | 9.2 | `runtime/test/geste.test.ts` |
| 27.2 | 52.4 | `runtime/test/mise-a-jour/machine.test.ts` |
| 26.0 | 11.7 | `app/test/runner.test.ts` |
| 24.3 | 31.6 | `runtime/test/installation.test.ts` |
| 22.4 | 17.2 | `runtime/test/exploitation-en-anglais.test.ts` |
| 20.5 | 4.0 | `app/test/projets/projets.test.ts` |
| 20.4 | 20.2 | `runtime/test/fusion.test.ts` |
| 20.1 | 8.5 | `runtime/test/reaction.test.ts` |
| 16.1 | 7.9 | `runtime/test/desinstallateur.test.ts` |
| 13.9 | 9.3 | `runtime/test/station/main.test.ts` |
| 11.4 | 5.9 | `app/test/stations/stations.test.ts` |

## Mesure après optimisation

Prise sur `v2` à `95a69d6` (après les optimisations #1635 et suivantes), sur la même box (la parade-box, **nproc 8**), avec le même script. Pour comparer à conditions égales, la mesure de départ a été **rejouée** juste après sur `6e165c3` (le script copié dans ce worktree, qui ne l'avait pas encore) : les deux passages se suivent, sur un poste peu chargé.

| Mesure | Départ (`6e165c3`, rejouée) | Après (`95a69d6`) |
|---|---|---|
| **CPU des gates complètes, vert** | **965.0 s** (795.3 utilisateur + 169.7 système) | **834.7 s** (658.1 utilisateur + 176.6 système) |
| Horloge des gates | 186.0 s | 163.4 s |
| Charge avant les gates (1, 5, 15 min) | 2.54, 3.82, 4.75, nproc 8 | 2.06, 4.08, 4.80, nproc 8 |
| Charge après les gates (1, 5, 15 min) | 12.43, 9.11, 6.78, nproc 8 | 11.23, 7.59, 6.06, nproc 8 |
| Somme des fichiers joués seuls, runtime | 610.5 s (248 fichiers) | 531.1 s (314 fichiers) |
| Somme des fichiers joués seuls, app | 148.7 s (141 fichiers) | 115.1 s (185 fichiers) |
| Tests relevés | 5115 dont 12 sautés | 6232 dont 15 sautés |

**Rapport : 834.7 / 965.0 = 0.865** : les gates coûtent 13,5 % de CPU de moins qu'au départ rejoué. Contre la première mesure de départ du tableau ci-dessus (1022.1 s, prise sur une box chargée à 20), le rapport est 834.7 / 1022.1 = 0.817 ; la mesure rejouée à charge faible est la comparaison honnête, et le CPU varie de quelques pour cent d'un passage à l'autre.

**Le CPU après, 834.7 s, n'est pas à environ 500 s ou moins : il en est loin, 334 s au-dessus.** L'objectif de l'épique #1314 n'est pas atteint. Il y a de plus 1117 tests de plus qu'au départ (les tickets fusionnés entre-temps en ont ajouté) : le coût par test a baissé plus que le coût total.

### Les 15 fichiers les plus coûteux, avant et après

Fichiers joués seuls, CPU en secondes (`cpu_s`, horloge entre parenthèses).

| Rang | Avant (`6e165c3`) | Après (`95a69d6`) |
|---:|---|---|
| 1 | 71.6 (11.0) `runtime/test/commandes.test.ts` | 30.6 (7.2) `runtime/test/main.test.ts` |
| 2 | 40.2 (14.0) `runtime/test/station.test.ts` | 23.2 (4.2) `runtime/test/commandes.test.ts` |
| 3 | 34.4 (15.7) `runtime/test/pass.test.ts` | 21.1 (9.8) `runtime/test/station.test.ts` |
| 4 | 31.1 (7.0) `runtime/test/main.test.ts` | 18.7 (10.8) `runtime/test/pass.test.ts` |
| 5 | 25.7 (5.5) `runtime/test/geste.test.ts` | 16.4 (9.0) `runtime/test/installation.test.ts` |
| 6 | 20.6 (8.2) `app/test/runner.test.ts` | 16.1 (6.4) `runtime/test/exploitation-en-anglais.test.ts` |
| 7 | 20.5 (25.5) `runtime/test/mise-a-jour/machine.test.ts` | 16.1 (7.6) `runtime/test/lectures-sous-condition.test.ts` |
| 8 | 20.2 (3.2) `app/test/projets/projets.test.ts` | 15.9 (23.9) `runtime/test/mise-a-jour/machine.test.ts` |
| 9 | 18.9 (8.0) `runtime/test/reaction.test.ts` | 13.6 (9.3) `runtime/test/station/main.test.ts` |
| 10 | 17.6 (9.6) `runtime/test/installation.test.ts` | 12.4 (5.7) `runtime/test/desinstallateur.test.ts` |
| 11 | 16.7 (7.2) `runtime/test/exploitation-en-anglais.test.ts` | 11.6 (4.7) `app/test/runner.test.ts` |
| 12 | 15.2 (7.9) `runtime/test/fusion.test.ts` | 9.4 (4.9) `runtime/test/reaction.test.ts` |
| 13 | 14.3 (6.6) `runtime/test/desinstallateur.test.ts` | 9.2 (2.0) `runtime/test/geste.test.ts` |
| 14 | 12.2 (9.0) `runtime/test/station/main.test.ts` | 9.1 (6.4) `runtime/test/fusion.test.ts` |
| 15 | 9.5 (2.6) `app/test/stations/stations.test.ts` | 7.0 (6.3) `runtime/test/bac-a-sable/configuration.test.ts` |

Les fichiers suivants, après : `runtime/test/paquet/paquet.test.ts` 6.4, `runtime/test/telephone/gestes.test.ts` 5.9, `runtime/test/servir.test.ts` 5.4, `runtime/test/depot.test.ts` 5.1, `runtime/test/bascule/machine.test.ts` 5.1, `runtime/test/closing/run.test.ts` 4.6. Le premier fichier a perdu plus de la moitié (`commandes.test.ts` 71.6 → 23.2), mais le coût est maintenant réparti sur plus de 300 fichiers : les 15 premiers ne pèsent que 230 s sur 646 s de CPU de fichiers joués seuls, et aucun d'eux ne suffit à ramener les gates à 500 s. Les 188 s d'écart entre les gates (834.7 s) et la somme des fichiers joués seuls (646.2 s) sont ce que cette mesure par fichier ne compte pas (contrôles de types, gates elles-mêmes) ; le démarrage de Node, lui, est compté dans chaque fichier.

### Résultat du `diff` des listes triées

`diff avant/tests.txt apres/tests.txt` **n'est pas vide**. Les listes citées ici viennent d'un second relevé, refait pour les lister (le script sans les gates, sur `6e165c3` et sur `95a69d6`, tous les fichiers verts) : **65 lignes retirées (`<`) et 1211 ajoutées (`>`)**, 5081 → 6227 tests relevés, 389 → 499 fichiers de test. Le relevé de la mesure ci-dessus en avait donné 5115 et 6232, avec 73 lignes retirées et 1190 ajoutées : quelques tests relevés varient d'un passage à l'autre (cause non cherchée), ce qui change les comptes de quelques dizaines de lignes sans changer la conclusion.

Ce n'est pas un effet des optimisations de test seules : `v2` a reçu entre-temps des fonctionnalités avec leurs tests (111 fichiers de test nouveaux), et des tests ont été renommés ou réécrits avec elles. Un seul fichier a disparu : `app/test/interrupteur-manager.test.ts` (9 tests). La comparaison de CPU ci-dessus est donc entre deux ensembles de tests différents, le second plus grand.

**Les 65 lignes retirées**, en entier (`fichier | nom complet`) :

```
app/test/alertes.test.ts | le manager : sain, éteint, non dit > éteint : la ligne dit ce que le runtime en écrit, mot pour mot, et propose de l'allumer — en disant ce que ça engage
app/test/apprentissage.test.ts | la section, telle que la vue la pose > ni leçon ni profil : une phrase, et aucune liste
app/test/bande-une-ligne.test.ts | le grant `merge` est un interrupteur > la bande porte son état, lu dans `status` : actif, éteint seul, ou sans ligne — pas actif ; `status` pas lu, ce n'est pas « éteint »
app/test/bande-une-ligne.test.ts | le grant `merge` est un interrupteur > le même rendu que celui du manager : une glissière et son mot, « merge on » ou « merge off », sa ligne de `status` au survol
app/test/bande-une-ligne.test.ts | le grant `merge` est un interrupteur > pas lu : ni « on » ni « off », et un clic ne bascule rien
app/test/bande-une-ligne.test.ts | le grant `merge` est un interrupteur > un clic le bascule : éteint, il ouvre la confirmation d'accorder, qui dit son prix ; allumé, celle de révoquer — rien ne part avant le « oui »
app/test/bande-une-ligne.test.ts | le grant `merge` est un interrupteur > éteint de lui-même, il le marque — et la bande ne pose plus sa ligne : l'interrupteur la dit, et la lève ; « bientôt éteint » reste une ligne, à prolonger
app/test/confirmation.test.ts | reprendre, accorder, révoquer, allumer : chacun dit ce qu'il engage > allumer le manager : l'avertissement de la doc, et ses deux nombres à demander à la box
app/test/couleurs.test.ts | la palette > la vue nomme un rôle et une couleur de la palette : rien d'autre ne s'écrit depuis elle
app/test/couleurs.test.ts | les couleurs dans la vue > un choix refusé le dit sous les couleurs ; une couleur écrite à la main hors de la palette se montre, sans geste
app/test/ecrans-restants.test.ts | Settings : la confirmation d'un geste coûteux dit son prix en une ligne > allumer le manager : le prix est une phrase — ce qu'il va juger —, ce qu'il engage et la source sont au survol
app/test/ecrans-restants.test.ts | Settings : la confirmation d'un geste coûteux dit son prix en une ligne > le titre du manager ne porte pas sa commande, et un état illisible tient en une ligne
app/test/faits.test.ts | Livré, d'après `livres` > ce que `livres` ne dit pas est écrit sur la carte : ni cuisinier ni PR, ni titre ni issue pour une livraison hors du rail
app/test/faits.test.ts | Livré, d'après `livres` > ce qui a été livré est le résumé de la relecture, mot pour mot, avec le nombre de ses constats en clair — sans relecture, la carte dit pourquoi, et ne met pas le titre à sa place
app/test/faits.test.ts | Livré, d'après `livres` > une relecture qui n'a pas la forme refuse la forme entière : un résumé, des constats en liste, chacun avec sa gravité, son fichier ou rien, son texte
app/test/gestes-ici.test.ts | les gestes d'un projet qui cuit sur cet ordinateur partent ici, sans ssh > un geste confirmé s'offre à confirmer pour un projet sans « hote » servi ici : arrêter, reprendre, accorder et révoquer `merge`, allumer le manager
app/test/gestes.test.ts | les gestes du chef > deux gestes sont directs — éteindre le manager, vérifier l'installation : aucun n'engage ni ne détruit ; les cinq autres sont confirmés
app/test/gestes.test.ts | les gestes du chef > « manager-allumer » écrit `ssh box brigade parade manager on` — caractère pour caractère la commande de docs/runtime/ : `brigade <projet> manager on`, dans sa forme de poste
app/test/gestes.test.ts | les gestes du chef > « manager-eteindre » écrit `ssh box brigade parade manager off` — caractère pour caractère la commande de docs/runtime/ : `brigade <projet> manager off`, dans sa forme de poste
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > allumé : « manager on », et la tête du rail n'est plus marquée ; une bascule lue se voit aussitôt, sans attendre les faits
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > allumé, un clic l'éteint : le geste part dans le second, sans confirmation
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > la phrase compte ce qu'il va vraiment juger : `blocked-on-human` retient, et rien d'ouvert, c'est rien à juger
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > le message d'un geste raté ne suit pas le chef dans un autre espace : ouvrir un projet l'efface
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > pas encore lu : ni « on » ni « off », et un clic ne bascule rien — ce n'est pas « éteint »
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > un geste que le second refuse : le centre le dit en une phrase avec « try again », qui rejoue le même geste — jamais un clic sans message
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > éteint : « manager off », la ligne de la box au survol, aucune ligne dans la bande, et la tête du rail à l'arrêt d'une ligne courte
app/test/interrupteur-manager.test.ts | l'interrupteur, en tête de l'espace > éteint, un clic ouvre la confirmation : une phrase dit ce qu'il va juger, avec le nombre réel d'issues ouvertes — rien ne part avant le « oui »
app/test/interrupteur-manager.test.ts | la bande porte l'état du manager, pour son interrupteur > allumé, éteint, pas encore lu : l'état tel qu'il vient d'être lu, la ligne du runtime mot pour mot — jamais « éteint » faute de lecture
app/test/manager.test.ts | l'onglet Manager et ses deux gestes > « allumer » et « éteindre » sont deux gestes du socle : la vue les nomme, elle ne sait pas ce qu'ils écrivent
app/test/manager.test.ts | l'onglet Manager et ses deux gestes > « éteindre », direct, et « allumer », confirmé, envoient la commande de docs/runtime/, « Le manager », dans le second — sans « oui », allumer ne part pas ; d'un second qui démarre, rien ne part, et aucun shell ne s'ouvre
app/test/page-etroite.test.ts | sur un écran large, rien ne change > deux onglets, et le second à droite quel que soit l'onglet ; Cooks porte la carte et la lecture de `station`
app/test/projets/page-du-projet.test.ts | confiée, la page nomme les stations qui font sa cuisine, et « + station » n'offre que des renforts, sans principale ni calibrage à redire
app/test/projets/page-du-projet.test.ts | un projet d'avant l'app : cocher une machine et confirmer l'ajoute sans qu'aucun champ soit redit ni montré
app/test/projets/page-du-projet.test.ts | une valeur que la première station ne dit pas se montre, posée de ce qu'on devine : seuls les champs visibles se demandent
app/test/projets/projets.test.ts | l'ajout, la lecture et le retrait d'un projet, contre un GitHub de test > ce que la première station sert l'emporte sur ce que la saisie dit
app/test/status-en-anglais.test.ts | l'app lit le haut de `status` en français comme en anglais > le merge, actif ou éteint seul : l'interrupteur se lit dans les deux langues
app/test/telephone/appairage.test.ts | hors d'une installation neuve > le desktop, qui ne rend aucun `telephone` : rien n'est posé, et sans projet l'app s'ouvre sur l'ajout, comme avant
app/test/telephone/conversation.test.ts | ce qui n'est pas parti, ou ne se lit pas, se dit en une ligne, le détail au survol > la station refuse la lecture : la ligne dit « conversation unavailable », sa phrase et son détail au survol
app/test/telephone/conversation.test.ts | ce qui n'est pas parti, ou ne se lit pas, se dit en une ligne, le détail au survol > le pont ne porte pas la conversation — celui de l'app Android d'aujourd'hui : « conversation unavailable », pourquoi au survol, pas de champ, et « read again » la relit
app/test/telephone/conversation.test.ts | ce qui n'est pas parti, ou ne se lit pas, se dit en une ligne, le détail au survol > un pont qui ne porte pas l'envoi — celui de l'app Android d'aujourd'hui : le texte reste dans le champ, la conversation ne bouge pas, et « send » se rejoue
app/test/telephone/file.test.ts | sur un écran étroit, rien ne défile de côté > la confirmation d'un interrupteur s'ouvre sous la tête de l'espace, de toute sa largeur, et non à 440 px sous lui
app/test/telephone/file.test.ts | sur un écran étroit, rien ne défile de côté > les colonnes de Rail s'empilent sur toute la largeur, TODO en tête : ni grille plus large que l'écran, ni défilement de côté
app/test/terminaux.test.ts | le registre des terminaux > le second est lancé sur le rôle, pas sur un `claude` nu : `/brigade:po` suit `--continue`, et une session neuve le porte aussi
app/test/terminaux.test.ts | un geste direct part vraiment dans le second, et dit quand il ne peut pas > le second est lancé avec les crochets qui disent ses tours, à la suite du rôle — et repart d'un fichier vide ; un shell n'en reçoit pas
app/test/urgence.test.ts | sans urgence, rien ne change > une décision qui ne retient qu'une partie du rail : pas de ligne d'urgence, la bande et la case sont celles d'avant l'urgence
app/test/vue/activite-cuisine.test.ts | l'activité de la cuisine, en tête de l'onglet Cooks > sans activité, les six nombres disent 0, jamais un blanc
app/test/vue/triage.test.ts | le triage, jour par jour, dans la file > chaque jour montre « decided alone » et « sent to TODO », le plus récent d'abord
app/test/vue/triage.test.ts | le triage, jour par jour, dans la file > le module se lit seul, sur un faux document : un titre, et une ligne par jour
app/test/vue/triage.test.ts | le triage, jour par jour, dans la file > un jour sans activité dit 0 et 0, jamais un blanc
app/test/vue/triage.test.ts | le triage, jour par jour, dans la file > un runtime qui ne donne pas le triage n'en pose rien
runtime/test/closing/run.test.ts | la passe de fermeture, en cuisine > sans la commande du chef, aucune passe qui écrit ne démarre — pas même quand un déclencheur est franchi
runtime/test/gele.test.ts | le cas de l'épique : un ticket gelé, quatre tickets qui l'attendent, un par zone — les cinq se lisent bloqués par lui
runtime/test/gele.test.ts | un ticket qui n'attend que la zone d'un ticket gelé se lit bloqué par lui
runtime/test/limite-github.test.ts | la station et trois projets, chacun dans son process, tiennent ensemble un seul plafond de 2 500 appels par heure
runtime/test/limite-github.test.ts | le canal du gist prend le budget à chaque appel, et ne lance pas `gh` quand il est épuisé
runtime/test/limite-github.test.ts | le sondage des issues prend le budget à chaque appel, et ne lance pas `gh` quand il est épuisé
runtime/test/limite-github.test.ts | sur une heure glissante, le budget n'est jamais dépassé, et chaque appel sorti de la fenêtre le libère
runtime/test/limite-github.test.ts | une fois par heure, la ligne « N appels GitHub sur l'heure écoulée » va au journal
runtime/test/main.test.ts | le runtime, son process et ses unités > le manager est branché, et éteint : il ne sonde les issues ouvertes qu'une fois allumé par le chef
runtime/test/manager-cli.test.ts | la commande manager > allumer s'écrit au journal, une seule fois, au nom du chef
runtime/test/manager-cli.test.ts | la commande manager > éteindre arrête les jugements à venir, et ne défait rien de ce qui est posé
runtime/test/mise-a-jour/publications.test.ts | la source se nomme : les releases d'un dépôt GitHub par défaut, un répertoire pour une installation de test ; autre chose est refusé
runtime/test/rail.test.ts | la retenue de zone tombe quand le premier revient en attente ou quitte le rail, et un 86 tient sa zone
runtime/test/rail.test.ts | un ticket remonté au chef puis mergé par lui reste 86, mais ne tient plus sa zone : sa livraison est sur la base
runtime/test/runtime.test.ts | le nom de projet « benomite/brigade » est refusé, et rien n'est écrit
```

**Les 1211 lignes ajoutées** ne sont pas recopiées ici : 1211 noms de tests longs (environ 200 ko) noieraient la page, et ce sont pour l'essentiel les tests des 111 fichiers nouveaux (par exemple `runtime/test/autonomie/decision/aiguillage.test.ts` 33, `app/test/vue/premier-lancement.test.ts` 26, `runtime/test/autonomie/table.test.ts` 24, `runtime/test/relance-de-ci.test.ts` 23, `runtime/test/installation/besoins/besoins.test.ts` 23) et des remplaçants renommés de lignes retirées. Les obtenir : poser un worktree sur `6e165c3` et un sur `95a69d6`, copier `scripts/mesure-cpu-gates/` dans le premier, y jouer le script de mesure dans chacun (son étape 2, le relevé par fichier, écrit `tests.txt`), puis `diff avant/tests.txt apres/tests.txt | grep '^>'`.
