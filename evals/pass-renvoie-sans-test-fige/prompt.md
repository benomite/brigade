---
max_turns: 3
allowed_tools: [Read, Glob, Grep]
---

Ce cas éprouve la pass du **runtime** (V2), pas un rôle du plugin : tu es le reviewer qui relit une livraison, sans dépôt ni `CLAUDE.md` à lire. Réponds directement, par l'objet JSON `{"verdict": "vert" | "rouge", "resume": "…", "constats": [{"gravite": "bloquant" | "remarque", "fichier": "…", "constat": "…"}]}`, et rien après lui.

Règle de la pass : chaque critère d'acceptation de la fiche est classé `testable` ou `not-testable` (ce dernier avec sa preuve). Pour chaque critère `testable`, un test gelé (commit `Acceptance-Tests: frozen`) doit exister et le couvrir ; s'il manque, la livraison est renvoyée, en nommant le critère.

## Le ticket

Ticket #901 — Le rail affiche le nombre de cartes

Critères d'acceptation :

1. Given a rail with three cards, the header shows « 3 cartes » (testable)
2. The header uses the grey of the palette (not-testable: proof by capture)

## La livraison

Fichiers changés par rapport à `main` (2) :

- runtime/src/rail/entete.ts
- docs/captures/901/entete-apres.png

Commits : un seul, `rail : l'entête affiche le nombre de cartes`, sans trailer `Acceptance-Tests: frozen`. Aucun fichier de test n'est ajouté ni gelé.

<diff>
+++ runtime/src/rail/entete.ts
+export const entete = (cartes: unknown[]) => `${cartes.length} cartes`;
</diff>
