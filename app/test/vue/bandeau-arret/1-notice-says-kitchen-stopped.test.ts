// #3924, critère 1 : au moins un ticket en file et aucune carte prise ni en pass : le tableau montre un bandeau qui dit
// que la cuisine est arrêtée.
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
import { arretDeLaCuisine } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import { monterLeBandeau } from "../../../src/vue/bandeau-arret/bandeau-arret.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };

test("two tickets queued, no card taken or in pass: the board shows a notice that says the kitchen is stopped", () => {
  const hote = new Faux("div");
  const arret = arretDeLaCuisine({ queued: 2, taken: 0, inPass: 0, since: "2026-11-20T09:15:00.000Z" });
  assert.notEqual(arret, null);
  monterLeBandeau(doc, hote).maj(arret);
  const bandeaux = [...hote.descendants()].filter(({ className }) => className.split(" ").includes("bandeau-arret"));
  assert.equal(bandeaux.length, 1);
  assert.match(bandeaux[0]?.textContent ?? "", /kitchen is stopped/i);
});
