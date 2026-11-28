// L'app hors ligne (#1818) : sans réseau, tout ce qu'elle lit du tableau de la cuisine rate d'un coup. Une seule cause,
// qui n'est pas une panne : le dernier état lu n'est pas jeté, et ce qui est à venir ne dit pas qu'il n'a pas été lu.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { see as seeUpstream } from "../src/upstream.ts";
import type { Reading } from "../src/box.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-10-27T13:${String(minute).padStart(2, "0")}:00.000Z`;
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       1 pris", "  #14  pris  prio:1  par box/claude depuis 12 min  Le journal en ajout seul", ""].join("\n");
const readEntry = (command: string, text: string, minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), sorties: [{ commande: command, texte: text }] });
// Ce que la veille du tableau rend sans réseau (board/rail.ts), et ce qu'elle rend d'un tableau joint mais illisible.
const outsideLine = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const unreadable = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "The Kitchen board of benomite/parade (issue 7) cannot be read: no machine block.", atteinte: true, cas: null, duTableau: true });

describe("les faits, hors ligne (#1818)", () => {

  test("ce qui est à venir ne dit pas « not read » hors ligne", () => {
    const seenOne = seeUpstream(outsideLine(1));
    assert.ok("nonPublie" in seenOne);
    assert.ok(!("sans" in seenOne));
  });
});
