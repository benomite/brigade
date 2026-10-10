# Un grant porte une échéance, et s'éteint seul — spec et plan (#256)

**Date** : 2026-10-10
**Statut** : brouillon — les six décisions produit ci-dessous sont les **recommandations du dev**,
envoyées à l'orchestrateur (`question-spec #256` du 2026-10-10) ; aucun code n'est écrit tant
qu'elles ne sont pas tranchées
**Issue** : #256 « Un grant porte une échéance, et s'éteint seul » (jalon 3, épique #254)
**S'appuie sur** : `2026-10-08-pass-et-grant-merge.md` (le grant comme faits au journal, l'intention
`grant.used` écrite avant le merge, la réconciliation au réveil).

Le comportement, tel que le chef le vit, sera dans `docs/runtime.md`, « Le grant `merge` » et la
section de `status` : c'est la doc vivante, ce document ne la recopie pas.

---

## Ce qui est vrai avant de coder

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

## Les six décisions (recommandations, à trancher)

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
   un merge de la pass réconcilié après un arrêt consomme.
5. **Après l'extinction.** `status` garde une ligne tant que l'état du grant est « éteint seul », et
   se tait pour un grant absent ou révoqué. Une livraison verte arrivée après garde le motif
   `no-grant` au journal ; son commentaire d'issue et sa ligne de file disent que le grant s'est
   éteint, et quand.
6. **« Bientôt éteint ».** À moins d'une heure de l'échéance, ou quand il ne reste qu'un usage.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Accorder avec une échéance ; sans échéance reste possible | `activer merge [--jusqu-a … \| --pour …] [--usages n]` ; `grant.activated` porte `until` et `uses` |
| S'éteint seul, à la décision suivante | L'état effectif se calcule à l'heure de la lecture ; la pass le lit dans sa transaction de décision |
| Extinction écrite, distincte d'une révocation | `grant.expired`, écrit par le runtime, avec sa cause |
| `grant` affiche ce qu'il reste | `montrer`, sur l'état effectif |
| Décompte sur l'usage | Les usages restants se comptent sur `merge.done` de la pass, pas sur `grant.used` |
| Prolonger sans révoquer, l'historique le dit | `grant.extended` |
| `status` le dit sans qu'on le demande | Une ligne `grant` dans l'en-tête de `status` |
| Expiré runtime arrêté : expiré au redémarrage | L'état effectif ne dépend pas d'un fait écrit ; le démarrage écrit `grant.expired` avant toute décision |

## Ce que le dev tranche

- **Trois faits, aucun état à côté.**
  - `grant.activated` : `{ action, until?: string, uses?: number }` — un fait d'avant ce ticket,
    sans ces champs, se lit « sans échéance ».
  - `grant.extended` : `{ action, until?: string | null, uses?: number }` — `until` nul lève
    l'échéance ; `uses` est ce qui s'ajoute. Auteur : le chef.
  - `grant.expired` : `{ action, cause: "until" | "uses", until?: string }` — auteur : le runtime.
    `until` y est l'échéance réelle, pas l'heure où le runtime l'a constatée.
- **L'extinction est un état calculé avant d'être un fait écrit.** `etatDuGrant(base, action,
  maintenant)` rend l'état **effectif** : un grant dont l'échéance est passée est éteint pour tout
  lecteur, que `grant.expired` soit au journal ou non. La sûreté ne tient donc à aucune écriture :
  la pass ne merge pas sous un grant échu même si personne ne l'a encore constaté.
- **Seul le runtime écrit `grant.expired`**, une fois : à son démarrage (avant toute décision), à
  chaque tour de la pass, et dans la transaction de décision de merge. La projection passe alors
  `active` à 0 : le second constat ne trouve plus rien à écrire. `grant` et `status` n'écrivent
  jamais : devant un grant échu que le runtime n'a pas encore constaté, ils disent « éteint »
  et, si aucun runtime ne tourne, que le fait s'écrira à son démarrage.
- **Les usages restants** sont une colonne de `grants` (`uses_left`), décrémentée par la projection
  sur `merge.done` quand il conclut une ligne de `grant_uses` restée sans résultat — c'est-à-dire
  un merge de la pass, pas un merge constaté dehors. Les réservations ne sont pas stockées : ce
  sont les lignes de `grant_uses` sans `outcome`, comptées à la lecture. Le dernier usage consommé,
  le runtime écrit `grant.expired` (cause `uses`) dans la même transaction que `merge.done`.
- **L'analyse de l'échéance tapée** (`--jusqu-a`, `--pour`) est une fonction pure, à part de la CLI,
  éprouvée en processus avec une horloge donnée.
- **Les tests** : projection, analyse de l'échéance, décision de la pass et rendu de `status` en
  processus ; la CLI dans un vrai Node seulement pour ce qui est d'elle (arguments, codes de
  sortie, lecture seule) — la suite est à 135–145 s pour un plafond de 165.

## Plan

1. Faits et projection : `until`, `uses_left`, `grant.extended`, `grant.expired` ; état effectif à
   une heure donnée ; usages restants et réservés. Rejeu d'un journal d'avant ce ticket.
2. Analyse de l'échéance tapée.
3. La pass : état effectif à la décision ; constat écrit au tour, au démarrage, au dernier usage ;
   commentaire d'une livraison arrêtée après extinction.
4. `grant` : `activer` avec échéance, `prolonger`, ce qu'il reste, l'historique des gestes.
5. `status` (et la file, `attend.ts`) : la ligne du grant, « bientôt éteint », « éteint seul ».
6. `docs/runtime.md` : le grant, `status`, la table des faits, la recette.

## Hors scope

La portée « tous les projets », de nouvelles actions, la charte (#255), l'essai à blanc (#258), les
plafonds durs (#259), la durée par défaut d'un `merge` (question ouverte n° 3 de l'épique : le
défaut reste « sans échéance »).
