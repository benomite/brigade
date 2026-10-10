# Un grant porte une échéance, et s'éteint seul — spec (#256)

**Date** : 2026-10-10
**Statut** : décidé par le Manager, **à valider par le PO après coup** — les six décisions produit
ci-dessous sont les recommandations du dev (`question-spec #256` du 2026-10-10), retenues telles
quelles par l'orchestrateur le même jour, sans le PO ; « Ce que le dev a tranché » est contestable
en review
**Issue** : #256 « Un grant porte une échéance, et s'éteint seul » (jalon 3, épique #254)
**S'appuie sur** : `2026-10-08-pass-et-grant-merge.md` (le grant comme faits au journal, l'intention
`grant.used` écrite avant le merge, la réconciliation au réveil).

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Le grant `merge` » et le bloc
`grant` de `status` : c'est la doc vivante, ce document ne la recopie pas.

---

## Ce qui était vrai avant de coder

Établi à la lecture de `runtime/src/grant-cli.ts`, `pass.ts` (`decider`) et `projections/pass.ts` :

- Le grant est une ligne de la table `grants` (`action`, `active`, `since`, `by`), projetée de deux
  faits : `grant.activated` et `grant.revoked`. Rien n'y porte de fin.
- La pass lit `grantActif` **dans la transaction** qui écrit l'intention de merger (`grant.used`),
  et une seconde fois au retour de la rencontre avec la base (`decider` se rappelle lui-même) :
  « à la décision suivante » est donc déjà le seul endroit où le grant compte.
- `grant.used` est l'**intention**, pas l'usage : le résultat s'écrit ensuite (`merge.done`,
  `merge.failed`) et se range sur la ligne de `grant_uses` restée sans `outcome`.
- La pass reçoit son horloge (`options.maintenant`), le journal la sienne : aucun test n'a besoin
  d'attendre.
- `grant` et `status` ouvrent le journal **en lecture seule** : ils ne peuvent rien y écrire, et ne
  doivent pas le pouvoir.
- `status` ne dit rien du grant aujourd'hui.

## Décisions prises sans le PO

Les six sont à relire d'un bloc par le PO : aucune n'était écrite dans l'issue.

1. **La forme de l'échéance.** Trois options, sur `activer` comme sur `prolonger` :
   `--jusqu-a <date ou heure>` (`2026-10-12T18:00`, `2026-10-12` = fin de cette journée, `18h30` =
   aujourd'hui, heure locale de la machine), `--pour <durée>` (`4h`, `2j`, `30min` — traduite en
   date à l'écriture), `--usages <n>`. Une heure déjà passée aujourd'hui est **refusée**, pas
   reportée au lendemain. Sans option : sans échéance, comme aujourd'hui.
2. **Date et usages ensemble** : permis. Le premier atteint éteint, et le fait d'extinction dit
   lequel.
3. **`prolonger`** ne vaut que sur un grant actif. `--jusqu-a` / `--pour` posent une nouvelle
   échéance (`--pour 2h` : deux heures à partir de maintenant) ; `--usages N` ajoute N aux usages
   restants ; `--sans-echeance` la lève. Une date plus proche que l'actuelle est refusée :
   raccourcir, c'est révoquer. `activer` sur un grant déjà actif n'écrit rien et renvoie à
   `prolonger`.
4. **Le décompte.** Une intention de merge sans résultat **réserve** un usage ; refusée par GitHub,
   elle le rend ; mergée, elle le consomme. Un merge fait à la main par le chef ne consomme rien ;
   un merge de la pass réconcilié après un arrêt consomme. **Précisé en revue de la PR #274** :
   ce qui consomme est une intention de la pass conclue par un merge, quel que soit le compte que
   GitHub nomme — une PR trouvée mergée alors qu'une intention était en vol consomme, même si le
   merge se lit `outside`. « À la main » s'entend donc : sans intention de la pass.
5. **Après l'extinction.** `status` garde une ligne tant que l'état du grant est « éteint seul », et
   se tait pour un grant absent ou révoqué. Une livraison verte arrivée après garde le motif
   `no-grant` au journal ; son commentaire d'issue et sa ligne de file disent que le grant s'est
   éteint, et quand.
6. **« Bientôt éteint ».** À moins d'une heure de l'échéance, ou quand il ne reste qu'un usage.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Accorder avec une échéance ; sans échéance reste possible | `activer merge [--jusqu-a … \| --pour …] [--usages n]` ; `grant.activated` porte `until` et `uses` |
| S'éteint seul, à la décision suivante | L'état effectif se calcule à l'heure de la lecture ; la pass le lit dans sa transaction de décision |
| Extinction écrite, distincte d'une révocation | `grant.expired`, avec sa cause ; `ÉTEINT SEUL` contre `RÉVOQUÉ` |
| `grant` affiche ce qu'il reste | `direGrant`, sur l'état effectif : le temps, les usages, ou « sans échéance » |
| Décompte sur l'usage | Les usages restants se comptent sur le `merge.done` de la pass, pas sur `grant.used` |
| Prolonger sans révoquer, l'historique le dit | `grant.extended` ; « derniers gestes » de `grant` |
| `status` le dit sans qu'on le demande | Le bloc `grant` de l'en-tête ; `BIENTÔT ÉTEINT` à moins d'une heure ou au dernier usage |
| Expiré runtime arrêté : expiré au redémarrage | L'état effectif ne dépend pas d'un fait écrit ; la pass écrit `grant.expired` avant toute décision |

## Ce que le dev a tranché

- **Trois faits, aucun état à côté.**
  - `grant.activated` : `{ action, until?, uses? }` — un fait d'avant ce ticket, sans ces champs,
    se lit « sans échéance ». Une limite écrite mais illisible ne fait pas un grant sans fin : elle
    est déjà atteinte.
  - `grant.extended` : `{ action, until?: string | null, uses?: number | null }` — `uses` est ce
    qui **s'ajoute** ; nuls, la limite est levée ; absents, elle ne change pas. Sans effet sur un
    grant qui n'est pas actif.
  - `grant.expired` : `{ action, cause: "until" | "uses", since }` — `since` est l'échéance réelle,
    pas l'heure où quelqu'un l'a constatée ; pour un grant à usages, l'instant du dernier merge.
- **L'extinction est un état calculé avant d'être un fait écrit.** `etatDuGrant(base, action,
  maintenant)` rend l'état **effectif**, et prend l'heure en argument obligatoire : aucun lecteur
  ne peut l'oublier. Un grant dont l'échéance est passée est éteint pour tous, que `grant.expired`
  soit au journal ou non (`unrecorded`). La sûreté ne tient donc à aucune écriture.
- **Qui écrit `grant.expired`.** La pass, en tête de chaque passage (donc au démarrage, avant toute
  décision, et au plus tard au tick) et dans la transaction qui écrit un `merge.done`. Le fait rend
  le grant inactif : le constat suivant ne trouve plus rien, il ne s'écrit qu'une fois. `grant` nu
  et `status` ouvrent le journal en lecture seule et n'écrivent jamais. **Écart avec ce que j'avais
  annoncé au `question-spec`** (« seul le runtime l'écrit ») : les commandes du chef qui écrivent
  déjà (`activer`, `prolonger`, `revoquer`) l'écrivent aussi, dans leur propre transaction, avant
  leur fait — sans quoi un `activer` tapé entre l'échéance et le tick recouvrirait l'extinction, et
  l'histoire ne la dirait jamais. Ce fait-là porte l'auteur `runtime`, pas `chef` : ce n'est pas
  son geste.
- **Les usages.** `uses_left` est une colonne de `grants`, décrémentée par la projection quand un
  merge conclut une intention restée sans résultat, **née sous le grant en cours** (`granted_seq`) :
  un merge voulu sous un grant révoqué depuis ne prend rien à celui qui l'a remplacé. Le champ `by`
  du merge n'y entre pas : sans identité propre, la pass ne sait pas toujours se reconnaître. Les
  réservations ne sont pas stockées : ce sont les lignes de `grant_uses` sans résultat, comptées à
  la lecture.
- **Une intention se conclut toujours** (revue de la PR #274). `merge.done` la consomme,
  `merge.failed` la rend ; un ticket parti du rail la conclut quand la pass lâche sa livraison
  (`pass.abandoned`, qui porte `merged` quand GitHub dit la PR mergée), ou au départ même s'il n'y
  a rien à lâcher ; une PR que GitHub ne connaît plus est traitée comme non mergée. Un refus de
  GitHub sur une PR trouvée mergée n'écrit plus `merge.failed` avant `merge.done` : l'intention se
  conclut sur le merge.
- **Tous les usages restants retenus par des merges en vol** : la décision n'écrit rien — ni fait,
  ni commentaire ; journald le dit une fois par livraison — et se reprend au réveil suivant, la livraison restant verte. Pas de nouveau
  motif d'attente : l'état dure le temps d'une réconciliation, un tick au plus.
- **Le motif d'arrêt ne change pas** (`no-grant`) : `pass.held` porte en plus `expired`, l'instant
  de l'extinction, rangé dans une colonne de la pass (`grant_expired`). C'est lui que lisent le
  commentaire d'issue, la file de `status` et `pass -- <ticket>`. Réaccorder le grant ne réécrit
  pas ces lignes : elles disent ce qui était vrai à l'arrêt.
- **Les dates se lisent en ISO 8601 UTC**, comme partout ailleurs dans le runtime, avec la durée
  restante à côté. Ce que le chef tape (`18h`) est à l'heure de la machine ; ce qu'il relit est
  l'instant UTC et « encore 3 h 31 ». C'est le point le plus discutable du rendu : une heure locale
  à l'affichage serait plus douce, mais ce serait la seule du runtime.
- **`src/grant.ts`** porte tout ce qui se teste en processus avec une heure donnée (l'analyse de
  l'échéance, les gestes, les formulations) ; `src/grant-cli.ts` n'est plus qu'une façade.
- **Les tests** : en processus pour la projection, l'échéance tapée, les gestes, la file et
  `status` ; quatre sur la pass avec sa cuisine ; trois sur la CLI dans un vrai Node (ses
  arguments, ses codes de sortie, sa lecture seule).

## Hors scope

La portée « tous les projets », de nouvelles actions, la charte (#255), l'essai à blanc (#258), les
plafonds durs (#259), la durée par défaut d'un `merge` (question ouverte n° 3 de l'épique : le
défaut reste « sans échéance »).
