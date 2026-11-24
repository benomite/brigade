// #4044, critère 8 : l'aîné fermé ou abandonné sans être servi, le ticket retenu est libéré seul et le lien ne se montre plus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";
import { DEPOT } from "../outils.ts";

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

test("the earlier ticket is closed with its delivery unmerged: the held delivery is released and merges", async () => {
  const faux = new FauxGitHub();
  const aine = enPass(faux, 1, ["runtime/src/x.ts"]);
  enPass(faux, 2, ["runtime/src/x.ts"]);
  faux.ciEnCours.add(aine.number);
  await tours(faux, 3);
  assert.equal(faux.mergee(2), undefined, "held while #1 is open");
  faux.ticket(1).state = "closed";
  Object.assign(aine, { state: "closed", merged: false });
  await tours(faux, 6);
  assert.equal(faux.mergee(1), undefined);
  assert.equal(faux.mergee(2)?.mergeePar, "A");
});

test("the earlier ticket is gone from the rail unserved: the link is no longer shown", async () => {
  const feux = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const lire = async (chemin: string): Promise<unknown> => (chemin === feux ? [{ number: 5, title: "#5", body: "Depends on #4", created_at: "2026-11-23T09:00:00Z", labels: [{ name: "fire" }] }] : []);
  const dites = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-23T10:00:00.000Z") });
  assert.deepEqual(dites.filter((l) => /after #4/.test(l)), []);
});
