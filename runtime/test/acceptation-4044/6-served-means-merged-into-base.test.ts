// #4044, critère 6 : « servi » = la livraison de l'aîné est mergée dans la base à la pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

// Un ticket en pass, sa PR ouverte sur `fichiers`, et le verdict déjà rendu sur sa tête.
function enPass(faux: FauxGitHub, ticket: number, fichiers: string[]) {
  faux.feu(ticket, [...CALIBRE, LABEL_IN_PASS]);
  const sha = faux.sha();
  const pr = { number: 1000 + ticket, issue: ticket, branche: brancheDuTicket(ticket), sha, state: "open" as const, merged: false, enRetard: false, mergeePar: null, fichiers };
  faux.prs.push(pr);
  faux.poster(pr.number, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  return pr;
}
const tours = async (faux: FauxGitHub, n: number) => {
  const a = faux.station("A", { places: 3, avertir: () => {} });
  for (let i = 0; i < n; i += 1) {
    await a.tour();
    await a.calme();
  }
};

test("an earlier delivery approved but not merged does not serve: the held one waits; once merged, even elsewhere, it is released", async () => {
  const faux = new FauxGitHub();
  const aine = enPass(faux, 1, ["runtime/src/x.ts"]);
  enPass(faux, 2, ["runtime/src/x.ts"]);
  faux.ciEnCours.add(aine.number);
  await tours(faux, 4);
  assert.equal(faux.mergee(1), undefined);
  assert.equal(faux.mergee(2), undefined, "approved, green, but #1 is not merged into the base");
  Object.assign(aine, { merged: true, state: "closed", mergeePar: "someone" });
  faux.ticket(1).state = "closed";
  await tours(faux, 6);
  assert.equal(faux.mergee(2)?.mergeePar, "A");
});
