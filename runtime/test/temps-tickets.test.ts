// Le temps d'un ticket du dépôt (ou de `fire`) au merge, phase par phase, et
// l'alerte des 10 minutes qui le lit (#2662, épique #2659).
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ticketDeCorrection } from "../src/temps-max/correction.ts";
import { medianeDesRecents } from "../src/temps-max/mesure.ts";
import { chronometre, enregistrerTemps, FICHIER_DES_TEMPS, type Historique, rejouer, resumer } from "../src/temps-ticket/mesure.ts";
import { lesTempsDesTickets } from "../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "./outils.ts";

const JOUR = Date.UTC(2026, 10, 6);
// `hm(10, 20)` : 10:20 UTC, le jour du ticket.
const hm = (h: number, m: number) => new Date(JOUR + (h * 60 + m) * 60_000).toISOString();

// Le ticket de la fiche : déposé à 10:00, mis sur le rail à 10:02, pris à 10:05,
// son cook s'arrête sans livraison à 10:15, repris à 10:20, livré à 10:28,
// approuvé à 10:31, merge demandé à 10:34, mergé à 10:35.
const PHASES_DU_TICKET = [
  { nom: "qualification wait", minutes: 2 },
  { nom: "claim wait", minutes: 3 },
  { nom: "failed cook", minutes: 10 },
  { nom: "claim wait", minutes: 5 },
  { nom: "cooking", minutes: 8 },
  { nom: "pass wait", minutes: 3 },
  { nom: "CI", minutes: 3 },
  { nom: "merge", minutes: 1 },
];

const historique = (ticket: number, depose: string, autres: Partial<Historique> = {}): Historique => ({
  ticket,
  createdAt: depose,
  labels: [],
  mergedAt: hm(10, 35),
  evenements: [{ event: "labeled", label: "fire", createdAt: hm(10, 2) }],
  commentaires: [],
  ...autres,
});

const DU_TICKET: Historique = historique(42, hm(10, 0), {
  evenements: [
    { event: "labeled", label: "fire", createdAt: hm(10, 2) },
    { event: "labeled", label: "in-pass", createdAt: hm(10, 28) },
  ],
  commentaires: [
    { body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 5) },
    { body: "<!-- brigade:echec n=1 -->\nStation `box/a`: the cook stopped without a delivery — tests red", createdAt: hm(10, 15) },
    { body: "<!-- brigade:prise station=box/b -->", createdAt: hm(10, 20) },
    { body: "<!-- brigade:verdict station=box/b verdict=approve sha=abc123 -->", createdAt: hm(10, 31) },
  ],
});

describe("a ticket's time runs from its filing to its merge", () => {
  test("filed at 10:00, claimed at 10:20 after one failed cook, merged at 10:35: 35 min, its phases listed", () => {
    let maintenant = Date.parse(hm(10, 5));
    const chrono = chronometre(() => new Date(maintenant));
    chrono.prendre(42);
    maintenant = Date.parse(hm(10, 15));
    chrono.rater(42);
    maintenant = Date.parse(hm(10, 20));
    chrono.prendre(42);
    maintenant = Date.parse(hm(10, 28));
    chrono.marquer(42, "attentePasse");
    maintenant = Date.parse(hm(10, 31));
    chrono.marquer(42, "ci");
    maintenant = Date.parse(hm(10, 34));
    chrono.marquer(42, "merge");
    maintenant = Date.parse(hm(10, 35));
    const temps = chrono.servir(42, { deposeAt: hm(10, 0), fireAt: hm(10, 2) });
    assert.ok(temps !== null);
    assert.equal(temps.depuis, hm(10, 0));
    assert.equal((Date.parse(temps.mergedAt) - Date.parse(temps.depuis ?? "")) / 60_000, 35);
    assert.deepEqual(temps.phases, PHASES_DU_TICKET);
    assert.equal(temps.cuissonsRatees, 600);
    assert.equal(temps.attentePrise, 480);
    assert.equal(medianeDesRecents([temps]), 35 * 60);
  });

  test("the same ticket replayed from its GitHub history gives the same 35 min and phases, the merge request inside the CI", () => {
    const [temps] = rejouer([DU_TICKET]);
    assert.equal(temps?.depuis, hm(10, 0));
    assert.deepEqual(temps?.phases, [...PHASES_DU_TICKET.slice(0, 6), { nom: "CI", minutes: 4 }]);
  });

  test("filed long before it was put on the rail, its time runs from fire, with no qualification wait", () => {
    const [temps] = rejouer([historique(43, hm(10, 0).replace("06T", "04T"), { commentaires: [{ body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 5) }] })]);
    assert.equal(temps?.depuis, hm(10, 2));
    assert.equal(temps?.attenteQualification, 0);
    assert.deepEqual(temps?.phases, [
      { nom: "claim wait", minutes: 3 },
      { nom: "cooking", minutes: 30 },
    ]);
  });

  test("a send-back is its own phase, until the next cook", () => {
    const [temps] = rejouer([
      historique(44, hm(10, 0), {
        evenements: [
          { event: "labeled", label: "fire", createdAt: hm(10, 0) },
          { event: "labeled", label: "in-pass", createdAt: hm(10, 10) },
          { event: "labeled", label: "in-pass", createdAt: hm(10, 25) },
        ],
        commentaires: [
          { body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 0) },
          { body: "<!-- brigade:renvoi n=1 sha=abc -->\nsent back", createdAt: hm(10, 15) },
          { body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 18) },
          { body: "<!-- brigade:verdict station=box/a verdict=approve sha=def -->", createdAt: hm(10, 30) },
        ],
      }),
    ]);
    assert.deepEqual(temps?.phases, [
      { nom: "cooking", minutes: 10 },
      { nom: "pass wait", minutes: 5 },
      { nom: "send-back", minutes: 3 },
      { nom: "cooking", minutes: 7 },
      { nom: "pass wait", minutes: 5 },
      { nom: "CI", minutes: 5 },
    ]);
  });

  test("epics are absent from the measure, their sub-tickets present; an issue closed without a merge is not measured", () => {
    const epique = historique(50, hm(9, 0), { labels: ["epic"], mergedAt: null });
    const epiqueMergee = historique(51, hm(9, 0), { evenements: [{ event: "labeled", label: "epic", createdAt: hm(9, 0) }] });
    const sousTicket = historique(52, hm(10, 0), { commentaires: [{ body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 3) }] });
    const fermee = historique(53, hm(10, 0), { mergedAt: null });
    assert.deepEqual(rejouer([epique, epiqueMergee, sousTicket, fermee]).map((t) => t.ticket), [52]);
  });
});

describe("temps-tickets.json and the 10-minute alert read this time", () => {
  test("the file carries the summary of the recent tickets and each ticket's phases", (tc) => {
    const depot = repertoireTemporaire(tc);
    mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
    writeFileSync(join(depot, ".claude", "brigade", "projet.json"), "{}");
    for (const temps of rejouer([DU_TICKET])) enregistrerTemps(depot, temps);
    const lu = JSON.parse(readFileSync(join(depot, FICHIER_DES_TEMPS), "utf8")) as { resume: unknown; tickets: { phases: unknown[] }[] };
    assert.deepEqual(lu.resume, { n: 1, medianMin: 35, p75Min: 35, maxMin: 10, phaseLaPlusLongue: { nom: "failed cooks", medianMin: 10, partPct: 29 } });
    assert.equal(lu.tickets[0]?.phases.length, 7);
    assert.equal(lesTempsDesTickets(depot).enregistrements.length, 1);
  });

  test("the file written before #2662, a bare array, is still read and rewritten whole", (tc) => {
    const depot = repertoireTemporaire(tc);
    mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
    const ancien = { ticket: 1, claimedAt: hm(9, 0), mergedAt: hm(9, 4), cuisson: 240, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
    writeFileSync(join(depot, FICHIER_DES_TEMPS), JSON.stringify([ancien]));
    assert.equal(lesTempsDesTickets(depot).enregistrements.length, 1);
    for (const temps of rejouer([DU_TICKET])) enregistrerTemps(depot, temps);
    assert.deepEqual(lesTempsDesTickets(depot).enregistrements.map((t) => t.ticket), [1, 42]);
  });

  test("over the max, the correction ticket counts from filing and names the slowest phase with its median and share", () => {
    const tickets = rejouer([DU_TICKET, { ...DU_TICKET, ticket: 43 }, { ...DU_TICKET, ticket: 44 }]);
    const correction = ticketDeCorrection(tickets, 10);
    assert.ok(correction !== null);
    assert.match(correction.titre, /median 35 min over the max of 10 min — failed cooks is the slowest phase/);
    assert.match(correction.corps, /from filing \(or `fire`\) to merge, is \*\*35 min\*\*/);
    assert.match(correction.corps, /\*\*failed cooks\*\*: 30 min of these tickets' time \(29%\), a median of 10 min per ticket/);
  });

  test("the summary's p75 is the nearest-rank one, its median the one the alert reads", () => {
    const tickets = [10, 12, 14, 20, 47, 60].map((minutes, rang) => ({ ticket: rang + 1, depuis: hm(8, 0), claimedAt: hm(9, 0), mergedAt: hm(8, minutes), cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, attentePrise: minutes * 60 }));
    const resume = resumer(tickets, 10);
    assert.equal(resume.medianMin, 17);
    assert.equal(resume.p75Min, 47);
    assert.equal(medianeDesRecents(tickets), 17 * 60);
    assert.equal(resume.phaseLaPlusLongue.nom, "claim wait");
  });
});
