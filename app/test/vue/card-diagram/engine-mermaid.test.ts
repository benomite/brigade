// Le moteur de l'app pour le diagramme de la fiche (#3773) : Mermaid, réglé en sécurité stricte, son SVG importé dans la
// vue. Il rejette quand Mermaid n'est pas chargé ou ne rend rien — la fiche montre alors la source. Contre un faux Mermaid
// et un faux DOMParser : le test ne charge pas de navigateur.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { rendreAvecMermaid } from "../../../src/vue/card-diagram/card-diagram.js";

const monde = globalThis as { mermaid?: unknown; DOMParser?: unknown };
const avant = { mermaid: monde.mermaid, DOMParser: monde.DOMParser };
afterEach(() => {
  monde.mermaid = avant.mermaid;
  monde.DOMParser = avant.DOMParser;
});

// Un DOMParser dont le premier élément du corps est l'objet `lu` — ou rien.
function parseur(lu: object | null) {
  return class {
    parseFromString(svg: string, type: string) {
      assert.equal(type, "text/html");
      return { body: { firstElementChild: lu === null ? null : { ...lu, svg } } };
    }
  };
}

function fauxMermaid() {
  const settings: unknown[] = [];
  const sources: string[] = [];
  return {
    reglages: settings,
    sources,
    initialize: (setting: unknown) => settings.push(setting),
    render: async (_id: string, source: string) => {
      sources.push(source);
      return { svg: "<svg></svg>" };
    },
  };
}

function fauxDoc() {
  const importes: [unknown, unknown][] = [];
  return { importes, importNode: (noeud: unknown, profond: unknown) => (importes.push([noeud, profond]), { importe: noeud }) };
}

describe("le moteur Mermaid de la fiche", () => {
  test("Mermaid chargé : réglé sans démarrage seul et en sécurité stricte, son SVG est importé en entier", async () => {
    const mermaid = fauxMermaid();
    monde.mermaid = mermaid;
    monde.DOMParser = parseur({ balise: "svg" });
    const doc = fauxDoc();
    const pose = await rendreAvecMermaid(doc as unknown as Document)("flowchart LR\n  A --> B");
    assert.deepEqual(pose, { importe: { balise: "svg", svg: "<svg></svg>" } });
    assert.deepEqual(doc.importes, [[{ balise: "svg", svg: "<svg></svg>" }, true]]);
    assert.deepEqual(mermaid.sources, ["flowchart LR\n  A --> B"]);
    assert.equal(mermaid.reglages.length, 1);
    assert.deepEqual(
      { startOnLoad: (mermaid.reglages[0] as { startOnLoad: unknown }).startOnLoad, securityLevel: (mermaid.reglages[0] as { securityLevel: unknown }).securityLevel },
      { startOnLoad: false, securityLevel: "strict" },
    );
  });

  test("Mermaid absent : le rendu rejette, sans rien importer", async () => {
    delete monde.mermaid;
    monde.DOMParser = parseur({ balise: "svg" });
    const doc = fauxDoc();
    await assert.rejects(rendreAvecMermaid(doc as unknown as Document)("flowchart LR"), /not loaded/);
    assert.deepEqual(doc.importes, []);
  });

  test("Mermaid qui ne rend rien : le rendu rejette, sans rien importer", async () => {
    monde.mermaid = fauxMermaid();
    monde.DOMParser = parseur(null);
    const doc = fauxDoc();
    await assert.rejects(rendreAvecMermaid(doc as unknown as Document)("flowchart LR"), /rendered nothing/);
    assert.deepEqual(doc.importes, []);
  });
});
