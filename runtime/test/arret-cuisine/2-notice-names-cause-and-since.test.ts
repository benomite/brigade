// #3924, critère 2 : le bandeau nomme la cause et dit depuis quand ; au moins deux causes : un ticket gelé qui tient une
// zone de fichiers, et main rouge.
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
import { monterLeBanner } from "../../../app/src/vue/banner-stop/banner-stop.js";
import { Faux } from "../../../app/test/aides/fausse-vue.ts";
import { arretDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };
const SANS_CARTE = { queued: 3, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };

function bandeauDe(arret: ReturnType<typeof arretDeLaCuisine>): string {
  const hote = new Faux("div");
  monterLeBanner(doc, hote).maj(arret);
  return hote.textContent;
}

test("a frozen ticket that holds a file zone: the detection names it and since when, and the notice says both", () => {
  const arret = arretDeLaCuisine({ ...SANS_CARTE, frozen: { ticket: 3901, zone: "app/src/vue/", since: "2026-11-20T08:30:00.000Z" } });
  assert.deepEqual(arret, { cause: { kind: "frozen-zone", ticket: 3901, zone: "app/src/vue/" }, since: "2026-11-20T08:30:00.000Z" });
  const texte = bandeauDe(arret);
  assert.match(texte, /#3901/);
  assert.match(texte, /app\/src\/vue\//);
  assert.match(texte, /since 08:30/);
});

test("main being red: the detection names it and since when, and the notice says both", () => {
  const arret = arretDeLaCuisine({ ...SANS_CARTE, mainRed: { since: "2026-11-20T07:45:00.000Z" } });
  assert.deepEqual(arret, { cause: { kind: "main-red" }, since: "2026-11-20T07:45:00.000Z" });
  const texte = bandeauDe(arret);
  assert.match(texte, /main is red/i);
  assert.match(texte, /since 07:45/);
});
