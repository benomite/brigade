// La lecture de la roadmap (#3436) : la consigne qui la lit comme un document
// de suivi, et la réponse qui se lit en travaux séparés — ou ne se lit pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeRoadmap, corpsDuTravail, lireTravaux, MARQUE_DE_LA_ROADMAP } from "../../src/manager/roadmap.ts";

test("la consigne lit la roadmap comme un document de suivi, sans rien demander au chef, avec les issues déjà ouvertes", () => {
  const consigne = consigneDeRoadmap({
    depot: "acme/espace",
    issue: { number: 1, title: "Roadmap", body: "Observation: `_ds_manifest.json` is stale.", labels: [] },
    commentaires: [],
    ouvertes: [
      { number: 1, title: "Roadmap" },
      { number: 12, title: "Rebuild the design tokens" },
    ],
  });
  assert.ok(consigne.startsWith(MARQUE_DE_LA_ROADMAP));
  assert.match(consigne, /un document de suivi, jamais un ticket/);
  assert.match(consigne, /- #12 — Rebuild the design tokens/);
  assert.doesNotMatch(consigne, /- #1 — Roadmap/);
  assert.match(consigne, /_ds_manifest\.json/);
});

test("une réponse se lit en travaux, une liste vide en aucun, et tout le reste est illisible", () => {
  assert.deepEqual(lireTravaux('Voici.\n{"travaux":[{"titre":"Drop the stale manifest","corps":"Remove it."}]}'), { valeur: [{ title: "Drop the stale manifest", body: "Remove it." }] });
  assert.deepEqual(lireTravaux('{"travaux":[]}'), { valeur: [] });
  assert.ok("illisible" in lireTravaux(null));
  assert.ok("illisible" in lireTravaux('{"nature":"decision"}'));
  assert.ok("illisible" in lireTravaux('{"travaux":[{"titre":"Sans corps"}]}'));
});

test("l'issue née de la roadmap porte sa marque et dit d'où elle vient", () => {
  const corps = corpsDuTravail(1, "abc123", 0, { title: "Drop the stale manifest", body: "Remove it." });
  assert.match(corps, /^<!-- brigade:roadmap-work of=1 state=abc123 index=0 -->\nRemove it\./);
  assert.match(corps, /Spotted by the manager in the roadmap #1, which stays a tracking document\./);
});
