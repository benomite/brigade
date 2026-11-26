// Ce que `facts` dit d'une carte en WAITING faute de capacité (#1958) : ce qu'elle requiert, et la tâche qu'elle devient
// dans TODO (vue/wait-capacity/read.ts), tels que le process principal les lit (facts.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre } from "../../../src/facts.ts";
import { requiredLus, tacheLue } from "../../../src/vue/wait-capacity/read.ts";

const A = "2026-10-21T10:04:12.000Z";

test("`requiert` et `tache` se lisent de `facts` ; d'une autre forme, ils ne sont pas donnés", () => {
  assert.deepEqual(requiredLus(["macos"]), { requiert: ["macos"] });
  assert.deepEqual(requiredLus("macos"), {});
  assert.deepEqual(requiredLus([]), {});
  assert.deepEqual(tacheLue({ assignee: "chef", missing: ["macos"], title: "T", context: "", criteria: [] }), { tache: { assignee: "chef", missing: ["macos"], title: "T", context: "", criteria: [] } });
  assert.deepEqual(tacheLue({ assignee: "chef" }), {});
  const lus = comprendre(JSON.stringify({ etat: "ouverte", lu: A, dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [{ ticket: 22, etat: "WAITING", titre: "T", url: "https://x/22", requiert: ["macos"] }] }));
  assert.ok(!("informe" in lus));
  assert.deepEqual(lus.rail[0]?.requiert, ["macos"]);
});
