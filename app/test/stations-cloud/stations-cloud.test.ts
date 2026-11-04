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
  recoit: { recoit: [{ cle: "jetonGithub", dit: "A GitHub token limited to that repository" }], jamais: [{ cle: "sessionMax", dit: "Your Claude Max session" }] },
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

  test("ce qu'une station reçoit : la `Liste` du runtime, chaque élément nommé et dit — une liste vide ne s'approuve pas", () => {
    const jeton = { cle: "jetonGithub", dit: "A GitHub token limited to that repository" };
    const max = { cle: "sessionMax", dit: "Your Claude Max session" };
    assert.deepEqual(lireCeQuElleRecoit({ recoit: [{ ...jeton, autre: 1 }], jamais: [max] }), { recoit: [jeton], jamais: [max] });
    assert.deepEqual(lireCeQuElleRecoit({ recoit: [jeton], jamais: [] }), { recoit: [jeton], jamais: [] });
    assert.equal(lireCeQuElleRecoit({ recoit: [], jamais: [max] }), undefined);
    assert.equal(lireCeQuElleRecoit({ recoit: [jeton, { cle: "depot", dit: "" }], jamais: [] }), undefined);
    assert.equal(lireCeQuElleRecoit({ recoit: [jeton], jamais: [{ dit: "Your Claude Max session" }] }), undefined);
    // Une ligne nue n'est pas un élément du runtime : elle ne se lit pas.
    assert.equal(lireCeQuElleRecoit({ recoit: ["a token"], jamais: [] }), undefined);
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
