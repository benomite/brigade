// #4232, criterion 2: the same skip is refused for the manager and for the supervisor.
import assert from "node:assert/strict";
import { test } from "node:test";
// Contract: src/regles-verrouillees.ts exports creerGarde({ verrouilles: string[] }) -> garde with
//   demanderSaut({ demandeur, check, raison? }) -> { accepte: boolean, message: string }
//   modifier({ demandeur, verrouilles }) -> { accepte: boolean, message: string }
//   lancer(executer: (check: string) => void) -> string[]  (the checks run, locked ones always included)
import { creerGarde } from "../../src/regles-verrouillees.ts";

for (const demandeur of ["manager", "supervisor"]) {
  test(`the ${demandeur}'s skip of a locked check is refused`, () => {
    const garde = creerGarde({ verrouilles: ["tests", "types"] });
    const reponse = garde.demanderSaut({ demandeur, check: "types" });
    assert.equal(reponse.accepte, false);
    assert.match(reponse.message, /locked/i);
    assert.match(reponse.message, /chef/i);
    assert.deepEqual(garde.lancer(() => {}), ["tests", "types"]);
  });
}
