// #4226, critère 1 : le compte des essais d'un ticket ne bouge ni à une nouvelle prise, ni à une réécriture du manager,
// ni à un découpage, ni à une passe du superviseur, ni à un redémarrage de la station.
// Deux refus, puis l'événement : le refus suivant est le troisième, il met le ticket de côté — aucun quatrième cook.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { HORS_CUISINE } from "../../src/github.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 7;

type Evenement = { nom: string; jouer: (faux: FauxGitHub) => void; station?: string };

// Ce que chaque événement fait au ticket, hors du compte : tout ce qui, aujourd'hui, le remet à zéro.
const relance = (faux: FauxGitHub) => {
  const dernier = (faux.commentaires.get(TICKET) ?? []).at(-1);
  const apres = new Date(Date.parse(dernier?.createdAt ?? "2026-11-02T00:00:00Z") + 500).toISOString();
  faux.retraits.set(TICKET, [...(faux.retraits.get(TICKET) ?? []), { label: HORS_CUISINE, createdAt: apres }]);
};
const EVENEMENTS: Evenement[] = [
  { nom: "a new claim", station: "B", jouer: (faux) => { faux.ticket(TICKET).labels.delete(LABEL_TAKEN); relance(faux); } },
  { nom: "a manager rewrite", jouer: (faux) => { faux.corpsEcrivables = true; faux.ticket(TICKET).corps = "the ticket's body, rewritten by the manager"; relance(faux); } },
  { nom: "a split", jouer: (faux) => { faux.feu(8, undefined, `Born of the split of #${TICKET}`); relance(faux); } },
  { nom: "a supervisor pass", jouer: (faux) => { faux.poster(TICKET, "supervisor", "<!-- brigade:supervisor -->\nSupervisor pass: the ticket is put back on the rail."); relance(faux); } },
  { nom: "a station restart", station: "A2", jouer: () => {} },
];

for (const evenement of EVENEMENTS) {
  test(`the count stays the same after ${evenement.nom}: the next refusal is the third and parks the ticket`, async () => {
    const faux = new FauxGitHub();
    faux.feu(TICKET);
    let refus = 0;
    const options = {
      juger: async (ticket: { number: number }) => (ticket.number === TICKET ? { verdict: "request-changes" as const, motif: `Problem number ${(refus += 1)}.` } : { verdict: "approve" as const, motif: "" }),
      avertir: () => {},
    };
    const tourner = async (station: ReturnType<FauxGitHub["station"]>, jusqua: number) => {
      for (let tour = 0; tour < 12 && refus < jusqua; tour += 1) {
        await station.tour();
        await station.calme();
      }
    };
    const a = faux.station("A", options);
    await tourner(a, 2);
    assert.equal(refus, 2, "two refusals so far");
    evenement.jouer(faux);
    const suite = evenement.station === undefined ? a : faux.station(evenement.station, options);
    await tourner(suite, 3);
    for (let tour = 0; tour < 4; tour += 1) {
      await suite.tour();
      await suite.calme();
    }
    assert.equal(refus, 3, "the third refusal came, and there is no fourth");
    assert.equal(faux.cuissons.filter(({ issue }) => issue === TICKET).length, 3, "three cooks in the ticket's life, none after the third refusal");
    assert.match((faux.commentaires.get(TICKET) ?? []).map(({ body }) => body).join("\n"), /parked/i, "the third refusal parks the ticket for the chef");
  });
}
