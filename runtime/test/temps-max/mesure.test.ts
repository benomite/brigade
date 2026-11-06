// Le temps des tickets contre le max du projet, en fonctions pures (#2515).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_PAR_DEFAUT_MIN, maxDuProjet, medianeDesRecents, phaseLaPlusLenteDesTickets, phaseLaPlusLenteDuTicket, ticketsLesPlusLents, ticketsRecents } from "../../src/temps-max/mesure.ts";
import { lesTempsDesTickets, type TempsTicket } from "../../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "../outils.ts";

const m = (n: number) => n * 60;
// Sans dates, la durée est la somme des phases.
const t = (ticket: number, cuisson: number, revue = 0, ci = 0, mergedAt?: string): TempsTicket => ({ ticket, cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: m(revue), ci: m(ci), merge: 0, ...(mergedAt === undefined ? {} : { mergedAt }) });

test("the project's max: 10 min by default, the project's own when it sets a valid one", () => {
  assert.equal(MAX_PAR_DEFAUT_MIN, 10);
  for (const projet of [undefined, null, [], {}, { tempsMaxTicketMin: 0 }, { tempsMaxTicketMin: -5 }, { tempsMaxTicketMin: "20" }, { tempsMaxTicketMin: Number.NaN }]) assert.equal(maxDuProjet(projet), 10);
  assert.equal(maxDuProjet({ tempsMaxTicketMin: 20 }), 20);
});

test("the max the runtime reads from .claude/brigade/projet.json: 10 without the key, 20 with \"tempsMaxTicketMin\": 20", (tc) => {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  assert.equal(lesTempsDesTickets(depot).tempsMaxTicketMin, 10);
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ name: "brigade" }));
  assert.equal(lesTempsDesTickets(depot).tempsMaxTicketMin, 10);
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ name: "brigade", tempsMaxTicketMin: 20 }));
  assert.equal(lesTempsDesTickets(depot).tempsMaxTicketMin, 20);
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
