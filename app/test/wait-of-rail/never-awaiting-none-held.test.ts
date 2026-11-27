// #3763 : la carte d'un ticket en file retenu par une attente — de son corps, de sa fiche, de l'arrêt d'un cook — dit
// `waits for #N — read from …`, la ligne même que `brigade <project> status` écrit
// (runtime/test/carte-attente/jamais-awaiting-none-retenu.test.ts) ; une carte que rien ne retient n'en a aucune.
import assert from "node:assert/strict";
import { test } from "node:test";
import { waitOfRailOf } from "../../src/vue/wait-of-rail/wait-of-rail.ts";

const REPOSITORY = "chef/cantine";

// Ce que l'attente du rail pose dans `facts` (`waitOfRailOf`) : derrière un cook qui tourne, la carte retenue par sa fiche, sa ligne et ses
// attendus, et aucune `attenteDuRail` ; une file libre sans station, la raison seule, sans ligne ni attendu de carte.
test("les faits du rail : la carte retenue porte sa ligne et ses attendus, une file libre n'en porte aucun", () => {
  const now = Date.parse("2026-11-17T10:00:00Z");
  const retainedOne = waitOfRailOf(REPOSITORY, [
    { ticket: 4, etat: "taken", entreLe: null, depend: [] },
    { ticket: 6, etat: "queued", entreLe: null, depend: [4], attentes: [{ ticket: 4, source: "fiche" }], commentairesLus: true },
  ], { lues: [] }, now);
  assert.deepEqual(retainedOne, { lignesDesCartes: { 6: "waits for #4 — read from the card" }, attendusDesCartes: { 6: [4] } });
  const free = waitOfRailOf(REPOSITORY, [{ ticket: 8, etat: "queued", entreLe: null, depend: [], attentes: [], commentairesLus: true }], { lues: [] }, now);
  assert.deepEqual(Object.keys(free), ["attenteDuRail"]);
  assert.equal(free.attenteDuRail?.raison, "aucune-station");
});
