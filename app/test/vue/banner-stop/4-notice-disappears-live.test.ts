// #3924, critère 4 : le bandeau disparaît, sans rechargement, dès qu'une carte est prise ou en pass, ou que la file est vide.
// Contrat posé par les tests d'acceptation du ticket #3924 (le cook le suit) :
//   runtime/src/arret-cuisine/arret-cuisine.ts exporte `arretDeLaCuisine(entree)` →
//     null | { cause: { kind: "frozen-zone"; ticket: number; zone: string } | { kind: "main-red" } | { kind: "unknown" }; since: string }
//     entree = { queued, taken, inPass: number; since: string; frozen?: { ticket, zone, since }; mainRed?: { since } }
//     `since` de l'arrêt : celui de la cause quand elle le sait (gel, main rouge), sinon `entree.since`.
//   app/src/vue/banner-stop/banner-stop.js exporte `monterLeBandeau(doc, hote)` → { maj(arret | null) } : `maj` pose
//     dans `hote` le bandeau (un élément de classe `bandeau-arret`) ou le retire, sans rechargement.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { test } from "node:test";
import { arretDeLaCuisine } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";
import { monterLeBanner } from "../../../src/vue/banner-stop/banner-stop.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_space: string, balise: string) => new Faux(balise) };
const DEPUIS = "2026-11-20T09:15:00.000Z";
const nb = (hote: Faux) => [...hote.descendants()].filter(({ className }) => className.split(" ").includes("bandeau-arret")).length;

for (const [name, suite] of [
  ["a card is taken", { queued: 2, taken: 1, inPass: 0 }],
  ["a card is in pass", { queued: 2, taken: 0, inPass: 1 }],
  ["the queue is empty", { queued: 0, taken: 0, inPass: 0 }],
] as const) {
  test(`the same mounted notice goes away when ${name}, and comes back when the kitchen stops again`, () => {
    const hote = new Faux("div");
    const banner = monterLeBanner(doc, hote);
    banner.maj(arretDeLaCuisine({ queued: 2, taken: 0, inPass: 0, since: DEPUIS }));
    assert.equal(nb(hote), 1);
    banner.maj(arretDeLaCuisine({ ...suite, since: DEPUIS }));
    assert.equal(nb(hote), 0);
    assert.equal(hote.textContent.includes("stopped"), false);
    banner.maj(arretDeLaCuisine({ queued: 2, taken: 0, inPass: 0, since: DEPUIS }));
    assert.equal(nb(hote), 1);
  });
}
