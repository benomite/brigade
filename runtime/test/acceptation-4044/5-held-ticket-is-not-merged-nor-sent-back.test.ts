// #4044, critère 5 : tant que son aîné n'est pas servi, le ticket retenu n'est ni mergé, ni renvoyé pour rebase ou conflit.
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
const tours = async (faux: FauxGitHub, n: number, apres?: () => void) => {
  const a = faux.station("A", { places: 3, avertir: () => {} });
  for (let i = 0; i < n; i += 1) {
    await a.tour();
    await a.calme();
    apres?.();
  }
};
const renvois = (faux: FauxGitHub, ticket: number) => (faux.commentaires.get(ticket) ?? []).filter((c) => c.body.startsWith("<!-- brigade:renvoi"));

test("a held delivery behind the base is neither merged nor synced while the earlier one is not served", async () => {
  const faux = new FauxGitHub();
  const aine = enPass(faux, 1, ["runtime/src/x.ts"]);
  const tardive = enPass(faux, 2, ["runtime/src/x.ts", "docs/y.md"]);
  faux.ciEnCours.add(aine.number);
  tardive.enRetard = true;
  const tete = tardive.sha;
  await tours(faux, 5, () => assert.equal(faux.mergee(2), undefined, "#2 is not merged"));
  assert.equal(faux.mergee(1), undefined);
  assert.equal(tardive.sha, tete, "its branch was not updated");
  assert.equal(tardive.enRetard, true);
  assert.deepEqual(renvois(faux, 2), []);
});

test("a held delivery in conflict is not sent back while the earlier one is not served", async () => {
  const faux = new FauxGitHub();
  const aine = enPass(faux, 1, ["runtime/src/x.ts"]);
  const tardive = enPass(faux, 2, ["runtime/src/x.ts"]);
  faux.ciEnCours.add(aine.number);
  Object.assign(tardive, { enConflit: true, conflitDeContenu: true });
  await tours(faux, 5);
  assert.deepEqual(renvois(faux, 2), []);
  assert.equal(faux.mergee(2), undefined);
  assert.deepEqual(faux.cuissons, []);
});
