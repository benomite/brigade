// #3924 : main rouge et un ticket gelé qui tient une zone, ensemble — main rouge est nommée : tant qu'elle l'est, la cuisine
// ne prend rien d'autre que sa réparation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arretDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

test("main red and a frozen ticket holding a zone at once: the stop names main red, since it went red", () => {
  const arret = arretDeLaCuisine({ queued: 2, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z", frozen: { ticket: 3901, zone: "app/src/vue/", since: "2026-11-20T08:30:00.000Z" }, mainRed: { since: "2026-11-20T07:45:00.000Z" } });
  assert.deepEqual(arret, { cause: { kind: "main-red" }, since: "2026-11-20T07:45:00.000Z" });
});
