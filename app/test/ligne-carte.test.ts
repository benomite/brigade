// La phrase d'une carte du rail (#622) : une par état, écrite d'après les faits que la file donne déjà.
// Chaque état a son test : ce que `faits` donne → la phrase exacte, le signal, le repère. Aucune carte
// ne porte un mot du runtime (« bail », « 86 », « non communiqué »), ni plus de deux lignes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Carte, type Faits } from "../src/faits.ts";
import { heureHM } from "../src/format.ts";
import { ligneAuTravail, ligneEnAttente, ligneEnWaiting, ligneLivree, ligneMiseDeCote, ligneQuiMAttend, PASS_SANS_DETAIL, PRET, TRAVAIL_SANS_DETAIL } from "../src/ligne-carte.ts";

const LU = "2026-10-12T10:04:11.000Z";
const url = (n: number) => `https://github.com/benomite/brigade/issues/${n}`;
const FAITS: Faits = {
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 5, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 1, etat: "pris", titre: "Au travail", url: url(1), activite: { fait: "écrit les tests", cible: null, depuis: "2026-10-12T09:52:11.000Z" }, attente: null },
    { ticket: 2, etat: "en attente", titre: "Prêt", url: url(2), activite: null, attente: null },
    { ticket: 3, etat: "en pass", titre: "En pass", url: url(3), activite: { fait: "relecture en cours", cible: null, depuis: "2026-10-12T10:03:11.000Z" }, attente: null },
    { ticket: 4, etat: "86", titre: "Mis de côté", url: url(4), activite: null, attente: { raison: "attend : setup du projet impossible", colonne: "en attente", retour: null } },
    { ticket: 5, etat: "WAITING", titre: "Chez un tiers", url: url(5), activite: null, attente: null, tiers: { quoi: "le devis", qui: "le client", depuis: "2026-10-11T10:04:11.000Z", relance: "2026-10-10T00:00:00.000Z", aLArrivee: "il repart en cuisine" } },
  ],
  attend: [{ ticket: 6, titre: "Qui m'attend", url: url(6) }],
  livres: [{ ticket: 7, titre: "Livré", url: url(7), livre: "2026-10-12T10:00:00.000Z", station: "box/claude", pr: null, relecture: { resume: "Le rail se lit en deux lignes. Le détail est sur la fiche.", constats: [] } }],
};
const cartes = (faits: Faits): Carte[] => {
  const dessine = rail(faits);
  return [...dessine.colonnes.flatMap(({ cartes: siennes }) => siennes), ...dessine.hors];
};
const de = (faits: Faits, ticket: number): Carte => cartes(faits).find((carte) => carte.ticket === ticket) ?? assert.fail(`pas de carte #${ticket}`);
const phrase = ({ ligne, signal, repere }: Carte) => ({ ligne, ...(signal === undefined ? {} : { signal }), ...(repere === undefined ? {} : { repere }) });

describe("la phrase de chaque état d'une carte (#622)", () => {
  test("au travail : ce que le cook fait, et depuis combien de temps", () => {
    assert.deepEqual(phrase(de(FAITS, 1)), { ligne: "écrit les tests · 12 min" });
    assert.deepEqual(ligneAuTravail("pris", { fait: "lit", cible: "runtime/src/etat.ts" }, "3 min"), { ligne: "lit runtime/src/etat.ts · 3 min" });
    // La box ne sait pas ce qu'on en fait : deux mots, et le repère.
    assert.deepEqual(ligneAuTravail("pris", null, ""), { ligne: TRAVAIL_SANS_DETAIL, repere: true });
    assert.deepEqual(ligneAuTravail("pris", undefined, ""), { ligne: TRAVAIL_SANS_DETAIL, repere: true });
  });

  test("en pass : la relecture, et depuis quand ; sans activité, « review in progress »", () => {
    assert.deepEqual(phrase(de(FAITS, 3)), { ligne: "relecture en cours · 1 min" });
    assert.deepEqual(ligneAuTravail("en pass", null, ""), { ligne: PASS_SANS_DETAIL, repere: true });
  });

  test("en attente : après les tickets qui la retiennent, ou prête à prendre une place — jamais « non communiqué »", () => {
    assert.deepEqual(phrase(de(FAITS, 2)), { ligne: PRET });
    assert.deepEqual(ligneEnAttente("en attente", "zone tenue par #14 (app/src)"), { ligne: "after #14" });
    assert.deepEqual(ligneEnAttente("en attente", "après #604 et #605, puis #604"), { ligne: "after #604, #605" });
    assert.deepEqual(ligneEnAttente("en attente", undefined), { ligne: PRET });
  });

  test("bloquée : ce qui la retient, avec un signal ; sans cause donnée, le repère", () => {
    assert.deepEqual(ligneEnAttente("BLOQUÉ", "zone tenue par #14"), { ligne: "after #14", signal: "blocked" });
    assert.deepEqual(ligneEnAttente("BLOQUÉ", "label `fire` manquant"), { ligne: "label `fire` manquant", signal: "blocked" });
    assert.deepEqual(ligneEnAttente("BLOQUÉ", undefined), { ligne: "blocked", signal: "blocked", repere: true });
  });

  test("mise de côté (86) : sa raison en clair, jamais le mot « 86 »", () => {
    const carte = de(FAITS, 4);
    assert.deepEqual(phrase(carte), { ligne: "attend : setup du projet impossible", signal: "set aside" });
    assert.deepEqual(ligneMiseDeCote("x"), { ligne: "x", signal: "set aside" });
    assert.doesNotMatch(JSON.stringify(phrase(carte)), /\b86\b/);
  });

  test("chez un tiers (WAITING) : ce qu'il attend et de qui ; la relance passée est un signal", () => {
    assert.deepEqual(phrase(de(FAITS, 5)), { ligne: "waiting for le devis · from le client", signal: "follow-up date passed" });
    assert.deepEqual(ligneEnWaiting({ quoi: "un accès", qui: "Sam" }, false), { ligne: "waiting for un accès · from Sam" });
    assert.deepEqual(ligneEnWaiting(null, false), { ligne: "waits for a third party", repere: true });
  });

  test("qui m'attend : ce qu'on attend du chef, en une phrase", () => {
    const carte = de(FAITS, 6);
    assert.equal(carte.attendu, true);
    assert.equal(carte.ligne, "This ticket waits for your decision — its issue says which.");
    assert.deepEqual(ligneQuiMAttend("Green, but not merged: merge it yourself."), { ligne: "Green, but not merged: merge it yourself." });
    assert.deepEqual(ligneQuiMAttend(undefined), { ligne: "waits for your decision", repere: true });
  });

  test("livrée : l'heure et la première phrase du résumé ; sans résumé, l'heure et le repère", () => {
    assert.deepEqual(phrase(de(FAITS, 7)), { ligne: `served at ${heureHM("2026-10-12T10:00:00.000Z")} · Le rail se lit en deux lignes.` });
    assert.deepEqual(ligneLivree("2026-10-12T10:00:00.000Z", undefined), { ligne: `served at ${heureHM("2026-10-12T10:00:00.000Z")}`, repere: true });
  });

  test("aucune carte ne parle comme le runtime", () => {
    for (const carte of cartes(FAITS)) assert.doesNotMatch(`${carte.ligne ?? ""} ${carte.signal ?? ""}`, /bail|lease|\b86\b|non communiqué|not given/i, `#${carte.ticket}`);
  });
});
