// Le moteur sur la carte d'une station de l'onglet Stations (#3746) : de ce que `facts` publie d'une station (son champ
// `engine` : le moteur choisi, celui sur lequel elle cuit, si c'est le secours, jusqu'à quand le choisi est bloqué), par la
// cuisson du projet (cooking.ts) et les stations qui le servent (stations-tab/state.js), jusqu'à sa carte : elle dit le moteur
// choisi et, sur le secours, sur lequel elle cuit, pourquoi et jusqu'à quand. La station de cet ordinateur, que le runtime
// ne dit pas encore, montre le moteur de ses réglages ; rien de lu, la carte ne dit aucun moteur.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdFacts, type Facts } from "../../../src/facts.ts";
import { topOf, servingOf, type Serving } from "../../../src/vue/stations-tab/state.js";
import { setTheTabOfStations } from "../../../src/vue/stations-tab/stations-tab.js";
import { Fake } from "../../helpers/false-vue.ts";

process.env.TZ = "UTC";
const doc = { createElement: (balise: string) => new Fake(balise) };
const READ = "2026-10-13T10:04:11.000Z";
const FACTS: Facts = { etat: "ouverte", lu: READ, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, cooks: [] };
const station = (more: object = {}) => ({ station: "parade-box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, cooks: [], ...more });
const IN_FALLBACK = { chosen: "claude-subscription", active: "claude-api-key", onFallback: true, blockedUntil: "2026-10-13T15:00:00Z" };

// Ce que la vue reçoit de `facts`, puis les stations qui servent le projet.
function servingOnes(stations: object[]) {
  const receivedOne = pull(stations);
  return servingOf({ projet: "parade", lignes: receivedOne.stations?.lignes ?? [], stations: [], declarees: [], locale: null, maintenant: Date.parse(READ) });
}
function pull(stations: object[]) {
  const receivedOne = holdFacts().recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations }) }] });
  assert.ok("tableau" in receivedOne, "titre" in receivedOne ? String(receivedOne.titre) : "informe" in receivedOne ? String(receivedOne.informe) : "");
  return receivedOne.tableau;
}
const ACTIONS = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
function card(theServing: Serving[], more: object = {}) {
  const tab = setTheTabOfStations(
    doc as never,
    { projet: "parade", poste: "this Mac", lues: true, haut: topOf({ servantes: theServing, deplacement: null, maintenant: Date.parse(READ) }), servantes: theServing, deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set(), ...more },
    ACTIONS,
  ) as Fake;
  return [...tab.descendants()].find((n) => n.className === "carte-de-station") ?? assert.fail("pas de carte");
}
const line = (root: Fake, classe: string) => [...root.descendants()].find((n) => n.className === classe);

describe("le moteur sur la carte d'une station (#3746)", () => {
  test("sur son secours : la carte dit le moteur choisi, et « cooking on the API key: the subscription's cap is reached until » la date", () => {
    const theServing = servingOnes([station({ engine: IN_FALLBACK })]);
    const root = card(theServing);
    assert.equal(line(root, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
    const fallback = line(root, "moteur-en-secours") ?? assert.fail("pas de phrase du secours");
    assert.equal(fallback.textContent, "cooking on the API key: the subscription's cap is reached until Oct 13, 03:00 PM");
    assert.equal(fallback.dataset.ton, "jaune");
  });

  test("sur son moteur : la carte le dit, sans phrase de secours ; un état mal formé ne rend pas `facts` illisible, et la carte n'en dit rien", () => {
    const root = card(servingOnes([station({ engine: { chosen: "codex", active: "codex", onFallback: false, blockedUntil: null } })]));
    assert.equal(line(root, "moteur-de-la-carte")?.textContent, "engine: Codex");
    assert.equal(line(root, "moteur-en-secours"), undefined);
    for (const engine of [{ chosen: "gpt", active: "codex", onFallback: true }, "claude-subscription", { chosen: "codex", active: "codex" }]) {
      assert.equal(line(card(servingOnes([station({ engine })])), "moteur-de-la-carte"), undefined, JSON.stringify(engine));
    }
  });

  test("sur son secours sans date lisible : la phrase s'arrête au plafond, aucune date inventée", () => {
    const root = card(servingOnes([station({ engine: { ...IN_FALLBACK, chosen: "claude-api-key", active: "codex", blockedUntil: "bientôt" } })]));
    assert.equal(line(root, "moteur-en-secours")?.textContent, "cooking on Codex: the API key's cap is reached");
  });

  test("la station de cet ordinateur, que le runtime ne dit pas : sa carte montre le moteur de ses réglages ; une autre, rien", () => {
    const [one] = servingOnes([station()]);
    assert.ok(one);
    assert.equal(line(card([{ ...one, ici: true, sorte: "ici" }], { moteurIci: "claude-api-key" }), "moteur-de-la-carte")?.textContent, "engine: Claude API key");
    assert.equal(line(card([one], { moteurIci: "claude-api-key" }), "moteur-de-la-carte"), undefined);
    assert.equal(line(card([{ ...one, ici: true, sorte: "ici" }]), "moteur-de-la-carte"), undefined);
  });
});
