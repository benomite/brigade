// #4462 : une livraison dont la CI de la PR est finie et rouge, sans verdict, repart à son cook au tour de pass même,
// sans relecture. Ni une CI qui tourne, ni une CI verte, ni une livraison déjà renvoyée ou relue en ce moment ne repart
// par cette règle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, type GitHubDuTour } from "../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { MARQUE_DE_RENVOI, RAISONS_DE_RENVOI } from "../src/qualite-github.ts";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

const TICKET = 7;
const PR = 1007;

// Une livraison en pass, sans verdict, sa PR ouverte.
function livree(): FauxGitHub {
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, LABEL_IN_PASS]);
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha: faux.sha(), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ["runtime/src/x.ts"] });
  return faux;
}

const renvois = (faux: FauxGitHub) => (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
const verdicts = (faux: FauxGitHub) => (faux.commentaires.get(PR) ?? []).filter((c) => c.body.startsWith("<!-- brigade:verdict"));

test("a delivery whose PR CI is complete and red, with no verdict, goes back to a cook within one pass turn, unreviewed", async () => {
  const faux = livree();
  faux.ciRouge.add(PR);
  const a = faux.station("A", { places: 0 });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.relectures, [], "no review ran");
  assert.deepEqual(verdicts(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false, "it left the pass");
  assert.equal(renvois(faux).length, 1);
  assert.match(renvois(faux)[0]!.body, new RegExp(`${RAISONS_DE_RENVOI.ci} \`${faux.pr(PR).sha.slice(0, 7)}\`: tests`));
});

test("a delivery already sent back on its head is not sent back twice, even when the list read still carries `in-pass`", async () => {
  const faux = livree();
  faux.ciRouge.add(PR);
  const a = faux.station("A", { places: 0 });
  await a.tour();
  await a.calme();
  // La liste lue sous ETag porte encore `in-pass` un tour de plus.
  faux.ticket(TICKET).labels.add(LABEL_IN_PASS);
  await a.tour();
  await a.calme();
  assert.equal(renvois(faux).length, 1);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), false);
  assert.deepEqual(faux.relectures, []);
});

test("a delivery whose CI still runs is not sent back by the rule, even with a red check already in", async () => {
  const faux = livree();
  const tete = faux.pr(PR).sha;
  // Un check fini rouge, un autre qui tourne : la CI n'est pas finie.
  faux.statutsDeCommit.set(tete, [{ id: 1, context: "lint", state: "failure", description: "", createdAt: new Date().toISOString() }]);
  faux.ciEnCours.add(PR);
  const a = faux.station("A", { places: 0, juger: async () => new Promise(() => {}), horsDuTour: true });
  await a.tour();
  assert.deepEqual(renvois(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), true);
});

test("a delivery whose CI is green is not sent back: it is reviewed and merged", async () => {
  const faux = livree();
  const a = faux.station("A", { places: 0 });
  await a.tour();
  await a.calme();
  assert.deepEqual(renvois(faux), []);
  assert.deepEqual(faux.relectures, [{ station: "A", pr: PR }]);
  assert.ok(faux.mergee(TICKET));
});

test("a delivery in review is not sent back by the rule when its CI turns red meanwhile", async () => {
  const faux = livree();
  faux.ciEnCours.add(PR);
  let relue = 0;
  const a = faux.station("A", { places: 0, horsDuTour: true, juger: async () => { relue += 1; return new Promise(() => {}); } });
  await a.tour();
  for (let i = 0; i < 20 && relue === 0; i += 1) await new Promise((suite) => setImmediate(suite));
  assert.equal(relue, 1, "the review started");
  faux.ciEnCours.delete(PR);
  faux.ciRouge.add(PR);
  await a.tour();
  assert.deepEqual(renvois(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), true);
});

test("a delivery whose comments cannot be read is not sent back and does not stop the turn: the station says so", async () => {
  const faux = livree();
  faux.ciRouge.add(PR);
  faux.feu(50);
  const pour = faux.pour.bind(faux);
  faux.pour = (station: string): GitHubDuTour => ({ ...pour(station), commentaires: async (numero: number) => { if (numero === PR) throw new Error("HTTP 502"); return pour(station).commentaires(numero); } });
  const avertis: string[] = [];
  const a = faux.station("A", { places: 1, horsDuTour: true, avertir: (texte) => avertis.push(texte), cuisiner: () => new Promise(() => {}) });
  await a.tour();
  assert.deepEqual(renvois(faux), []);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_IN_PASS), true);
  assert.ok(avertis.some((texte) => texte.includes(`#${TICKET}`) && texte.includes("HTTP 502")), avertis.join("\n"));
  assert.deepEqual(faux.cuissons, [{ station: "A", issue: 50 }], "the turn went on to the claim");
});
