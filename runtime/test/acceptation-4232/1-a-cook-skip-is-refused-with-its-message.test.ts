// #4232, criterion 1: a skip of a locked check requested by a cook is refused, with a clear message.
import assert from "node:assert/strict";
import { test } from "node:test";
// Contract: src/regles-verrouillees.ts exports creerGarde({ verrouilles: string[] }) -> garde with
//   demanderSaut({ demandeur, check, raison? }) -> { accepte: boolean, message: string }
//   modifier({ demandeur, verrouilles }) -> { accepte: boolean, message: string }
//   lancer(executer: (check: string) => void) -> string[]  (the checks run, locked ones always included)
import { creerGarde } from "../../src/regles-verrouillees.ts";

test("a cook's skip of a locked check is refused and the message says why", () => {
  const garde = creerGarde({ verrouilles: ["tests", "types"] });
  const reponse = garde.demanderSaut({ demandeur: "cook", check: "tests" });
  assert.equal(reponse.accepte, false);
  assert.match(reponse.message, /locked/i);
  assert.match(reponse.message, /chef/i);
  assert.match(reponse.message, /tests/);
});
