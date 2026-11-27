// Acceptance test (#4380), criterion 4.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consignerGeste, gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique } from "../../src/autonomie/agents/politique.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const horloge = () => new Date("2026-11-26T12:00:00.000Z");

test("running the policy again on the same facts adds no entry, no second demotion and no second wake-up", (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "closer", "act");
  for (const sha of ["0000001a", "0000002a"]) consignerGeste(repertoire, "closer", { line: `merged as ${sha}`, reason: `commit ${sha}`, outcome: OUTCOME.FIXED_BY_SELF }, horloge);
  const chiffres = { bugsEchappes: [], reverts: ["0000001a", "0000002a"].map((sha, i) => ({ depot: "o/shop", sha: `deadbe${i}`, revertes: [sha], tickets: [] as number[] })) };
  const reveils: string[] = [];
  const politique = () => appliquerLaPolitique({ repertoire, projet: PROJET, chiffres, horloge, reveillerLeChef: (raison: string) => void reveils.push(raison) });
  politique();
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "propose");
  assert.equal(reveils.length, 1, "two reverted gestures: one wake-up of the chef");
  const apres = gestesDe(repertoire, "closer").length;
  politique();
  politique();
  assert.equal(gestesDe(repertoire, "closer").length, apres);
  assert.equal(reveils.length, 1);
  // The chef puts it back to act: the reverts already handled do not demote it again.
  magasinDeNiveaux(repertoire).poser(PROJET, "closer", "act");
  politique();
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "act");
  assert.equal(reveils.length, 1);
});
