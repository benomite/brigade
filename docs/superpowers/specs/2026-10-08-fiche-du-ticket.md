# La fiche du ticket — spec et plan (#68)

**Date** : 2026-10-08
**Statut** : décidé — l'emplacement et le format sont la qualification technique du Manager, dans
l'issue ; les choix de lecture ci-dessous (« Ce que le dev a tranché ») sont contestables en review
**Issue** : #68 « Ce qu'un ticket doit porter : dépendances et zone de fichiers »
**Résout** : la question ouverte n°2 de `2026-10-08-brigade-v2-design.md`
**S'appuie sur** : `2026-10-08-runtime-rail.md` (sondage, faits du rail),
`2026-10-08-station-claude.md` (le refus `no-calibration`, précédent imité). Ce document ne redécide
rien de ce qui y figure.

---

## La décision

Dépendances et zone vivent dans **un commentaire dédié de l'issue**, la fiche, repéré par le
marqueur `<!-- brigade:fiche -->` et fait de lignes `clé : valeur` :

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
```

Le motif, l'usage et la table des cas illisibles sont dans `docs/runtime.md`, « La fiche d'un
ticket » : c'est la doc vivante, ce document ne la recopie pas.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Visibles sur GitHub, pas seulement dans la base | Un commentaire de l'issue ; la base n'en garde qu'une copie dérivée (`card`) |
| Lisibles et corrigeables à la main, sans casser le format | Lignes `clé : valeur` ; la lecture tolère casse, gras, puces, espaces, prose autour |
| Survit à un reformatage du corps | La fiche n'est pas dans le corps |
| Le runtime dit quand il ne comprend pas | Tout ce qui n'est pas compris devient un `problem` de la fiche ; la station refuse le ticket (86 `unreadable-card`) et commente quoi corriger ; `run rail` l'affiche |
| Le choix écrit avec son motif, et ce qu'il laisse au jalon 4 | `docs/runtime.md`, « Pourquoi un commentaire » et « Ce que la fiche laisse au jalon 4 » |
| Question ouverte n°2 marquée résolue | `2026-10-08-brigade-v2-design.md`, § Questions ouvertes |

## Mesuré contre GitHub, le 2026-10-08

Le piège annoncé — une fiche corrigée à la main serait-elle relue ? — a été mesuré sur l'issue #68
avec un commentaire temporaire, pas supposé :

| Geste | `updated_at` de l'issue | ETag de la liste des issues |
|---|---|---|
| Poser un commentaire | bouge | change |
| **Éditer** ce commentaire | **bouge** | **change** |
| Le supprimer | bouge | change |

Le sondage conditionnel existant suffit donc : aucun second sondage, aucun `since`. La granularité
de `updated_at` est la seconde : deux modifications dans la même seconde, séparées par un sondage,
ne se distingueraient pas — la seconde serait lue à la modification suivante.

## Ce que le dev a tranché

Détails de lecture que la qualification laissait ouverts. Chacun a un test.

1. **Pas de fiche ≠ fiche illisible.** Une issue sans commentaire marqué est un ticket sans
   dépendance ni zone (`card: null`) : la fiche est optionnelle, sinon chaque ticket du jalon 1
   deviendrait 86.
2. **Le refus se fait à la prise, par la station**, à l'image de `no-calibration` : un ticket déjà
   pris ou en pass dont la fiche devient illisible n'est pas interrompu. Le rail porte les problèmes
   dès le sondage (`run rail` les montre tout de suite).
3. **Une fiche posée par qui n'a pas la main sur le dépôt est ignorée** (`author_association` hors
   `OWNER`, `MEMBER`, `COLLABORATOR`), et dite sur journald. La refuser aurait permis à n'importe
   quel passant de mettre 86 un ticket d'un dépôt public ; la lire, de dicter une zone.
4. **« Éditée par un tiers » : lue comme elle est.** L'API REST ne dit pas qui a édité, et GitHub ne
   le permet qu'à l'auteur et à ceux qui ont la main sur le dépôt.
5. **Une clé inconnue est un problème**, pas une ligne ignorée — y compris les futures `requiert`,
   `domaine`, `budget` tant que le runtime ne les lit pas.
6. **`#N` attendu** : doit exister sur le dépôt (issue ou PR, ouverte ou fermée) et ne pas être le
   ticket lui-même. Les cycles sont l'affaire de #70.
7. **`zone`** : des chaînes, portées telles quelles. Seuls sont refusés ce qui sort du dépôt
   (absolu, `~`, `..`, `\`). Dossier, fichier ou motif : #73 dira comment les interpréter.
8. **Les commentaires lus sont mis en cache en mémoire**, par `updated_at` — cache, pas état, comme
   l'ETag du sondage : un redémarrage coûte une lecture par ticket du rail.
9. **Une fiche qui tient à autre chose que son issue n'est pas mise en cache** (revue de la PR) :
   un `#N` inexistant, un auteur sans la main sur le dépôt. Ni la création de #N ni l'invitation de
   l'auteur ne font bouger l'issue : tant que cela dure, le sondage n'est pas confirmé — il reste
   inconditionnel — et la fiche est relue à chaque tick.
10. **La clé d'unicité d'un `ticket.changed` porte l'empreinte de son contenu** (revue de la PR) :
    ce que le rail lit d'une issue peut changer sans que son `updated_at` bouge — le cas 9, ou une
    fiche qu'un runtime précédent ne lisait pas. Sans elle, le fait serait refusé comme doublon, et
    le sondage jamais confirmé.

## Plan

| Module | Ce qui change |
|---|---|
| `src/fiche.ts` (neuf) | Lecture pure, sans E/S : `fiche(commentaires)`, `porteFiche`, `illisible` |
| `src/github.ts` | `commentaires(numero)`, paginé |
| `src/alimenter.ts` | Lit la fiche des issues modifiées, vérifie les `#N`, la porte dans `ticket.arrived` / `ticket.changed` |
| `src/evenements/rail.ts`, `src/projections/rail.ts` | `card?: Fiche \| null`, optionnel à la relecture ; colonne `card` (JSON) |
| `src/station.ts` | Refus `unreadable-card`, commentaire, retour `card-readable` |
| `src/montrer-rail.ts` | La fiche et ses problèmes, en retrait sous le ticket |

## Hors scope

- Faire **respecter** `attend` (#70) ou `zone` (#73).
- Faire **écrire** une fiche par le runtime ou le manager (#69, #71).
- `status` : il montre déjà le motif du 86 ; la fiche détaillée reste dans `run rail`.
