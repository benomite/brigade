// Sur la fiche d'un ticket (#3773, épique #3768) : un corps qui porte un bloc ```mermaid pose le diagramme rendu.
// Le module est joué devant un faux document, avec un moteur de rendu injecté (aucun navigateur, aucun réseau).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserDiagrammeDeFiche } from "../../../src/vue/fiche-diagramme/fiche-diagramme.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

describe("le diagramme sur la fiche", () => {
  test("un corps avec un bloc mermaid : le diagramme rendu est posé sur la fiche", async () => {
    const vus: string[] = [];
    const rendre = async (source: string) => {
      vus.push(source);
      return doc.createElement("svg");
    };
    const corps = "Context.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nThe rest.";
    const posees = (await poserDiagrammeDeFiche(doc, corps, rendre)) as Faux[];
    assert.equal(posees.length, 1);
    assert.equal(posees[0]?.dessous("svg").length, 1);
    assert.deepEqual(vus, ["flowchart LR\n  A --> B"]);
  });
});
