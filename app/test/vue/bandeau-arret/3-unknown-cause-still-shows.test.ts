// #3924, critère 3 : quand la cause est inconnue, le bandeau se montre quand même et dit que la cause est inconnue.
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

test("queued tickets, nothing taken or in pass, no frozen ticket, main green: the notice shows and says the cause is unknown", () => {
  const arret = arretDeLaCuisine({ queued: 1, taken: 0, inPass: 0, since: "2026-11-20T11:20:00.000Z" });
  assert.deepEqual(arret, { cause: { kind: "unknown" }, since: "2026-11-20T11:20:00.000Z" });
  const hote = new Faux("div");
  monterLeBandeau(doc, hote).maj(arret);
  const texte = hote.textContent;
  assert.match(texte, /kitchen is stopped/i);
  assert.match(texte, /cause is unknown/i);
  assert.match(texte, /since 11:20/);
});
