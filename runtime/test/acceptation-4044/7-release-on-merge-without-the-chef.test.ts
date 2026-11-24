// #4044, critère 7 : l'aîné servi, le ticket retenu est libéré et passe seul ; la ligne « after #A » et la marque disparaissent.
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

test("once the earlier delivery merges, the held one goes on to merge with no action from the chef", async () => {
  const faux = new FauxGitHub();
  const aine = enPass(faux, 1, ["runtime/src/x.ts"]);
  enPass(faux, 2, ["runtime/src/x.ts"]);
  faux.ciEnCours.add(aine.number);
  const a = faux.station("A", { places: 3, avertir: () => {} });
  for (let i = 0; i < 8; i += 1) {
    if (i === 3) faux.ciEnCours.delete(aine.number);
    await a.tour();
    await a.calme();
    assert.ok(faux.mergee(2) === undefined || faux.mergee(1) !== undefined, "#2 never merges before #1");
  }
  assert.equal(faux.mergee(1)?.mergeePar, "A");
  assert.equal(faux.mergee(2)?.mergeePar, "A");
  assert.ok([...faux.commentaires.values()].flat().every((c) => c.station === "A"), "no comment but the station's");
});

test("once the earlier ticket is served, the card no longer says 'after #A' nor waits", async () => {
  const feux = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const lire = async (chemin: string): Promise<unknown> => (chemin === feux ? [{ number: 5, title: "#5", body: "Depends on #4", created_at: "2026-11-23T09:00:00Z", labels: [{ name: "fire" }, { name: "in-pass" }] }] : []);
  const dites = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-23T10:00:00.000Z") });
  assert.deepEqual(dites.filter((l) => /after #|waiting/i.test(l)), []);
});
