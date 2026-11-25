// Le TODO parked du chef (ticket 4281) : la couche de données, devant de fausses cartes — ce qu'un enregistrement dit de
// chaque carte parked, qui attend le chef, et ce que « back to the kitchen » en a fait.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Carte } from "../../../src/faits.ts";
import { CHEF, cardOf, notParkedForChef, parkedRecords, waitingFor } from "../../../src/vue/parked/records.js";

const carte = (ticket: number, plus: Partial<Carte> = {}): Carte => ({ ticket, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} as Carte["fiche"], ...plus }) as Carte;
const pourQuoi = (valeur: string) => [{ libelle: "since", valeur: "yesterday" }, { libelle: "waiting for", valeur }];

test("a parked card gives its record: who, for what, until its day, and the step it was at", () => {
  const cartes = [
    carte(1, { parque: { qui: "the chef", jusqua: "2026-12-03T09:00:00.000Z", chef: true }, dit: pourQuoi("your call"), etape: "Cooks" }),
    carte(2, { parque: { qui: "Stripe support", jusqua: null }, dit: [] }),
    carte(3, { parque: { qui: "Camille", jusqua: "the vendor answers" }, dit: pourQuoi("the keys"), etape: "Backlog" }),
    carte(4, { etape: "Pass" }),
  ];
  assert.deepEqual(parkedRecords(cartes, "parade"), [
    { ticket: 1, who: CHEF, what: "your call", until: "2026-12-03", step: "Cooks" },
    { ticket: 2, who: "Stripe support", what: null, until: null, step: null },
    { ticket: 3, who: "Camille", what: "the keys", until: "the vendor answers", step: "Backlog" },
  ]);
});

test("a ticket sent back to the kitchen leaves the records; a refused one stays, saying why", () => {
  const parque = { qui: "the chef", jusqua: null, chef: true as const };
  const cartes = [carte(5, { parque }), carte(6, { parque }), carte(7, { parque }), carte(8, { parque })];
  const arrivees = new Map([
    ["parade#5", { envoi: true as const }],
    ["parade#6", { fait: "posted", detail: "" }],
    ["parade#7", { refus: "GitHub refused the comment", detail: "403" }],
    ["atelier#8", { fait: "posted", detail: "" }],
  ]);
  assert.deepEqual(
    parkedRecords(cartes, "parade", arrivees).map(({ ticket, note }) => ({ ticket, note })),
    [{ ticket: 7, note: "GitHub refused the comment" }, { ticket: 8, note: undefined }],
  );
});

test("only the records whose who is the chef wait for the chef; the TODO entries keep the cards not parked for the chef", () => {
  const records = [{ ticket: 1, who: CHEF }, { ticket: 2, who: "Camille" }, { ticket: 3, who: CHEF }].map((r) => ({ ...r, what: null, until: null, step: null }));
  assert.deepEqual(waitingFor(records, CHEF).map(({ ticket }) => ticket), [1, 3]);
  const cartes = [carte(1, { parque: { qui: "the chef", jusqua: null, chef: true } }), carte(2, { parque: { qui: "Camille", jusqua: null } }), carte(3, { attendu: true })];
  assert.deepEqual(notParkedForChef(cartes).map(({ ticket }) => ticket), [2, 3]);
});

test("a record carries its ticket's title when the card says it, and the card of a ticket is found by its number", () => {
  const cartes = [carte(1, { titre: "Le menu", parque: { qui: "the chef", jusqua: null, chef: true } }), carte(2, { parque: { qui: "Camille", jusqua: null } })];
  assert.deepEqual(parkedRecords(cartes, "parade").map(({ title }) => title), ["Le menu", undefined]);
  assert.equal(cardOf(cartes, 2), cartes[1]);
  assert.equal(cardOf(cartes, 3), undefined);
});
