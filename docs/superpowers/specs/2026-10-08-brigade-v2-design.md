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
5. **Des devs interchangeables qui n'apprennent rien.** Même prompt, même modèle, aucune mémoire
   d'un ticket à l'autre.

Causes racines : le Manager est à la fois **process parent** (d'où 3 et 4) et **agent qui juge
tout** (d'où 1 et son coût en contexte), et le système n'a **aucune notion de capacité** (d'où 2).

## Contraintes

- **Abonnements, pas d'API.** On utilise les comptes Max (Claude) et ChatGPT (Codex) via leurs
  CLI officielles, pas les API facturées au token. Le facteur limitant devient **le quota**
  (fenêtres glissantes, plafonds hebdomadaires partagés entre toutes les sessions d'un compte),
  plus l'argent. *À vérifier avant de construire : les conditions d'usage de ces abonnements
  pour une exécution automatisée et parallèle.*
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
| **cook** | Exécute **un** ticket | N'importe lequel (Claude, Codex, openweight…) | Dev |
| **reviewer** | Relit le diff pour la passe | Au choix, idéalement un autre moteur que le cook | Revue du Manager |

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
| **cook profile** | Moteur + modèle + outils + skills + carnet de leçons |

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

## Architecture

```
┌──────────────────────── parade-box (Kimsufi) ─────────────────────────┐
│                                                                        │
│  scheduler ── quotas par compte, charge machine, poids des projets    │
│      │                                                                 │
│      ├── projet A : manager · rail · pass · cooks (conteneur A)       │
│      ├── projet B : manager · rail · pass · cooks (conteneur B)       │
│      └── …                                                             │
│                                                                        │
│  log (SQLite) → API pour l'app + endpoint MCP pour les seconds        │
│  Adaptateurs moteurs : claude -p · codex exec · vibe · opencode       │
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

### Stations et cooks

Une **station** = machine + adaptateur moteur + capacités. Exemples :

| Station | Fournit |
|---|---|
| `box/claude-opus` | code, raisonnement lourd |
| `box/claude-sonnet` | code courant |
| `box/codex` | code courant |
| `box/openweight` | tâches triviales (formatage, tri, rétro) — sans quota |
| `box/playwright` | navigateur headless (couvre la plupart des besoins « navigateur ») |
| `mac/claude-chrome` | `chrome-connecté` |
| `mac/accès-prod` | `accès-prod` — toujours avec validation du chef |
| `chef` | `revue-humaine`, décisions |

Un **cook profile** = moteur, modèle, outils, skills, et un **carnet** de leçons. Après chaque
ticket, une rétro courte propose des ajouts au carnet ; le manager les trie (un carnet qui grossit
sans tri pollue le contexte). Les evals servent de garde-fou de non-régression des profils.

Un **adaptateur moteur** sait : lancer la CLI en headless avec la bonne config, lire son flux
(JSON streamé), détecter la fin, l'échec, et l'épuisement de quota.

### La pass

- Outil du runtime, plus le travail du manager : gates du projet (`gates.sh`, contrat V1
  conservé), lecture de la CI, appel au **reviewer** cadré sur le diff.
- Verte → merge automatique si le grant `merge` est actif. Rouge → findings renvoyés au cook,
  **deux renvois max** (règle V1), puis issue de suite ou remontée.
- Un lot de tickets sur zones disjointes se merge d'un bloc (règle V1).
- Après merge : la CI du projet déploie en preprod ; le second résume ce qui est à recetter.
  Rien ne bloque sur la recette.

## Charte de délégation et grants

C'est la pièce qui règle le problème n°1.

**La charte** dit ce que la brigade tranche seule et ce qui monte au second. Défaut proposé :

| Le manager tranche seul | Monte au second |
|---|---|
| Découpage, ordre, assignation | Choix produit, critère d'acceptation ambigu |
| Retry, changement de cook profile | Tout ce qui touche la prod |
| Merge si pass verte (si grant actif) | Action irréversible hors dépôt |
| Priorisation des bugs / hors-scope | Dépassement de budget d'une épique |
| Issue de suite après 2 renvois | Changement de périmètre |

**Les grants** remplacent l'édition des settings sur la box. Ce sont des objets du runtime, pas
des fichiers :

- Donnés en une phrase au second : « tu peux merger à partir de maintenant », « autorise
  `gh release` sur thermigo jusqu'à vendredi ».
- Portée : projet (ou tous), action (`merge`, `push-tag`, commande précise…), durée (permanente,
  jusqu'à une date, N fois).
- **Effet immédiat** : la pass et le manager consultent les grants à chaque décision ; chaque cook
  est lancé avec des settings **générés** à partir des grants du moment. Rien à éditer, rien à
  redémarrer.
- Visibles et révocables dans l'app. Chaque usage est journalisé.
- Plafond dur : aucun grant ne peut donner `accès-prod` à une station de la box.

## Scheduler, quota et moteurs

- Le scheduler connaît, par compte : consommation estimée (depuis les flux JSON des cooks),
  fenêtre en cours, prochaine réinitialisation. Et par machine : CPU/RAM disponibles.
- Il route par coût : Opus pour le difficile, Sonnet/Codex pour le courant, openweight pour le
  trivial.
- « Quota épuisé » est un état normal (**86**) : le ticket retourne sur le rail, la brigade
  ralentit.
- Poids entre projets réglables (« thermigo prioritaire cette semaine »).
- Pur code, aucun LLM.

## Garde-fous

Mécanique du runtime, pas jugement d'agent :

- Plafond par ticket : tours, durée, tokens.
- Détection de boucle et d'inactivité (pas de sortie depuis N minutes).
- Disjoncteur par projet après N échecs d'affilée.
- **Bouton « stop kitchen »** global et par projet.

## Monitoring

Tout passe par le **log** : ticket pris, cook lancé, signal, question posée, pass verte/rouge,
merge, quota épuisé, grant donné/utilisé. Tout le reste en dérive.

- **Kitchen** : tous les projets, questions en attente, jauges de quota et de machine, log en
  direct.
- **Espace projet** : rail par état, cooks actifs, questions, grants.
- **Direct d'un cook** : son flux retransmis, son budget, son ticket, son profil.
- **Détection de « qui coince »** automatique : inactivité, trop de tours, deuxième renvoi,
  quota bloquant → alerte dans l'app et au second.
- Le second répond à « comment ça va sur X ? » en lisant le même log.

## Isolation et secrets

- **Un conteneur par projet, un worktree par cook** (comme aujourd'hui).
- Réseau des conteneurs en liste blanche : Anthropic, OpenAI, GitHub, registres de paquets.
- **Comptes Max / ChatGPT** : connexion par SSH sur la box (comme aujourd'hui), identifiants
  montés en lecture seule dans les conteneurs. L'app signale une connexion expirée.
- **GitHub** : une GitHub App par dépôt, tokens courts limités au dépôt. Les cooks poussent des
  branches, ne mergent pas (protection de branche) ; seule la pass merge.
- **Secrets de dev** : un fichier par projet, monté uniquement dans son conteneur. Jamais de prod.

## Migration

- Conventions GitHub (labels, issues, PR, `gates.sh`, `worktree-setup.sh`) conservées autant que
  possible pour basculer projet par projet.
- Construire la V2 avec la V1.

## Au parking

- **Apprentissage des cooks par la mesure** (taux de renvoi, quota par ticket, durée par profil
  → routage et carnets pilotés par les données). Potentiellement le vrai différenciateur à moyen
  terme ; mérite son propre brainstorm.
- **Accès multi-humains au second** : V2.5.
- **Ressources machine** fines (au-delà d'un plafond de cooks simultanés) : plus tard.
- **Messagerie** (Telegram, Slack) pour le second : pas dans l'immédiat.

## Questions ouvertes

1. Conditions d'usage des abonnements Max / ChatGPT pour de l'exécution automatisée et parallèle.
2. Stack du runtime (langage, file d'événements, déploiement sur la box) et de l'app (Electron,
   Tauri…).
3. Format exact du ticket (dans le corps de l'issue GitHub ? frontmatter ? labels de capacités ?).
4. Comment le runner Mac matérialise la validation du chef pour `accès-prod` (dans le terminal du
   second, notification de l'app ?).
5. Le direct d'un cook : retransmettre le flux brut, ou un résumé vivant ?
