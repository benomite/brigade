// #4044, critère 9 : sans dépendance déclarée ni fichier commun, aucune ligne, marque ou état de plus qu'aujourd'hui.
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

// brigade:guard
test("tickets with no declared dependency and no common file show nothing more and merge freely", async () => {
  const feuxPath = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const feux = [4, 5].map((number) => ({ number, title: `#${number}`, body: "Independent work.", created_at: "2026-11-23T09:00:00Z", labels: [{ name: "fire" }] }));
  const maintenant = Date.parse("2026-11-23T10:00:00.000Z");
  const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(maintenant - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
  const dites = await lignesDeLAttente({ depot: DEPOT, lire: async (chemin) => (chemin === feuxPath ? feux : []), stations: enLigne, maintenant });
  assert.deepEqual(dites, ["queue wait A cook takes the ticket within minutes. It resolves by itself."]);

  const faux = new FauxGitHub();
  enPass(faux, 1, ["runtime/src/x.ts"]);
  enPass(faux, 2, ["runtime/src/y.ts"]);
  const a = faux.station("A", { places: 3, avertir: () => {} });
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(1)?.mergeePar, "A");
  assert.equal(faux.mergee(2)?.mergeePar, "A");
});
