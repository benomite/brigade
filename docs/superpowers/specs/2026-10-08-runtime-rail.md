# Le rail — spec et plan (#14)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — (a) aux quatre questions de fin de document
**Issue** : #14 « Le rail porte les tickets d'un projet et ne les prête qu'une fois »
**S'appuie sur** : `2026-10-08-runtime-stack.md` (§2 sondage GitHub, §3 « ne prêter qu'une
fois ») et `2026-10-08-runtime-journal.md` (règle d'extension, projections, curseurs). Ce document
ne redécide rien de ce qui y figure. Décisions déjà prises sur #19 : une issue entre sur le rail
par le label **`fire`** ; l'ordre de service est **`prio:` puis ancienneté** ; le lien
`projet → owner/repo` est une configuration que #14 pose.

---

## Ce que #14 livre

Le rail d'un projet : la file de ses tickets, alimentée depuis GitHub, et la primitive qui en
prête un à une station — une seule à la fois. **Aucun cook, aucun appel à `claude`** : #14 ne
lance que `gh`, donc ne consomme aucun quota Max.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Les issues ouvertes apparaissent sur le rail ; une issue fermée en disparaît | Sondage `gh api` au démarrage puis à chaque tick ; l'écart entre GitHub et le rail devient des événements `ticket.arrived` / `ticket.left` |
| Chaque ticket porte un état lisible par le chef | Projection `rail` : une ligne par ticket, avec son état |
| Un ticket pris ne peut pas être pris par une autre station ; le chef voit qui et depuis quand | `prendre` : vérifier et écrire `ticket.taken` dans une seule transaction `BEGIN IMMEDIATE` ; la projection garde la station, l'heure de prise et l'échéance du bail |
| Une station qui meurt : le ticket revient en attente au bout d'un délai, avec la trace | Bail à échéance, que la station renouvelle ; au tick, un bail échu devient `ticket.released` (motif `lease-expired`) |
| Le rail se reconstruit à l'identique après un redémarrage | Le rail est une projection : effacé et rejoué à chaque démarrage. Rien ne vit en mémoire |

## Modules

Selon la règle d'extension de #13 : deux fichiers de domaine, une ligne dans chaque registre.

```
runtime/src/
  evenements/rail.ts     les faits du rail
  evenements.ts          + une ligne (union Fait)
  projections/rail.ts    la table `rail` et ses lectures (le rail trié, un ticket)
  projections.ts         + une ligne (registre)
  rail.ts                les gestes : prendre, renouveler, rendre, envoyer en pass, servir, 86,
                         et relever les baux échus
  github.ts              le sondage : `gh api`, requête conditionnelle, issues → tickets
  alimenter.ts           l'écart GitHub ↔ rail, écrit au journal ; configuration ; branchement sur les réveils
  montrer-rail.ts        `npm run rail` : le rail, en lecture seule
  main.ts                + deux lignes : lire la configuration du rail avant de démarrer, brancher le rail après
```

`runtime.ts` n'est pas modifié : le rail s'abonne par `surReveil`, le mécanisme que #13 a posé
pour cela.

**Un fait du rail illisible est ignoré par la projection** (sans ticket, ou d'une forme que cette
version ne connaît pas) : le journal est en ajout seul et rejoué à chaque démarrage, donc un fait
qui ferait lever la projection empêcherait le runtime de redémarrer, sans qu'on puisse le retirer.

**Raccord laissé à #15** : rendre le ticket quand son cook finit ou est retrouvé interrompu
(`cook.exited`, `cook.interrupted`, posés par #16). #14 livre le geste `rendre` ; ces faits
n'existaient pas encore sur `v2`.

## Les états

| État (chef) | En base | Sens |
|---|---|---|
| **en attente** | `waiting` | sur le rail, à prendre |
| **pris** | `taken` | prêté à une station, sous bail |
| **en pass** | `pass` | le cook a fini ; gates, CI, revue, merge (#17) |
| **servi** | `served` | passé — reste visible sur le rail tant que son issue est ouverte |
| **86** | `86` | pas servable pour l'instant (quota épuisé, station absente) |

```
            prendre                 en pass                servir
en attente ────────► pris ─────────────────► en pass ─────────────► servi
     ▲                 │ bail échu / rendu       │ renvoi (#17)
     ├─────────────────┘◄────────────────────────┘
     │   86 (depuis en attente ou pris)
     └──────── 86 ◄──────
```

#14 pose **tous** les états et les gestes qui y mènent, gardés (on ne sert qu'un ticket en pass,
seule la station qui tient le bail le renouvelle ou l'envoie en pass). Ceux qui les déclenchent
arrivent après : le cook (#15) prend, renouvelle et signale le 86 ; la pass (#17) sert ou renvoie.

**Conséquence à connaître** : un ticket **servi** disparaît du rail quand son issue se ferme.
Sur `v2`, une PR mergée ne ferme pas son issue (`Closes #n` n'agit que sur la branche par
défaut) : un ticket servi y reste affiché « servi » jusqu'à ce que quelqu'un ferme l'issue. C'est
exact, et sans danger — un ticket servi ne se reprend pas.

## Les événements

Noms en anglais, comme ceux de #13. Tous portent le numéro du ticket.

| Type | Auteur | Charge utile | Effet sur le rail |
|---|---|---|---|
| `ticket.arrived` | `github` | `title`, `priority` (1, 2, 3 ou rien), `createdAt`, `url` | nouvelle ligne, en attente |
| `ticket.changed` | `github` | `title`, `priority` | titre ou priorité mis à jour |
| `ticket.left` | `github` | `reason` : `closed` \| `unfired` \| `gone` (issue supprimée) | la ligne disparaît, quel que soit son état |
| `ticket.taken` | `station:<nom>` | `station`, `leaseUntil` | pris |
| `ticket.renewed` | `station:<nom>` | `leaseUntil` | échéance repoussée |
| `ticket.released` | `runtime` ou la station | `reason` : `lease-expired` \| `returned` \| … , `station` | retour en attente |
| `ticket.passing` | `station:<nom>` | — | en pass, bail clos |
| `ticket.served` | `runtime` | — | servi |
| `ticket.86` | `runtime` ou la station | `reason`, `until` (heure de retour, ou rien) | 86, bail clos |

**Le temps n'entre jamais dans la projection.** Un bail échu ne rend pas le ticket tout seul :
c'est un événement `ticket.released`, écrit par le runtime, qui le rend. Sans cela, rejouer le
journal à une autre heure donnerait un autre rail. `prendre` relève les baux échus dans sa propre
transaction, avant de choisir : un ticket n'attend donc jamais le tick pour redevenir prenable.

## Alimenter le rail depuis GitHub

- **Source** : `gh api repos/<owner>/<repo>/issues?labels=fire&state=open`, les PR écartées.
  `gh` porte l'authentification ; le runtime ne lit aucun jeton.
- **Requête conditionnelle** : l'`ETag` de la dernière réponse est renvoyé en `If-None-Match` ;
  un `304` ne coûte rien au quota de l'API et ne produit aucun événement (éprouvé le 2026-10-08
  avec `gh` 2.100 : `gh api -i` sort en code 1 avec `HTTP/2.0 304` en tête). L'`ETag` est un
  cache en mémoire : le perdre coûte une requête pleine, pas un état. Au-delà d'une page de
  100 tickets, le sondage redevient inconditionnel — un changement en page 2 ne se verrait pas
  dans l'`ETag` de la page 1.
- **Écart, pas flux** : chaque sondage compare la liste de GitHub au rail et écrit ce qui
  diffère. Un sondage manqué (réseau, box éteinte) se rattrape au suivant, sans rien rejouer.
  Pour un ticket qui n'est plus dans la liste, une requête sur l'issue dit s'il est fermé
  (`closed`) ou a perdu son label (`unfired`).
- **Clé unique** : `github:<owner>/<repo>#<n>:<type du fait>:<updated_at de l'issue>`. Deux sondages du
  même changement — ou, plus tard, le sondage et le webhook — n'écrivent qu'une ligne.
- **Ordre de service** : `prio:1`, `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
  égale, la plus ancienne d'abord (date de création de l'issue).
- **`gh` en panne** (réseau, authentification expirée) : le rail reste tel quel, l'échec
  s'imprime sur la sortie d'erreur (journald). Il n'entre pas au journal : une ligne par minute de
  panne n'y raconterait rien.
- **Doublure de test** : `BRIGADE_GH_BIN` surcharge le binaire, comme `BRIGADE_CLAUDE_BIN`. Les
  tests de l'écart injectent directement une liste d'issues ; un seul test passe par un faux `gh`.
  Aucun test ne touche le réseau.

## Prêter une seule fois

`prendre(station)` rend le premier ticket en attente dans l'ordre de service, ou rien. Dans une
seule transaction `BEGIN IMMEDIATE` : relever les baux échus, lire le premier ticket en attente,
écrire `ticket.taken`. Deux preneurs se suivent, ils ne se croisent pas ; le second lit un rail
où le ticket est déjà pris.

Test qui le prouve : deux vrais process, chacun sa connexion, se jettent sur un rail d'un seul
ticket ; un seul l'obtient, le journal ne porte qu'un `ticket.taken`. Le même test avec N
tickets et deux preneurs : aucun ticket pris deux fois.

## Configuration

Une troisième variable, **obligatoire, sans défaut** : `BRIGADE_GITHUB_REPO=<owner>/<repo>`.
Absente ou mal formée, le runtime refuse de démarrer (code 2) et la nomme. Sur la box, elle se
pose par projet dans un drop-in de l'instance (`systemctl edit brigade@<projet>`) — le gabarit
d'unité ne peut pas la deviner.

Nouveau point de la liste « à vérifier avant d'installer » : `gh` est installé sur la box et
connecté sous le compte du service (`gh auth status`).

## Plan

Chaque étape en TDD. La suite reste de l'ordre de la seconde.

1. `evenements/rail.ts`, `projections/rail.ts` : arrivée, changement, départ, ordre de service ;
   l'histoire du test de rejeu de #13 s'enrichit des faits du rail.
2. `rail.ts` : prendre (ordre, un seul preneur), renouveler, rendre, bail échu relevé, gardes des
   transitions vers en pass, servi, 86.
3. Deux preneurs concurrents, sur de vrais process.
4. `github.ts` : lecture d'une réponse `gh api`, `304`, PR écartées, pagination, faux `gh`.
5. `alimenter.ts` : l'écart et sa clé unique ; branchement au démarrage et au tick.
6. `main.ts` : `BRIGADE_GITHUB_REPO`, refus, branchement ; redémarrage : le rail d'avant se retrouve.
7. Surface du chef (selon la question 1), `docs/runtime.md`, recette.

## Questions tranchées — (a) aux quatre, le 2026-10-08

Les questions 2, 3 et 4 par le chef ; la 1 par le précédent de #13.

**1. Par où le chef lit-il le rail, tant que #18 n'est pas livrée ?** Trois critères disent « le
chef voit » ; l'affichage d'état est le ticket #18.

- **(a) — recommandé**, comme pour #13 : une commande minimale en lecture seule,
  `npm --prefix runtime run rail` — une ligne par ticket : numéro, état, priorité, titre, et pour
  un ticket pris, la station et depuis quand. #18 la reprendra dans `brigade status`.
- (b) : #14 ne livre que la projection, prouvée par test ; le chef attend #18 pour la voir.

**2. Une issue ouverte dont on retire le label `fire` : que devient son ticket ?**

- **(a) — recommandé** : il quitte le rail, quel que soit son état, exactement comme une issue
  fermée. Retirer `fire` devient le geste du chef pour reprendre un ticket. Si un cook
  travaillait dessus, son bail tombe avec la trace au journal ; l'arrêter est l'affaire des
  garde-fous (#16).
- (b) : il ne quitte le rail que s'il est en attente ; pris ou en pass, il va au bout.

**3. Quel délai avant qu'un ticket pris par une station morte revienne en attente ?** La station
renouvelle son bail tant qu'elle vit ; le délai est le silence toléré.

- **(a) — recommandé** : **10 minutes** par défaut, réglable par `BRIGADE_LEASE_SECONDS`. Assez
  long pour ne pas reprendre un cook qui réfléchit, assez court pour qu'un ticket ne dorme pas une
  heure. Au jalon 1 les cooks meurent avec le runtime, et #15 rendra leurs tickets dès le
  redémarrage : ce délai est le filet, pas le chemin normal.
- (b) : une autre valeur.

**4. Un ticket en 86 : comment revient-il en attente ?**

- **(a) — recommandé** : le 86 porte son motif et, quand elle est connue, l'**heure de retour**
  (le flux de `claude` la donne pour un quota épuisé). Passé cette heure, le tick le remet en
  attente, avec la trace. Sans heure de retour, il reste 86 jusqu'à ce qu'un geste explicite le
  rende — #15 ou une commande du chef, hors de ce ticket.
- (b) : un 86 ne revient jamais seul ; il faut toujours un geste.
