// #4462 : le pass ne retient plus les prises. Avec cinq livraisons en pass ou plus, la station prend encore les tickets
// prêts jusqu'à ses places ; c'est la pass elle-même qui ne relit que `PASS_MAX` livraisons à la fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PASS_MAX, brancheDuTicket } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

// `n` livraisons en pass, sans verdict, dont la CI tourne encore.
function passPlein(n: number): FauxGitHub {
  const faux = new FauxGitHub();
  for (let ticket = 41; ticket < 41 + n; ticket += 1) {
    faux.feu(ticket, [...CALIBRE, LABEL_IN_PASS]);
    faux.prs.push({ number: 1000 + ticket, issue: ticket, branche: brancheDuTicket(ticket), sha: faux.sha(), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [`runtime/src/f${ticket}.ts`] });
    faux.ciEnCours.add(1000 + ticket);
  }
  return faux;
}

test("with five deliveries in pass or more, the station still claims ready tickets up to its places", async () => {
  const faux = passPlein(PASS_MAX + 1);
  for (const ticket of [50, 51, 52]) faux.feu(ticket);
  const sauts: Array<[number, string]> = [];
  const a = faux.station("A", { places: 2, horsDuTour: true, juger: () => new Promise(() => {}), cuisiner: () => new Promise(() => {}), sauter: (numero, ligne) => sauts.push([numero, ligne]) });
  await a.tour();
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue).sort(), [50, 51]);
  // Le seul ticket laissé l'est pour ses places, jamais pour le pass.
  assert.deepEqual(sauts, [[52, "#52 is claimable but not claimed, the claim gate skipped it: the station's 2 places are all taken (#50, #51)"]]);
});

test("the pass still starts at most PASS_MAX reviews at a time", async () => {
  const faux = passPlein(PASS_MAX + 2);
  const relues: number[] = [];
  const a = faux.station("A", { places: 0, horsDuTour: true, juger: async (_ticket, pr) => { relues.push(pr.number); return new Promise(() => {}); } });
  await a.tour();
  for (let i = 0; i < 50; i += 1) await new Promise((suite) => setImmediate(suite));
  await a.tour();
  for (let i = 0; i < 50; i += 1) await new Promise((suite) => setImmediate(suite));
  assert.equal(PASS_MAX, 5);
  assert.equal(relues.length, PASS_MAX);
});
