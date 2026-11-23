// #4026, critère 4 : le même échec sur le même commit n'est ni jugé ni relancé deux fois (panne #4001).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a cook that fails again on the same commit is relaunched exactly once, then stopped", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/1-abcdef01");
  pr.issue = 1;
  faux.ciRouge.add(pr.number);
  const tete = pr.sha;
  const a = faux.station("A", {
    places: 1,
    sauter: () => {},
    avertir: () => {},
    // The cook fails again and leaves the same commit.
    cuisiner: async () => ({ echec: "same failure" }),
  });
  for (let i = 0; i < 6; i++) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.pr(pr.number).sha, tete, "the commit did not change");
  const relances = faux.cuissons.filter(({ issue }) => issue === 1).length;
  assert.equal(relances, 1, `exactly one relaunch on the same commit, got ${relances}`);
  assert.equal(faux.relectures.filter(({ pr: n }) => n === pr.number).length <= 1, true, "judged at most once");
});
