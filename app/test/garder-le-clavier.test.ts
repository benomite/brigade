// Le champ où le chef écrit garde le clavier et sa sélection quand la vue redessine sa zone (vue/garder-le-clavier.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { garderLeClavier } from "../src/vue/garder-le-clavier.js";

function champ(champ: string, cle: string | undefined, selection = { debut: 0, fin: 0, sens: "none" }) {
  const pris: unknown[][] = [];
  const el = {
    dataset: { champ, ...(cle === undefined ? {} : { cle }) },
    selectionStart: selection.debut,
    selectionEnd: selection.fin,
    selectionDirection: selection.sens,
    focuse: false,
    focus() { this.focuse = true; },
    setSelectionRange(...args: unknown[]) { pris.push(args); },
  };
  return { el, pris };
}
const zone = (...enfants: any[]) => ({ contains: (x: unknown) => enfants.includes(x), querySelectorAll: () => enfants });

describe("garderLeClavier", () => {
  test("le champ neuf reprend le clavier et la sélection du champ qui allait disparaître", () => {
    const ancien = champ("commentaire-validation", "p#1", { debut: 3, fin: 8, sens: "backward" });
    const neuf = champ("commentaire-validation", "p#1");
    const autre = champ("autre", "p#1");
    const rendre = garderLeClavier(ancien.el, zone(ancien.el));
    rendre(zone(autre.el, neuf.el));
    assert.equal(neuf.el.focuse, true);
    assert.equal(autre.el.focuse, false);
    assert.deepEqual(neuf.pris, [[3, 8, "backward"]]);
  });

  test("un champ hors de la zone redessinée, ou aucun champ en main, ne rend rien", () => {
    const dehors = champ("commentaire-validation", "p#1");
    const neuf = champ("commentaire-validation", "p#1");
    garderLeClavier(dehors.el, zone())(zone(neuf.el));
    garderLeClavier(undefined, zone())(zone(neuf.el));
    garderLeClavier({ dataset: {} }, zone())(zone(neuf.el));
    assert.equal(neuf.el.focuse, false);
  });

  test("le champ de la même carte seulement : une autre clé ne prend pas le clavier", () => {
    const ancien = champ("reponse-du-chef", "p#1");
    const autre = champ("reponse-du-chef", "p#2");
    garderLeClavier(ancien.el, zone(ancien.el))(zone(autre.el));
    assert.equal(autre.el.focuse, false);
  });
});
