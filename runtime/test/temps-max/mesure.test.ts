// Le temps des tickets contre le max du projet, en fonctions pures (#2515).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { medianeDesRecents, medianePerdueDesRecents, perteLaPlusLourde, pertesDuTicket, SEUIL_PERDU_PAR_DEFAUT_MIN, seuilDuProjet, phaseLaPlusLenteDesTickets, phaseLaPlusLenteDuTicket, tempsPerdu, ticketsLesPlusLents, ticketsRecents, totauxParPerte } from "../../src/temps-max/mesure.ts";
import { lesTempsDesTickets, type TempsTicket } from "../../src/temps-ticket/ligne-status.ts";
import { rattraperLaPrise } from "../../src/temps-ticket/mesure.ts";
import { repertoireTemporaire } from "../outils.ts";

const m = (n: number) => n * 60;
// Sans dates, la durée est la somme des phases.
const t = (ticket: number, cuisson: number, revue = 0, ci = 0, mergedAt?: string): TempsTicket => ({ ticket, cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: m(revue), ci: m(ci), merge: 0, ...(mergedAt === undefined ? {} : { mergedAt }) });

test("the project's lost-time threshold: 2 min by default, the project's own when it sets a valid one; tempsMaxTicketMin is no longer read", () => {
  assert.equal(SEUIL_PERDU_PAR_DEFAUT_MIN, 2);
  for (const projet of [undefined, null, [], {}, { lostTimeMaxMin: 0 }, { lostTimeMaxMin: -5 }, { lostTimeMaxMin: "20" }, { lostTimeMaxMin: Number.NaN }, { tempsMaxTicketMin: 20 }]) assert.equal(seuilDuProjet(projet), 2);
  assert.equal(seuilDuProjet({ lostTimeMaxMin: 5 }), 5);
});

test("the threshold the runtime reads from .claude/brigade/projet.json: 2 without the key, 5 with \"lostTimeMaxMin\": 5", (tc) => {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  assert.equal(lesTempsDesTickets(depot).lostTimeMaxMin, 2);
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ name: "brigade" }));
  assert.equal(lesTempsDesTickets(depot).lostTimeMaxMin, 2);
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ name: "brigade", lostTimeMaxMin: 5 }));
  assert.equal(lesTempsDesTickets(depot).lostTimeMaxMin, 5);
});

test("a ticket's lost time: as the measure wrote it, else drawn from its waits, failed cooks and send-backs", () => {
  assert.deepEqual(pertesDuTicket({ ...t(1, 10), perdu: { attente: m(3), ratees: m(4), renvois: m(5) } }), { qualification: 0, attente: m(3), ratees: m(4), renvois: m(5) });
  assert.deepEqual(pertesDuTicket({ ...t(1, 10), attenteQualification: m(1), attentePrise: m(2), cuissonsRatees: m(4), renvois: m(5) }), { qualification: m(1), attente: m(2), ratees: m(4), renvois: m(5) });
  assert.deepEqual(pertesDuTicket(t(1, 10)), { qualification: 0, attente: 0, ratees: 0, renvois: 0 });
  assert.equal(medianePerdueDesRecents([{ ...t(1, 10), attentePrise: m(1) }, { ...t(2, 10), attentePrise: m(9) }, { ...t(3, 10), cuissonsRatees: m(4) }]), m(4));
  assert.equal(medianePerdueDesRecents([]), null);
  // La perte qui pèse le plus, en tout ; rien de perdu, aucune.
  assert.equal(perteLaPlusLourde([{ ...t(1, 10), attentePrise: m(1) }, { ...t(2, 10), cuissonsRatees: m(4) }])?.nom, "failed cooks");
  assert.equal(perteLaPlusLourde([t(1, 10)]), null);
});

// BOBL-tech/mirrorlab#732 (#3422) : déposé à 15:40:33, mis sur le rail par le
// manager à 15:55:56, pris à 15:57:00. Ses 16,5 min passaient toutes pour
// l'attente d'une prise ; 15,4 sont celle du jugement du manager.
test("the wait for the manager's judgement, from filing to fire, is its own loss, not a wait for a claim; the lost time does not change (#3422)", () => {
  const mirrorlab732: TempsTicket = { ...t(732, 15), attenteQualification: 923, attentePrise: 64, perdu: { attente: 923 + 64, ratees: 0, renvois: 0 } };
  assert.deepEqual(pertesDuTicket(mirrorlab732), { qualification: 923, attente: 64, ratees: 0, renvois: 0 });
  assert.equal(tempsPerdu(mirrorlab732), 987);
  assert.equal(perteLaPlusLourde([mirrorlab732])?.nom, "waiting for the manager's judgement");
  // Une attente d'une prise retirée de `perdu.attente` (`rattraperLaPrise`) ne
  // prend rien au manager ; une qualification plus longue que l'attente écrite
  // n'en prend pas plus qu'elle.
  assert.deepEqual(pertesDuTicket({ ...t(1, 10), attenteQualification: m(2), perdu: { attente: m(1), ratees: 0, renvois: 0 } }), { qualification: m(1), attente: 0, ratees: 0, renvois: 0 });
  // La prise rattrapée sur GitHub (`rattraperLaPrise`) retire de `perdu.attente`
  // ce qui était une cuisson, jamais plus que l'attente d'une prise : le
  // jugement du manager reste entier, l'attente d'une prise seule rétrécit.
  const avant = { ...t(1, 0), mergedAt: "2026-11-12T16:10:00Z", depuis: "2026-11-12T15:40:33Z", claimedAt: "2026-11-12T16:00:00Z", attenteQualification: m(15), attentePrise: m(4.5), perdu: { attente: m(19.5), ratees: 0, renvois: 0 } };
  const rattrape = rattraperLaPrise(avant, "2026-11-12T15:57:00Z");
  assert.equal(rattrape.perdu?.attente, m(16.5));
  assert.deepEqual(pertesDuTicket(rattrape), { qualification: m(15), attente: m(1.5), ratees: 0, renvois: 0 });
  // À égalité, la perte la plus tôt dans la vie du ticket : le manager avant la prise.
  assert.equal(perteLaPlusLourde([{ ...t(1, 10), attenteQualification: m(2), attentePrise: m(2) }])?.nom, "waiting for the manager's judgement");
  assert.deepEqual(
    totauxParPerte([mirrorlab732, { ...t(2, 10), attentePrise: m(1) }]).map(({ nom, secondes, tickets }) => ({ nom, secondes, tickets })),
    [
      { nom: "waiting for the manager's judgement", secondes: 923, tickets: 1 },
      { nom: "waiting for a claim", secondes: 124, tickets: 2 },
      { nom: "failed cooks", secondes: 0, tickets: 0 },
      { nom: "send-backs", secondes: 0, tickets: 0 },
    ],
  );
});

test("recent tickets: the last 10, and every one merged in the 24 h before the last", () => {
  const sansDate = Array.from({ length: 12 }, (_, i) => t(i + 1, 1));
  assert.deepEqual(ticketsRecents(sansDate).map((r) => r.ticket), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const heure = (h: number) => new Date(Date.UTC(2026, 10, 5, 0) + h * 3_600_000).toISOString();
  // 14 tickets : le premier la veille, les 13 autres dans la journée du dernier.
  const journee = [t(1, 1, 0, 0, heure(-30)), ...Array.from({ length: 13 }, (_, i) => t(i + 2, 1, 0, 0, heure(i)))];
  assert.deepEqual(ticketsRecents(journee).map((r) => r.ticket), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(ticketsRecents([]), []);
});

test("the median of the recent tickets, in seconds; none measured, null", () => {
  assert.equal(medianeDesRecents([t(1, 4), t(2, 18), t(3, 81)]), m(18));
  assert.equal(medianeDesRecents([t(1, 10), t(2, 20)]), m(15));
  assert.equal(medianeDesRecents([]), null);
});

test("the slowest phase of a ticket and of a set of tickets, with its figures", () => {
  assert.deepEqual(phaseLaPlusLenteDuTicket(t(7, 8, 14, 2)), { phase: "revue", nom: "review", secondes: m(14), mediane: m(14), part: 14 / 24 });
  // À égalité, la plus tôt dans la vie du ticket.
  assert.equal(phaseLaPlusLenteDuTicket(t(7, 5, 5)).nom, "cooking");
  const lente = phaseLaPlusLenteDesTickets([t(1, 2, 10), t(2, 30, 1), t(3, 4, 2)]);
  assert.deepEqual(lente, { phase: "cuisson", nom: "cooking", secondes: m(36), mediane: m(4), part: 36 / 49 });
});

test("the slowest tickets, longest first", () => {
  assert.deepEqual(ticketsLesPlusLents([t(1, 5), t(2, 81), t(3, 49), t(4, 74)], 2).map((r) => r.ticket), [2, 4]);
});
