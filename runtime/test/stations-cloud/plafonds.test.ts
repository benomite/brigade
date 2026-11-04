// Les plafonds d'un projet pour ses stations cloud (#2228) : avant chaque
// démarrage, une station de plus part ou non, et sinon le plafond qui la retient
// est nommé. Sans plafond posé, rien ne part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { peutDemarrer, type Usage } from "../../src/stations-cloud/plafonds.ts";

const RIEN: Usage = { enCours: 0, heuresDuJour: 0, heuresDuMois: 0 };
const TOUS = { aLaFois: 2, heuresParJour: 8, heuresParMois: 100 };

describe("une station cloud de plus", () => {
  test("sans aucun plafond posé, elle ne part pas, même sans aucun usage — et la raison dit quoi poser", () => {
    for (const plafonds of [{}, { aLaFois: undefined, heuresParJour: undefined, heuresParMois: undefined }]) {
      const verdict = peutDemarrer(plafonds, RIEN);
      assert.ok(!verdict.peut);
      assert.equal(verdict.plafond, "aucun");
      assert.match(verdict.raison, /until the project sets a ceiling/);
    }
  });

  test("sous tous ses plafonds, elle part", () => {
    assert.deepEqual(peutDemarrer(TOUS, RIEN), { peut: true });
    assert.deepEqual(peutDemarrer(TOUS, { enCours: 1, heuresDuJour: 7.9, heuresDuMois: 99.5 }), { peut: true });
  });

  test("le plafond de stations à la fois atteint la retient, et le dit", () => {
    const verdict = peutDemarrer(TOUS, { enCours: 2, heuresDuJour: 1, heuresDuMois: 1 });
    assert.ok(!verdict.peut);
    assert.equal(verdict.plafond, "a-la-fois");
    assert.equal(verdict.raison, "2 of 2 cloud stations at once are already running.");
    // Au-delà, de même : le plafond a pu être baissé sous ce qui tourne.
    assert.equal(peutDemarrer({ aLaFois: 1 }, { ...RIEN, enCours: 3 }).peut, false);
    assert.deepEqual(peutDemarrer({ aLaFois: 3 }, { ...RIEN, enCours: 2 }), { peut: true });
  });

  test("les heures du jour épuisées la retiennent, et le disent", () => {
    const verdict = peutDemarrer(TOUS, { enCours: 0, heuresDuJour: 8, heuresDuMois: 20 });
    assert.ok(!verdict.peut);
    assert.equal(verdict.plafond, "par-jour");
    assert.equal(verdict.raison, "Today's 8 h of cloud stations are used (8 h).");
    // Dépassées, de même ; les heures se lisent arrondies au centième.
    assert.deepEqual(peutDemarrer({ heuresParJour: 2.5 }, { ...RIEN, heuresDuJour: 2.6666 }), {
      peut: false,
      plafond: "par-jour",
      raison: "Today's 2.5 h of cloud stations are used (2.67 h).",
    });
  });

  test("les heures du mois épuisées la retiennent, et le disent", () => {
    const verdict = peutDemarrer(TOUS, { enCours: 0, heuresDuJour: 0, heuresDuMois: 100 });
    assert.ok(!verdict.peut);
    assert.equal(verdict.plafond, "par-mois");
    assert.equal(verdict.raison, "This month's 100 h of cloud stations are used (100 h).");
    assert.deepEqual(peutDemarrer({ heuresParMois: 100 }, { ...RIEN, heuresDuMois: 99.99 }), { peut: true });
  });

  test("un plafond seul borne seul : les autres, absents, ne retiennent rien", () => {
    const beaucoup: Usage = { enCours: 50, heuresDuJour: 24, heuresDuMois: 700 };
    assert.deepEqual(peutDemarrer({ aLaFois: 51 }, beaucoup), { peut: true });
    assert.deepEqual(peutDemarrer({ heuresParJour: 25 }, beaucoup), { peut: true });
    assert.deepEqual(peutDemarrer({ heuresParMois: 701 }, beaucoup), { peut: true });
  });

  test("retenue par plusieurs, elle nomme celle qui la retiendra le plus longtemps : le mois, puis le jour, puis les stations à la fois", () => {
    const plafond = (usage: Usage) => {
      const verdict = peutDemarrer(TOUS, usage);
      return verdict.peut ? "aucun ne retient" : verdict.plafond;
    };
    assert.equal(plafond({ enCours: 2, heuresDuJour: 8, heuresDuMois: 100 }), "par-mois");
    assert.equal(plafond({ enCours: 2, heuresDuJour: 8, heuresDuMois: 50 }), "par-jour");
    assert.equal(plafond({ enCours: 2, heuresDuJour: 0, heuresDuMois: 50 }), "a-la-fois");
  });

  test("un plafond à zéro ne laisse rien partir", () => {
    for (const plafonds of [{ aLaFois: 0 }, { heuresParJour: 0 }, { heuresParMois: 0 }]) {
      assert.equal(peutDemarrer(plafonds, RIEN).peut, false, JSON.stringify(plafonds));
    }
  });

  test("un plafond illisible ne laisse rien partir, et nomme lequel", () => {
    const cas = [
      [{ aLaFois: -1 }, "a-la-fois"],
      [{ aLaFois: 1.5 }, "a-la-fois"],
      [{ heuresParJour: Number.NaN }, "par-jour"],
      [{ heuresParMois: -10 }, "par-mois"],
      [{ heuresParMois: Number.POSITIVE_INFINITY }, "par-mois"],
    ] as const;
    for (const [plafonds, attendu] of cas) {
      const verdict = peutDemarrer(plafonds, RIEN);
      assert.ok(!verdict.peut, JSON.stringify(plafonds));
      assert.equal(verdict.plafond, attendu);
      assert.match(verdict.raison, /no cloud station starts/);
    }
  });
});
