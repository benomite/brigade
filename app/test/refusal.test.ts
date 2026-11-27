// « Will not start: <pourquoi>. » (ticket 3147) : chaque raison que la station sait produire a une phrase en mots simples ;
// une raison sans phrase tombe sur la phrase générique, jamais sur le message brut seul. La liste des raisons est lue dans
// le code de la station : une raison de plus, sans phrase, fait échouer ce test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";
import { START_OF_REFUSAL, REASONS_OF_REFUSAL, reasonOfRefusal, REFUSAL_GENERIC, refusalEnClear } from "../src/refusal.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("les raisons de refus en mots simples", () => {
  test("chaque raison reconnaît son exemple et le dit en une phrase qui n'est pas le message brut", () => {
    const ids = REASONS_OF_REFUSAL.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length, "un id en double");
    for (const { id, exemple: example } of REASONS_OF_REFUSAL) {
      assert.equal(reasonOfRefusal(example)?.id, id, `l'exemple de « ${id} » ne se reconnaît pas`);
      const said = refusalEnClear(example);
      assert.match(said, /^Will not start: [a-z0-9].*\.$/, id);
      assert.ok(!said.includes(example), `« ${id} » redit le message brut`);
      assert.notEqual(said, refusalEnClear("a reason nobody wrote"), `« ${id} » n'a que la phrase générique`);
    }
  });

  test("les raisons des tickets 86 du runtime (mise-de-cote.ts, `RAISONS`) ont toutes leur phrase", () => {
    const source = read("runtime/src/mise-de-cote.ts");
    const block = /const RAISONS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? assert.fail("le tableau RAISONS du runtime ne se lit plus");
    const saidEntries = [...block.matchAll(/^\s+(?:"[^"]+"|[a-z]+|\[[A-Z_]+\]): "([^"]+)",?$/gm)].map((finds) => finds[1] ?? "");
    assert.ok(saidEntries.length >= 11, `${saidEntries.length} raisons lues seulement`);
    for (const saidOne of saidEntries) {
      const reason = reasonOfRefusal(saidOne);
      assert.ok(reason !== null, `« ${saidOne} » n'a pas de phrase en mots simples (refusal.ts)`);
      assert.notEqual(refusalEnClear(saidOne), refusalEnClear(null), saidOne);
    }
    // Les motifs que `direMiseDeCote` compose, et le « sans motif ».
    assert.equal(reasonOfRefusal("attend : un humain — aucune station ne fournit macos ; brancher une station")?.id, "sans-station");
    assert.equal(reasonOfRefusal("attend : station absente (box/claude) — il repart seul")?.id, "station-absente");
    assert.equal(reasonOfRefusal("attend : mis de côté, sans motif")?.id, "sans-motif");
  });

  test("les raisons de sortie des renvois épuisés (renvois.ts, `raisonDeSortie`) ont toutes leur phrase", () => {
    const source = read("runtime/src/github-seul/renvois/renvois.ts");
    const body = /function raisonDeSortie\([^)]*\): string \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? assert.fail("raisonDeSortie ne se lit plus");
    const returns = body.match(/\breturn\b/g) ?? [];
    const outputs = REASONS_OF_REFUSAL.filter(({ id }) => ["deja-remis", "ticket-de-fix", "calibrage-incomplet", "calibrage-au-plus-haut"].includes(id));
    assert.equal(returns.length, outputs.length, "raisonDeSortie a une sortie de plus ou de moins que refusal.ts n'en dit");
  });

  test("les messages de la station sur GitHub : cooks sans livraison, renvois épuisés", () => {
    assert.equal(refusalEnClear("off the kitchen after 3 cooks without a delivery — the cook added nothing"), "Will not start: 3 cooks in a row stopped without delivering anything.");
    assert.equal(refusalEnClear("still not mergeable after 2 sends back — the CI is red\n\nTaken off the kitchen (`served-elsewhere`): a human decides."), "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.");
    assert.equal(refusalEnClear("Taken off the kitchen (`served-elsewhere`): its calibration (opus / high) is already the highest the kitchen sets. A human decides."), "Will not start: its calibration is already the highest the kitchen sets, so it cannot be raised.");
  });

  test("une raison sans phrase, un message vide ou absent : la phrase générique, jamais le brut seul", () => {
    for (const raw of ["something the station invented", "", null, undefined]) {
      const said = refusalEnClear(raw);
      assert.equal(said, `${START_OF_REFUSAL} ${REFUSAL_GENERIC}.`);
      if (typeof raw === "string" && raw !== "") assert.ok(!said.includes(raw));
    }
  });
});
