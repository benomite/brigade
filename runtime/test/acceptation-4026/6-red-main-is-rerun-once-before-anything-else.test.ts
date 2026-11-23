// #4026, critère 6 : un check rouge sur main est relancé une fois, avant toute autre action.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a red check on main is rerun once, and nothing else happens before the rerun result", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  faux.feu(1, CALIBRE);
  const journal: string[] = [];
  const relances: string[] = [];
  const a = faux.station("A", {
    places: 1,
    sauter: () => {},
    avertir: () => {},
    cuisiner: async () => {
      journal.push("cook");
      return { echec: "not the point" };
    },
    relancerLaBase: async () => {
      journal.push("rerun");
      relances.push("rerun");
    },
  } as never);
  await a.tour();
  await a.calme();
  assert.equal(relances.length, 1, "exactly one rerun");
  assert.equal(journal[0], "rerun", `the rerun comes first, got: ${journal.join(",")}`);
});
