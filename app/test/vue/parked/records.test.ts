// Le TODO parked du chef (ticket 4281) : la couche de données, devant de fausses cartes — ce qu'un enregistrement dit de
// chaque carte du TODO, et ceux qui attendent le chef.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Carte } from "../../../src/faits.ts";
import { CHEF, chefRecords, waitingFor } from "../../../src/vue/parked/records.js";

const carte = (ticket: number, plus: Partial<Carte> = {}): Carte => ({ ticket, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Carte["fiche"], ...plus }) as Carte;

test("a card of the chef's TODO gives its record: the chef, for what, until its day or its fact, its step and its title", () => {
  const cartes = [
    carte(1, { parque: { qui: "the chef", quoi: "your call", jusqua: "2026-12-03T09:00:00.000Z", chef: true }, etape: "Cooks", titre: "Le menu" }),
    carte(2, { parque: { qui: "the chef", jusqua: null, chef: true } }),
    carte(3, { parque: { qui: "the chef", quoi: "the keys", jusqua: "the vendor answers", chef: true }, etape: "Backlog" }),
    carte(4, { etape: "Pass" }),
  ];
  assert.deepEqual(chefRecords(cartes), [
    { ticket: 1, who: CHEF, what: "your call", until: "2026-12-03", step: "Cooks", title: "Le menu" },
    { ticket: 2, who: CHEF, what: null, until: null, step: null },
    { ticket: 3, who: CHEF, what: "the keys", until: "the vendor answers", step: "Backlog" },
    { ticket: 4, who: CHEF, what: null, until: null, step: "Pass" },
  ]);
});

test("only the records whose who is the chef wait for the chef", () => {
  const records = [{ ticket: 1, who: CHEF }, { ticket: 2, who: "Camille" }, { ticket: 3, who: CHEF }].map((r) => ({ ...r, what: null, until: null, step: null }));
  assert.deepEqual(waitingFor(records, CHEF).map(({ ticket }) => ticket), [1, 3]);
});
