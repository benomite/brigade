# Le reviewer relit le diff, et juge seul les tickets sans diff — spec et plan (#72)

**Date** : 2026-10-08
**Statut** : livré — les décisions de la première section sont celles de l'issue et de sa
qualification ; les choix de la section « Ce que le dev a tranché » sont contestables en review
**Issue** : #72 « Le reviewer relit le diff, et juge seul les tickets sans diff » (jalon 2)
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§La pass, §Les tickets sans diff — mise
d'accord avec ce ticket par la même PR), `2026-10-08-pass-et-grant-merge.md` (la pass du jalon 1),
`2026-10-08-manager-qualifie-et-calibre.md` (un jugement lancé comme un cook hors ticket — précédent
imité), `2026-10-08-garde-fous.md` (plafonds, disjoncteur, « stop »).

---

## Ce qui était décidé

| # | Décision | Source |
|---|---|---|
| 1 | Après des **gates vertes**, un reviewer relit le diff ; ses findings entrent dans le verdict. | issue |
| 2 | Un finding **bloquant** rend la pass rouge, gates vertes ou non, et consomme un renvoi comme une gate rouge — même limite de deux. | issue, qualification |
| 3 | Le reviewer est **obligatoire sur un ticket sans diff** : jamais « servi » sans relecture. La spec V2 disait l'inverse ; c'est ce ticket qui fait foi. | issue (décision du 2026-10-08, PR #44) |
| 4 | Ce n'est pas le cook qui se relit. En V2, un autre Claude ; un autre moteur est au parking. | issue |
| 5 | Le chef lit ce que le reviewer a dit sur l'issue ou la PR, sans ouvrir le journal. | issue |
| 6 | Son calibrage est explicite, sans défaut, posé par configuration du runtime — refus de démarrer s'il manque —, et au journal. | issue, qualification |
| 7 | Le verdict dit ce qui l'a produit : quelle gate, quel job de CI, quel finding. | issue |
| 8 | `judge-modified` reste : un reviewer vert ne lève rien. Une sortie illisible n'est **ni verte ni rouge** : elle remonte. | qualification |

## Ce que le dev a tranché

| # | Choix | Pourquoi |
|---|---|---|
| a | **Le reviewer passe avant la lecture de la CI**, pas après. Un constat bloquant n'attend pas une CI encore en cours. | La CI conclut pendant la relecture, et un cook renvoyé repart avec tout ce qui a été trouvé — un renvoi coûte un cook entier, une relecture bien moins. Prix : une relecture payée sur une livraison que la CI aurait rougie seule. |
| b | **Pas de relecture sans gates vertes** : gates rouges, worktree sale, conflit avec la base. | Le cook reviendra de toute façon avec un autre commit, qui sera relu. |
| c | **Un ticket sans diff se reconnaît au worktree** : le cook a conclu, laissé un compte-rendu, et n'a rien commité. Rien ne le déclare d'avance. | La spec : « un cook non-code est un cook dont le diff est vide ». Conséquence : un cook qui ne commite rien sur un ticket de code part en pass comme tel, et c'est le reviewer qui dit que le ticket n'est pas rempli — au lieu de l'ancien échec `no-commit`, qui relançait un cook sans rien lui dire. Sans commit **ni** compte-rendu, c'est toujours un échec. |
| d | **Vert et sans diff : servi sans merge, sans grant, issue fermée** (`pass.served`). | Le grant couvre un merge ; il n'y a rien à merger. Le livrable reste sur l'issue. |
| e | **Trois outils de lecture** (`Read`, `Grep`, `Glob`), dans le worktree de la livraison ; le diff est dans la consigne, coupé à 40 000 caractères. | « Sans droit d'écriture » par construction, sans shell. Le plafond tient la consigne dans un argument de commande (128 Ko sous Linux) ; au-delà, il lit les fichiers livrés. |
| f | **La réponse est un objet JSON** : `verdict` (`vert`/`rouge`), `resume`, `constats[]` (`gravite` : `bloquant`/`remarque`, `fichier`, `constat`). Le verdict est redondant avec les constats, exprès : s'ils se contredisent, la réponse est illisible. | Rien n'est deviné. |
| g | **Une relecture par livraison** — le run du cook et son commit —, au journal (`pass.reviewed`). | Elle coûte du quota : ni une CI lente ni un redémarrage ne doivent la refaire. Les gates, gratuites, restent un cache en mémoire. |
| h | **Lancée comme un jugement du manager** : `cook.launched` hors ticket, station `reviewer`, run `review-<ticket>-…`, sous garde-fous ; elle n'a pas lieu sous « stop », disjoncteur, quota ou déconnexion. | Précédent #69. Hors ticket parce que le ticket a déjà son cook : c'est `pass.reviewed` qui rattache la relecture à sa livraison. |
| i | **Seuls les constats bloquants repartent au cook** ; les remarques restent sur l'issue. | Un cook de renvoi « corrige ce que la pass a trouvé, et rien d'autre ». |
| j | **Le reviewer lit le ticket** (corps, commentaires de confiance hors ceux de la brigade) **et le compte-rendu du cook**, comme des données. | Relire un diff sans savoir ce qui était demandé ne dit pas s'il le fait. |
| k | Variables : `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`. | Le patron de `BRIGADE_MANAGER_*`. |

## Plan

1. `runtime/src/reviewer.ts` — sans E/S : configuration, arguments de `claude`, consigne, lecture de
   la réponse.
2. `evenements/pass.ts`, `projections/pass.ts` — `pass.reviewed`, `pass.served`, `review` et
   `noDiff` dans `pass.judged`, la phase `served`, le motif `review-unreadable`.
3. `pass.ts` — la relecture après des gates vertes ; le jugement d'un ticket sans diff ; servir
   sans merge.
4. `station.ts` — un cook qui conclut sans commit, avec un compte-rendu, part en pass (`no-diff`),
   sans push ni PR.
5. `depot.ts` (`diff`), `github.ts` (le corps d'une issue), `main.ts` et l'unité systemd (les deux
   variables), `montrer-pass.ts` (ce que le chef lit).
6. `docs/runtime.md`, et la spec V2 mise d'accord.

## Hors scope

Un reviewer d'un autre moteur. Le lot de tickets mergé d'un bloc. Le manager (#69) : la pass reste
un outil du runtime, sans lui. Déclarer d'avance qu'un ticket est sans diff.
