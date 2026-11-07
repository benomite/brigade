// Le budget d'appels GitHub par projet (#2197, épique 2184), rendu depuis un instantané d'essai de la forme du registre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserLeBudgetDAppels } from "../../src/vue/budget-appels.js";
import { budgetDesAppelsLu } from "../../src/faits.ts";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const compte = (total: number, byCategory: Record<string, number> = {}) => ({ total, byCategory });
const INSTANTANE = {
  windowStart: "2026-11-03T10:00:00.000Z",
  projects: {
    parade: { reads: compte(120, { issues: 80, prs: 40, gists: 0 }), writes: compte(30, { prs: 30 }), budget: { reads: 100, writes: 50 }, overBudget: true },
    brigade: { reads: compte(10, { checks: 10 }), writes: compte(2, { prs: 2 }), budget: { reads: 100, writes: 50 }, overBudget: false },
  },
  perTicket: {},
};
const bloc = (section: Faux, nom: string) => section.children.find((enfant) => enfant.dataset.projet === nom)!;

describe("le budget d'appels GitHub", () => {
  test("un projet au-delà : marqué, lectures et écritures à part, catégories nommées", () => {
    const parade = bloc(poserLeBudgetDAppels(doc, INSTANTANE), "parade");
    assert.equal("horsBudget" in parade.dataset, true);
    assert.match(parade.textContent, /over budget/);
    const [lectures, ecritures] = parade.children.filter((e) => e.dataset.genre !== undefined);
    assert.match(lectures!.textContent, /reads 120 \/ 100/);
    assert.match(lectures!.textContent, /used by issues 80, prs 40/);
    assert.doesNotMatch(lectures!.textContent, /gists/);
    assert.match(ecritures!.textContent, /writes 30 \/ 50/);
    assert.doesNotMatch(ecritures!.textContent, /used by/);
  });

  test("un projet dans son budget : ses deux lignes, aucune alerte", () => {
    const section = poserLeBudgetDAppels(doc, INSTANTANE);
    const brigade = bloc(section, "brigade");
    assert.equal("horsBudget" in brigade.dataset, false);
    assert.doesNotMatch(brigade.textContent, /over budget|used by/);
    assert.match(brigade.textContent, /reads 10 \/ 100/);
    assert.match(brigade.textContent, /writes 2 \/ 50/);
  });

  test("aucun projet au-delà : le bloc n'est pas en alerte", () => {
    const calme = { projects: { brigade: INSTANTANE.projects.brigade } };
    const section = poserLeBudgetDAppels(doc, calme);
    assert.equal("horsBudget" in section.dataset, false);
    assert.doesNotMatch(section.textContent, /over budget/);
  });

  test("pas d'instantané : une ligne neutre", () => {
    const section = poserLeBudgetDAppels(doc, undefined);
    assert.equal(section.dataset.appels, "absents");
    assert.match(section.textContent, /no call counted yet/);
  });

  test("le champ du runtime est lu, un projet mal formé est écarté", () => {
    const lu = budgetDesAppelsLu({ ...INSTANTANE, projects: { ...INSTANTANE.projects, casse: { reads: 3 } } });
    assert.deepEqual(Object.keys(lu!.projects), ["parade", "brigade"]);
    assert.equal(budgetDesAppelsLu({ projects: {} }), undefined);
    assert.equal(budgetDesAppelsLu("x"), undefined);
  });

  test("un projet sans catégorie : ses lignes, sans « used by »", () => {
    const vide = { projects: { p: { reads: compte(5), writes: compte(0), budget: { reads: 1, writes: 1 }, overBudget: true } } };
    assert.doesNotMatch(poserLeBudgetDAppels(doc, vide).textContent, /used by/);
  });
});
