// Le temps d'un ticket du dépôt (ou de `fire`) au merge, phase par phase (#2662,
// épique #2659), son temps perdu, et l'alerte qui le lit (#2670).
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ticketDeCorrection } from "../src/temps-max/correction.ts";
import { medianeDesRecents, medianePerdueDesRecents, tempsPerdu } from "../src/temps-max/mesure.ts";
import { chronometre, type DepotDuTicket, enregistrerTemps, type Etape, FICHIER_DES_TEMPS, rattraperLaPrise, resumer } from "../src/temps-ticket/mesure.ts";
import { lesTempsDesTickets } from "../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "./outils.ts";
import { type Historique, rejouer } from "./temps-ticket/rejeu.ts";

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
    // Perdu : tout sauf le cook qui a livré, sa pass, sa CI et son merge — 20 des 35 min.
    assert.deepEqual(temps.perdu, { attente: 600, ratees: 600, renvois: 0 });
    assert.equal(medianePerdueDesRecents([temps]), 20 * 60);
  });

  test("merged by a station that did not see its claim, its claim wait ends at the first claim the issue bears, and the rest is cooking (#2732)", () => {
    // Pris à 10:05 par une autre station (ou avant un redémarrage) : celle qui
    // merge ne le voit qu'en CI à 10:30. Sans la prise, ses 33 min passaient
    // pour l'attente d'une prise.
    let maintenant = Date.parse(hm(10, 30));
    const chrono = chronometre(() => new Date(maintenant));
    chrono.marquer(42, "ci");
    maintenant = Date.parse(hm(10, 34));
    chrono.marquer(42, "merge");
    maintenant = Date.parse(hm(10, 35));
    const temps = chrono.servir(42, { deposeAt: hm(10, 0), fireAt: hm(10, 2), priseAt: hm(10, 5) });
    assert.ok(temps !== null);
    assert.deepEqual(temps.phases, [
      { nom: "qualification wait", minutes: 2 },
      { nom: "claim wait", minutes: 3 },
      { nom: "cooking", minutes: 25 },
      { nom: "CI", minutes: 4 },
      { nom: "merge", minutes: 1 },
    ]);
    assert.deepEqual(temps.perdu, { attente: 300, ratees: 0, renvois: 0 });
    assert.equal(tempsPerdu(temps), 5 * 60);
  });

  test("a claim read before the ticket was put on the rail, or after the station saw it claimed, changes nothing", () => {
    const vue = (priseAt: string) => {
      let maintenant = Date.parse(hm(10, 20));
      const chrono = chronometre(() => new Date(maintenant));
      chrono.prendre(42);
      maintenant = Date.parse(hm(10, 35));
      return chrono.servir(42, { deposeAt: hm(10, 0), fireAt: hm(10, 2), priseAt });
    };
    const sans = (() => {
      let maintenant = Date.parse(hm(10, 20));
      const chrono = chronometre(() => new Date(maintenant));
      chrono.prendre(42);
      maintenant = Date.parse(hm(10, 35));
      return chrono.servir(42, { deposeAt: hm(10, 0), fireAt: hm(10, 2) });
    })();
    const sansPrise = (temps: ReturnType<typeof vue>) => ({ ...temps, priseAt: null });
    assert.deepEqual(sansPrise(vue(hm(10, 1))), sans);
    assert.deepEqual(sansPrise(vue(hm(10, 25))), sans);
    assert.deepEqual(sans?.perdu, { attente: 20 * 60, ratees: 0, renvois: 0 });
  });

  // Un ticket mergé avant #2732 par une station qui n'a vu de lui que `vues`
  // (marques posées dans l'ordre, chacune à son instant) : son enregistrement
  // d'alors, sans la prise, et celui d'aujourd'hui, avec elle.
  const avantEtApres = (vues: [Etape, string][], mergedAt: string) => {
    const servi = (depot: DepotDuTicket) => {
      let maintenant = 0;
      const chrono = chronometre(() => new Date(maintenant));
      for (const [etape, at] of vues) {
        maintenant = Date.parse(at);
        chrono.marquer(42, etape);
      }
      maintenant = Date.parse(mergedAt);
      const temps = chrono.servir(42, depot);
      assert.ok(temps !== null);
      return temps;
    };
    const { priseAt: _priseAt, ...avant } = servi({ deposeAt: hm(10, 0), fireAt: hm(10, 2) });
    return { avant, apres: servi({ deposeAt: hm(10, 0), fireAt: hm(10, 2), priseAt: hm(10, 5) }) };
  };

  test("a record measured before #2732 is caught up with the claim its issue bears, as the measure does today (#2734)", () => {
    // Le cas de #2709 : vu en CI seulement, 309 min de ses 310 passaient pour l'attente d'une prise.
    const { avant, apres } = avantEtApres([["ci", hm(10, 30)], ["merge", hm(10, 34)]], hm(10, 35));
    assert.deepEqual(avant.perdu, { attente: 30 * 60, ratees: 0, renvois: 0 });
    assert.deepEqual(rattraperLaPrise(avant, hm(10, 5)), apres);
    assert.equal(tempsPerdu(rattraperLaPrise(avant, hm(10, 5))), 5 * 60);
  });

  test("caught up, the cooking the station did not see before a cooking it saw is a send-back", () => {
    const { avant, apres } = avantEtApres([["cuisson", hm(10, 40)], ["ci", hm(10, 50)]], hm(10, 55));
    assert.deepEqual(rattraperLaPrise(avant, hm(10, 5)), apres);
    assert.deepEqual(apres.perdu, { attente: 5 * 60, ratees: 0, renvois: 35 * 60 });
  });

  test("caught up with no claim, or one the station saw, a record only learns it was read", () => {
    const { avant } = avantEtApres([["cuisson", hm(10, 20)]], hm(10, 35));
    assert.deepEqual(rattraperLaPrise(avant, null), { ...avant, priseAt: null });
    assert.deepEqual(rattraperLaPrise(avant, hm(10, 25)), { ...avant, priseAt: hm(10, 25) });
    assert.deepEqual(rattraperLaPrise(avant, hm(10, 1)), { ...avant, priseAt: hm(10, 1) });
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
    // La livraison renvoyée — sa cuisson, sa pass — et le renvoi sont perdus ; la livraison mergée ne l'est pas.
    assert.deepEqual(temps?.perdu, { attente: 0, ratees: 0, renvois: 18 * 60 });
  });

  test("epics are absent from the measure, their sub-tickets present; an issue closed without a merge is not measured", () => {
    const epique = historique(50, hm(9, 0), { labels: ["epic"], mergedAt: null });
    const epiqueMergee = historique(51, hm(9, 0), { evenements: [{ event: "labeled", label: "epic", createdAt: hm(9, 0) }] });
    const sousTicket = historique(52, hm(10, 0), { commentaires: [{ body: "<!-- brigade:prise station=box/a -->", createdAt: hm(10, 3) }] });
    const fermee = historique(53, hm(10, 0), { mergedAt: null });
    assert.deepEqual(rejouer([epique, epiqueMergee, sousTicket, fermee]).map((t) => t.ticket), [52]);
  });
});

describe("temps-tickets.json and the lost-time alert read this time", () => {
  test("the file carries the summary of the recent tickets and each ticket's phases", (tc) => {
    const depot = repertoireTemporaire(tc);
    mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
    writeFileSync(join(depot, ".claude", "brigade", "projet.json"), "{}");
    for (const temps of rejouer([DU_TICKET])) enregistrerTemps(depot, temps);
    const lu = JSON.parse(readFileSync(join(depot, FICHIER_DES_TEMPS), "utf8")) as { resume: unknown; tickets: { phases: unknown[] }[] };
    assert.deepEqual(lu.resume, {
      n: 1,
      medianMin: 35,
      p75Min: 35,
      perduMedianMin: 20,
      lostTimeMaxMin: 2,
      phaseLaPlusLongue: { nom: "failed cooks", medianMin: 10, partPct: 29 },
      // À égalité avec les cooks ratés, la perte la plus tôt dans la vie du ticket.
      perteLaPlusLourde: { nom: "waiting for a claim", medianMin: 10, partPct: 50 },
    });
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

  test("the project's threshold is lostTimeMaxMin of projet.json, 2 min without it", (tc) => {
    const depot = repertoireTemporaire(tc);
    mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
    assert.equal(lesTempsDesTickets(depot).lostTimeMaxMin, 2);
    writeFileSync(join(depot, ".claude", "brigade", "projet.json"), JSON.stringify({ lostTimeMaxMin: 5, tempsMaxTicketMin: 30 }));
    assert.equal(lesTempsDesTickets(depot).lostTimeMaxMin, 5);
    assert.ok(!("tempsMaxTicketMin" in lesTempsDesTickets(depot)));
    for (const temps of rejouer([DU_TICKET])) enregistrerTemps(depot, temps);
    assert.equal((JSON.parse(readFileSync(join(depot, FICHIER_DES_TEMPS), "utf8")) as { resume: { lostTimeMaxMin: number } }).resume.lostTimeMaxMin, 5);
  });

  test("over the threshold, the correction ticket counts the lost time and names the loss that weighs most", () => {
    const tickets = rejouer([DU_TICKET, { ...DU_TICKET, ticket: 43 }, { ...DU_TICKET, ticket: 44 }]);
    const correction = ticketDeCorrection(tickets, 2);
    assert.ok(correction !== null);
    assert.equal(correction.titre, "Tickets lose too much time: median 20 min lost over the threshold of 2 min — waiting for a claim weighs most");
    assert.match(correction.corps, /These tickets lost 60 min of their 105 min\./);
    assert.match(correction.corps, /\*\*waiting for a claim\*\*: 30 min of these tickets' lost time \(50%\), a median of 10 min per ticket, in 3 of the 3 tickets/);
    assert.match(correction.corps, /^- #42: 10 min of waiting for a claim — 20 min lost of 35 min$/m);
  });
});

// Les 40 tickets servis du 6 et du 7 novembre, tels que GitHub les a gardés
// (`fixtures/temps-tickets-40`) : ceux que l'épique #2659 a chiffrés.
const ENREGISTRES = (JSON.parse(readFileSync(new URL("./fixtures/temps-tickets-40/historiques.json", import.meta.url), "utf8")) as { historiques: Historique[] }).historiques;

describe("brigade's 40 tickets closed on 2026-11-06 and 07, replayed from their recorded history", () => {
  const rejoues = rejouer(ENREGISTRES);

  test("the epics and the issue closed without a merge are left out, the 40 sub-tickets measured", () => {
    assert.equal(ENREGISTRES.length, 47);
    assert.equal(rejoues.length, 40);
    for (const absent of [2484, 2498, 2514, 2553, 2582, 2583, 2616]) assert.ok(!rejoues.some((t) => t.ticket === absent), `#${absent}`);
  });

  test("median 14 min, p75 47 min, and the slowest phase is the wait before the claim, not cooking", () => {
    const resume = resumer(rejoues, 10);
    assert.equal(resume.n, 40);
    assert.equal(resume.medianMin, 14);
    assert.equal(resume.p75Min, 47);
    assert.ok(["claim wait", "failed cooks"].includes(resume.phaseLaPlusLongue.nom), resume.phaseLaPlusLongue.nom);
    assert.deepEqual(resume.phaseLaPlusLongue, { nom: "claim wait", medianMin: 5, partPct: 54 });
  });

  // #2670 : le temps perdu de ces tickets, contre le seuil de 2 min.
  test("their median lost time is over 2 min, and most of it is waiting before the claim", () => {
    const resume = resumer(rejoues, 2);
    assert.ok(resume.perduMedianMin > 2, String(resume.perduMedianMin));
    assert.equal(resume.perduMedianMin, 7.7);
    assert.deepEqual(resume.perteLaPlusLourde, { nom: "waiting for a claim", medianMin: 4.8, partPct: 57 });
    // Le cook qui a livré et sa pass ne sont jamais perdus : chaque ticket perd moins que tout son temps.
    for (const t of rejoues) assert.ok(tempsPerdu(t) < (Date.parse(t.mergedAt) - Date.parse(t.depuis ?? t.claimedAt)) / 1000, `#${t.ticket}`);
  });

  test("the correction ticket they open names waiting before the claim, with its figures and the tickets concerned", () => {
    const correction = ticketDeCorrection(rejoues, 2);
    assert.ok(correction !== null);
    const [, perte] = /— (.+) weighs most$/.exec(correction.titre) ?? [];
    assert.ok(["waiting for a claim", "failed cooks"].includes(perte ?? ""), correction.titre);
    assert.equal(correction.titre, "Tickets lose too much time: median 7.7 min lost over the threshold of 2 min — waiting for a claim weighs most");
    assert.match(correction.corps, /\*\*waiting for a claim\*\*: 3329 min of these tickets' lost time \(57%\), a median of 4\.8 min per ticket, in 40 of the 40 tickets\./);
    assert.match(correction.corps, /^- failed cooks: 633 min \(11%\), median 0 min per ticket, in 10 tickets$/m);
    assert.match(correction.corps, /## Tickets concerned\n\n- #2479: 1217 min of waiting for a claim — 1235 min lost of 1238 min\n/);
    assert.match(correction.corps, /^- and 30 more$/m);
  });
});
