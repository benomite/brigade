// Le composant du diagramme de la fiche (#3773) : le premier bloc ```mermaid du corps du ticket, et lui seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractMermaid } from "../../../src/vue/card-diagram/card-diagram.js";

describe("l'extraction du bloc mermaid", () => {
  test("d'un corps avec du texte avant et après le bloc", () => {
    const body = "Intro line.\n\n## Flow\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter the diagram.\n";
    assert.equal(extractMermaid(body), "flowchart LR\n  A --> B");
  });

  test("d'un corps avec deux blocs : le premier l'emporte", () => {
    const body = "```mermaid\ngraph TD\n  X --> Y\n```\n\ntext\n\n```mermaid\ngraph TD\n  P --> Q\n```\n";
    assert.equal(extractMermaid(body), "graph TD\n  X --> Y");
  });

  test("sans bloc mermaid : rien", () => {
    assert.equal(extractMermaid("no block here\n```js\nx\n```"), undefined);
  });
});
