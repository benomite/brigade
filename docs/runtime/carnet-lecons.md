## Le carnet des leçons

Après chaque **ticket servi**, le cook qui l'a livré laisse sa **rétro** : au plus trois leçons,
chacune proposée (`propose <leçon>`) ou reconfirmée par son id (`reconfirm L4`). Le **journal** du
projet les garde toutes — ce sont les **leçons provisoires**, que rien ne valide. Celles qui ont
fait leurs preuves entrent dans le dépôt du projet, dans le **carnet** ; celles qui ne sont plus
vraies en sortent. Le runtime le décide seul, de l'histoire des rétros, et le livre par une PR qui
passe par **la pass** comme une **livraison** : **elle ne t'attend pas.**

Le carnet a donc deux étages :

| Étage | Où | Ce qu'il tient |
|---|---|---|
| provisoire | le journal du runtime (`retro.recorded`) | toutes les leçons des rétros, avec leur id (`L1`, `L2`…) — stable : le journal n'est qu'en ajout |
| carnet | `.claude/brigade/carnet.md`, dans le dépôt du projet, sur la branche d'intégration | les leçons **promues**, et la trace de celles qui sont **sorties** (expirées ou retirées) |

Une leçon qui n'est pas dans le carnet est provisoire. Ce que le projet a appris — provisoire et
promu — se lit dans `faits` (`apprentissage`, voir [`etat-et-mesures.md`](etat-et-mesures.md)).

### Ce que reçoit un cook

Le cook lancé sur un ticket — premier cook, reprise d'un travail conservé, renvoi de la pass, d'ici
ou d'une station distante — reçoit dans sa consigne les **leçons provisoires de son projet**, et
d'aucun autre : chacune avec son id, la plus récente d'abord (récente par la rétro qui l'a
proposée). Une leçon que le carnet de la branche d'intégration tient — promue, ou sortie — n'est
plus provisoire : elle n'est pas reçue. Un carnet illisible n'en retire aucune. Le module est
`runtime/src/apprentissage/injection.ts`.

Il en reçoit **au plus 20**, les plus récentes : un réglage du projet, pour que le contexte de
chaque cook ne grossisse pas sans fin. `BRIGADE_INJECTED_LESSONS` dans le drop-in de son unité,
comme les seuils plus bas ; `0` les coupe. Un entier mal écrit fait refuser le démarrage en nommant
la variable ; `seuils-cli.ts` le montre avec les seuils.

Le journal dit ce qu'il a reçu : `lessons` de son `cook.launched`, les ids, dans l'ordre de sa
consigne — `[]` s'il n'en a reçu aucune. Sans leçon, sa consigne est celle d'avant.

### Le format du carnet

Lisible à la main, un bloc par leçon, triés par id :

```
# Carnet des leçons

## L1
- état: promoted
- texte: Lancer les tests du runtime avant de commiter.
- entrée: 2026-10-01
- rétros: retro-12, retro-15, retro-19

## L2
- état: expired
- texte: Relire la fiche avant d'écrire.
- entrée: 2026-10-02
- rétros: retro-13
- sortie: 2026-12-01
- raison: expiry
```

`état` vaut `promoted`, `expired` (sortie `raison: expiry`) ou `retired` (sortie `raison: manual`).
`entrée` est le jour de sa promotion, `rétros` celles qui l'ont proposée ou reconfirmée (la
référence d'une rétro au journal). **Une leçon sortie n'est jamais effacée du fichier** : elle garde
son id, sa date et sa raison de sortie. Le format est dans `runtime/src/carnet/carnet.ts` ; un
fichier qu'il ne comprend pas n'est pas réécrit (voir plus bas).

### Les trois seuils

Le temps se compte en **tickets servis**, pas en jours : chaque ticket servi écrit une rétro, vide
ou non.

| Seuil | Défaut | Variable |
|---|---|---|
| **Promotion** : une leçon provisoire entre au carnet quand autant de rétros, de **tickets différents**, la citent — la proposer compte. Deux rétros d'un même ticket comptent pour une | **3** rétros | `BRIGADE_PROMOTION_RETROS` |
| **Rétrogradation** : une leçon promue qu'aucune rétro ne reconfirme pendant autant de tickets servis redevient provisoire. Ses citations d'avant ne comptent plus pour la repromouvoir | **20** tickets servis | `BRIGADE_PROMOTED_EXPIRY_TICKETS` |
| **Disparition** : une leçon provisoire qu'aucune rétro ne reconfirme pendant autant de tickets servis — depuis sa dernière citation, ou depuis sa rétrogradation — disparaît. Si elle avait été promue, sa sortie entre au carnet, `état: expired` | **20** tickets servis | `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` |

**Les changer, pour un projet** : ce sont des variables de l'unité du projet, dans le drop-in de
son instance (`/etc/systemd/system/brigade@<projet>.service.d/projet.conf`, voir
[`installer.md`](../installer.md)) — chaque projet a donc les siens :

```
[Service]
Environment=BRIGADE_PROMOTION_RETROS=4
```

puis `sudo systemctl daemon-reload && sudo systemctl restart brigade@<projet>`. Lus au démarrage :
un entier mal écrit, ou zéro, fait refuser le démarrage en nommant la variable, jamais un repli sur
le défaut. Pour lire ceux qui sont en vigueur, avec l'environnement de l'unité :
`node runtime/src/seuils/seuils-cli.ts`.

### La promotion et la péremption, livrées par une PR

Le module est `runtime/src/promotion/` ; la décision elle-même, `runtime/src/peremption/`.

1. **Quand.** À chaque ticket servi de plus, et à chaque PR du carnet conclue (mergée ou fermée),
   le runtime rejuge l'histoire des rétros. Rien d'autre ne change une décision.
2. **Sur quoi.** Sur le carnet de la branche d'intégration, d'abord tel que le clone de la station
   le porte ; s'il trouve un changement, il prépare une branche comme celle d'un cook — la base
   rapatriée — et rejuge sur le carnet de cette base. **Sans décision, rien ne part** : ni branche,
   ni PR.
3. **Une PR du carnet à la fois.** Tant que la dernière n'est ni mergée ni fermée, aucune autre ne
   part : le carnet de la base ne dit pas encore ce qu'elle décide.
4. **La PR.** Une branche qui ne porte **que** `.claude/brigade/carnet.md`, une PR vers la branche
   d'intégration, titrée `Carnet des leçons — promue L4 ; expirée L2`. Son corps dit chaque
   décision et **les rétros qui la justifient** — pour une promotion, celles qui l'ont proposée ou
   reconfirmée, avec leur ticket. Au journal : `carnet.started`, puis `carnet.delivered` (la PR, ses
   décisions, les leçons qu'elle change) ou `carnet.undelivered` (pourquoi elle n'est pas partie).
5. **La pass.** La PR entre en pass **hors du rail**, du même geste que son ouverture
   (`pass.entered`), comme une passe de fermeture ou une correction acceptée : fusion avec la base,
   gates, reviewer — qui la relit comme un changement du carnet —, CI, grant `merge`. **Aucun geste
   de toi n'est attendu.** Le carnet est sous `.claude/brigade/`, avec ce qui juge les livraisons :
   la pass appelle donc aussi son **second juge** (voir [`pass-merge.md`](pass-merge.md)) ; établie
   non affaiblie, elle est mergée sous le grant `merge`, arrêtée sans lui. Rouge, aucun cook ne la
   reprend : elle te remonte, comme toute livraison hors du rail.

Un carnet de la base illisible n'est jamais réécrit : rien ne part, `carnet.undelivered` dit la
ligne fautive, et le jugement repart au ticket servi suivant — corrige le fichier par une PR.
Une livraison morte avec le runtime reprend, au réveil suivant, la PR que GitHub porte pour sa
branche ; sans PR, elle est dite non livrée et le jugement suivant la refait.

### Retirer une leçon promue

Une leçon promue que tu ne veux plus voir se retire **par une PR**, comme toute livraison. Deux
façons, au choix :

**Par un revert** — la leçon est entrée seule, ou tu retires tout ce que sa PR a promu :

1. Sur GitHub, ouvre la PR `Carnet des leçons — promue …` qui l'a promue, et clique **Revert**.
2. Merge la PR de revert sur la branche d'intégration.
3. Au ticket servi suivant, le runtime constate qu'une leçon qu'il avait promue n'est plus dans le
   carnet de la base : il ouvre une PR `Carnet des leçons — retirée L4`, qui l'y inscrit
   `état: retired`, `raison: manual`, datée du jour où il le constate. Elle passe par la pass comme
   les autres.

**Par une édition** — pour retirer une leçon parmi d'autres, ou tout de suite :

1. Sur une branche, dans `.claude/brigade/carnet.md`, change le bloc de la leçon :
   `- état: promoted` devient `- état: retired`, et ajoute sous ses rétros
   `- sortie: <AAAA-MM-JJ>` (le jour du retrait) puis `- raison: manual`. Ne retire pas le bloc.
2. Ouvre la PR vers la branche d'intégration, et merge-la.

Dans les deux cas, la leçon **garde son id**, et le runtime ne compte plus que les rétros écrites
**après** le jour de sa sortie — une rétro du jour même est tenue pour antérieure. Les
reconfirmations d'avant ne la ramènent pas ; il faut que **trois nouvelles rétros** (le seuil de
promotion), de tickets différents, la citent pour qu'une nouvelle PR la repromeuve. Une leçon
expirée revient de la même façon.
