// #3893, critère 5 : la réponse brute qui a échoué pour #847 (« Expected property name or '}' » en position 2 :
// des guillemets simples) est soit acceptée et donne l'objet voulu, soit rejetée avec une erreur claire qui
// déclenche une nouvelle demande au manager.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecrireLesTests, lireLesChemins, type OutilsDeLEcriture } from "../../src/tests-acceptation/ecriture.ts";

const CHEMINS = ["runtime/test/acceptation-847/1-a.test.ts", "runtime/test/acceptation-847/2-b.test.ts"];
const BRUTE = `{ 'tests': ['${CHEMINS[0]}', '${CHEMINS[1]}'] }`;
const CORPS = "## Acceptance criteria\n\n- The first thing\n- The second thing\n";

test("the answer that failed for #847 is accepted with the intended object, or rejected clearly and the manager is asked again", async () => {
  const lu = lireLesChemins(BRUTE, 2);
  if ("chemins" in lu) {
    assert.deepEqual(lu.chemins, CHEMINS);
    return;
  }
  assert.match(lu.illisible, /JSON|property name/i);
  // Rejetée : la station redemande au manager au lieu d'abandonner.
  let demandes = 0;
  const outils: OutilsDeLEcriture = {
    issue: async () => ({ title: "t", body: CORPS }),
    commenter: async () => {},
    labelliser: async () => {},
    preparer: async () => ({ worktree: "/tmp/inexistant", branche: "cook/847-github" }),
    manager: async () => ({ message: ++demandes === 1 ? BRUTE : JSON.stringify({ tests: CHEMINS }) }),
    git: async (args) => {
      const [commande] = args;
      if (commande === "status") return { code: 0, stdout: CHEMINS.map((c) => `?? ${c}\0`).join(""), stderr: "" };
      if (commande === "rev-list") return { code: 0, stdout: "1\n", stderr: "" };
      if (commande === "show") return { code: 0, stdout: CHEMINS.join("\0") + "\0", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    pousser: () => {},
    retirer: () => {},
    base: "main",
    depot: "acme/brigade",
  };

  const fin = await ecrireLesTests(847, outils);

  assert.ok(demandes >= 2, "the manager was not asked again");
  assert.ok("fiches" in fin, "the step did not succeed after the retry");
});
