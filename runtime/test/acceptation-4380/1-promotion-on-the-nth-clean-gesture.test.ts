// Acceptance test (#4380), criterion 1. The policy is read as `appliquerLaPolitique` of autonomie/agents/politique.ts:
// ({ repertoire, projet, chiffres: { bugsEchappes, reverts }, horloge, reveillerLeChef }), and N as NOMBRE_DE_GESTES_PROPRES.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique, NOMBRE_DE_GESTES_PROPRES } from "../../src/autonomie/agents/politique.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const horloge = () => new Date("2026-11-26T12:00:00.000Z");
const sha = (n: number) => `${String(n).padStart(7, "0")}a`;

test("an agent at propose moves to act on exactly the Nth clean gesture, and not on the one before", (t) => {
  const repertoire = repertoireTemporaire(t);
  assert.equal(NOMBRE_DE_GESTES_PROPRES, 5);
  // A revert of a commit that none of the gestures delivered.
  const chiffres = { bugsEchappes: [], reverts: [{ depot: "o/shop", sha: "deadbee", revertes: ["ffff000"], tickets: [] }] };
  const politique = () => appliquerLaPolitique({ repertoire, projet: PROJET, chiffres, horloge, reveillerLeChef: () => {} });
  const propre = (n: number) => consignerGeste(repertoire, "closer", { line: `merged #${n} as ${sha(n)}`, reason: `the chef said OK, commit ${sha(n)}`, outcome: OUTCOME.HANDED_TO_CHEF }, horloge);
  for (let n = 1; n < NOMBRE_DE_GESTES_PROPRES; n++) propre(n);
  politique();
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "propose");
  propre(NOMBRE_DE_GESTES_PROPRES);
  politique();
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "act");
});
