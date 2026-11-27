// Les alertes du haut du rail, posées par la vue (ticket 3823) : une lecture de `facts` telle que le process principal la
// donne, l'espace de `parade` ouvert sur son rail. L'alerte se pose en tête du rail ; celle qui dit qu'aucun cook ne peut
// partir se tait pendant que la station de cet ordinateur redémarre pour sa mise à jour (ticket 3637) ; la phrase de
// l'attente qui porte un geste ne se montre plus — les alertes disent seules les pannes —, celle sans geste reste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { playTheVue, repos, type Fake } from "../helpers/false-vue.ts";

const PARADE = "parade";
const READ = "2026-11-18T12:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const BASE = { etat: "ouverte", lu: READ, dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [] };
const NO_COOK = { sorte: "aucun-cook", phrase: "Station parade-box has been offline since 11:00 UTC (1 h), so no cook can start: #4 waits. Start it on its computer.", fait: { depuis: "2026-11-18T11:00:00.000Z", ticket: 4, check: "the signs of life of parade-box" }, geste: "Start it on its computer", geree: null, bouton: "demarrer-la-station" };
const BASE_RED = { sorte: "base-rouge", phrase: "The main branch has been red since 10:00 UTC (2 h) (check runtime tests fails, #12): no delivery merges.", fait: { depuis: "2026-11-18T10:00:00.000Z", ticket: 12, check: "runtime tests" }, geste: null, geree: "The kitchen repairs it on #12." };

// L'espace de `parade` ouvert sur son rail — sa station d'ici en train de redémarrer, ou non ; `montrer` y pose une lecture de `facts`.
async function space(restarts: boolean) {
  const configuration = forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true, () => true, () => !restarts, () => (restarts ? "2.5.0" : null));
  const vue = await playTheVue({
    demarrage: () => ({ configuration, palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS, gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED }, banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined }),
    espace: () => [SECOND],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return async (facts: Record<string, unknown>) => {
    const drawable = holdFacts().recevoir({ projet: PARADE, demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: `${JSON.stringify({ ...BASE, ...facts })}\n` }] });
    vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
    await repos();
    return vue.element("rail");
  };
}
const alertsOf = (rail: Fake) => rail.children.filter(({ className }) => className.includes("alerte-du-rail")).map(({ dataset }) => dataset.sorte);
const waitsOf = (rail: Fake) => rail.children.filter(({ className }) => className.includes("attente-du-rail")).map(({ dataset }) => dataset.raison);

describe("les alertes du haut du rail, dans la vue", () => {
  test("l'alerte qui dit qu'aucun cook ne peut partir se pose en tête du rail ; pendant le redémarrage de la station d'ici, elle se tait, et la base rouge reste", async () => {
    const show = await space(false);
    assert.deepEqual(alertsOf(await show({ alertesDuRail: [NO_COOK] })), ["aucun-cook"]);
    const during = await space(true);
    assert.deepEqual(alertsOf(await during({ alertesDuRail: [NO_COOK] })), []);
    // La base rouge que la cuisine répare seule ne demande rien au chef : pas de bannière (#4238). Celle qui attend son geste reste,
    // avec un bouton.
    assert.deepEqual(alertsOf(await during({ alertesDuRail: [NO_COOK, BASE_RED] })), []);
    const rail = await during({ alertesDuRail: [NO_COOK, { ...BASE_RED, geste: "Open the failing check", geree: null }] });
    assert.deepEqual(alertsOf(rail), ["base-rouge"]);
    assert.deepEqual(rail.children.find(({ className }) => className.includes("alerte-du-rail"))?.dessous("button").map(({ textContent }) => textContent), ["open #12"]);
  });

  test("la phrase de l'attente qui porte un geste ne se montre plus ; celle sans geste reste", async () => {
    const show = await space(false);
    assert.deepEqual(waitsOf(await show({ attenteDuRail: { raison: "aucune-station", phrase: "No station serves this project, so no cook can start. Add the project to a station.", geste: "ajouter-a-une-station", stations: [] } })), []);
    assert.deepEqual(waitsOf(await show({ attenteDuRail: { raison: "normale", phrase: "Normal wait: a cook takes the ticket within minutes (the oldest has waited 2 min). It resolves by itself.", geste: null, stations: [] } })), ["normale"]);
  });
});
