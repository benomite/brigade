// #4232, criterion 4: a change of the locked checks made by the chef is accepted and takes effect on the next run.
import assert from "node:assert/strict";
import { test } from "node:test";
// Contract: src/regles-verrouillees.ts exports creerGarde({ verrouilles: string[] }) -> garde with
//   demanderSaut({ demandeur, check, raison? }) -> { accepte: boolean, message: string }
//   modifier({ demandeur, verrouilles }) -> { accepte: boolean, message: string }
//   lancer(executer: (check: string) => void) -> string[]  (the checks run, locked ones always included)
import { creerGarde } from "../../src/regles-verrouillees.ts";

test("the chef's change is accepted and the next run uses it", () => {
  const garde = creerGarde({ verrouilles: ["tests"] });
  assert.deepEqual(garde.lancer(() => {}), ["tests"]);
  const reponse = garde.modifier({ demandeur: "chef", verrouilles: ["tests", "no broken link"] });
  assert.equal(reponse.accepte, true);
  const lances: string[] = [];
  garde.lancer((check) => lances.push(check));
  assert.deepEqual(lances, ["tests", "no broken link"]);
});
