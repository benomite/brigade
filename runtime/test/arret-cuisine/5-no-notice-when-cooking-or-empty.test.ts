// #3924, critère 5 : file vide, ou au moins une carte prise ou en pass : aucun bandeau — même quand un ticket gelé tient une
// zone ou que main est rouge.
// Contrat posé par les tests d'acceptation du ticket #3924 (le cook le suit) :
//   runtime/src/arret-cuisine/arret-cuisine.ts exporte `arretDeLaCuisine(entree)` →
//     null | { cause: { kind: "frozen-zone"; ticket: number; zone: string } | { kind: "main-red" } | { kind: "unknown" }; since: string }
//     entree = { queued, taken, inPass: number; since: string; frozen?: { ticket, zone, since }; mainRed?: { since } }
//     `since` de l'arrêt : celui de la cause quand elle le sait (gel, main rouge), sinon `entree.since`.
//   app/src/vue/bandeau-arret/bandeau-arret.js exporte `monterLeBandeau(doc, hote)` → { maj(arret | null) } : `maj` pose
//     dans `hote` le bandeau (un élément de classe `bandeau-arret`) ou le retire, sans rechargement.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { test } from "node:test";
import { monterLeBandeau } from "../../../app/src/vue/bandeau-arret/bandeau-arret.js";
import { Faux } from "../../../app/test/aides/fausse-vue.ts";
import { arretDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };
const CAUSES = { frozen: { ticket: 3901, zone: "app/src/vue/", since: "2026-11-20T08:30:00.000Z" }, mainRed: { since: "2026-11-20T07:45:00.000Z" } };

for (const [nom, etat] of [
  ["an empty queue", { queued: 0, taken: 0, inPass: 0 }],
  ["a card taken", { queued: 4, taken: 1, inPass: 0 }],
  ["a card in pass", { queued: 4, taken: 0, inPass: 1 }],
  ["a card taken and one in pass", { queued: 4, taken: 2, inPass: 1 }],
] as const) {
  test(`${nom}: no stop is detected and no notice shows, with or without a cause around`, () => {
    for (const causes of [{}, CAUSES]) {
      const arret = arretDeLaCuisine({ ...etat, since: "2026-11-20T09:15:00.000Z", ...causes });
      assert.equal(arret, null);
      const hote = new Faux("div");
      monterLeBandeau(doc, hote).maj(arret);
      assert.equal(hote.children.length, 0);
      assert.equal(hote.textContent, "");
    }
  });
}
