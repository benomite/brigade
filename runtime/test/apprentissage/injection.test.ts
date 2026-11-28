// Les leçons qu'un cook reçoit à son lancement : le plafond du projet
// (`apprentissage/injection.ts`), et le bloc que sa consigne en porte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blocDesLecons, LECONS_INJECTEES_PAR_DEFAUT, lirePlafondDesLecons, VARIABLE_LECONS_INJECTEES } from "../../src/apprentissage/injection.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import { ConfigInvalide } from "../../src/config-invalide.ts";
import { repertoireTemporaire } from "../outils.ts";

describe("les leçons qu'un cook reçoit", () => {
  test("le plafond est un réglage du projet : vingt par défaut, zéro les coupe, une valeur illisible refuse le démarrage en nommant la variable", () => {
    assert.equal(lirePlafondDesLecons({}), 20);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "" }), 20);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "7" }), 7);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "0" }), 0);
    for (const valeur of ["-1", "2.5", "vingt"]) {
      assert.throws(() => lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: valeur }), (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.includes(VARIABLE_LECONS_INJECTEES));
    }
  });

  test("chaque consigne de cook les porte, avec leur id ; sans leçon, elle reste ce qu'elle était", () => {
    const lecons = [{ id: "L2", texte: "Lancer les gates avant de commiter." }, { id: "L1", texte: "Lire le CLAUDE.md." }];
    const mission = { ticket: 7, titre: "t", depot: "o/r", base: "v2" };
    const consignes = [
      (l?: typeof lecons) => consigne({ ...mission, lecons: l }),
      (l?: typeof lecons) => consigneDeSuite({ ...mission, branche: "cook/7", lecons: l }),
    ];
    for (const ecrire of consignes) {
      const texte = ecrire(lecons);
      assert.ok(texte.includes("- L2 : Lancer les gates avant de commiter.\n- L1 : Lire le CLAUDE.md."));
      assert.ok(texte.indexOf("- L2") < texte.indexOf("- L1"));
      assert.equal(ecrire([]), ecrire());
      assert.doesNotMatch(ecrire(), /leçons provisoires/);
    }
    assert.deepEqual(blocDesLecons([]), []);
  });
});
