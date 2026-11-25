// #4232, criterion 3: a skip request that gives a reason (an urgent fix) is still refused.
import assert from "node:assert/strict";
import { test } from "node:test";
// Contract: src/regles-verrouillees.ts exports creerGarde({ verrouilles: string[] }) -> garde with
//   demanderSaut({ demandeur, check, raison? }) -> { accepte: boolean, message: string }
//   modifier({ demandeur, verrouilles }) -> { accepte: boolean, message: string }
//   lancer(executer: (check: string) => void) -> string[]  (the checks run, locked ones always included)
import { creerGarde } from "../../src/regles-verrouillees.ts";

test("a reason does not unlock a check, and the message does not depend on it", () => {
  const garde = creerGarde({ verrouilles: ["tests"] });
  const sans = garde.demanderSaut({ demandeur: "cook", check: "tests" });
  const avec = garde.demanderSaut({ demandeur: "cook", check: "tests", raison: "urgent fix, production is down" });
  assert.equal(avec.accepte, false);
  assert.equal(avec.message, sans.message);
  assert.deepEqual(garde.lancer(() => {}), ["tests"]);
});
