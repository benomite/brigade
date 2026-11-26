// Le moteur d'une livraison (#3747) : lu dans `facts`, dit sur sa fiche, et son prix sur la page des coûts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comprendre, type Card, type Facts } from "../../../src/facts.ts";
import { poserChers } from "../../../src/vue/cost/chers.js";
import { poserEngine, prixDit, SANS_ENGINE } from "../../../src/vue/delivery-engine/display.js";
import { engineLu } from "../../../src/vue/delivery-engine/engine.ts";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const livre = (ticket: number, plus: object) => ({ ticket, titre: `T${ticket}`, url: null, livre: "2026-10-12T10:00:00.000Z", station: "box/claude", pr: null, relecture: null, ...plus });
const lire = (livres: object[]): Facts => {
  const lu = comprendre(JSON.stringify({ etat: "ouverte", lu: "2026-10-12T10:04:11.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], livres }));
  assert.ok(!("informe" in lu), "informe" in lu ? lu.informe : "");
  return lu;
};
const line = (engine: Parameters<typeof poserEngine>[1]) => poserEngine(doc, engine).textContent;

describe("ce que `facts` dit du moteur d'une livraison", () => {
  test("chaque moteur se lit ; le prix ne vient qu'avec la clé d'API", () => {
    const [a, b, c, d] = lire([
      livre(1, { engine: "claude-subscription", costUsd: 9 }),
      livre(2, { engine: "claude-api-key", costUsd: 1.5 }),
      livre(3, { engine: "codex", costUsd: 9 }),
      livre(4, { engine: "claude-api-key" }),
    ]).livres!;
    assert.deepEqual(a?.moteur, { engine: "claude-subscription" });
    assert.deepEqual(b?.moteur, { engine: "claude-api-key", costUsd: 1.5 });
    assert.deepEqual(c?.moteur, { engine: "codex" });
    assert.deepEqual(d?.moteur, { engine: "claude-api-key" });
  });

  test("sans `engine`, rien n'est lu ; un moteur inconnu ou un prix absurde rend la carte illisible", () => {
    assert.equal(lire([livre(1, {})]).livres![0]?.moteur, undefined);
    assert.equal(engineLu(undefined, 3, "x", assert.fail), undefined);
    const [inconnu, absurde] = lire([livre(1, { engine: "gemini" }), livre(2, { engine: "claude-api-key", costUsd: "cher" })]).livres!;
    assert.match(inconnu?.illisible ?? "", /engine/);
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
    assert.equal(line(SANS_ENGINE), "cooked withClaude subscription");
  });

  test("une clé d'API qui ne dit pas son prix n'en invente pas", () => {
    assert.equal(prixDit({ engine: "claude-api-key" }), null);
    assert.equal(prixDit(undefined), null);
  });
});

describe("la page des coûts", () => {
  const cook = (ticket: number, tokens: string) => `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  fini  31 tours · ${tokens} tokens · 9,2 min`;
  const station = ["station  box/claude", "derniers cooks        ", cook(1, "900 000"), cook(2, "800 000"), cook(3, "700 000"), cook(4, "600 000"), "consommé  rien"].join("\n");
  const lectures = new Map([["parade", { projet: "parade", demande: 0, a: "2026-10-17T10:00:00.000Z", sorties: [{ commande: "station", texte: station }] }]]);
  const moteurs: Record<number, Card["moteur"]> = { 1: { engine: "claude-api-key", costUsd: 3.27 }, 2: { engine: "codex" }, 3: { engine: "claude-subscription" } };
  const prix = (avec: boolean) => poserChers(doc, [{ nom: "parade" }], lectures, () => "t", () => {}, undefined, new Date("2026-10-17T10:00:00.000Z"), avec ? (_p, t) => moteurs[t] : undefined)
    .dessous("button").map((b: Faux) => b.dessous("span").filter((s: Faux) => s.className === "prix").map((s: Faux) => s.textContent));

  test("la livraison sur clé d'API porte son prix ; les autres moteurs et les tickets sans moteur n'ont aucun chiffre", () => {
    assert.deepEqual(prix(true), [["$3.27"], [""], [""], [""]]);
  });

  test("sans livraison à prix, aucune colonne de prix n'est posée", () => {
    assert.deepEqual(prix(false), [[], [], [], []]);
  });
});
