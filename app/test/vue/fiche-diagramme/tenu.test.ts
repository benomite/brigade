// Le diagramme de la fiche, tenu d'une pose de la fiche à l'autre (#3773) : la vue repose la fiche entière à chaque
// nouvelle ; le diagramme se rend une fois par corps, et la fiche est reposée quand il est prêt.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diagrammeTenu, type Tenu } from "../../../src/vue/fiche-diagramme/fiche-diagramme.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const CORPS = "Context.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n";

describe("le diagramme tenu sur la fiche", () => {
  test("rien d'abord, puis la fiche reposée montre le diagramme, rendu une seule fois", async () => {
    const tenus = new Map<string, Tenu>();
    let rendus = 0;
    let reposee: () => void = () => {};
    const pret = new Promise<void>((resolu) => (reposee = resolu));
    const rendre = async () => {
      rendus += 1;
      return doc.createElement("svg");
    };
    assert.deepEqual(diagrammeTenu(doc, tenus, "parade#14", CORPS, reposee, rendre), []);
    await pret;
    const posees = diagrammeTenu(doc, tenus, "parade#14", CORPS, reposee, rendre) as Faux[];
    assert.equal(posees.length, 1);
    assert.equal(posees[0]?.dessous("svg").length, 1);
    assert.equal(rendus, 1);
  });

  test("un corps sans bloc ne repose jamais la fiche ; un corps changé se rend à nouveau", async () => {
    const tenus = new Map<string, Tenu>();
    let reposes = 0;
    const vus: string[] = [];
    const rendre = async (source: string) => {
      vus.push(source);
      return doc.createElement("svg");
    };
    assert.deepEqual(diagrammeTenu(doc, tenus, "parade#14", "no diagram here", () => (reposes += 1), rendre), []);
    await new Promise((resolu) => setImmediate(resolu));
    assert.deepEqual(diagrammeTenu(doc, tenus, "parade#14", "no diagram here", () => (reposes += 1), rendre), []);
    assert.equal(reposes, 0);
    diagrammeTenu(doc, tenus, "parade#14", CORPS, () => (reposes += 1), rendre);
    await new Promise((resolu) => setImmediate(resolu));
    assert.equal(reposes, 1);
    assert.deepEqual(vus, ["flowchart LR\n  A --> B"]);
  });
});
