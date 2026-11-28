// L'app hors ligne (#1818) : sans réseau, tout ce qu'elle lit du tableau de la cuisine rate d'un coup. Une seule cause,
// qui n'est pas une panne : le dernier état lu n'est pas jeté, et ce qui est à venir ne dit pas qu'il n'a pas été lu.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";
import { isOutsideLine, holdFacts, type Facts } from "../src/facts.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-10-27T13:${String(minute).padStart(2, "0")}:00.000Z`;
const FACTS: Facts = {
  etat: "ouverte",
  lu: a(0),
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  attend: [{ ticket: 14, titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14" }],
};
const STATUS = ["projet     parade", "cuisine    ouverte", "", "awaiting   1 decision awaits the chef — for 12 min", "  #14  for 12 min  merge  Le journal en ajout seul", "end awaiting", ""].join("\n");
const readEntry = (command: string, text: string, minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), sorties: [{ commande: command, texte: text }] });
// Ce que la veille du tableau rend sans réseau (board/rail.ts), et ce qu'elle rend d'un tableau joint mais illisible.
const outsideLine = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const unreadable = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "The Kitchen board of benomite/parade (issue 7) cannot be read: no machine block.", atteinte: true, cas: null, duTableau: true });

describe("les faits, hors ligne (#1818)", () => {
  test("le dernier état lu n'est pas jeté : ni ses faits, ni son `status` ; la lecture hors ligne se dit comme telle", () => {
    const facts = holdFacts();
    facts.recevoir(readEntry("facts", JSON.stringify(FACTS), 0));
    assert.ok(facts.attendre(putAside(readEntry("status", STATUS, 0))) !== undefined);
    const receivedOne = facts.recevoir(outsideLine(1));
    assert.ok(isOutsideLine(receivedOne));
    assert.equal(facts.attendre(putAside(outsideLine(1))), undefined);
    const keptOne = facts.redessiner(PARADE);
    assert.ok(keptOne !== undefined && "tableau" in keptOne);
    assert.equal(keptOne.a, a(0));
    assert.equal(facts.adresse(PARADE, 14), "https://github.com/benomite/brigade/issues/14");
    // Une vraie panne du tableau ne retire rien non plus (#2151) : GitHub tient encore ce qui était lu.
    facts.recevoir(unreadable(2));
    assert.equal(facts.attendre(putAside(unreadable(2))), undefined);
    const always = facts.redessiner(PARADE);
    assert.ok(always !== undefined && "tableau" in always);
    assert.equal(facts.adresse(PARADE, 14), "https://github.com/benomite/brigade/issues/14");
  });

});
