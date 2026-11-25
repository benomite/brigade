// #4227, critère 2 : la pass joue checks, CI et relecture pour un plat en une étape de pass, et rend un seul résultat, à trois parties.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

test("one dish through the pass: one result on the PR, naming the checks, the CI and the review", async () => {
  const faux = new FauxGitHub();
  faux.feu(21);
  const station = faux.station("box", {
    juger: async () => ({ verdict: "approve", motif: "Looks right." }),
    gates: async () => ({ jouer: async () => ({ vert: true, resume: "", detail: "" }), liberer: () => {} }),
    ciDesPR: () => false,
    avertir: () => {},
  });
  for (let tour = 0; tour < 6 && faux.mergee(21) === undefined; tour += 1) {
    for (const pr of faux.prs) faux.sansCI.add(pr.number);
    await station.tour();
    await station.calme();
  }
  const pr = faux.prs.find((p) => p.issue === 21);
  assert.ok(pr);
  assert.equal(faux.mergee(21)?.number, pr.number);
  const resultats = (faux.commentaires.get(pr.number) ?? []).filter((c) => c.body.startsWith("<!-- brigade:verdict"));
  assert.equal(resultats.length, 1, "the pass returns one result for the dish");
  const corps = resultats[0]?.body ?? "";
  assert.match(corps, /checks|gates/i, `the result has no part for the project's checks:\n${corps}`);
  assert.match(corps, /\bCI\b/, `the result has no part for the CI:\n${corps}`);
  assert.match(corps, /review/i, `the result has no part for the review:\n${corps}`);
});
