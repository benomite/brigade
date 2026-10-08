# La pass et le grant `merge` — spec et plan (#17)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — (a) aux huit questions de fin de document
**Issue** : #17 « La pass juge la livraison, et merge sous grant »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§La pass, §Charte de délégation et grants,
§Isolation et secrets), `2026-10-08-runtime-stack.md` (§2, effets en deux temps),
`2026-10-08-station-claude.md` (la station livre : branche poussée, PR ouverte, `ticket.passing`)

---

## Ce que #17 livre

Aujourd'hui un ticket livré reste « en pass », sa PR ouverte, et rien ne le juge. #17 ajoute au
runtime la **pass** : dès qu'un cook a livré, elle joue les gates du projet dans son worktree, lit
la CI de son commit, écrit un verdict, puis décide — merger si le grant `merge` est actif, s'arrêter
en le disant sinon, renvoyer au cook si c'est rouge, remonter au chef après deux renvois.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Gates jouées et CI lue sans le chef | La pass se réveille à chaque livraison (`cook.reported`, fin `done`) et à chaque tick |
| Verdict journalisé avec ce qui l'a produit | Fait `pass.judged` : par juge (gates, CI), son issue, les lignes `FAIL` et la fin de sortie des gates, chaque job de CI avec sa conclusion et son adresse |
| Un grant `merge`, objet du runtime, activé et révoqué à chaud, état visible | Faits `grant.activated` / `grant.revoked`, projection `grants`, commande `npm run grant` |
| Consulté à chaque décision de merge | Lu dans la transaction qui écrit l'intention de merger — jamais gardé en mémoire |
| Grant actif + vert → merge, ticket « servi » | `grant.used`, merge par l'API, `merge.done`, `ticket.served`, issue fermée |
| Grant absent + vert → la pass s'arrête et le dit | `pass.held`, motif `no-grant`, commentaire sur le ticket |
| PR vers la base ; une PR vers `main` refusée | La base de la PR est relue sur GitHub avant tout jugement (question 6) |
| Chaque usage du grant journalisé | `grant.used` : ticket, PR, commit, numéro de séquence du verdict qui l'autorise, horodatage |
| Aucun cook ne merge | Protection de branche — geste du chef, question 7 ; ce que le code garantit et ne garantit pas y est dit |
| Rouge : findings au cook, deux renvois, puis le chef | `pass.returned` (n° du renvoi, findings) ; au troisième verdict rouge, `pass.escalated` |
| Le chef voit les renvois consommés | Projection `pass`, commande `npm run pass` |
| Aucun quota | La pass ne lance ni `claude` ni aucun modèle. Seul un renvoi en consomme : c'est un cook |

## Ce qui a été vérifié avant d'écrire

- Le dépôt `benomite/brigade` est **public**, sa branche par défaut est `main`, et **ni `main` ni
  `v2` ne sont protégées** aujourd'hui (`gh api …/branches/v2/protection` → 404).
- `gh` sur le poste est connecté sous `benomite`, propriétaire du dépôt. Si la box l'est aussi,
  **le cook et la pass ont la même identité GitHub** : voir question 7.
- Le dépôt n'a **aucune CI** (`.github/workflows` absent).
- Les gates du dépôt réclament un worktree **préparé** : sans `worktree-setup.sh`, le contrôle de
  types est « injouable » et les gates sortent rouges. La station ne joue pas ce setup aujourd'hui.

## Le parcours d'une livraison

1. **Retrouver la livraison** : le run, sa branche et son worktree (`cook.launched`), puis la PR,
   relue sur GitHub par sa branche (`pulls?head=<owner>:<branche>`). Absente — son ouverture avait
   échoué — la pass l'ouvre. GitHub injoignable : rien n'est écrit, le tick suivant réessaie.
2. **Refus sans jugement** : la PR ne vise pas la base (question 6) ; le projet n'a pas de gates
   (question 3). Ce ne sont pas des fautes du cook : la pass remonte au chef, sans renvoi.
3. **Gates** : `.claude/brigade/worktree-setup.sh <ticket> <worktree>` s'il existe, puis
   `.claude/brigade/gates.sh <worktree>` — le contrat V1, **le code de sortie est le verdict**. Dans
   le worktree du cook, sous l'environnement d'un cook (ni `BRIGADE_*`, ni jeton). Avant de les
   jouer, la pass vérifie qu'aucun fichier suivi n'y est modifié — sinon les gates jugeraient autre
   chose que ce qui est commité, et c'est un finding. Le commit jugé est le `HEAD` du worktree :
   c'est lui que le merge exigera. Plafond de durée : 30 minutes (`BRIGADE_GATES_TIMEOUT_SECONDS`), au-delà c'est
   rouge.
4. **CI**, seulement si les gates sont vertes : les *check runs* et les statuts du commit jugé.
   - un job en échec → **rouge**, avec son nom, sa conclusion, son adresse ;
   - des jobs en cours → **pas de verdict** : relue au tick suivant (question 4 pour le plafond) ;
   - tous verts → vert ;
   - **aucun check** → cas nommé `none`, ni vert ni rouge : le verdict repose sur les seules gates,
     et il le dit (`ci: none`). Sauf si le worktree porte des workflows (`.github/workflows/*.yml`) :
     des checks sont alors attendus, leur absence est « en cours », pas « aucun ».
5. **Verdict** : `pass.judged`, vert ou rouge. Conflit avec la base (`mergeable: false`) : rouge.
6. **Décision**, dans une seule transaction avec la lecture du grant :

| Verdict | Grant `merge` | Ce que fait la pass |
|---|---|---|
| vert | actif | `grant.used` (l'intention), merge de la PR **sur le commit jugé**, `merge.done`, `ticket.served`, issue fermée, commentaire |
| vert | absent ou révoqué | `pass.held` motif `no-grant`, commentaire « PR ouverte, verte, non mergée : pas de grant » |
| rouge, renvois < 2 | — | `pass.returned`, findings en commentaire, ticket rendu au rail : la station relance un cook dessus (question 2) |
| rouge, 2 renvois déjà consommés | — | `pass.escalated`, ticket 86 motif `pass:returns-exhausted`, commentaire. Rien n'est mergé |

**Le merge est un effet en deux temps.** `grant.used` est écrit *avant* l'appel à GitHub, avec la PR
et le commit ; `merge.done` ou `merge.failed` après. Le merge lui-même exige le commit jugé
(`sha`) : GitHub refuse si la branche a bougé depuis le verdict. Une intention sans résultat —
runtime mort entre les deux — se réconcilie en relisant la PR : mergée, la pass écrit `merge.done`
et sert le ticket ; non mergée, `merge.failed` motif `interrupted`, et la décision est reprise
(grant relu). GitHub refuse de merger deux fois une même PR : jamais deux merges, jamais un merge
sans trace. Un merge **refusé** par GitHub (protection, commit déplacé) ne se retente pas en
boucle : `pass.held`, avec le motif rendu par GitHub.

**Après le merge**, la pass ferme l'issue elle-même (`Closes` n'agit que sur la branche par
défaut) : le ticket est « servi », puis quitte le rail au sondage suivant.

**Un ticket que la pass a arrêté** (`held`, `escalated`) reste surveillé : à chaque tick sa PR est
relue, et si le chef l'a mergée à la main, la pass écrit `merge.done` (auteur du merge : hors
runtime), sert le ticket et ferme l'issue. C'est la sortie normale d'un ticket vert sans grant.

## Le grant `merge`

Le strict nécessaire : exister, être consulté, être révocable, être journalisé.

- Deux faits écrits par la CLI, auteur `chef` : `grant.activated` et `grant.revoked`, charge
  `{ action: "merge" }`. Un troisième écrit par la pass : `grant.used`.
- La portée est le projet (un journal par projet) et la base configurée. Ni durée, ni compteur.
- **Absent par défaut** : un runtime neuf ne merge rien.
- La pass le lit dans la base au moment de décider : une révocation vaut dès la décision suivante,
  sans redémarrage. Une révocation qui arrive *après* `grant.used` n'annule pas le merge en cours.

```
npm --prefix runtime run grant                    l'état du grant, depuis quand, et ses dix derniers usages
npm --prefix runtime run grant -- activer merge
npm --prefix runtime run grant -- revoquer merge
npm --prefix runtime run pass                     les tickets en pass : phase, verdict, renvois n/2, PR
npm --prefix runtime run pass -- <ticket>         l'histoire d'un ticket : chaque verdict et ce qui l'a produit
```

« Pourquoi ce code est-il sur `v2` ? » : `npm run grant` liste les usages (ticket, PR, commit,
verdict, heure), `npm run pass -- <ticket>` montre le verdict cité.

## Faits journalisés

| Fait | Ticket | Charge utile | Auteur |
|---|---|---|---|
| `grant.activated` / `grant.revoked` | — | `action` | `chef` |
| `pass.started` | oui | `run`, `pr`, `number`, `sha` | `pass` |
| `pass.judged` | oui | `run`, `pr`, `number`, `sha`, `verdict` (`green`, `red`), `gates` (`outcome`, `code`, `failures`, `tail`), `ci` (`outcome` : `green`, `red`, `none`, `skipped` ; `checks`), `findings`, `judgeModified` | `pass` |
| `grant.used` | oui | `action`, `pr`, `number`, `sha`, `base`, `verdict` (n° de séquence du `pass.judged`) | `pass` |
| `merge.done` | oui | `pr`, `sha`, `by` (`pass`, `outside`), `reconciled` | `pass` |
| `merge.failed` | oui | `pr`, `sha`, `reason` | `pass` |
| `pass.held` | oui | `reason` (`no-grant`, `judge-modified`, `merge-refused: …`) | `pass` |
| `pass.returned` | oui | `n` (1 ou 2), `findings` | `pass` |
| `pass.escalated` | oui | `reason` (`returns-exhausted`, `wrong-base`, `no-gates`, `ci-silent`) | `pass` |

`ticket.served` et `ticket.86` existent déjà ; le rail accepte désormais qu'un ticket **en pass**
passe 86 par le runtime. Un ticket rouge revient en attente par `ticket.released`, motif
`pass-red` ; un ticket remonté passe 86, motif `pass:<raison>`.

## Modules

| Fichier | Rôle |
|---|---|
| `src/evenements/pass.ts` | Les faits de la pass et du grant |
| `src/projections/pass.ts` | Par ticket : la livraison, la phase, le dernier verdict, les renvois. Et l'état du grant, ses usages |
| `src/gates.ts` | Jouer setup et gates dans un worktree, sous plafond ; en tirer issue, lignes `FAIL`, fin de sortie. Seul module qui lance les scripts du projet |
| `src/pass.ts` | La boucle : retrouver, juger, décider, merger, réconcilier |
| `src/grant-cli.ts`, `src/montrer-pass.ts` | Les deux commandes |

Touchés : `github.ts` (lire une PR par branche, lire la CI d'un commit, merger, fermer une issue),
`depot.ts` (commit de tête et propreté d'un worktree, fichiers changés depuis la base), `rail.ts`
(86 depuis la pass), `station.ts` (reprise d'un ticket renvoyé : même worktree, même branche,
consigne de renvoi, PR déjà ouverte ; réveil de la pass à la fin d'un cook), `main.ts`,
`docs/runtime.md`. **`claude.ts` n'est pas touché** (dev-41 y travaille) : la consigne de renvoi
vit avec la pass.

## Ce que le développement a précisé

- **La récolte d'un renvoi** (question 8). Sur un renvoi, les commits de la livraison refusée sont
  déjà dans le worktree : la station ne récolte que s'il y a **un commit de plus**. Sans cela un
  cook de renvoi mort au lancement aurait « livré » le même commit, et consommé un renvoi. Un cook
  de renvoi qui *conclut* sans rien commiter repart quand même en pass : il tient le finding pour
  faux, elle rejuge.
- **La branche d'un cook est poussée en force.** Un conflit avec la base se corrige par un rebase,
  qu'un push simple refuserait. La branche `cook/<run>` n'appartient qu'à la station.
- **La pass est réveillée par la station** à la fin de chaque cook, sans attendre le tick. Dans
  l'autre sens — un ticket renvoyé, à reprendre — la station attend le tick : une minute au plus.
- **Un `mergeable` que GitHub n'a pas encore calculé** ne retient pas le verdict : si la branche est
  en conflit, c'est le merge qui sera refusé, et la pass s'arrête (`merge-refused`).
- **La fenêtre laissée par #15** — runtime mort entre `ticket.passing` et `cook.reported` — n'est
  pas refermée : un tel ticket reste en pass sans être jugé. La pass part de `cook.reported`.

## Ce que ce ticket ne fait pas

- **Reviewer, jugement LLM** : jalon 2. Au jalon 1, vert veut dire « les gates et la CI n'ont rien
  trouvé », pas « quelqu'un a relu ».
- **La montée de calibrage au second renvoi** (§La pass) : l'issue ne la demande pas ; les deux
  renvois partent au calibrage du ticket.
- **Branche à jour de la base** : les gates jugent la branche du cook, pas le résultat du merge.
  Un conflit est vu (rouge) ; une régression née de la rencontre de deux merges propres ne l'est
  pas. Avec un seul cook à la fois le risque vient des PR mergées à la main sur `v2` pendant la
  construction. Le resserrer (« branche à jour exigée ») est un réglage de la protection de branche.
- **Le ménage** des worktrees et des branches mergées.
- **PR fermée sans merge par le chef** : le ticket reste en pass ; retirer `fire` le sort du rail.

## Plan

Chaque étape : le test d'abord, rouge, puis le code. Ni réseau, ni vrai merge, ni vrai `claude`.

1. Faits et projection : grant (activé, révoqué, usages), pass (phase, verdict, renvois) ; rejeu.
2. `npm run grant` : état, activer, révoquer — écrit dans le journal d'un runtime qui tourne.
3. `gates.ts` : vert, rouge avec ses lignes `FAIL`, absent, plafond de durée, setup joué avant.
4. `github.ts` : PR par branche, CI d'un commit (verte, rouge, en cours, aucune), merge, fermeture.
5. La pass, verdicts : gates rouges, CI rouge, CI en cours puis verte, aucun check, mauvaise base.
6. La pass, décisions : vert + grant → merge, servi, issue fermée ; vert sans grant → arrêt dit ;
   révocation entre deux livraisons ; `grant.used` avant l'appel.
7. Réconciliation : intention sans résultat, PR mergée ou non ; PR mergée à la main.
8. Renvois : findings au cook dans le même worktree, compteur, troisième rouge → remontée, 86.
9. `npm run pass`, `main.ts`, `docs/runtime.md` (la pass, le grant, la recette du chef).

## Questions au chef

Chacune a une réponse recommandée, **(a)**. « (a) partout » suffit.

**1. Un ticket vert arrêté faute de grant est-il mergé quand le grant est activé ensuite ?**
- **(a) Non.** La décision se prend une fois, au verdict. Activer le grant vaut pour les verdicts
  suivants ; les PR déjà arrêtées, le chef les merge à la main — la pass le voit, sert le ticket et
  ferme l'issue. Raison : sans reviewer, activer un grant ne doit pas faire atterrir d'un coup du
  code jugé sous un autre régime, possiblement des heures plus tôt.
- (b) Oui : à l'activation, toute PR arrêtée pour `no-grant` dont le commit n'a pas bougé est
  mergée. Moins de gestes pour le chef, mais le grant devient rétroactif.

**2. « Les findings repartent au cook qui a livré » : quel cook ?**
Le process du cook est mort quand la pass juge.
- **(a) Un cook neuf, dans le même worktree, sur la même branche, la même PR**, avec une consigne
  de renvoi qui porte les findings (aussi postés en commentaire du ticket). Il retrouve le travail,
  pas la conversation. Le ticket repasse par le rail : la station le reprend à son tour, sous les
  mêmes garde-fous.
- (b) La session du cook reprise (`claude --resume`) : il garde son contexte, mais ce contexte
  entier est relu et repayé, le cache étant froid après des gates ; cela dépend du stockage des
  sessions sur la box, et ne s'éprouve qu'en brûlant du quota.

**3. Un projet sans `gates.sh` : vert, rouge, ou autre ?**
- **(a) Ni l'un ni l'autre : la pass refuse de juger et remonte au chef** (`no-gates`), sans
  renvoi. Sans gates et sans CI, « vert » voudrait dire « personne n'a regardé », et le grant
  mergerait du code jamais jugé.
- (b) Vert si la CI est verte, remontée seulement s'il n'y a ni gates ni CI.

**4. Une CI qui ne répond jamais ?**
- **(a) Trente minutes d'attente au plus** (`BRIGADE_CI_WAIT_SECONDS`), puis remontée au chef
  (`ci-silent`), sans renvoi : ce n'est pas le cook qui la débloquera.
- (b) Attendre sans limite : le ticket reste en pass, visible dans `npm run pass`.

**5. Un cook qui modifie ses propres juges.**
Les gates jouées sont celles **de la branche du cook**. Une livraison qui touche
`.claude/brigade/` ou `.github/workflows/` peut se rendre verte elle-même, et sans reviewer rien ne
le verrait.
- **(a) Une telle livraison n'est jamais mergée par la pass** : verte, elle est arrêtée
  (`pass.held`, motif `judge-modified`) et le chef merge. Les tickets qui font évoluer les gates
  restent possibles, ils demandent un regard.
- (b) Jouer les gates de la base plutôt que celles de la branche : un ticket qui ajoute une gate
  ne serait alors jamais jugé par elle.
- (c) Ne rien faire au jalon 1.

**6. « Une PR qui ciblerait `main` est refusée » : `main` en dur, ou la base configurée ?**
- **(a) La pass refuse toute PR dont la base n'est pas `BRIGADE_BASE_BRANCH`** (`v2` pour le
  pilote) — remontée `wrong-base`. `main` est donc refusée ici, sans être écrite en dur : un projet
  dont la base *est* `main` restera servable le jour venu.
- (b) En plus, refus de merger sur la branche par défaut du dépôt, quelle que soit la
  configuration, tant que le jalon 1 dure.

**7. La protection de branche de `v2` — ton geste, pas le mien.**
Ce qu'il faut savoir avant de choisir : sur la box, cook et pass passent par le même `gh`, donc la
même identité. **Aucune protection de branche ne peut alors distinguer l'un de l'autre** : elle
peut interdire le push direct sur `v2`, pas réserver le merge à la pass. La garantie dure viendra
avec la GitHub App (jalon 7, tokens limités par rôle) ; d'ici là, ce qui retient un cook de
`gh pr merge` est la liste d'outils interdits de #15, de bonne foi.
- **(a) Protéger `v2` : PR obligatoire, zéro approbation requise, administrateurs inclus.** Plus
  aucun push direct, y compris par un cook ou par erreur ; les merges de PR — ceux de la pass, les
  tiens, ceux du Manager V1 — passent. Je te donne la commande dans la recette ; tu la joues.
  ⚠️ À vérifier de ton côté : rien dans la construction de la V2 ne pousse directement sur `v2`.
- (b) Ne rien protéger au jalon 1 et l'écrire comme limite connue.

**8. Deux renvois : qu'est-ce qui en consomme un ?**
- **(a) Seul un verdict rouge de la pass.** Un cook de renvoi qui échoue sans rien livrer ne
  consomme pas de renvoi : il revient en attente et c'est le disjoncteur de #16 qui borne. Un
  ticket coûte donc au plus trois verdicts rouges avant de remonter.
- (b) Tout cook relancé sur le ticket compte.
