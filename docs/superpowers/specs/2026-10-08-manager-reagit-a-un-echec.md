# Le manager réagit à un échec au lieu de le remonter

Issue #74 — épique #75 (jalon 2). Spec de référence : `2026-10-08-brigade-v2-design.md`, §Le
manager (« réagit aux échecs : redécoupe, change de cook profile, remonte au second ») et §La pass
(« les deux renvois ne sont pas deux tentatives identiques »).

## Le problème

La pass renvoie deux fois les findings à un cook, au même calibrage, puis remonte au chef
(`returns-exhausted`). Personne ne décide rien : un manager qui ne sait que remonter est un
aiguillage.

## Décisions (validées le 2026-10-08)

1. **Un jugement LLM choisit**, le code tient les invariants. Passé les deux renvois, le manager
   demande à son LLM — un appel, au calibrage `BRIGADE_MANAGER_*`, sans outil — de choisir entre
   **monter** le calibrage, **redécouper** le ticket, ou **remonter** au chef. Une réponse
   illisible, ou un choix impossible (monter au plafond, redécouper un ticket déjà né d'un
   redécoupage), vaut remontée.
2. **Le plafond de calibrage** est une configuration du projet : `BRIGADE_CEILING_MODEL` et
   `BRIGADE_CEILING_EFFORT`, facultatives, **sans défaut**. Une dimension sans plafond ne monte
   jamais ; le manager le dit.
3. **Monter d'un cran** : l'effort d'abord (`low < medium < high < xhigh < max`), puis le modèle
   (`haiku < sonnet < opus`) en gardant l'effort atteint. Le plafond du chef fait foi, `xhigh` et
   `max` compris.
4. **Le geste du chef est plus fort.** Le manager ne remplace qu'un label de calibrage qu'il a posé
   lui-même (qualification, découpage, ou montée précédente) : il retire le sien et pose le
   suivant. Une dimension posée par le chef n'est jamais touchée.
5. **Manager éteint** : la pass se comporte comme avant — deux renvois au même calibrage, puis
   `returns-exhausted`.
6. **Redécouper** : le ticket devient l'épique de ses sous-tickets (machinerie du découpage
   réutilisée). Il passe 86 (`manager:split`), sa PR reste ouverte, et **il ne tient plus de
   zone** : ses sous-tickets, qui la recouvrent, partent. Un ticket né d'un tel redécoupage ne se
   redécoupe pas (profondeur 1).
7. **Le disjoncteur garde le dernier mot.** Une livraison jugée rouge, quand elle vient d'une
   relance décidée par le manager, compte comme un échec ; le cook qui l'a livrée ne remet pas le
   compteur à zéro. Disjoncteur ouvert, le manager ne relance plus rien : il remonte. Pas de
   compteur de réactions par ticket — plafond et profondeur 1 rendent la suite finie.

## Le parcours d'un ticket rouge, manager allumé

| Pass rouge n° | Ce qui se passe | Qui |
|---|---|---|
| 1 | renvoi 1/2, même calibrage | la pass, comme avant |
| 2 | la pass **passe la main** (`pass.deferred`) ; le manager monte d'un cran s'il le peut, puis renvoie 2/2 — sinon renvoie au même calibrage en disant pourquoi | code, sans LLM |
| 3 et suivantes | la pass passe la main ; le manager **choisit** : monter, redécouper, remonter | un jugement LLM |

La pass ne rend plus le ticket au rail elle-même à partir du second rouge : la station le
reprendrait avant que le calibrage ait changé. Le manager change les labels, **attend que le rail
ait lu le nouveau calibrage**, puis rend le ticket (`pass.returned`). Un ticket ne repart donc
jamais à l'identique : soit son calibrage a changé, soit il est redécoupé, soit il est remonté. La
seule exception est le second renvoi quand rien ne peut monter — c'est la règle des deux renvois,
et elle est dite.

## Faits au journal

- `pass.deferred` — la pass passe la main au manager (phase `deferred`).
- `manager.reacted` — `{ verdict, returns, choice: retry | raise | split | escalate, reason,
  proposal, run, from, to }`. C'est par lui que le chef lit « pourquoi ce ticket a-t-il été
  découpé ? ». `run` : le jugement, nul quand le code a tranché seul.
- `manager.raised` — `{ added, removed }` : les labels changés, écrit une fois GitHub servi.
- `manager.reaction-commented` — la réaction est dite sur l'issue.
- `pass.escalated` gagne deux motifs : `manager-split`, `manager-escalated`.
- `relaunch.judged` — `{ run, verdict }` : le verdict de la pass sur une relance du manager, lu par
  le disjoncteur. `cook.launched` porte `relaunch: true` pour un tel cook.

## Ce que le chef reçoit quand le manager remonte

Un commentaire sur l'issue : chaque tentative (calibrage, ce que la pass a trouvé), ce qui a échoué
en dernier, et ce que le manager propose.

## Plan

1. `reagir.ts` (pur) — échelles, plafond, `monter`, consigne et lecture de la réaction.
2. Garde-fous — `relaunch` sur `cook.launched`, `relaunch.judged`, `jugerRelance`.
3. Rail — un 86 `manager:split` ne tient pas de zone.
4. Projections — phase `deferred` de la pass ; `reactions`.
5. Pass — passe la main au manager allumé ; station : marque les relances.
6. GitHub — retirer un label.
7. `reaction.ts` — la boucle de réaction, branchée dans le manager ; `redecouper` dans le découpage.
8. `main.ts`, `docs/runtime.md`.

Chaque étape : le test d'abord, vu rouge, puis le code.

## Hors scope

Les cook profiles (jalon 8) : « changer de profil » se réduit ici à changer de calibrage. Le cook
qui rend la main en demandant lui-même la montée (§La pass) n'est pas traité ici.
