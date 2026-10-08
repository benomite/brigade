# La station `box/claude` — spec et plan (#15)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — (a) aux sept questions de fin de document ; complété le même jour par les deux critères de récolte ajoutés à l'issue
**Issue** : #15 « Une station claude prend un ticket et rend une branche »
**S'appuie sur** : `2026-10-08-runtime-stack.md` (§4 piloter `claude`), `2026-10-08-runtime-rail.md`
(prêter, rendre, 86), `2026-10-08-garde-fous.md` (lancement gardé, `juger`), et
`2026-10-08-brigade-v2-design.md` (§Contraintes, §Stations et cooks)

---

## Ce que #15 livre

La pièce qui manquait entre le rail et les garde-fous : quelque chose qui **vient prendre** un
ticket. Le runtime gagne une station, `box/claude`, qui à chaque réveil regarde si elle peut
servir, prend le premier ticket en attente, lui fabrique un worktree, y lance un cook sous
garde-fous, lit comment il finit, et rend au rail ce que cette fin veut dire.

| Critère de l'issue | Ce qui le porte |
|---|---|
| La station s'annonce, le chef la voit | Fait `station.announced` au démarrage ; projection `stations` ; commande `npm run station` |
| Aucun cook sans calibrage | Le calibrage (modèle + effort) est lu sur le ticket ; absent ou ambigu, le ticket est refusé (question 2), jamais lancé avec un défaut |
| Le cook n'a aucun geste de livraison ; un cook qui a commité puis s'est arrêté a fini | La station **récolte** : ce qui est commité est poussé et part en pass, quelle que soit la façon dont le process s'est arrêté (voir « Récolte ») |
| Le log porte le calibrage | `cook.launched` gagne `model`, `effort`, `station`, `branch` |
| Worktree propre, branche poussée, arbre principal intact | `git worktree add` depuis `origin/<base>` dans `<état>/worktrees/<run>` ; jamais de checkout dans le clone |
| Branche depuis `v2`, PR vers `v2` | `BRIGADE_BASE_BRANCH`, sans défaut ; la PR est ouverte avec `--base` |
| Binaire officiel seul, jamais le token | L'adaptateur ne lance que `claude` ; le runtime **refuse de démarrer** si son environnement porte `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ou `CLAUDE_CODE_OAUTH_TOKEN` ; aucun fichier d'identifiants n'est ouvert |
| Trois fins | `fini`, `échoué`, `86` — plus la connexion expirée, qui n'est aucune des trois |
| 86 : retour en attente, rien de perdu, heure de retour | `ticket.86` avec `until` (le rail le rend seul, #14) et `station.86` : la station ne prend plus rien jusque-là |
| Plafond de cooks simultanés = 1 | La station ne prend un ticket que si aucun cook ne tourne ; le plafond est écrit dans `station.announced` |
| Relire ce que le cook a fait | Flux brut `runs/<run>.jsonl` (déjà #16), et le compte-rendu au journal (`cook.reported`) |
| Le cook commente son ticket | Commentaire GitHub en fin de course (question 4) |
| Connexion expirée détectée et signalée | `station.disconnected` (question 6), au démarrage (`claude auth status`) et dans le flux d'un cook |
| Un cook ne merge jamais | Consigne du cook, outils de merge interdits au lancement (question 3) ; la garantie dure reste la protection de branche (#17) |

## Ce qui a été éprouvé avant d'écrire

Mesuré le 2026-10-08 sur le Mac (`claude` 2.1.285). **Quota consommé : un seul appel réel**, une
réponse d'un mot en `haiku` / `low` (107 tokens de sortie). Le reste n'a rien coûté.

- **Le calibrage est deux options du binaire** : `--model <alias>` et
  `--effort <low|medium|high|xhigh|max>`.
- **Flux normal** : `system/init`, lignes `assistant` (un même message en plusieurs lignes),
  `rate_limit_event`, puis `result` — `subtype: "success"`, `is_error: false`,
  `terminal_reason: "completed"`, `result: "<dernier message>"`, code de sortie 0.
- **`rate_limit_event`** : `rate_limit_info.status` (`allowed` observé), `rateLimitType`
  (`five_hour`), `resetsAt` en **secondes** depuis l'époque, et `unifiedWindows` (taux des fenêtres
  de 5 h et de 7 jours).
- **Session non connectée** — provoquée sans quota, par un répertoire de configuration vide
  (`CLAUDE_CONFIG_DIR`) : une ligne `assistant` synthétique portant
  `error: "authentication_failed"` et `is_api_error_message: true`, puis un `result` avec
  `is_error: true` et `terminal_reason: "api_error"`, **code de sortie 1**. À noter :
  `subtype` y vaut quand même `"success"` — il ne dit donc rien de la réussite.
- **`claude auth status`** répond en JSON (`loggedIn`, `authMethod`), code 1 si non connecté, sans
  aucun appel au modèle.

**Essai de bout en bout**, après le code : un cook réel (`haiku` / `low`) lancé par la station sur
un dépôt local jetable, avec un faux `gh`. Il a commité en `bypassPermissions`, la station a poussé
sa branche et l'a mise en pass — 14 tours, 25 000 tokens, une minute. Deuxième et dernier appel
réel. Il a aussi montré qu'un cook charge les plugins et les hooks du compte (issue #41).

**Non éprouvé, et dit comme tel** : le flux d'un quota **réellement** épuisé. Le provoquer, c'est
brûler le quota du chef ; je ne l'ai pas fait. La détection s'appuie sur la forme observée pour
l'échec d'authentification, transposée : une ligne `assistant` portant `error: "rate_limit"`, ou un
`rate_limit_event` dont le `status` est `rejected` — les valeurs que documente le type du flux. Le
faux `claude` rejoue cette forme **reconstruite**, pas enregistrée. Le premier vrai 86 laissera son
flux dans `runs/` : c'est lui qu'il faudra comparer, et la recette le dit.

De même, la connexion **expirée** n'a pas été provoquée (il faudrait attendre l'expiration) : le
flux enregistré est celui d'une session **non connectée**, qui emprunte le même chemin d'erreur.

## Modules

| Fichier | Rôle |
|---|---|
| `src/evenements/station.ts` | Les faits de la station |
| `src/projections/stations.ts` | L'état de la station : annonce, connexion, 86 |
| `src/calibrage.ts` | Lire modèle et effort sur les labels d'une issue |
| `src/claude.ts` | L'adaptateur moteur : arguments du binaire, consigne du cook, lecture du flux brut, verdict |
| `src/depot.ts` | Les gestes git : worktree du cook, commits à pousser, push. Injecté dans la station : la plupart de ses tests en donnent un faux, et `depot.test.ts` éprouve le vrai sur des dépôts locaux |
| `src/station.ts` | La boucle : pouvoir servir, prendre, lancer, conclure |
| `src/montrer-station.ts` | `npm run station`, en lecture seule |

Touchés : `evenements/garde-fous.ts` et sa projection (`cook.launched` enrichi),
`evenements/rail.ts`, `alimenter.ts` et la projection du rail (calibrage du ticket ; retour en
attente sur `cook.exited` et `cook.interrupted`), `github.ts` (commenter, ouvrir une PR), `main.ts`,
l'unité systemd, `docs/runtime.md`.

## Faits journalisés

| Fait | Ticket | Charge utile | Auteur |
|---|---|---|---|
| `station.announced` | — | `station`, `engine`, `provides`, `maxCooks` | `station:box/claude` |
| `ticket.86` (existant) | oui | `reason: "no-calibration"` : le refus d'un ticket non calibré | `station:box/claude` |
| `cook.launched` (enrichi) | oui | + `station`, `model`, `effort`, `branch`, `worktree` | `runtime` |
| `cook.reported` | oui | `run`, `ending` (`done`, `failed`, `86`, `disconnected`), `reason`, `summary`, `branch`, `pr` | `station:box/claude` |
| `station.86` | — | `reason`, `until`, `window` (`five_hour`, `seven_day`) | `station:box/claude` |
| `station.disconnected` | — ou oui | `reason`, `run` | `station:box/claude` |

`ticket.arrived` et `ticket.changed` gagnent `model` et `effort` (nuls quand le ticket n'est pas
calibré). Un fait écrit avant #15 ne les porte pas : il se lit comme non calibré.

## La boucle de la station

À chaque réveil du runtime, et dès qu'un cook se termine :

1. **Peut-elle servir ?** Non si un cook tourne (plafond 1), si la cuisine est arrêtée ou le
   disjoncteur ouvert (#16), si le quota est épuisé et son heure de retour pas encore passée, si la
   connexion est tenue pour expirée.
2. **Prendre** : `rail.prendre("box/claude")`. Le bail est renouvelé tant que le cook vit.
3. **Calibrage** : lu sur le ticket. Absent → refus (question 2), et on recommence en 2.
4. **Worktree** : `git fetch origin <base>`, puis
   `git worktree add -b cook/<ticket>-<run> <état>/worktrees/<run> origin/<base>`.
5. **Lancer**, par le lancement gardé de #16 :
   `claude -p <consigne> --output-format stream-json --verbose --model <m> --effort <e>` (plus les
   options de permission, question 3), dans le worktree.
6. **Conclure**, selon la fin lue dans le flux brut et le code de sortie :

| Fin | Reconnue à | Disjoncteur | Rail |
|---|---|---|---|
| **fini** | au moins un commit sur la branche, et la branche poussée — que le cook ait conclu (code 0, `result` sans erreur), soit sorti en erreur, ou ait été arrêté par un garde-fou | réussite | PR ouverte, `ticket.passing` |
| **échoué** | aucun commit (même si le cook dit avoir fini), ou un push impossible | échec | retour en attente (question 5) |
| **86** | `error: "rate_limit"` ou `rate_limit_event` rejeté, et le cook n'a pas conclu | neutre | `ticket.86` jusqu'à `resetsAt`, `station.86` |
| connexion expirée | `error: "authentication_failed"` | neutre | retour en attente, `station.disconnected` |
| « stop » du chef | déjà #16 | neutre | retour en attente, rien n'est récolté |

Un quota épuisé **sans** heure de retour dans le flux : la station s'en donne une, une heure plus
tard, plutôt que de rester 86 jusqu'à ce qu'on la relève à la main.

### Récolte

Deux critères ajoutés à l'issue pendant le développement (retour terrain « idle post-commit ») :
le cook n'a aucun geste de livraison à accomplir, et un cook qui a commité puis s'est arrêté a fini.
La station ne se fie donc pas à ce que le cook annonce : **le worktree fait foi**.

- Des commits, quelle que soit la fin du process — sortie en erreur, flux sans `result`, arrêt par
  inactivité ou par plafond : poussés, et le ticket part en pass. La raison reste lisible
  (`cook.reported.reason` vaut `harvested:<pourquoi>`, et `guard.tripped` est au journal).
- Pour cela `juger` est désormais consulté aussi quand un garde-fou a arrêté le cook : s'il dit
  « ok », la fin est une réussite ; sinon elle reste un arrêt par garde-fou, comme avant.
- **Deux fins ne se récoltent pas.** Le « stop » du chef : il a demandé que tout s'arrête, pas
  qu'une PR s'ouvre. Et le quota épuisé : le critère de l'issue veut que le ticket retourne en
  attente à l'heure du retour du quota.

C'est la pass (#17) qui juge si le travail récolté est complet : la station ne sait que constater
qu'il existe.

**Ce que ce ticket ne fait pas** de la spec de design mise à jour (PR #28) : le bail s'y renouvelle
sur une preuve de travail, l'inactivité s'y mesure sur le worktree. Ici le bail se renouvelle tant
que le cook vit, et l'inactivité reste celle de #16, mesurée sur le flux. C'est l'issue #35.

**Le raccord laissé par #14 et #16.** `cook.exited` — quand l'issue est `failed`, `guard` ou `stop`
— et `cook.interrupted` remettent le ticket pris en attente **dans la projection du rail**, sans fait de
plus : la raison est déjà au journal du ticket (`guard.tripped`, puis `cook.exited`).

**Le worktree reste** après la fin du cook, quelle qu'elle soit : c'est là que la pass (#17) jouera
les gates, et là que le chef regarde quand un cook échoue. Le ménage n'est pas dans ce ticket.

**Une panne entre deux écritures** : chaque étape écrit son résultat avant la suivante. Un runtime
tué après `cook.exited` mais avant `ticket.passing` laisse un ticket pris, sans cook : son bail
échoit, il revient en attente — le rail de #14 fait déjà ce travail.

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `BRIGADE_REPO_DIR` | aucun — refus de démarrer | Un clone du dépôt du projet, réservé à la station. Elle n'y fait que `fetch` et `worktree add` : son arbre de travail n'est jamais modifié |
| `BRIGADE_BASE_BRANCH` | aucun — refus de démarrer | La branche d'intégration : d'où part le worktree, où vise la PR (`v2` pour le pilote) |
| `BRIGADE_CLAUDE_BIN` | `claude` | Le binaire. Sert aux tests ; **jamais posé sur la box** |

## Frontières avec les tickets voisins

- **#17 (pass)** part de `ticket.passing` et de la PR ouverte. Elle seule merge.
- **#18 (CLI d'état)** lit les mêmes projections. `npm run station` est le minimum pour que le
  critère « le chef la voit » ne dépende pas d'elle ; elle pourra l'absorber.
- **Jalon 2** : le manager posera le calibrage. **Jalon 4** : plafond réglable, arbitrage.

## Plan

Chaque étape : le test d'abord, rouge, puis le code.

1. Calibrage : lecture des labels ; `ticket.arrived` / `ticket.changed` le portent ; rejeu.
2. Faits et projection de la station ; rail remis en attente sur `cook.exited` / `cook.interrupted`.
3. Adaptateur `claude` : arguments, verdict sur les flux enregistrés (fini, échec, 86, non connecté).
4. Gestes git : worktree depuis la base, arbre principal intact, push.
5. La station : boucle, plafond 1, refus sans calibrage, les fins, bail renouvelé, redémarrage.
6. GitHub : commentaire et PR par le faux `gh`.
7. `main.ts`, refus de démarrer, unité systemd, `npm run station`.
8. `docs/runtime.md` : la station, la recette du premier cook.

## Questions tranchées — (a) aux sept, le 2026-10-08

Par le chef : 1, 2, 3 et 6. Par le Manager : 4 (c'est un critère de l'issue), 5 et 7.

**1. Où le chef pose-t-il le calibrage sur le ticket ?**
L'issue dit « posé à la main sur le ticket » ; #19 (question 6) demande de ne pas inventer de
format de ticket avant le jalon 2.
- **(a) Deux labels, `model:<opus|sonnet|haiku>` et `effort:<low|medium|high|xhigh|max>`.** Même
  famille que `prio:N`, que le rail lit déjà. Ce sont des valeurs fermées et peu nombreuses — ce
  qu'un label porte bien, l'argument retenu pour l'étiquette de domaine. Deux labels `model:` sur
  un même ticket : ambigu, donc refusé.
- (b) Une ligne balisée dans le corps de l'issue : c'est le format que #19 demande de ne pas
  improviser.
- (c) Une commande du chef qui écrit le calibrage dans le journal : invisible sur GitHub.

**2. Que devient un ticket sans calibrage ?**
- **(a) Il passe 86, motif `no-calibration`, sans heure de retour**, avec un commentaire sur
  l'issue qui dit quoi poser. Le chef le voit dans le rail ; dès que les deux labels sont là, il
  revient en attente tout seul.
- (b) Il reste en attente et la station le saute : rien ne dit au chef pourquoi il ne part pas, et
  le ticket bloque visuellement la tête du rail.

**3. Quelles permissions pour un cook sans personne devant ?**
`claude -p` ne peut répondre à aucune demande de permission : sans réglage, il ne peut ni éditer ni
lancer une commande. Les grants générés sont au jalon 3.
- **(a) `--permission-mode bypassPermissions`, avec une liste d'outils interdits** :
  `gh pr merge`, `git push`, `git merge` vers la base. Le cook édite, teste et commite librement
  dans son worktree ; c'est la station qui pousse (question 4). À savoir : la liste est un
  garde-fou de bonne foi, pas une clôture — un cook décidé la contourne. La clôture, c'est la
  protection de branche (#17) aujourd'hui et le conteneur au jalon 7. La box n'a aucun accès prod.
- (b) `acceptEdits` et une liste blanche de commandes : chaque projet a les siennes (`npm`,
  `pytest`…), et un cook bloqué sur une commande non prévue échoue en silence.
- (c) Les seuls réglages du dépôt (`.claude/settings.json`) : reporte le problème sur chaque projet.

**4. Qui pousse la branche, ouvre la PR et commente le ticket ?**
- **(a) La station, en code.** Le cook commite et termine par son compte-rendu. La station vérifie
  qu'il y a des commits, pousse `cook/<ticket>-<run>`, ouvre la PR vers la base, et poste en
  commentaire le dernier message du cook sous un en-tête : fin, calibrage, tours, tokens, durée,
  branche, PR. Garanti même si le cook oublie — et le commentaire part aussi quand le cook
  **échoue** (avec le motif), pas quand il est 86 (état normal : il se lit dans le rail, un
  commentaire par fenêtre de quota serait du bruit).
- (b) Le cook le fait lui-même, sur consigne : un compte-rendu plus libre, mais rien ne garantit
  qu'il existe, et le cook doit alors avoir le droit de pousser.

**5. Un ticket dont le cook échoue est-il repris tout de suite ?**
- **(a) Oui.** Il revient en attente (c'est le raccord demandé par la qualification), la station le
  reprend avec un cook neuf, et le disjoncteur de #16 borne la série : trois échecs d'affilée, plus
  rien ne part avant « reprendre ». Coût maximal d'un ticket infaisable : trois cooks.
- (b) Il passe 86 jusqu'à ce que le chef le rende : un seul cook perdu, mais une cuisine qui
  s'arrête au premier échec, y compris passager.

**6. Connexion Max expirée : comment le chef l'apprend-il, et comment la station repart-elle ?**
- **(a) Signalée à trois endroits, reprise par « reprendre ».** `station.disconnected` au journal,
  l'état dans `npm run station`, et un commentaire sur le ticket qui l'a subie — le seul canal
  visible hors de la box au jalon 1. Le ticket revient en attente, rien n'est compté au
  disjoncteur, la station ne prend plus rien. Après son `claude /login`, le chef dit « reprendre »
  (la commande de #16). Au démarrage, la station joue aussi `claude auth status` : non connectée,
  elle le dit tout de suite au lieu d'attendre le premier cook.
- (b) Reprise automatique dès que `claude auth status` répond connecté : cette commande ne voit pas
  toujours une session expirée, la station relancerait alors un cook par minute pour rien.

**7. Le calibrage accepte-t-il d'autres modèles que les trois alias ?**
- **(a) Non : `opus`, `sonnet`, `haiku`, les trois que nomme la spec.** Une valeur hors liste est
  un ticket non calibré (question 2). Un alias inconnu passé au binaire donnerait un cook en échec,
  compté au disjoncteur.
- (b) Toute valeur est passée telle quelle à `--model`.
