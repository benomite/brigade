// Sur la fiche d'un ticket (#3773) : sans bloc mermaid, aucune zone de diagramme — ni cadre vide, ni mot de remplacement.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserDiagramDeCard } from "../../../src/vue/card-diagram/card-diagram.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

describe("la fiche sans diagramme", () => {
  test("un corps sans bloc mermaid : rien n'est posé, et le moteur n'est pas appelé", async () => {
    let calls = 0;
    const rendre = async () => {
      calls += 1;
      return doc.createElement("svg");
    };
    const corps = "Plain text.\n\n```js\nconst a = 1;\n```\n\n```text\nflowchart LR\n```\n";
    assert.deepEqual(await poserDiagramDeCard(doc, corps, rendre), []);
    assert.deepEqual(await poserDiagramDeCard(doc, "", rendre), []);
    assert.deepEqual(await poserDiagramDeCard(doc, undefined, rendre), []);
    assert.equal(calls, 0);
  });
});
