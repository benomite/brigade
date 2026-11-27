// Le moteur d'une livraison (#3747) : lu dans `facts`, dit sur sa fiche, et son prix sur la page des coûts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { understand, type Facts } from "../../../src/facts.ts";
import { setEngine, priceSays, WITHOUT_ENGINE } from "../../../src/vue/delivery-engine/display.js";
import { engineRead } from "../../../src/vue/delivery-engine/engine.ts";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const delivers = (ticket: number, more: object) => ({ ticket, titre: `T${ticket}`, url: null, livre: "2026-10-12T10:00:00.000Z", station: "box/claude", pr: null, relecture: null, ...more });
const read = (delivered: object[]): Facts => {
  const readOne = understand(JSON.stringify({ etat: "ouverte", lu: "2026-10-12T10:04:11.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], livres: delivered }));
  assert.ok(!("informe" in readOne), "informe" in readOne ? readOne.informe : "");
  return readOne;
};
const line = (engine: Parameters<typeof setEngine>[1]) => setEngine(doc, engine).textContent;

describe("ce que `facts` dit du moteur d'une livraison", () => {
  test("chaque moteur se lit ; le prix ne vient qu'avec la clé d'API", () => {
    const [a, b, c, d] = read([
      delivers(1, { engine: "claude-subscription", costUsd: 9 }),
      delivers(2, { engine: "claude-api-key", costUsd: 1.5 }),
      delivers(3, { engine: "codex", costUsd: 9 }),
      delivers(4, { engine: "claude-api-key" }),
    ]).livres!;
    assert.deepEqual(a?.moteur, { engine: "claude-subscription" });
    assert.deepEqual(b?.moteur, { engine: "claude-api-key", costUsd: 1.5 });
    assert.deepEqual(c?.moteur, { engine: "codex" });
    assert.deepEqual(d?.moteur, { engine: "claude-api-key" });
  });

  test("sans `engine`, rien n'est lu ; un moteur inconnu ou un prix absurde rend la carte illisible", () => {
    assert.equal(read([delivers(1, {})]).livres![0]?.moteur, undefined);
    assert.equal(engineRead(undefined, 3, "x", assert.fail), undefined);
    const [unknown, absurde] = read([delivers(1, { engine: "gemini" }), delivers(2, { engine: "claude-api-key", costUsd: "cher" })]).livres!;
    assert.match(unknown?.illisible ?? "", /engine/);
    assert.match(absurde?.illisible ?? "", /costUsd/);
  });
});

describe("la fiche d'une livraison", () => {
  test("dit le moteur de chacun des trois, et le prix de la clé d'API seule", () => {
    assert.equal(line({ engine: "claude-subscription" }), "cooked withClaude subscription");
    assert.equal(line({ engine: "claude-api-key", costUsd: 1.5 }), "cooked withClaude API key$1.50");
    assert.equal(line({ engine: "codex" }), "cooked withCodex");
  });

  test("sans `engine`, une livraison est dite sur l'abonnement Claude", () => {
    assert.equal(line(WITHOUT_ENGINE), "cooked withClaude subscription");
  });

  test("une clé d'API qui ne dit pas son prix n'en invente pas", () => {
    assert.equal(priceSays({ engine: "claude-api-key" }), null);
    assert.equal(priceSays(undefined), null);
  });
});

