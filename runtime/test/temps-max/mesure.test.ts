// Le temps des tickets contre le max du projet, en fonctions pures (#2515).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { medianeDesRecents, medianePerdueDesRecents, perteLaPlusLourde, pertesDuTicket, SEUIL_PERDU_PAR_DEFAUT_MIN, seuilDuProjet, phaseLaPlusLenteDesTickets, phaseLaPlusLenteDuTicket, ticketsLesPlusLents, ticketsRecents } from "../../src/temps-max/mesure.ts";
import { lesTempsDesTickets, type TempsTicket } from "../../src/temps-ticket/ligne-status.ts";
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
  assert.deepEqual(pertesDuTicket({ ...t(1, 10), perdu: { attente: m(3), ratees: m(4), renvois: m(5) } }), { attente: m(3), ratees: m(4), renvois: m(5) });
  assert.deepEqual(pertesDuTicket({ ...t(1, 10), attenteQualification: m(1), attentePrise: m(2), cuissonsRatees: m(4), renvois: m(5) }), { attente: m(3), ratees: m(4), renvois: m(5) });
  assert.deepEqual(pertesDuTicket(t(1, 10)), { attente: 0, ratees: 0, renvois: 0 });
  assert.equal(medianePerdueDesRecents([{ ...t(1, 10), attentePrise: m(1) }, { ...t(2, 10), attentePrise: m(9) }, { ...t(3, 10), cuissonsRatees: m(4) }]), m(4));
  assert.equal(medianePerdueDesRecents([]), null);
  // La perte qui pèse le plus, en tout ; rien de perdu, aucune.
  assert.equal(perteLaPlusLourde([{ ...t(1, 10), attentePrise: m(1) }, { ...t(2, 10), cuissonsRatees: m(4) }])?.nom, "failed cooks");
  assert.equal(perteLaPlusLourde([t(1, 10)]), null);
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
