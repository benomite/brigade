// Le moteur sur la carte d'une station de l'onglet Stations (#3746) : de ce que `facts` publie d'une station (son champ
// `engine` : le moteur choisi, celui sur lequel elle cuit, si c'est le secours, jusqu'à quand le choisi est bloqué), par la
// cuisson du projet (cuisson.ts) et les stations qui le servent (stations-tab/etat.js), jusqu'à sa carte : elle dit le moteur
// choisi et, sur le secours, sur lequel elle cuit, pourquoi et jusqu'à quand. La station de cet ordinateur, que le runtime
// ne dit pas encore, montre le moteur de ses réglages ; rien de lu, la carte ne dit aucun moteur.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tenirFaits, type Faits } from "../../../src/faits.ts";
import { hautDe, servantesDe, type Servante } from "../../../src/vue/stations-tab/etat.js";
import { poserLOngletDesStations } from "../../../src/vue/stations-tab/stations-tab.js";
import { Faux } from "../../aides/fausse-vue.ts";

process.env.TZ = "UTC";
const doc = { createElement: (balise: string) => new Faux(balise) };
const LU = "2026-10-13T10:04:11.000Z";
const FAITS: Faits = { etat: "ouverte", lu: LU, dernierTick: LU, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
const station = (plus: object = {}) => ({ station: "parade-box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, cooks: [], ...plus });
const EN_SECOURS = { chosen: "claude-subscription", active: "claude-api-key", onFallback: true, blockedUntil: "2026-10-13T15:00:00Z" };

// Ce que la vue reçoit de `facts`, puis les stations qui servent le projet.
function servantes(stations: object[]) {
  const recue = tirer(stations);
  return servantesDe({ projet: "parade", lignes: recue.stations?.lignes ?? [], stations: [], declarees: [], locale: null, maintenant: Date.parse(LU) });
}
function tirer(stations: object[]) {
  const recue = tenirFaits().recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
  assert.ok("tableau" in recue, "titre" in recue ? String(recue.titre) : "informe" in recue ? String(recue.informe) : "");
  return recue.tableau;
}
const GESTES = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
function carte(lesServantes: Servante[], plus: object = {}) {
  const onglet = poserLOngletDesStations(
    doc as never,
    { projet: "parade", poste: "this Mac", lues: true, haut: hautDe({ servantes: lesServantes, deplacement: null, maintenant: Date.parse(LU) }), servantes: lesServantes, deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set(), ...plus },
    GESTES,
  ) as Faux;
  return [...onglet.descendants()].find((n) => n.className === "carte-de-station") ?? assert.fail("pas de carte");
}
const ligne = (racine: Faux, classe: string) => [...racine.descendants()].find((n) => n.className === classe);

describe("le moteur sur la carte d'une station (#3746)", () => {
  test("sur son secours : la carte dit le moteur choisi, et « cooking on the API key: the subscription's cap is reached until » la date", () => {
    const lesServantes = servantes([station({ engine: EN_SECOURS })]);
    const racine = carte(lesServantes);
    assert.equal(ligne(racine, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
    const secours = ligne(racine, "moteur-en-secours") ?? assert.fail("pas de phrase du secours");
    assert.equal(secours.textContent, "cooking on the API key: the subscription's cap is reached until Oct 13, 03:00 PM");
    assert.equal(secours.dataset.ton, "jaune");
  });

  test("sur son moteur : la carte le dit, sans phrase de secours ; un état mal formé ne rend pas `facts` illisible, et la carte n'en dit rien", () => {
    const racine = carte(servantes([station({ engine: { chosen: "codex", active: "codex", onFallback: false, blockedUntil: null } })]));
    assert.equal(ligne(racine, "moteur-de-la-carte")?.textContent, "engine: Codex");
    assert.equal(ligne(racine, "moteur-en-secours"), undefined);
    for (const engine of [{ chosen: "gpt", active: "codex", onFallback: true }, "claude-subscription", { chosen: "codex", active: "codex" }]) {
      assert.equal(ligne(carte(servantes([station({ engine })])), "moteur-de-la-carte"), undefined, JSON.stringify(engine));
    }
  });

  test("sur son secours sans date lisible : la phrase s'arrête au plafond, aucune date inventée", () => {
    const racine = carte(servantes([station({ engine: { ...EN_SECOURS, chosen: "claude-api-key", active: "codex", blockedUntil: "bientôt" } })]));
    assert.equal(ligne(racine, "moteur-en-secours")?.textContent, "cooking on Codex: the API key's cap is reached");
  });

  test("la station de cet ordinateur, que le runtime ne dit pas : sa carte montre le moteur de ses réglages ; une autre, rien", () => {
    const [une] = servantes([station()]);
    assert.ok(une);
    assert.equal(ligne(carte([{ ...une, ici: true, sorte: "ici" }], { moteurIci: "claude-api-key" }), "moteur-de-la-carte")?.textContent, "engine: Claude API key");
    assert.equal(ligne(carte([une], { moteurIci: "claude-api-key" }), "moteur-de-la-carte"), undefined);
    assert.equal(ligne(carte([{ ...une, ici: true, sorte: "ici" }]), "moteur-de-la-carte"), undefined);
  });
});
