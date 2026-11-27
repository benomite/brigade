// Le champ où le chef écrit garde le clavier et sa sélection quand la vue redessine sa zone (vue/keep-the-keyboard.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { keepTheKeyboard } from "../src/vue/keep-the-keyboard.js";

function field(field: string, key: string | undefined, selection = { debut: 0, fin: 0, sens: "none" }) {
  const taken: unknown[][] = [];
  const el = {
    dataset: { champ: field, ...(key === undefined ? {} : { cle: key }) },
    selectionStart: selection.debut,
    selectionEnd: selection.fin,
    selectionDirection: selection.sens,
    focuse: false,
    focus() { this.focuse = true; },
    setSelectionRange(...args: unknown[]) { taken.push(args); },
  };
  return { el, pris: taken };
}
const zone = (...children: any[]) => ({ contains: (x: unknown) => children.includes(x), querySelectorAll: () => children });

describe("garderLeClavier", () => {
  test("le champ neuf reprend le clavier et la sélection du champ qui allait disparaître", () => {
    const old = field("commentaire-validation", "p#1", { debut: 3, fin: 8, sens: "backward" });
    const fresh = field("commentaire-validation", "p#1");
    const other = field("autre", "p#1");
    const render = keepTheKeyboard(old.el, zone(old.el));
    render(zone(other.el, fresh.el));
    assert.equal(fresh.el.focuse, true);
    assert.equal(other.el.focuse, false);
    assert.deepEqual(fresh.pris, [[3, 8, "backward"]]);
  });

  test("un champ hors de la zone redessinée, ou aucun champ en main, ne rend rien", () => {
    const outside = field("commentaire-validation", "p#1");
    const fresh = field("commentaire-validation", "p#1");
    keepTheKeyboard(outside.el, zone())(zone(fresh.el));
    keepTheKeyboard(undefined, zone())(zone(fresh.el));
    keepTheKeyboard({ dataset: {} }, zone())(zone(fresh.el));
    assert.equal(fresh.el.focuse, false);
  });

  test("le champ de la même carte seulement : une autre clé ne prend pas le clavier", () => {
    const old = field("reponse-du-chef", "p#1");
    const other = field("reponse-du-chef", "p#2");
    keepTheKeyboard(old.el, zone(old.el))(zone(other.el));
    assert.equal(other.el.focuse, false);
  });
});
