// « Will not start: <pourquoi>. » (ticket 3147) : chaque raison que la station sait produire a une phrase en mots simples ;
// une raison sans phrase tombe sur la phrase générique, jamais sur le message brut seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { START_OF_REFUSAL, REASONS_OF_REFUSAL, reasonOfRefusal, REFUSAL_GENERIC, refusalInClear } from "../src/refusal.ts";

describe("les raisons de refus en mots simples", () => {
  test("chaque raison reconnaît son exemple et le dit en une phrase qui n'est pas le message brut", () => {
    const ids = REASONS_OF_REFUSAL.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length, "un id en double");
    for (const { id, exemple: example } of REASONS_OF_REFUSAL) {
      assert.equal(reasonOfRefusal(example)?.id, id, `l'exemple de « ${id} » ne se reconnaît pas`);
      const said = refusalInClear(example);
      assert.match(said, /^Will not start: [a-z0-9].*\.$/, id);
      assert.ok(!said.includes(example), `« ${id} » redit le message brut`);
      assert.notEqual(said, refusalInClear("a reason nobody wrote"), `« ${id} » n'a que la phrase générique`);
    }
  });

  test("les motifs de mise de côté et le « sans motif » ont leur phrase", () => {
    // Les motifs que la station compose (ancien `direMiseDeCote`) : conservés tels quels.
    assert.equal(reasonOfRefusal("attend : un humain — aucune station ne fournit macos ; brancher une station")?.id, "sans-station");
    assert.equal(reasonOfRefusal("attend : station absente (box/claude) — il repart seul")?.id, "station-absente");
    assert.equal(reasonOfRefusal("attend : mis de côté, sans motif")?.id, "sans-motif");
  });

  test("les messages de la station sur GitHub : cooks sans livraison, renvois épuisés", () => {
    assert.equal(refusalInClear("off the kitchen after 3 cooks without a delivery — the cook added nothing"), "Will not start: 3 cooks in a row stopped without delivering anything.");
    assert.equal(refusalInClear("still not mergeable after 2 sends back — the CI is red\n\nTaken off the kitchen (`served-elsewhere`): a human decides."), "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.");
    assert.equal(refusalInClear("Taken off the kitchen (`served-elsewhere`): its calibration (opus / high) is already the highest the kitchen sets. A human decides."), "Will not start: its calibration is already the highest the kitchen sets, so it cannot be raised.");
  });

  test("une raison sans phrase, un message vide ou absent : la phrase générique, jamais le brut seul", () => {
    for (const raw of ["something the station invented", "", null, undefined]) {
      const said = refusalInClear(raw);
      assert.equal(said, `${START_OF_REFUSAL} ${REFUSAL_GENERIC}.`);
      if (typeof raw === "string" && raw !== "") assert.ok(!said.includes(raw));
    }
  });
});
