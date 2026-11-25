import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquettesALaCreation } from "../src/liberer-la-machine.ts";

test("a ticket whose title or body frees the machine gets the label once; a plain ticket does not (#4173)", () => {
  assert.deepEqual(etiquettesALaCreation({ titre: "Purge stale caches", corps: "", labels: ["fire"] }), ["fire", "saturation-repair"]);
  assert.deepEqual(etiquettesALaCreation({ titre: "Reclaim disk", corps: "", labels: ["saturation-repair"] }), ["saturation-repair"]);
  assert.deepEqual(etiquettesALaCreation({ titre: "Rename a button", corps: "The button says OK.", labels: ["fire"] }), ["fire"]);
});
