// Les stations cloud d'un projet, telles que l'app les lit (#2232, épique #2223) : les plafonds, le coût par ticket
// servi et ce qu'une station reçoit, dans les formes du runtime — lues sans rien croire sur parole. Une forme qui n'est
// pas la sienne ne se lit pas : l'écran ne montre rien plutôt qu'un chiffre faux.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lireCeQuElleRecoit, lireCout, lireLeCloud, lirePlafonds, type VuDuCloud } from "../../src/stations-cloud/stations-cloud.ts";

const VU: VuDuCloud = {
  projet: "parade",
  ajoutees: 1,
  plafonds: { aLaFois: 2, heuresParJour: 4 },
  recoit: { recoit: ["A GitHub token scoped to benomite/parade"], jamais: ["Your Max session"] },
  approuvee: true,
  cout: { projet: "parade", coutTotal: 12.6, ticketsServis: 7, coutParTicket: 1.8 },
  periode: "this month",
};

describe("ce que l'app lit des stations cloud d'un projet", () => {
  test("la forme du runtime se lit telle quelle", () => {
    assert.deepEqual(lireLeCloud(JSON.stringify(VU)), VU);
  });

  test("les plafonds : chacun absent ou un nombre positif — aucun, c'est un objet vide, que le runtime refuse de démarrer", () => {
    assert.deepEqual(lirePlafonds({}), {});
    assert.deepEqual(lirePlafonds({ heuresParMois: 60, aLaFois: null }), { heuresParMois: 60 });
    assert.equal(lirePlafonds({ heuresParJour: -1 }), undefined);
    assert.equal(lirePlafonds({ aLaFois: "2" }), undefined);
    assert.equal(lirePlafonds([]), undefined);
  });

  test("sans ticket servi, le coût par ticket n'existe pas : « n/a », jamais une division par zéro", () => {
    assert.deepEqual(lireCout({ projet: "parade", coutTotal: 3, ticketsServis: 0, coutParTicket: "n/a" }), { projet: "parade", coutTotal: 3, ticketsServis: 0, coutParTicket: "n/a" });
    assert.equal(lireCout({ projet: "parade", coutTotal: 3, ticketsServis: 0, coutParTicket: Number.POSITIVE_INFINITY })?.coutParTicket, "n/a");
    assert.equal(lireCout({ projet: "parade", coutTotal: 3, ticketsServis: 1.5, coutParTicket: 2 }), undefined);
    assert.equal(lireCout({ projet: "parade", coutTotal: 3, ticketsServis: 2, coutParTicket: "beaucoup" }), undefined);
  });

  test("ce qu'une station reçoit : une liste vide ne s'approuve pas", () => {
    assert.equal(lireCeQuElleRecoit({ recoit: [], jamais: ["Your Max session"] }), undefined);
    assert.equal(lireCeQuElleRecoit({ recoit: ["a token", ""], jamais: [] }), undefined);
    assert.deepEqual(lireCeQuElleRecoit({ recoit: ["a token"], jamais: [] }), { recoit: ["a token"], jamais: [] });
  });

  test("une forme qui n'est pas la sienne ne se lit pas", () => {
    for (const casse of [
      "pas du json",
      "[]",
      JSON.stringify({ ...VU, approuvee: "yes" }),
      JSON.stringify({ ...VU, ajoutees: -1 }),
      JSON.stringify({ ...VU, periode: "" }),
      JSON.stringify({ ...VU, cout: { ...VU.cout, projet: "cantine" } }),
      JSON.stringify({ ...VU, recoit: undefined }),
    ]) {
      assert.equal(lireLeCloud(casse), undefined, casse);
    }
  });
});
