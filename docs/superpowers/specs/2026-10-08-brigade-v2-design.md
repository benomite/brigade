# brigade V2 — design

**Date** : 2026-10-08
**Statut** : brainstorm consolidé, à valider avant plan d'implémentation
**Portée** : refonte complète — brigade passe d'un plugin Claude Code à une application (runtime + tableau de bord) installée sur la parade-box, plus un plugin léger côté Mac

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
   d'un bon à l'autre.

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

On garde la cuisine, en l'alignant sur une vraie brigade.

| Terme | Rôle | Remplace |
|---|---|---|
| **Maître d'** | Le seul interlocuteur de l'humain. Débat produit, écrit épiques et critères, fixe les priorités, sert les questions de la cuisine. | PO |
| **Chef** | Tient la cuisine d'un projet : découpe les épiques en bons, ordonne, assigne, arbitre. Ne cuisine pas, ne goûte pas chaque assiette. | Manager (moitié « jugement ») |
| **Commis** | Exécute **un** bon. Spécialisable (profil = moteur + modèle + outils + carnet). | Dev |
| **Poste** | Un endroit où un commis peut tourner : machine + moteur + capacités fournies. L'humain est un poste. | Designer (en partie) |
| **La passe** | Vérification avant de servir : gates, revue, merge. Tenue par un poste dédié, pas par le chef. | Manager (moitié « intégration ») |
| **Le rail** | La file des bons d'un projet. | Roadmap |
| **Bon** | Une unité de travail. | Issue |
| **Ordonnanceur** | Répartit quotas et postes entre toutes les brigades. | — (n'existait pas) |

« Serveur » est écarté : il désigne aussi la machine.

## Principes

1. **Le chef ne spawne plus.** Il pose des bons sur le rail ; des postes viennent les prendre.
   Plus de process parent, donc plus de limite de pool, plus de mort collective, n'importe quel
   moteur.
2. **Le chef est du code, pas un agent.** La boucle (rail, baux, matching, retries, merge sur
   passe verte) est déterministe et ne coûte aucun quota. Un LLM n'est appelé que pour juger :
   qualifier, découper, arbitrer un conflit.
3. **Capacités, pas rôles.** Un bon déclare ce qu'il **requiert** (`chrome-connecté`,
   `accès-prod`, `revue-humaine`, `gpu`…), un poste déclare ce qu'il **fournit**.
4. **Un commis = un bon.** La leçon du dev-employé-permanent tient toujours, et pèse plus lourd
   en quota qu'en euros.
5. **Les artefacts durables restent la vérité.** GitHub porte bons, PR, décisions ; l'état de
   runtime (baux, quotas, runs, carnets) vit dans une base locale. Tout se reconstruit après un
   crash.
6. **Ne jamais bloquer sur l'humain.** Ce qui attend l'humain s'empile ; tout le reste avance.

## Architecture

```
┌──────────────────────── parade-box (Kimsufi) ─────────────────────────┐
│                                                                        │
│  Ordonnanceur global ── quotas par compte, ressources machine,        │
│        │                 poids entre brigades                          │
│        ├── Brigade A : chef · rail · passe · commis (conteneur A)     │
│        ├── Brigade B : chef · rail · passe · commis (conteneur B)     │
│        └── …                                                           │
│                                                                        │
│  Journal d'événements (SQLite) → tableau de bord web + endpoint MCP   │
│  Adaptateurs moteurs : claude -p · codex exec · vibe · opencode       │
│                                                                        │
│  AUCUN accès prod.                                                     │
└───────────────────────────────▲────────────────────────────────────────┘
                                │ Tailscale / WireGuard
                                │ (le Mac se connecte, jamais l'inverse)
┌───────────────────────────────┴──────── Mac ───────────────────────────┐
│  Maîtres d' : sessions Claude Code (terminal / Desktop), une par       │
│               dossier projet, branchées au runtime via MCP.            │
│               Les `!` tournent ici, avec les accès prod.               │
│  Runner Mac : poste qui fournit chrome-connecté, accès-prod,           │
│               revue-humaine.                                           │
└────────────────────────────────────────────────────────────────────────┘
```

### Le maître d'

- Une **vraie session Claude Code** sur le Mac, ouverte dans le dossier du projet : on garde
  tout (`!`, slash commands, historique) sans rien reconstruire. Aucun chat maison.
- Plugin brigade léger + MCP vers le runtime. Outils : écrire/modifier épiques et bons, fixer les
  priorités, lire l'état, répondre aux questions, **donner ou retirer des autorisations**.
- **À l'ouverture**, un hook sert la file : questions en attente, livraisons, ce qui est en
  preprod à vérifier, alertes.
- Mac fermé : rien ne se perd, les questions s'empilent côté runtime.
- Prévu pour V2.5 : accès d'autres humains (associés, clients). Le MCP passe donc dès la V2
  derrière une couche d'authentification.

### Le chef

- Un par brigade. Process du runtime, réveillé par événement (webhook GitHub, fin de bon, signal
  de commis, tick périodique), sans état en mémoire.
- Découpe les épiques en bons avec **dépendances** (B attend A), partitionne par zone de fichiers
  (règle V1 conservée : un fichier, un propriétaire entre bons concurrents).
- Ordonne **dans** les priorités produit fixées par le maître d'. Peut prioriser seul ce qui
  arrive en cours de route (bugs, hors-scope) selon la charte.
- Réagit aux échecs : redécoupe, change de profil de commis, remonte au maître d'.
- Verrou par brigade : jamais deux chefs sur un même dépôt. Autant de chefs que de projets.

### Postes et commis

Un **poste** = machine + adaptateur moteur + capacités. Exemples :

| Poste | Fournit |
|---|---|
| `box/claude-opus` | code, raisonnement lourd |
| `box/claude-sonnet` | code courant |
| `box/codex` | code courant |
| `box/openweight` | tâches triviales (formatage, tri, rétro) — sans quota |
| `box/playwright` | navigateur headless (couvre la plupart des besoins « navigateur ») |
| `mac/claude-chrome` | `chrome-connecté` |
| `mac/accès-prod` | `accès-prod` — toujours avec validation humaine |
| `humain/benoit` | `revue-humaine`, décisions |

Un **profil de commis** = fiche de poste versionnée : moteur, modèle, outils, skills, et un
**carnet** de leçons. Après chaque bon, une rétro courte propose des ajouts au carnet ; le chef
les trie (un carnet qui grossit sans tri pollue le contexte). Les evals servent de garde-fou de
non-régression des profils.

Un **adaptateur moteur** sait : lancer la CLI en headless avec la bonne config, lire son flux
(JSON streamé), détecter la fin, l'échec, et l'épuisement de quota.

### La passe

- Poste dédié, plus le travail du chef : gates du projet (`gates.sh`, contrat V1 conservé),
  lecture de la CI, revue de code cadrée sur le diff.
- Verte → merge automatique si l'autorisation `merge` est active (voir charte). Rouge → findings
  renvoyés, **deux renvois max** (règle V1), puis issue de suite ou remontée.
- Un lot de bons sur zones disjointes se merge d'un bloc (règle V1).
- Après merge : la CI du projet déploie en preprod ; le maître d' résume ce qui est à recetter.
  Rien ne bloque sur la recette.

## Charte de délégation et autorisations à chaud

C'est la pièce qui règle le problème n°1.

**La charte** dit ce que la cuisine tranche seule et ce qui monte au maître d'. Défaut proposé :

| Le chef tranche seul | Monte au maître d' |
|---|---|
| Découpage, ordre, assignation | Choix produit, critère d'acceptation ambigu |
| Retry, changement de profil | Tout ce qui touche la prod |
| Merge si passe verte (si autorisé) | Action irréversible hors dépôt |
| Priorisation des bugs / hors-scope | Dépassement de budget d'une épique |
| Issue de suite après 2 renvois | Changement de périmètre |

**Les autorisations** remplacent l'édition des settings sur la box. Ce sont des objets du runtime,
pas des fichiers :

- Données en une phrase au maître d' : « tu peux merger à partir de maintenant », « autorise
  `gh release` sur Thermigo jusqu'à vendredi ».
- Portée : brigade (ou toutes), action (`merge`, `push-tag`, commande précise…), durée
  (permanente, jusqu'à une date, N fois).
- **Effet immédiat** : la passe et le chef consultent les autorisations à chaque décision ; chaque
  commis est lancé avec des settings **générés** à partir des autorisations du moment. Rien à
  éditer, rien à redémarrer.
- Visibles et révocables dans le tableau de bord. Chaque usage est journalisé.
- Plafond dur : aucune autorisation ne peut donner `accès-prod` à un poste de la box.

## Quota, moteurs et ordonnanceur

- L'ordonnanceur connaît, par compte : consommation estimée (depuis les flux JSON), fenêtre en
  cours, prochaine réinitialisation. Et par machine : CPU/RAM disponibles.
- Il route par coût : Opus pour le difficile, Sonnet/Codex pour le courant, openweight pour le
  trivial.
- « Quota épuisé » est un état normal : le bon retourne sur le rail, la cuisine ralentit.
- Poids entre brigades réglables (« Thermigo prioritaire cette semaine »).

## Garde-fous

Mécanique du runtime, pas jugement d'agent :

- Plafond par bon : tours, durée, tokens.
- Détection de boucle et d'inactivité (pas de sortie depuis N minutes).
- Disjoncteur par brigade après N échecs d'affilée.
- **Bouton « stop cuisine »** global et par brigade.

## Monitoring

Tout passe par le **journal d'événements** : bon pris, commis lancé, signal, question posée,
passe verte/rouge, merge, quota épuisé, autorisation donnée/utilisée. Tout le reste en dérive.

- **Tableau de bord web** (sur la box, lisible depuis le Mac et le téléphone) : vue cuisine
  (toutes les brigades), vue brigade (rail par état, commis actifs, questions, autorisations),
  direct d'un commis (flux retransmis), jauges de quota et de machine.
- **Détection de « qui coince »** automatique : inactivité, trop de tours, deuxième renvoi,
  quota bloquant → alerte au tableau et au maître d'.
- `brigade top` dans le terminal pour un coup d'œil.
- Le maître d' répond à « comment ça va sur X ? » en lisant le même journal.

## Isolation et secrets

- **Un conteneur par brigade, un worktree par commis** (comme aujourd'hui).
- Réseau des conteneurs en liste blanche : Anthropic, OpenAI, GitHub, registres de paquets.
- **Comptes Max / ChatGPT** : connexion par SSH sur la box (comme aujourd'hui), identifiants
  montés en lecture seule dans les conteneurs. Le tableau de bord signale une connexion expirée.
- **GitHub** : une GitHub App par dépôt, tokens courts limités au dépôt. Les commis poussent des
  branches, ne mergent pas (protection de branche) ; seule la passe merge.
- **Secrets de dev** : un fichier par brigade, monté uniquement dans son conteneur. Jamais de prod.

## Migration

- Conventions GitHub (labels, issues, PR, `gates.sh`, `worktree-setup.sh`) conservées autant que
  possible pour basculer projet par projet.
- Construire la V2 avec la V1.

## Au parking

- **Apprentissage des commis par la mesure** (taux de renvoi, quota par bon, durée par profil →
  routage et carnets pilotés par les données). Potentiellement le vrai différenciateur à moyen
  terme ; mérite son propre brainstorm.
- **Accès multi-humains au maître d'** : V2.5.
- **Ressources machine** fines (au-delà d'un plafond de commis simultanés) : plus tard.
- **Messagerie** (Telegram, Slack) pour le maître d' : pas dans l'immédiat.

## Questions ouvertes

1. Conditions d'usage des abonnements Max / ChatGPT pour de l'exécution automatisée et parallèle.
2. Stack du runtime (langage, file d'événements, déploiement sur la box).
3. Format exact du bon (dans le corps de l'issue GitHub ? frontmatter ? labels de capacités ?).
4. Comment le runner Mac matérialise la validation humaine pour `accès-prod` (prompt Claude Code
   sur le Mac, notification, bouton dans le tableau de bord ?).
5. Le direct d'un commis : retransmettre le flux brut, ou un résumé vivant ?
