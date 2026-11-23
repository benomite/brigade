// #4026, critère 1 : à chaque tour, la station lance les quatre contrôles, chacun une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

test("one tick calls each of the four invariant checks exactly once", async () => {
  const faux = new FauxGitHub();
  const appels: number[] = [];
  const controles = [1, 2, 3, 4].map((numero) => async () => {
    appels.push(numero);
  });
  const a = faux.station("A", { places: 1, avertir: () => {}, invariants: controles } as never);
  await a.tour();
  await a.calme();
  assert.deepEqual([...appels].sort(), [1, 2, 3, 4], `each check ran once, got: ${appels.join(",")}`);
});
