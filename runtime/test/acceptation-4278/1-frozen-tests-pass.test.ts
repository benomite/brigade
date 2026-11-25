// #4278, critère 1 : les trois tests gelés de #4139 passent. Ils n'existent que sur la branche cook/4139-github ; ce test fixe le contrat commun qu'ils exercent : `runtime/src/etapes-du-ticket.ts` exporte `etapesDuTicket`, `avancerEtape` et `decrireEtape`.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as etapes from "../../src/etapes-du-ticket.ts";

test("the module the frozen #4139 tests import exports the three functions and they work together", () => {
  assert.equal(typeof etapes.etapesDuTicket, "function");
  assert.equal(typeof etapes.avancerEtape, "function");
  assert.equal(typeof etapes.decrireEtape, "function");
  const liste = etapes.etapesDuTicket({ projet: { stages: { video: ["script", "storyboard", "voice", "render"] } }, sorte: "video" });
  assert.deepEqual(liste, ["script", "storyboard", "voice", "render"]);
  const suite = etapes.avancerEtape({ etapes: liste, courante: 0, essais: 0 }, { verdict: "green" });
  assert.equal(suite.courante, 1);
  assert.match(etapes.decrireEtape(suite), /storyboard/);
});
