// Sur la fiche d'un ticket (#3773) : un bloc qui n'est pas du Mermaid valide se montre en code, jamais en erreur ; la fiche s'ouvre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserDiagramDeCard } from "../../../src/vue/card-diagram/card-diagram.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

describe("un bloc mermaid invalide", () => {
  test("la source est posée dans un bloc de code, le rendu qui échoue ne casse pas la fiche", async () => {
    const rendre = async () => {
      throw new Error("Parse error on line 1");
    };
    const posees = (await poserDiagramDeCard(doc, "```mermaid\nnot a diagram ???\n```", rendre)) as Faux[];
    assert.equal(posees.length, 1);
    const [pre] = posees[0]?.dessous("pre") ?? [];
    assert.equal(pre?.dessous("code")[0]?.textContent, "not a diagram ???");
    assert.equal(posees[0]?.dessous("svg").length, 0);
    assert.doesNotMatch(posees[0]?.textContent ?? "", /Parse error/);
  });
});
