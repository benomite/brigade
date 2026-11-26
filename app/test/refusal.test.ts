// « Will not start: <pourquoi>. » (ticket 3147) : chaque raison que la station sait produire a une phrase en mots simples ;
// une raison sans phrase tombe sur la phrase générique, jamais sur le message brut seul. La liste des raisons est lue dans
// le code de la station : une raison de plus, sans phrase, fait échouer ce test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";
import { DEBUT_DU_REFUSAL, RAISONS_DE_REFUSAL, raisonDeRefusal, REFUSAL_GENERIQUE, refusalEnClair } from "../src/refusal.ts";

const RACINE = resolve(import.meta.dirname, "..", "..");
const lire = (chemin: string) => readFileSync(resolve(RACINE, chemin), "utf8");

describe("les raisons de refus en mots simples", () => {
  test("chaque raison reconnaît son exemple et le dit en une phrase qui n'est pas le message brut", () => {
    const ids = RAISONS_DE_REFUSAL.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length, "un id en double");
    for (const { id, exemple } of RAISONS_DE_REFUSAL) {
      assert.equal(raisonDeRefusal(exemple)?.id, id, `l'exemple de « ${id} » ne se reconnaît pas`);
      const dit = refusalEnClair(exemple);
      assert.match(dit, /^Will not start: [a-z0-9].*\.$/, id);
      assert.ok(!dit.includes(exemple), `« ${id} » redit le message brut`);
      assert.notEqual(dit, refusalEnClair("a reason nobody wrote"), `« ${id} » n'a que la phrase générique`);
    }
  });

  test("les raisons des tickets 86 du runtime (mise-de-cote.ts, `RAISONS`) ont toutes leur phrase", () => {
    const source = lire("runtime/src/mise-de-cote.ts");
    const bloc = /const RAISONS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? assert.fail("le tableau RAISONS du runtime ne se lit plus");
    const dites = [...bloc.matchAll(/^\s+(?:"[^"]+"|[a-z]+|\[[A-Z_]+\]): "([^"]+)",?$/gm)].map((trouve) => trouve[1] ?? "");
    assert.ok(dites.length >= 11, `${dites.length} raisons lues seulement`);
    for (const dite of dites) {
      const raison = raisonDeRefusal(dite);
      assert.ok(raison !== null, `« ${dite} » n'a pas de phrase en mots simples (refusal.ts)`);
      assert.notEqual(refusalEnClair(dite), refusalEnClair(null), dite);
    }
    // Les motifs que `direMiseDeCote` compose, et le « sans motif ».
    assert.equal(raisonDeRefusal("attend : un humain — aucune station ne fournit macos ; brancher une station")?.id, "sans-station");
    assert.equal(raisonDeRefusal("attend : station absente (box/claude) — il repart seul")?.id, "station-absente");
    assert.equal(raisonDeRefusal("attend : mis de côté, sans motif")?.id, "sans-motif");
  });

  test("les raisons de sortie des renvois épuisés (renvois.ts, `raisonDeSortie`) ont toutes leur phrase", () => {
    const source = lire("runtime/src/github-seul/renvois/renvois.ts");
    const corps = /function raisonDeSortie\([^)]*\): string \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? assert.fail("raisonDeSortie ne se lit plus");
    const retours = corps.match(/\breturn\b/g) ?? [];
    const sorties = RAISONS_DE_REFUSAL.filter(({ id }) => ["deja-remis", "ticket-de-fix", "calibrage-incomplet", "calibrage-au-plus-haut"].includes(id));
    assert.equal(retours.length, sorties.length, "raisonDeSortie a une sortie de plus ou de moins que refusal.ts n'en dit");
  });

  test("les messages de la station sur GitHub : cooks sans livraison, renvois épuisés", () => {
    assert.equal(refusalEnClair("off the kitchen after 3 cooks without a delivery — the cook added nothing"), "Will not start: 3 cooks in a row stopped without delivering anything.");
    assert.equal(refusalEnClair("still not mergeable after 2 sends back — the CI is red\n\nTaken off the kitchen (`served-elsewhere`): a human decides."), "Will not start: its delivery was sent back to a cook 2 times and is still not mergeable.");
    assert.equal(refusalEnClair("Taken off the kitchen (`served-elsewhere`): its calibration (opus / high) is already the highest the kitchen sets. A human decides."), "Will not start: its calibration is already the highest the kitchen sets, so it cannot be raised.");
  });

  test("une raison sans phrase, un message vide ou absent : la phrase générique, jamais le brut seul", () => {
    for (const brut of ["something the station invented", "", null, undefined]) {
      const dit = refusalEnClair(brut);
      assert.equal(dit, `${DEBUT_DU_REFUSAL} ${REFUSAL_GENERIQUE}.`);
      if (typeof brut === "string" && brut !== "") assert.ok(!dit.includes(brut));
    }
  });
});
