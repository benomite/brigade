// Le tour de la station sur un ticket marqué pour un cook humain (#4276) : aucune station ne le cuit ; la PR que
// l'humain ouvre sur sa branche entre en pass, et la même pass la relit et la merge, comme celle d'un cook.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherBrigadeGithub, type StationGitHub } from "../../src/brigade-github.ts";
import { jusqua } from "../outils.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

function ouvrir(t: TestContext, station: StationGitHub) {
  const ouvert = brancherBrigadeGithub({ station: () => station, intervalleMs: 5, avertir: () => {} });
  assert.equal(ouvert.refus, undefined);
  t.after(() => ouvert.arreter());
}

test("a fired ticket marked human-cook is not taken by a station, while an ordinary one is", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "human-cook"]);
  faux.feu(2);
  const station = faux.station("A");

  await station.tour();
  await jusqua(() => faux.cuissons.length > 0);

  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [2]);
  assert.equal(faux.ticket(1).labels.has("taken"), false);
  assert.equal(faux.ticket(1).labels.has("in-pass"), false);
});

test("the human's pull request on the ticket's branch enters the pass, which reviews and merges it like a cook's", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "human-cook"]);
  faux.prs.push({ number: 1000, issue: 1, branche: "cook/1-github", sha: faux.sha(), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ["README.md"] });

  ouvrir(t, faux.station("A"));

  await jusqua(() => faux.mergee(1) !== undefined, 20_000);
  await jusqua(() => faux.ticket(1).state === "closed", 20_000);
  assert.deepEqual(faux.cuissons, []);
});
