// Sur la fiche d'un ticket (#3773, épique #3768) : un corps qui porte un bloc ```mermaid pose le diagramme rendu.
// Le module est joué devant un faux document, avec un moteur de rendu injecté (aucun navigateur, aucun réseau).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setDiagramOfCard } from "../../../src/vue/card-diagram/card-diagram.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

describe("le diagramme sur la fiche", () => {
  test("un corps avec un bloc mermaid : le diagramme rendu est posé sur la fiche", async () => {
    const seenOnes: string[] = [];
    const render = async (source: string) => {
      seenOnes.push(source);
      return doc.createElement("svg");
    };
    const body = "Context.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nThe rest.";
    const setEntries = (await setDiagramOfCard(doc, body, render)) as Fake[];
    assert.equal(setEntries.length, 1);
    assert.equal(setEntries[0]?.dessous("svg").length, 1);
    assert.deepEqual(seenOnes, ["flowchart LR\n  A --> B"]);
  });
});
