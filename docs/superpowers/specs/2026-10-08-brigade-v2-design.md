# brigade V2 — design

**Date** : 2026-10-08
**Statut** : brainstorm consolidé, à valider avant plan d'implémentation
**Portée** : refonte complète — brigade passe d'un plugin Claude Code à une application : un runtime
sur la parade-box et une app desktop sur le Mac (terminal intégré, runner local, tableau de bord)

---

## Le problème

La V1 a prouvé le principe : un humain qui débat produit, des agents qui livrent, toute la
coordination dans des artefacts durables. Elle bute sur cinq limites, toutes vécues :

1. **Le Manager demande trop.** Validations, merges que le mode auto refuse, questions qu'il
   pourrait trancher : il faut être connecté en permanence pour qu'il avance. Et changer ses
   permissions sur la box est pénible (fichiers de settings, redémarrage de session).
2. **Le Designer est le mauvais découpage.** Le vrai besoin n'est pas « un designer », c'est :
   certains travaux ont besoin d'un humain, d'autres ont besoin d'outils que seul le Mac a
   (Chrome connecté, accès prod, gcloud, az).
3. **Un Manager, un petit pool.** Le Manager est un process parent qui spawne des teammates :
   pool limité, tout meurt avec lui, agent teams expérimental, session interactive obligatoire.
4. **Claude seulement.** Un sous-agent ne peut pas être un Codex, un Mistral ou un openweight.
   (La V2 reste sur Claude, mais lève ce verrou d'architecture pour la suite.)
5. **Des devs interchangeables qui n'apprennent rien.** Même prompt, même modèle, aucune mémoire
   d'un ticket à l'autre.
6. **Un dev parqué ne se signale pas.** Mesuré le 2026-10-08 : deux devs inertes **65 minutes**,
   l'un avec son correctif **committé mais jamais poussé** — un travail fini, invisible. Le Manager
   l'a découvert en comparant l'heure et la date du dernier commit, et s'en est excusé : *« j'avais
   prévu de nudger au bout de 15-20 min et je ne l'ai pas fait »*. Coût en quota : zéro, d'où
   l'absence d'alerte.

Causes racines : le Manager est à la fois **process parent** (d'où 3 et 4) et **agent qui juge
tout** (d'où 1 et son coût en contexte), et le système n'a **aucune notion de capacité** (d'où 2).
La limite 6 en ajoute deux, du même genre : **la livraison dépend d'un dernier geste de l'agent**
(pousser), et **la surveillance repose sur la mémoire d'un agent** — or un LLM ne tient pas un
timer. Ce qui dépend d'un dernier geste sera parfois oublié.

## Contraintes

- **Abonnements, pas d'API.** On utilise le compte Max via la CLI officielle `claude`, pas l'API
  facturée au token. Le facteur limitant devient **le quota** (fenêtres glissantes, plafonds
  hebdomadaires partagés entre toutes les sessions du compte), plus l'argent.
- **Claude d'abord.** La V2 ne cible que Claude. Codex, Mistral et les openweights viennent après
  (voir Au parking) ; l'architecture garde la porte ouverte via les adaptateurs moteurs.
- **Conditions d'usage Max** (vérifiées le 2026-10-08, doc « Legal and compliance » de Claude
  Code) : se connecter avec son propre abonnement dans le binaire `claude` officiel non modifié
  est permis, y compris sur une machine hébergée. Interdit : utiliser ces identifiants hors de
  Claude Code / Claude.ai (Agent SDK, outils tiers), ou faire passer l'usage d'autres personnes.
  Point de vigilance : les limites Max supposent un usage « ordinaire et individuel » ; un
  parallélisme élevé et continu s'en éloigne, Anthropic se réserve d'agir sans préavis. D'où :
  - les adaptateurs pilotent **uniquement le binaire `claude` officiel**, jamais le token extrait ;
  - **pas d'Agent SDK** (il exige une clé API) ;
  - le scheduler plafonne le parallélisme sur le compte Max ;
  - en V2.5, chaque humain se connecte avec **son propre compte**.
- **La parade-box (Kimsufi) n'aura jamais d'accès prod.** Les accès sensibles (serveurs de prod,
  gcloud, az) vivent sur le Mac et y restent.
- **Plusieurs projets en parallèle**, comme aujourd'hui, sans qu'ils se marchent dessus.
- **Visibilité** : savoir à tout moment ce qui tourne, qui coince, comment ça va.

## Vocabulaire

Les noms sont en anglais, empruntés aux cuisines. On sépare strictement ce qui raisonne (agents)
de ce qui est du code (outils).

### Les agents — ceux qui raisonnent avec un LLM

| Nom | Rôle | Moteur | Remplace |
|---|---|---|---|
| **second** | L'interlocuteur du chef : débat produit, écrit tickets et critères, fixe les priorités, sert les questions | Claude, session dans le terminal de l'app | PO |
| **manager** | Pilote un projet : découpe, ordonne, arbitre, réagit aux échecs. Sa boucle est du code ; il n'appelle un LLM que pour juger | Hybride : code + LLM ponctuel | Manager |
| **cook** | Exécute **un** ticket | Claude en V2 (autres moteurs plus tard) | Dev |
| **reviewer** | Relit le diff pour la passe | Claude en V2 | Revue du Manager |
| **closer** | Range la cuisine : mesure la dérive, puis élague, simplifie, dédoublonne. Hors du rail | Claude | — (personne) |

### Les outils et l'infra — du code, sans LLM

| Nom | Ce que c'est |
|---|---|
| **rail** | La file de tickets d'un projet |
| **ticket** | Une unité de travail (une issue GitHub) |
| **pass** | L'étape avant de servir : gates, CI, appel au reviewer, merge |
| **station** | Machine + moteur où tourne un cook, avec les capacités qu'elle fournit |
| **scheduler** | Répartit quotas, stations et charge machine entre projets |
| **kitchen** | Le tableau de bord global, tous projets confondus |
| **log** | Le journal d'événements dont tout dérive |
| **grants** | Les autorisations données à chaud par le chef |

### Les concepts

| Nom | Sens |
|---|---|
| **chef** | L'humain. Fixe le menu et les priorités, a le dernier mot |
| **project** | Un dépôt git |
| **brigade** | L'équipe d'agents qui travaille sur un projet |
| **cook profile** | Moteur + outils + skills + carnet de leçons, plus un **défaut** et un **plafond** de calibrage. Propre au projet, défini dans son dépôt |
| **calibrage** | Modèle + effort d'un cook. Décidé **par ticket**, jamais figé dans le profil |
| **spécialité** | Domaine d'un profil (sécu, rédaction, BDD…) : une préférence de routage, jamais une contrainte |
| **fermeture** | Le *closing* : le moment où l'on range la cuisine. Hors du rail, déclenché par la mesure, jamais par une priorité |

Jargon de service réutilisable pour les statuts : **fire** (lancer un ticket), **86** (plus
disponible : quota épuisé, station absente), **behind** (en retard).

## Principes

1. **Le manager ne spawne plus.** Il pose des tickets sur le rail ; des stations viennent les
   prendre. Plus de process parent, donc plus de limite de pool, plus de mort collective,
   n'importe quel moteur.
2. **Le manager est surtout du code.** La boucle (rail, baux, matching, retries, pass) est
   déterministe et ne coûte aucun quota. Un LLM n'est appelé que pour juger : qualifier,
   découper, arbitrer un conflit.
3. **Capacités, pas rôles.** Un ticket déclare ce qu'il **requiert** (`chrome-connecté`,
   `accès-prod`, `revue-humaine`, `gpu`…), une station déclare ce qu'elle **fournit**.
4. **Un cook = un ticket.** La leçon du dev-employé-permanent tient toujours, et pèse plus lourd
   en quota qu'en euros.
5. **Les artefacts durables restent la vérité.** GitHub porte tickets, PR, décisions ; l'état de
   runtime (baux, quotas, runs, carnets) vit dans une base locale. Tout se reconstruit après un
   crash.
6. **Ne jamais bloquer sur le chef.** Ce qui l'attend s'empile ; tout le reste avance.
7. **Le runtime récolte, il n'attend pas qu'on le serve.** Un cook n'a aucun geste de livraison à
   accomplir — ni pousser, ni ouvrir une PR, ni annoncer qu'il a fini. Le runtime observe son
   worktree et prend ce qui est prêt. Et aucun garde-fou ne repose sur la mémoire d'un agent : il
   n'existe pas de « nudge » dont quelqu'un doive se souvenir.

## Architecture

```
┌──────────────────────── parade-box (Kimsufi) ─────────────────────────┐
│                                                                        │
│  arbitre de quota ── plafond du compte Max, poids des projets         │
│      ▲                                                                 │
│      ├── brigade@A : journal · rail · pass · cooks (conteneur A)      │
│      ├── brigade@B : journal · rail · pass · cooks (conteneur B)      │
│      └── …  une instance de runtime par projet, mise à jour à part    │
│                                                                        │
│  un journal (SQLite) PAR PROJET → API pour l'app + MCP pour le second │
│  Adaptateur moteur : claude -p (autres moteurs plus tard)       │
│                                                                        │
│  AUCUN accès prod.                                                     │
└───────────────────────────────▲────────────────────────────────────────┘
                                │ Tailscale / WireGuard
                                │ (le Mac se connecte, jamais l'inverse)
┌───────────────────────────────┴──────── Mac : app brigade ─────────────┐
│  Un espace par projet :                                                │
│    · terminal intégré — le second (claude) + des shells, en local      │
│    · rail, cooks, grants, log du projet                                │
│  Kitchen : vue d'ensemble de tous les projets                          │
│  Runner Mac : station qui fournit chrome-connecté, accès-prod,         │
│               revue-humaine                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### L'app desktop

- App desktop sur le Mac (Electron ou équivalent, à trancher). Elle embarque de **vrais
  terminaux** (xterm.js + pty, comme VS Code) : on ne quitte pas l'app pour travailler en local.
- **Un espace par projet**, choisi dans une barre latérale (façon Slack/Discord). Un espace a ses
  onglets : Second (le terminal), Rail, Cooks, Grants, Log.
- **Kitchen** : l'espace global en tête de barre, vue partagée de tous les projets.
- La même app héberge le **runner Mac**.
- **Elle parle à un parc hétérogène en permanence**, pas seulement pendant une mise à jour : les
  runtimes de projet se mettent à jour un par un. Elle affiche donc la version de chaque projet,
  reste pilotable sur **N et N-1**, et au-delà laisse le projet visible mais non pilotable avec un
  message clair. Elle ne suppose jamais que tous les projets répondent pareil.
- Un accès web en lecture seule au tableau de bord (téléphone) reste possible côté box.

### Le second

- Une **vraie session Claude Code** lancée par l'app dans le terminal intégré, dans le dossier du
  projet : on garde tout (`!`, slash commands, historique) sans reconstruire de chat.
- Les `!` s'exécutent **sur le Mac**, avec les accès prod du chef.
- Plugin brigade léger + MCP vers le runtime. Outils : écrire/modifier épiques et tickets, fixer
  les priorités, lire l'état, répondre aux questions, **donner ou retirer des grants**.
- **À l'ouverture**, un hook sert la file : questions en attente, livraisons, ce qui est en
  preprod à recetter, alertes.
- App fermée : rien ne se perd, les questions s'empilent côté runtime.
- Prévu pour V2.5 : accès d'autres humains (associés, clients). Le MCP passe donc dès la V2
  derrière une couche d'authentification.

### Le manager

- Un par projet. Process du runtime, réveillé par événement (webhook GitHub, fin de ticket,
  signal de cook, tick périodique), sans état en mémoire.
- Découpe les épiques en tickets avec **dépendances** (B attend A), partitionne par zone de
  fichiers (règle V1 conservée : un fichier, un propriétaire entre tickets concurrents).
- Ordonne **dans** les priorités produit fixées par le second. Peut prioriser seul ce qui
  arrive en cours de route (bugs, hors-scope) selon la charte.
- Réagit aux échecs : redécoupe, change de cook profile, remonte au second.
- Verrou par projet : jamais deux managers sur un même dépôt. Autant de managers que de projets.

#### Le bail se renouvelle par la preuve de travail

Un ticket pris est tenu par un **bail**, et ce bail ne se renouvelle **que** sur une preuve de
travail observable de l'extérieur : un commit, un fichier touché dans le worktree. Jamais sur la
présence du cook, ni sur ce qu'il dit faire.

C'est une **échelle plus longue** que le garde-fou d'inactivité (§Garde-fous), qui surveille la
vivacité sur le flux de sortie. Les deux coexistent : un cook peut être bien vivant et ne pas
progresser, et c'est alors le bail qui tranche, pas l'inactivité.

Conséquence voulue : **l'état « vivant mais parqué » n'existe pas.** Un cook inerte perd son ticket
exactement comme un cook mort, sans que personne ait à s'en apercevoir ni à le relancer.

Et avant de rendre un ticket au rail, le runtime **récolte ce qui existe** : si le worktree porte
un travail complet, il part en pass au lieu d'être jeté. Un cook qui a committé puis s'est arrêté
est traité comme un cook qui a fini, pas comme un cook en panne. Un travail fait ne doit jamais
être perdu parce que personne ne l'a réclamé (limite 6).

### Stations et cooks

Une **station** = machine + adaptateur moteur + capacités. Exemples :

| Station | Fournit |
|---|---|
| `box/claude` | code, raisonnement — le **calibrage** se règle par ticket, pas par station |
| `box/playwright` | navigateur headless (couvre la plupart des besoins « navigateur ») |
| `mac/claude-chrome` | `chrome-connecté` |
| `mac/accès-prod` | `accès-prod` — toujours avec validation du chef |
| `chef` | `revue-humaine`, décisions |

Un **cook profile** = moteur, modèle, outils, skills, et un **carnet** de leçons. Les evals
servent de garde-fou de non-régression des profils.

#### Les profils sont propres au projet

Un profil « expert sécu » n'a pas le même sens sur un projet d'infra et sur un site vitrine ; un
profil « rédacteur » n'en a aucun sur un projet d'infra. La V2 ne livre donc **aucun catalogue de
profils** : elle livre la capacité d'en fabriquer, et ils appartiennent au projet.

Leur **définition** (moteur, modèle, skills, périmètre) vit **dans le dépôt**, versionnée : c'est
de la configuration qu'on relit et qui voyage avec le projet — la V1 fait déjà exactement ça avec
ses rôles en markdown. Seul le carnet mute à chaque ticket (voir plus bas).

**Par défaut, pas de profil.** Un ticket peut charger des skills ponctuellement (« utilise la
skill copywriting ») sans qu'aucun profil existe : ça ne coûte rien à construire et ça couvre la
majorité des besoins. Un profil n'ajoute que deux choses — la **capitalisation** d'un carnet et la
**mesure** dans le temps — et il ne vaut que s'il a le volume de tickets pour les remplir. En
dessous du volume, un profil n'est qu'un généraliste avec des skills, et autant l'assumer : quinze
profils ayant vu deux tickets chacun donnent quinze carnets vides et une mesure sans
signification.

#### Spécialité n'est pas capacité

Les deux se ressemblent et ne se comportent pas pareil :

| | Nature | Effet sur le matching |
|---|---|---|
| **capacité** (`chrome-connecté`, `accès-prod`, `gpu`) | dure, binaire, vérifiable | **filtre** : sans elle, le ticket est impossible |
| **spécialité** (sécu, rédaction, BDD) | souple, graduelle, non vérifiable | **préférence** : un généraliste reste capable |

Les confondre construirait un goulot d'étranglement : un ticket `requires: sécu` attendrait que
« l'expert soit libre » alors qu'un profil n'est pas une ressource rare — on en instancie autant
qu'on veut, ce n'est qu'une configuration. Ce qui est rare, c'est le **quota**, le **plafond de
parallélisme** et la **partition par zone de fichiers**.

Le coût d'un spécialiste n'est donc pas une attente mais un prix : il voudra souvent un modèle
plus cher et plus de tours (lire le code autour, vérifier les dépendances). L'arbitrage réel est
« un ticket sécu sur Opus, ou trois tickets courants sur Sonnet ? », et il se règle par un
**budget ou un poids par domaine** côté scheduler — pas par un délai d'attente.

#### Le calibrage se décide par ticket, pas par profil ni par station

Le **modèle** et l'**effort** ne sont ni une propriété de la machine, ni une propriété durable du
domaine. Un modèle est un paramètre d'invocation du même binaire `claude` sur la même machine :
en faire une dimension de station multiplierait les stations pour rien (trois modèles × deux
machines = six stations pour une seule capacité réelle). D'où une seule station `box/claude`.

La V1 fait pourtant du calibrage une donnée du profil, et avec raison dans son cadre : elle expose
le même dev sous trois calibrages portés par le frontmatter de chaque agent, et « choisir l'agent,
c'est trancher l'effort ». Ça tient parce qu'elle n'a qu'un domaine, le dev générique. Dès qu'on
ajoute sécu, rédaction, BDD, le même choix donne un **produit cartésien** — trois domaines × trois
calibrages = neuf profils, dont sept au carnet vide. C'est précisément le travers décrit plus haut.

Les deux axes se séparent donc :

| Axe | Ce qu'il porte | Durée de vie |
|---|---|---|
| **profil** | skills, carnet, périmètre du domaine | durable, versionné dans le dépôt |
| **calibrage** | modèle + effort | décidé à chaque ticket |

Et la décision suit le même patron que la spécialité — **le profil demande, le scheduler dispose** :

- le **profil** porte un **défaut** et un **plafond** (un profil sécu ne descend pas sous
  `medium` ; un profil de formatage ne monte pas au-dessus de `low`) ;
- le **ticket** porte la valeur, décidée par le manager sur sa table type de ticket → calibrage —
  c'est déjà son travail en V1 ;
- le **scheduler** arbitre sous contrainte de quota : il peut dégrader ou faire attendre, jamais
  dépasser le plafond du profil ;
- le **chef** plafonne par budget de domaine.

**Le défaut est un plafond, pas un point de départ.** Mesuré en V1 : *32 teammates spawnés
d'affilée, 31 en `effort: high`* faute d'avoir tranché au spawn, alors que les tokens de
raisonnement sont facturés en output. En V2 ce biais serait pire et non meilleur — le manager est
du code, il lance sans surveillance, et plus aucun humain ne voit passer la facture. D'où deux
exigences : **aucun cook n'est lancé sans calibrage explicite** (garde-fou, voir plus bas), et le
**log porte le calibrage de chaque cook** — l'équivalent V2 du « l'humain doit voir ce qu'il paie »
de la V1.

#### Le carnet a deux étages

Après chaque ticket, une rétro courte propose des leçons. Elles n'attendent personne :

| | Où | Quand ça s'applique | Qui valide |
|---|---|---|---|
| **leçon provisoire** | base du runtime | immédiatement | personne |
| **leçon promue** | carnet versionné dans le dépôt | à la promotion | la pass, sous grant |

Le cook suivant bénéficie tout de suite des leçons provisoires. Le dépôt, lui, ne reçoit que ce
qui a fait ses preuves et reste lisible.

**Critère de promotion : la répétition entre rétros indépendantes.** Si plusieurs cooks, sur des
tickets différents et sans se voir, proposent la même leçon, elle est vraie. C'est mesurable sans
rien instrumenter — il suffit de comparer des rétros, là où « cette leçon a-t-elle été appliquée ? »
ne se mesure pas. Conséquence heureuse : **plus on parallélise, plus la promotion est fiable**,
alors que des rétros concurrentes ressemblaient d'abord à un défaut. Le seuil — combien de rétros
concordantes — est arbitraire au départ et se règle par la mesure.

Ça supprime une corvée au passage : le tri du carnet n'est plus un geste du manager, c'est la
promotion qui filtre. Un carnet ne grossit plus sans tri.

Et le chef n'est jamais sur le chemin critique : la PR de promotion est mergée par la pass sous
grant, comme n'importe quelle livraison. Il relit **après coup** — le `git log` du carnet dit
quand chaque leçon est entrée et sur quelles rétros — et retire une leçon par une PR, comme
n'importe quel revert. Une promotion en attente ne bloque jamais un déploiement ; l'inverse serait
pire, car un carnet qui attend est un carnet qui ne sert pas.

En V2, un seul adaptateur : `claude`. Un **adaptateur moteur** sait : lancer la CLI en headless avec la bonne config, lire son flux
(JSON streamé), détecter la fin, l'échec, et l'épuisement de quota.

### La pass

- Outil du runtime, plus le travail du manager : gates du projet (`gates.sh`, contrat V1
  conservé), lecture de la CI, appel au **reviewer** cadré sur le diff. Le reviewer passe **après
  des gates vertes**, et un de ses constats **bloquants** rend la pass rouge, gates vertes ou non.
- Verte → merge automatique si le grant `merge` est actif. Rouge → findings renvoyés au cook,
  **deux renvois max** (règle V1), puis issue de suite ou remontée.
- Les **deux renvois ne sont pas deux tentatives identiques** : le premier corrige au même
  calibrage, le second **monte** (modèle ou effort) dans la limite du plafond du profil. Et un cook
  qui découvre en cours de route que son ticket dépasse son calibrage **rend la main en demandant
  la montée**, plutôt que d'échouer ou de livrer mal — ce que la V1 ne permet pas, son effort étant
  figé dans le frontmatter de l'agent.
- Un lot de tickets sur zones disjointes se merge d'un bloc (règle V1).
- Après merge : la CI du projet déploie en preprod ; le second résume ce qui est à recetter.
  Rien ne bloque sur la recette.
- **Tout cook commente son ticket** en fin de course, qu'il ait produit du code ou non. Le
  compte-rendu devient un artefact durable sur GitHub, lisible sans ouvrir l'app — et c'est là que
  le second lit ce qu'il y a à recetter.

#### Les tickets sans diff

Certains tickets ne produisent aucun diff : un audit, une comparaison d'approches, une analyse
(« pourquoi la CI est-elle lente ? »), ou le livrable d'un cook non-code. Un cook non-code n'est
pas un cas particulier du modèle — c'est un cook dont le diff est vide.

- Gates et CI sont **muettes** sur ce genre de livrable, et il n'y a rien à merger. Un tel ticket
  est **servi dès que son livrable a été relu** : son verdict est celui du reviewer, et de lui
  seul (principe 6 : rien n'attend le chef ; la recette reste informelle, comme en V1). Rien à
  merger, donc aucun grant à consulter.
- Sur du code, les gates attrapent le pire même sans relecture ; ici, rien ne l'attraperait. Un
  cook qui dérape produirait un rapport faux marqué « servi », et personne ne le saurait avant de
  l'avoir lu.
- D'où : **le reviewer est obligatoire sur un ticket sans diff** — c'est le seul juge disponible —,
  alors qu'il **complète** les gates sur du code. Un livrable non-code ne passe jamais à « servi »
  sans avoir été relu (décision du 2026-10-08, PR #44, livrée par #72).
- Ça rend faisable une classe de tickets que le modèle ne savait pas terminer : audits, analyses,
  recommandations.

## Les grants, et pas de charte à côté

C'est la pièce qui règle le problème n°1.

**Décidé le 2026-10-10 par le chef : la charte est vide au départ — et ce n'est pas un objet de
plus.** Une ligne n'a de sens que là où une action est **irréversible ou sort du dépôt** : merger,
pousser, publier, fermer, dépenser. Tout ce qui est réversible — découper, ordonner, calibrer,
lancer, relancer — n'est pas une autorisation : c'est ce que la brigade *est*. On ne demande pas la
permission d'exister.

Reste une liste d'actions irréversibles, éteintes au départ, chacune levée par un grant. **C'est la
liste des grants elle-même** : rien à lire à côté. Ce qu'aucun grant ne lève se lit au même endroit.

Les grants sont des objets du runtime, pas des fichiers :

- Donnés en une phrase au second : « tu peux merger à partir de maintenant », « autorise
  `gh release` sur thermigo jusqu'à vendredi ».
- Une action, et une échéance : permanente, jusqu'à une date, ou N usages. **Pas de portée
  « tous les projets »** : un grant est un fait au journal, et il y a un journal par projet.
- **Effet immédiat** : la pass et le manager consultent les grants à chaque décision ; chaque cook
  est lancé avec des settings **générés** à partir des grants du moment. Rien à éditer, rien à
  redémarrer.
- Visibles et révocables dans l'app. Chaque usage est journalisé.
- Plafond dur : aucun grant ne peut donner `accès-prod` à une station de la box, ni lever la règle
  qui interdit au runtime de lire les identifiants du compte Max.

## Scheduler, quota et moteurs

Le mot « scheduler » couvre deux responsabilités qu'il faut séparer, parce qu'elles n'ont pas la
même portée (voir §Mises à jour) :

| | Portée | Ce qu'il décide |
|---|---|---|
| **arbitre de quota** | **globale, unique** | plafond de parallélisme du compte, poids entre projets, fenêtre et réinitialisation |
| **runtime de projet** | une instance par projet | rail, baux, calibrage du ticket, pass, garde-fous |

- L'arbitre connaît, par compte : consommation estimée (depuis les flux JSON des cooks),
  fenêtre en cours, prochaine réinitialisation. Et par machine : CPU/RAM disponibles.
- Il **arbitre le calibrage** demandé par le ticket sous contrainte de quota : il peut dégrader
  (Sonnet au lieu d'Opus, effort plus bas) ou faire attendre, jamais dépasser le plafond du profil.
- Il arbitre les **spécialités** par un budget ou un poids par domaine — « un ticket sécu sur Opus
  contre trois tickets courants sur Sonnet » — jamais par une file d'attente : un profil n'est pas
  une ressource rare.
- Il plafonne le nombre de cooks simultanés sur le compte Max.
- « Quota épuisé » est un état normal (**86**) : le ticket retourne sur le rail, la brigade
  ralentit.
- **Arbitre injoignable : le projet lance quand même** (décision du chef, 2026-10-08). Geler tous
  les projets parce que l'arbitre est tombé serait la panne la plus coûteuse du système, et elle
  est évitable : la consommation étant journalisée par projet, l'arbitre **se reconstruit** depuis
  les journaux à son retour (principe 5). Le mode dégradé doit être plus prudent que le mode
  normal, d'où ses bordures :
  - un runtime sans arbitre lance **au plus un cook à la fois**, quel que soit l'état de son rail ;
  - chaque lancement non arbitré est journalisé comme tel ;
  - l'interface signale les projets qui tournent en mode dégradé ;
  - au retour, l'arbitre rattrape sa comptabilité depuis les journaux **avant** de rouvrir les
    vannes.
- Poids entre projets réglables (« thermigo prioritaire cette semaine »).
- Pur code, aucun LLM.

## Garde-fous

Mécanique du runtime, pas jugement d'agent :

- Plafond par ticket : tours, durée, tokens.
- **Aucun cook lancé sans calibrage explicite** : un ticket sans calibrage est refusé, pas lancé
  au maximum.
- Détection de boucle et d'inactivité, sur **deux signaux à deux échelles** — complémentaires et
  non substituables :
  - le **flux de sortie** dit que le cook est **vivant**. Seuil court : un cook qui n'écrit plus
    rien est bloqué ou mort. C'est ce que mesure le garde-fou d'inactivité.
  - le **worktree** dit que le cook **progresse**. Seuil long, porté par le bail (§Le manager) :
    un cook peut bavarder sans avancer.

  Aucun des deux ne suffit seul : surveiller le seul worktree tuerait un cook qui lit longuement du
  code avant d'écrire une ligne ; surveiller le seul flux laisserait passer un cook qui raisonne en
  boucle. L'un mesure la vie, l'autre l'avancement.
- **Âge de bail sans progrès**, plafonné à part des budgets. Un cook parqué ne consomme ni tour,
  ni token, ni durée d'exécution : aucun plafond de budget ne le rattrape, seul le temps de mur le
  trahit (limite 6).
- Disjoncteur par projet après N échecs d'affilée.
- **Bouton « stop kitchen »** global et par projet.

## Monitoring

Tout passe par le **log** : ticket pris, cook lancé **et son calibrage**, signal, question posée,
pass verte/rouge, montée de calibrage au renvoi, merge, quota épuisé, grant donné/utilisé. Tout le
reste en dérive.

- **Kitchen** : tous les projets, questions en attente, jauges de quota et de machine, log en
  direct.
- **Espace projet** : rail par état, cooks actifs, questions, grants.
- **Direct d'un cook** : son flux retransmis, son budget, son ticket, son profil, son calibrage.
- **Détection de « qui coince »** automatique : inactivité, trop de tours, deuxième renvoi,
  quota bloquant → alerte dans l'app et au second.
- Pour chaque ticket pris, la kitchen montre **depuis combien de temps il n'a pas progressé**, pas
  seulement depuis quand il est pris : des deux durées, c'est la seule qui révèle un blocage. Elle
  est lue, jamais déduite — personne ne doit comparer une heure courante à la date d'un commit pour
  savoir si ça avance.
- Le second répond à « comment ça va sur X ? » en lisant le même log.

## La fermeture

En cuisine, la **fermeture** — le *closing* — est un rituel de métier : on nettoie, on jette ce qui
est périmé, on range, on prépare le service suivant. Personne ne la met au menu ; elle a lieu.

### Le problème qu'elle résout

Constat du chef sur les projets conduits en V1 : **ils dérivent.** Les devs prennent de plus en plus
de temps, le manager aussi, et personne ne cherche à l'éviter. Ce n'est pas un défaut d'attention,
c'est une conséquence du design : **rien, dans la V2, ne retire quoi que ce soit.**

| Ce qui grossit | Qui l'élague aujourd'hui |
|---|---|
| la doc | personne — la règle dit « toute livraison met à jour la doc » : elle ajoute |
| les tests | personne — mesuré le 2026-10-08 : 203 → 622 tests en un seul jalon |
| le code | personne : pas de refactor sans ticket, et le hors-scope devient une issue |
| les carnets | la promotion filtre l'entrée ; rien ne retire une leçon devenue fausse |
| le `CLAUDE.md` et les conventions | personne |
| la dette de sécurité | personne, et les gates ne la voient pas |

Trois causes, toutes structurelles :

1. **un cook = un ticket** — il ne peut pas remarquer en passant que trois fonctions font la même
   chose, et s'il le remarque, la règle en fait une issue, pas un commit ;
2. **le manager ordonne *dans* les priorités du second** — il ne crée pas de travail de fond, et le
   second priorise la valeur produit : **l'entropie n'est jamais la valeur produit, donc elle ne
   monte jamais** ;
3. **les gates vérifient la non-régression, pas la non-dérive** — elles disent « ça marche », jamais
   « ça devient lourd ».

### Le closer est hors du rail

**Décision du chef (2026-10-09) : la fermeture ne suit pas les règles de priorité.** Un ticket de
rangement posé en `prio:3` ne passerait jamais — il y aura toujours quelque chose de plus utile, et
c'est précisément ce qui produit la dérive en V1. **L'entropie n'a pas besoin d'une priorité, elle
a besoin d'un budget.**

Le **closer** n'est donc pas un cook et ne prend pas de ticket : il travaille hors du rail, en
parallèle des cooks ou quand le service se calme.

Mais il garde **tous les garde-fous** : plafonds par passe, détection d'inactivité, « stop »,
disjoncteur, et les **zones de fichiers dans les deux sens** — il ne touche pas ce qu'un cook
tient, et pendant qu'il range il en tient beaucoup. Sortir du rail ne veut pas dire sortir des
garde-fous, et pour une raison précise : **c'est l'agent le plus dangereux du système.** Un cook qui
se trompe ajoute du mauvais code, et la pass l'attrape ; un closer qui se trompe **efface du bon
code**, et les gates diront « ça marche toujours » — puisque ce qui a disparu n'était testé par rien.

### Observer et écrire ne se font pas dans la même fenêtre

| | Ce qu'elle fait | Non bloquante ? |
|---|---|---|
| **fermeture qui observe** | mesure, compte, repère doublons et code mort, constate la dérive | **oui** : elle ne touche à rien, elle peut tourner en continu |
| **fermeture qui écrit** | supprime, simplifie, range, dédoublonne | **non** : elle doit merger, donc elle déplace la branche d'intégration sous les cooks en vol |

Une passe qui écrit pendant que trente cooks travaillent, c'est la rencontre de deux livraisons
(§La pass) multipliée par trente — et c'est le closer qui déclenche la collision. « Quand ça se
calme » n'est donc pas une préférence d'ordonnancement mais une **condition d'exécution**,
mesurable : le rail est vide, ou le nombre de cooks en vol est sous un seuil.

### Elle se déclenche par la mesure, pas par l'horloge

Un balayage nocturne est arbitraire : il passe quand rien ne le justifie, et après la panne quand
quelque chose la justifiait. Les déclencheurs sont des **compteurs**, et le journal les porte déjà :

- N merges depuis la dernière fermeture — « quatre-vingts merges d'affilée, c'est beaucoup » ;
- la suite de tests a dépassé le plafond déclaré par le projet ;
- la doc a grossi de X % sans qu'un seul fichier ait été supprimé ;
- N merges depuis le dernier regard sécurité — un domaine où les gates ne voient rien.

### Ses KPI, et ce qui les empêche de tricher

**On ne mesure jamais une réduction sans mesurer ce qu'elle ne doit pas casser.** Un agent mesuré
sur le nombre de tests supprimera des tests ; sur la taille du dépôt, du code utile ; sur le temps
des gates, des vérifications. Chacune de ces tricheries améliore le KPI et dégrade le projet.

| KPI | Nature | Son garde-fou |
|---|---|---|
| nombre et durée des tests | symptôme | la couverture ne baisse pas |
| temps moyen des gates | symptôme | les gates vérifient toujours autant de choses |
| temps d'un cook à livrer | symptôme | normalisé par taille de ticket — sinon un gros ticket ressemble à une dérive |
| taille du contexte chargé (`CLAUDE.md`, doc lue) | symptôme | — |
| taille du dépôt | symptôme | le produit marche toujours |
| doublons et code mort retirés | **effet** | rien de vivant n'a disparu |

Les **symptômes** déclenchent, les **effets** font le bilan. Et les symptômes se mesurent **dès
aujourd'hui, sans closer** : le journal porte les tours, les tokens et la durée de chaque cook, les
gates connaissent leur temps, le dépôt se mesure avec `git`. **Le tableau de ces mesures vient donc
avant le closer** — sans lui, il rangerait à l'aveugle et personne ne saurait s'il sert.

Le cas le plus délicat est le **temps d'un cook à livrer** : le plus proche de la dérive vécue, et
le plus trompeur. Il mêle la taille des tickets, la lourdeur du projet et l'encombrement du
contexte. Mieux vaut suivre la **part du temps passée dans les gates** et le **nombre de tours pour
un ticket de taille comparable** que le total brut.

### La mémoire se périme aussi

Les carnets ont une entrée — la promotion par répétition entre rétros indépendantes (§Stations et
cooks) — et n'avaient pas de sortie. Une leçon devenue fausse est pire que pas de leçon : un carnet
qui dit « toujours faire X » alors que X a été remplacé fait du mal à chaque cook qui le charge.

**Promotion par répétition, péremption par silence** : une leçon qu'aucune rétro n'a reconfirmée
depuis N tickets redescend en provisoire, puis disparaît.

Et pour la mémoire du projet — `CLAUDE.md`, doc, conventions — l'argument n'est pas l'hygiène mais
l'économie : **elle est payée à chaque cook.** Ce qui est chargé dans chaque session coûte du
contexte pour toujours ; une convention périmée est une taxe permanente.

### Ce qui se range sans attendre la fermeture

Tout n'a pas besoin d'une passe. Le nettoyage des ressources a un **moment naturel** — la fin d'un
cook, un merge — et l'y faire vaut mieux qu'un balayage : à trente cooks le disque se remplit dans
la journée, et un balai de nuit passe après la panne.

| Objet | Quand il part | Pourquoi |
|---|---|---|
| **worktree** | à la fin du cook, succès ou échec | après avoir **commité ce qui traîne** sur sa branche : rien n'est perdu, et c'est le worktree qui pèse, pas la branche |
| **branche** | au merge ; sinon après N jours si abandonnée | légère, et c'est elle qui porte la trace |
| **flux brut** (`runs/*.jsonl`) | compressé, puis purgé après un délai | le gros volume, et du détail : le journal garde le compte-rendu |
| **journal** (`log.db`) | jamais | c'est la vérité, tout en dérive |

Décision du chef (2026-10-09) : **personne ne retourne dans le worktree d'un échec.** Il peut donc
partir tout de suite, à condition que le travail non commité y soit commité d'abord.

S'y ajoute une **borne de disque** qui ne dépend d'aucune horloge : au-delà d'un seuil, les plus
vieux partent maintenant.

## Isolation et secrets

- **Un conteneur par projet, un worktree par cook** (comme aujourd'hui).
- Réseau des conteneurs en liste blanche : Anthropic, GitHub, registres de paquets.
- **Compte Max** : connexion par SSH sur la box (comme aujourd'hui), identifiants
  montés en lecture seule dans les conteneurs. L'app signale une connexion expirée.
- **GitHub** : une GitHub App par dépôt, tokens courts limités au dépôt. Les cooks poussent des
  branches, ne mergent pas (protection de branche) ; seule la pass merge.
- **Secrets de dev** : un fichier par projet, monté uniquement dans son conteneur. Jamais de prod.

## Migration

- Conventions GitHub (labels, issues, PR, `gates.sh`, `worktree-setup.sh`) conservées autant que
  possible pour basculer projet par projet.
- Construire la V2 avec la V1.

## Mises à jour

Brigade se maintient avec brigade : les mises à jour seront fréquentes, surtout au début. Aucune
ne doit coûter une session, ni du temps sur les autres projets. L'essentiel est déjà acquis — le
runtime n'a pas d'état en mémoire, les cooks sont jetables, et tout dérive d'un journal en ajout
seul.

### Une instance de runtime par projet

Le runtime livré par #13 est **par projet** : unité systemd templatée `brigade@<projet>.service`,
un répertoire d'état, un verrou et un journal par projet. `systemctl restart brigade@espace` ne
touche pas `brigade@brigade`.

- **La mise à jour se fait projet par projet** : c'est de l'exploitation, il n'y a rien à
  construire.
- **Brigade est son propre canari** : on bascule `brigade@brigade` d'abord et les autres projets
  restent sur la version précédente le temps qu'elle tourne. Si elle casse, on perd l'outil qui
  construit brigade — pas les autres projets.
- **Plus de point unique de défaillance** : un runtime qui plante ne coûte qu'un projet.
- L'isolation par conteneur est déjà payée : un runtime unique devrait traverser N frontières
  d'isolation pour piloter ses cooks, un runtime par projet n'a rien à traverser.

### Les règles qui rendent un redémarrage indolore

- **Un cook survit au redémarrage de son runtime.** Il est détaché, jamais un processus enfant
  qu'une mise à jour tuerait. Le principe 7 le rattrape : au réveil, le runtime observe le
  worktree et récolte ce qui est prêt, sans dépendre d'un message du cook.
- **Le journal est une API entre versions.** En ajout seul, il ne se migre pas : il se relit.
  Chaque version doit savoir lire tous les événements passés.
- **Contrat de version entre l'interface et les runtimes** : **N et N-1 pilotables**, au-delà
  visible mais non pilotable (voir §L'app desktop).
- **Un mode « drain », frère doux du « stop kitchen »** : cesser de *fire* de nouveaux tickets et
  laisser finir les cooks en vol. Quelques minutes de débit en moins, zéro perte. Le stop reste
  l'arrêt immédiat.
- **Rollback automatique** : une version qui ne démarre pas, ou qui échoue ses contrôles de
  démarrage, revient seule à la précédente. `brigade@.service` en porte déjà la moitié —
  `RestartPreventExitStatus=2` empêche un refus de démarrer de boucler.

### Le serpent qui se mord la queue

Un cook modifie le runtime qui l'exécute, la pass merge sous grant, le runtime redémarre sur une
version cassée — et ce qui permettrait de réparer ne tourne plus. Deux garde-fous :

- **les gates ne suffisent pas** : un runtime peut passer ses tests et refuser de démarrer sur la
  box. Le contrôle qui compte est un démarrage réel ;
- **déployer à côté, basculer après un démarrage réussi**, revenir seul en cas d'échec.

Le cloisonnement par projet contient le reste : seule l'instance `brigade@brigade` bascule.

### Ce qui coûte encore une session

Le **second** est une session Claude Code : son prompt est chargé au démarrage, et une mise à jour
du plugin ne change rien à une session en cours — limite V1, inchangée. D'où une règle d'arbitrage
permanente : **minimum dans le prompt, maximum dans le runtime.** Un comportement placé dans le
markdown d'un rôle exigera un redémarrage de session ; placé côté runtime, non.

## Au parking

- **Autres moteurs** (Codex via abonnement ChatGPT, Mistral, openweights via opencode/ollama).
  Conditions d'usage ChatGPT pour `codex exec` à vérifier le moment venu. Un reviewer d'un autre
  moteur que le cook deviendra alors possible.
- **Apprentissage des cooks par la mesure** (taux de renvoi, quota par ticket, durée par profil
  → routage et carnets pilotés par les données). Potentiellement le vrai différenciateur à moyen
  terme ; mérite son propre brainstorm.
- **Création de profils proposée par la mesure** : « sept des douze derniers tickets touchaient la
  BDD, quatre ont été renvoyés deux fois — un profil BDD ? ». Le chef ne sait pas à l'avance quels
  profils son projet mérite, et c'est précisément ce que la mesure peut lui dire. Prolongement
  direct du point ci-dessus.
- **Accès multi-humains au second** : V2.5.
- **Ressources machine** fines (au-delà d'un plafond de cooks simultanés) : plus tard.
- **Messagerie** (Telegram, Slack) pour le second : pas dans l'immédiat.

## Questions ouvertes

1. ~~Stack du runtime (langage, file d'événements, déploiement sur la box)~~ — **résolue le
   2026-10-08** : voir [`2026-10-08-runtime-stack.md`](2026-10-08-runtime-stack.md).
   **Reste ouverte** : la stack de l'app (Electron, Tauri…), à trancher au jalon 6.
2. ~~Format exact du ticket (dans le corps de l'issue GitHub ? frontmatter ? labels de capacités ?)~~
   — **résolue le 2026-10-08** (#68) : une **fiche en commentaire** de l'issue, ni dans le corps ni
   en labels. Voir [`2026-10-08-fiche-du-ticket.md`](2026-10-08-fiche-du-ticket.md), et
   « La fiche d'un ticket » dans [`docs/runtime.md`](../../runtime.md#la-fiche-dun-ticket).
   **Reste au jalon 4** : les capacités requises, le domaine et le budget, qui s'y ajoutent comme
   des lignes de plus.
3. Comment le runner Mac matérialise la validation du chef pour `accès-prod` (dans le terminal du
   second, notification de l'app ?).
4. Le direct d'un cook : retransmettre le flux brut, ou un résumé vivant ?
