// La phrase d'une carte du rail (#622) : une par état, écrite d'après les faits que la file donne déjà.
// Chaque état a son test : ce que `faits` donne → la phrase exacte, le signal, le repère. Aucune carte
// ne porte un mot du runtime (« bail », « 86 », « non communiqué »), ni plus de deux lignes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Card, type Facts } from "../src/facts.ts";
import { hourHM } from "../src/format.ts";
import { dayOf } from "../src/vue/wait/input.ts";
import { lineAtWork, queuedLine, lineInWaiting, lineDelivered, lineSetAside, lineAwaitingMe, READY } from "../src/line-card.ts";
import { NOT_STILL_OF_ACTIVITY } from "../src/vue/card/activity.ts";

const READ = "2026-10-12T10:04:11.000Z";
const url = (n: number) => `https://github.com/benomite/brigade/issues/${n}`;
const FACTS: Facts = {
  etat: "ouverte",
  lu: READ,
  dernierTick: READ,
  compteurs: { rail: 5, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 1, etat: "pris", titre: "Au travail", url: url(1), activite: { fait: "écrit les tests", faitEn: "writing the tests", cible: null, depuis: "2026-10-12T09:52:11.000Z" }, attente: null },
    { ticket: 2, etat: "en attente", titre: "Prêt", url: url(2), activite: null, attente: null },
    { ticket: 3, etat: "en pass", titre: "En pass", url: url(3), activite: { fait: "relecture en cours", faitEn: "review in progress", cible: null, depuis: "2026-10-12T10:03:11.000Z" }, attente: null },
    { ticket: 4, etat: "86", titre: "Mis de côté", url: url(4), activite: null, attente: { raison: "attend : setup du projet impossible", colonne: "en attente", retour: null } },
    { ticket: 5, etat: "WAITING", titre: "Chez un tiers", url: url(5), activite: null, attente: null, tiers: { quoi: "le devis", qui: "le client", depuis: "2026-10-11T10:04:11.000Z", relance: "2026-10-10T00:00:00.000Z", aLArrivee: "il repart en cuisine" } },
  ],
  attend: [{ ticket: 6, titre: "Qui m'attend", url: url(6) }],
  livres: [{ ticket: 7, titre: "Livré", url: url(7), livre: "2026-10-12T10:00:00.000Z", station: "box/claude", pr: null, relecture: { resume: "Le rail se lit en deux lignes. Le détail est sur la fiche.", constats: [] } }],
};
const cards = (facts: Facts): Card[] => {
  const draws = rail(facts);
  return [...draws.colonnes.flatMap(({ cartes: itsOwn }) => itsOwn), ...draws.hors];
};
const of = (facts: Facts, ticket: number): Card => cards(facts).find((card) => card.ticket === ticket) ?? assert.fail(`pas de carte #${ticket}`);
const sentence = ({ ligne: line, signal, repere: marker }: Card) => ({ ligne: line, ...(signal === undefined ? {} : { signal }), ...(marker === undefined ? {} : { repere: marker }) });

describe("la phrase de chaque état d'une carte (#622)", () => {
  test("au travail : ce que le cook fait, et depuis combien de temps", () => {
    assert.deepEqual(sentence(of(FACTS, 1)), { ligne: "writing the tests · 12 min ago" });
    assert.deepEqual(lineAtWork({ faitEn: "reading", cible: "runtime/src/etat.ts" }, "3 min"), { ligne: "reading runtime/src/etat.ts · 3 min ago" });
    assert.deepEqual(lineAtWork({ faitEn: "writing", cible: "app/src/bon.ts" }, "2 s"), { ligne: "writing app/src/bon.ts · 2 s ago" });
    assert.deepEqual(lineAtWork({ faitEn: "running a command", cible: null }, "5 s"), { ligne: "running a command · 5 s ago" });
    // Un cook qui réfléchit le dit lui aussi, avec son âge (ticket 3923) : la carte dit ce que fait son cook.
    assert.deepEqual(lineAtWork({ faitEn: "thinking", cible: null }, "2 s"), { ligne: "thinking · 2 s ago" });
    // Un runtime d'avant `faitEn` : le français ne passe pas sur la carte.
    assert.deepEqual(lineAtWork({ cible: null }, "2 s"), { ligne: NOT_STILL_OF_ACTIVITY, repere: true });
    // La box ne sait pas ce qu'on en fait : trois mots neutres, et le repère.
    assert.deepEqual(lineAtWork(null, ""), { ligne: NOT_STILL_OF_ACTIVITY, repere: true });
    assert.deepEqual(lineAtWork(undefined, ""), { ligne: NOT_STILL_OF_ACTIVITY, repere: true });
  });

  test("en pass : ce que fait la pass, et depuis quand ; sans activité, « no activity yet »", () => {
    assert.deepEqual(sentence(of(FACTS, 3)), { ligne: "review in progress · 1 min ago" });
    assert.deepEqual(lineAtWork(null, ""), { ligne: NOT_STILL_OF_ACTIVITY, repere: true });
  });

  test("en attente : après les tickets qui la retiennent, ou prête à prendre une place — jamais « non communiqué »", () => {
    assert.deepEqual(sentence(of(FACTS, 2)), { ligne: READY });
    assert.deepEqual(queuedLine("en attente", "zone tenue par #14 (app/src)"), { ligne: "Waiting for #14", liens: [14] });
    assert.deepEqual(queuedLine("en attente", "après #604 et #605, puis #604"), { ligne: "Waiting for #604, #605", liens: [604, 605] });
    assert.deepEqual(queuedLine("en attente", undefined), { ligne: READY });
  });

  test("bloquée : ce qui la retient, avec un signal ; sans cause donnée, le repère", () => {
    assert.deepEqual(queuedLine("BLOQUÉ", "zone tenue par #14"), { ligne: "Waiting for #14", signal: "blocked", liens: [14] });
    assert.deepEqual(queuedLine("BLOQUÉ", "label `fire` manquant"), { ligne: "label `fire` manquant", signal: "blocked" });
    assert.deepEqual(queuedLine("BLOQUÉ", undefined), { ligne: "blocked", signal: "blocked", repere: true });
  });

  test("mise de côté (86) : sa raison en clair, jamais le mot « 86 »", () => {
    const card = of(FACTS, 4);
    assert.deepEqual(sentence(card), { ligne: "attend : setup du projet impossible", signal: "set aside" });
    assert.deepEqual(lineSetAside("x"), { ligne: "x", signal: "set aside" });
    assert.doesNotMatch(JSON.stringify(sentence(card)), /\b86\b/);
  });

  test("chez un tiers (WAITING) : ce qu'il attend, de qui, et sa relance ; la relance passée est un signal", () => {
    assert.deepEqual(sentence(of(FACTS, 5)), { ligne: `waiting for le devis · from le client · follow-up ${dayOf(new Date("2026-10-10T00:00:00.000Z"))}`, signal: "follow-up date passed" });
    assert.deepEqual(lineInWaiting({ quoi: "un accès", qui: "Sam" }, false), { ligne: "waiting for un accès · from Sam" });
    // Sa relance, au jour du poste (#3075) : celui que le chef a choisi, posé à minuit.
    assert.deepEqual(lineInWaiting({ quoi: "un accès", qui: "Sam", relance: new Date(2026, 10, 16).toISOString() }, false), { ligne: "waiting for un accès · from Sam · follow-up 2026-11-16" });
    assert.deepEqual(lineInWaiting({ quoi: "un accès", qui: "Sam", relance: null }, false), { ligne: "waiting for un accès · from Sam" });
    assert.deepEqual(lineInWaiting(null, false), { ligne: "waits for a third party", repere: true });
  });

  test("qui m'attend : ce qu'on attend du chef, en une phrase", () => {
    const card = of(FACTS, 6);
    assert.equal(card.attendu, true);
    assert.equal(card.ligne, "no question found on #6");
    assert.deepEqual(lineAwaitingMe("Green, but not merged: merge it yourself."), { ligne: "Green, but not merged: merge it yourself." });
    assert.deepEqual(lineAwaitingMe(undefined), { ligne: "waits for your decision", repere: true });
  });

  test("livrée : l'heure et la première phrase du résumé ; sans résumé, l'heure et le repère", () => {
    assert.deepEqual(sentence(of(FACTS, 7)), { ligne: `served at ${hourHM("2026-10-12T10:00:00.000Z")} · Le rail se lit en deux lignes.` });
    assert.deepEqual(lineDelivered("2026-10-12T10:00:00.000Z", undefined), { ligne: `served at ${hourHM("2026-10-12T10:00:00.000Z")}`, repere: true });
  });

  test("aucune carte ne parle comme le runtime", () => {
    for (const card of cards(FACTS)) assert.doesNotMatch(`${card.ligne ?? ""} ${card.signal ?? ""}`, /bail|lease|\b86\b|non communiqué|not given/i, `#${card.ticket}`);
  });
});
