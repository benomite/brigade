// Sur la fiche d'un ticket (#3773) : sans bloc mermaid, aucune zone de diagramme — ni cadre vide, ni mot de remplacement.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setDiagramOfCard } from "../../../src/vue/card-diagram/card-diagram.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

describe("la fiche sans diagramme", () => {
  test("un corps sans bloc mermaid : rien n'est posé, et le moteur n'est pas appelé", async () => {
    let calls = 0;
    const render = async () => {
      calls += 1;
      return doc.createElement("svg");
    };
    const body = "Plain text.\n\n```js\nconst a = 1;\n```\n\n```text\nflowchart LR\n```\n";
    assert.deepEqual(await setDiagramOfCard(doc, body, render), []);
    assert.deepEqual(await setDiagramOfCard(doc, "", render), []);
    assert.deepEqual(await setDiagramOfCard(doc, undefined, render), []);
    assert.equal(calls, 0);
  });
});
