// Test d'acceptation gelé (#4173), critère 2. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/reparation.ts` exporte `etiquettesALaCreation({ titre, corps, labels, auteur })` -> `string[]`, les labels
// qu'un ticket porte dès sa création. `auteur` : "supervisor" | "manager" | "cook". Un ticket dont le travail libère la
// machine (disque, processus, caches) reçoit `saturation-repair`, quel que soit l'auteur ; les labels donnés restent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquettesALaCreation } from "../../src/reparation.ts";

const LIBERE = [
  { titre: "Reclaim leftover worktrees", corps: "## Context\n\nThe disk is full: delete the worktrees of merged tickets." },
  { titre: "Kill orphan processes", corps: "## Context\n\nOrphan node processes eat the memory; reap them." },
  { titre: "Purge the npm and build caches", corps: "## Context\n\nFree disk space by clearing the caches." },
];

test("a ticket that frees the machine carries `saturation-repair` whoever creates it, and keeps its other labels", () => {
  for (const auteur of ["supervisor", "manager", "cook"] as const) {
    for (const { titre, corps } of LIBERE) {
      const labels = etiquettesALaCreation({ titre, corps, labels: ["tech", "prio:1"], auteur });
      assert.ok(labels.includes("saturation-repair"), `${auteur}: « ${titre} » lacks the label`);
      assert.ok(labels.includes("tech") && labels.includes("prio:1"));
    }
  }
});

test("a ticket that does not free the machine does not get the label", () => {
  const labels = etiquettesALaCreation({ titre: "Add a settings screen", corps: "## Context\n\nA new screen for the app.", labels: ["feature"], auteur: "manager" });
  assert.ok(!labels.includes("saturation-repair"));
});
