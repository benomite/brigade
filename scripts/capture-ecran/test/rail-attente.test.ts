// L'écran du rail en attente (#3763) : sa carte #21, retenue par une phrase de son corps, dit son attente et d'où elle est
// lue, la ligne que l'app tire du rail (app/src/vue/rail/github.ts, `avecLeRail`), et n'ouvre que #12 ; #12 et #22, libres,
// n'en ont pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran } from "../ecrans/rail-attente.ts";

test("l'écran rail-attente : la carte #21 dit « waits for #12 — read from the body », et elle seule", () => {
  const cartes = [...JSON.stringify(ecran.donnees()).matchAll(/\{"ticket":(\d+),"ligne":"([^"]*)"(?:,"liens":\[([\d,]*)\])?/g)].map(([, n, ligne, liens]) => `#${n} ${ligne}${liens === undefined ? "" : ` → ${liens}`}`);
  assert.ok(cartes.includes("#22 ready, waits for a place in the kitchen"), cartes.join("\n"));
  assert.deepEqual([...new Set(cartes.filter((carte) => carte.includes("waits for #")))], ["#21 waits for #12 — read from the body: 'Builds on #12.' → 12"]);
});
