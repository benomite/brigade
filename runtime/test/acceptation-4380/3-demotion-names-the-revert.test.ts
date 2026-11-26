// Acceptance test (#4380), criterion 3.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consignerGeste, gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique } from "../../src/autonomie/agents/politique.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const horloge = () => new Date("2026-11-26T12:00:00.000Z");

test("a revert traced to a gesture done under act demotes the agent to propose, and the reason names the revert", (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "closer", "act");
  consignerGeste(repertoire, "closer", { line: "merged #9 as 0000009a", reason: "done by itself, commit 0000009a", outcome: OUTCOME.FIXED_BY_SELF }, horloge);
  const avant = gestesDe(repertoire, "closer").length;
  const revert = { depot: "o/shop", sha: "deadbee", revertes: ["0000009a"], tickets: [9] };
  appliquerLaPolitique({ repertoire, projet: PROJET, chiffres: { bugsEchappes: [], reverts: [revert] }, horloge, reveillerLeChef: () => {} });
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "propose");
  const ajoutes = gestesDe(repertoire, "closer").slice(avant);
  assert.equal(ajoutes.length, 1);
  assert.match(ajoutes[0].reason, /revert/i);
  assert.ok(ajoutes[0].reason.includes("deadbee") || ajoutes[0].reason.includes("0000009a"), ajoutes[0].reason);
});
