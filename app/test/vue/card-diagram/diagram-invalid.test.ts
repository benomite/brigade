// Sur la fiche d'un ticket (#3773) : un bloc qui n'est pas du Mermaid valide se montre en code, jamais en erreur ; la fiche s'ouvre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setDiagramOfCard } from "../../../src/vue/card-diagram/card-diagram.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

describe("un bloc mermaid invalide", () => {
  test("la source est posée dans un bloc de code, le rendu qui échoue ne casse pas la fiche", async () => {
    const render = async () => {
      throw new Error("Parse error on line 1");
    };
    const setEntries = (await setDiagramOfCard(doc, "```mermaid\nnot a diagram ???\n```", render)) as Fake[];
    assert.equal(setEntries.length, 1);
    const [pre] = setEntries[0]?.dessous("pre") ?? [];
    assert.equal(pre?.dessous("code")[0]?.textContent, "not a diagram ???");
    assert.equal(setEntries[0]?.dessous("svg").length, 0);
    assert.doesNotMatch(setEntries[0]?.textContent ?? "", /Parse error/);
  });
});
