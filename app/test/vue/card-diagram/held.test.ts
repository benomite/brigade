// Le diagramme de la fiche, tenu d'une pose de la fiche à l'autre (#3773) : la vue repose la fiche entière à chaque
// nouvelle ; le diagramme se rend une fois par corps, et la fiche est reposée quand il est prêt.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diagramHeld, type Held } from "../../../src/vue/card-diagram/card-diagram.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const BODY = "Context.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n";

describe("le diagramme tenu sur la fiche", () => {
  test("rien d'abord, puis la fiche reposée montre le diagramme, rendu une seule fois", async () => {
    const heldOnes = new Map<string, Held>();
    let renderedOnes = 0;
    let rested: () => void = () => {};
    const ready = new Promise<void>((resolved) => (rested = resolved));
    const render = async () => {
      renderedOnes += 1;
      return doc.createElement("svg");
    };
    assert.deepEqual(diagramHeld(doc, heldOnes, "parade#14", BODY, rested, render), []);
    await ready;
    const setEntries = diagramHeld(doc, heldOnes, "parade#14", BODY, rested, render) as Fake[];
    assert.equal(setEntries.length, 1);
    assert.equal(setEntries[0]?.dessous("svg").length, 1);
    assert.equal(renderedOnes, 1);
  });

  test("un corps sans bloc ne repose jamais la fiche ; un corps changé se rend à nouveau", async () => {
    const heldOnes = new Map<string, Held>();
    let rested = 0;
    const seenOnes: string[] = [];
    const render = async (source: string) => {
      seenOnes.push(source);
      return doc.createElement("svg");
    };
    assert.deepEqual(diagramHeld(doc, heldOnes, "parade#14", "no diagram here", () => (rested += 1), render), []);
    await new Promise((resolved) => setImmediate(resolved));
    assert.deepEqual(diagramHeld(doc, heldOnes, "parade#14", "no diagram here", () => (rested += 1), render), []);
    assert.equal(rested, 0);
    diagramHeld(doc, heldOnes, "parade#14", BODY, () => (rested += 1), render);
    await new Promise((resolved) => setImmediate(resolved));
    assert.equal(rested, 1);
    assert.deepEqual(seenOnes, ["flowchart LR\n  A --> B"]);
  });
});
