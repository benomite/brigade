// La page d'un projet ne dit jamais « No station cooks » à côté d'une panne qui nomme sa station (#3472) : la station
// que la panne du rail nomme est celle qui le sert, arrêtée ou non — la ligne la nomme, et « choose its machine » ne
// s'offre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import type { Reading } from "../../src/box.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: "2026-11-13T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

const SILENT = { station: "macbook-air-de-benoit/claude", distante: false, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: false, cuisson: "stopped", cooks: [], vueLe: A };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "secondes", dossier: "/tmp/secondes", depot: "benomite/secondes", base: "main" }] }, () => false),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  // Les stations du compte, lues, sans que l'app en connaisse une qui serve le projet : seul `facts` dit celle qui le sert.
  stations: { a: A, stations: [] } satisfies SeenOfStations,
  projetsDesStations: { a: A, projets: [], recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) } as SeenOfProjects,
});
async function open(facts?: unknown): Promise<{ vue: Played; bloc: ReturnType<Played["element"]> }> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  if (facts !== undefined) {
    const reading: Reading = { projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] };
    vue.dire("surFaits", { ...holdFacts().recevoir(reading), demande: vue.dernier("faits")[0] as number });
    await repos();
  }
  return { vue, bloc: vue.element("stations-du-projet") };
}

test("la panne nomme la station arrêtée : l'étiquette de Stations la nomme, jamais « No station cooks »", async () => {
  const { vue, bloc: block } = await open({ ...FACTS, stations: [SILENT] });
  const text = block.textContent;
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.doesNotMatch(text, /No station cooks/);
  assert.equal(block.dessous("button").some((button) => button.textContent === "choose its machine"), false);
});

const buttons = (block: ReturnType<Played["element"]>) => block.dessous("button").map((button) => button.textContent);

test("une station arrêtée, la file vide : aucune panne, et la page la nomme — jamais « No station cooks », jamais « choose its machine » (secondes)", async () => {
  const { vue, bloc: block } = await open({ ...FACTS, stations: [SILENT] });
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.doesNotMatch(block.textContent, /No station cooks/);
  assert.equal(buttons(block).includes("choose its machine"), false);
});

test("secondes : la station arrêtée est nommée par la ligne des stations, et le geste qui la démarre ne se dit qu'une fois dans la page", async () => {
  const { vue, bloc: block } = await open({ ...FACTS, stations: [SILENT] });
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.equal((block.textContent.match(/Start it on its computer/g) ?? []).length, 0);
  assert.doesNotMatch(block.textContent, /No station cooks/);
  assert.equal(buttons(block).includes("choose its machine"), false);
  // Au plus une ligne d'état au-dessus des colonnes (#3523) : la phrase de la panne et son bouton, jamais deux fois.
  assert.ok((vue.element("rail").textContent.match(/Start it on its computer/g) ?? []).length <= 1, "la phrase de la panne, sans bouton : un seul geste");
});

test("« choose its machine » ne s'offre que sans station : aucune n'a servi le projet, ou celle qui le servait est retirée", async () => {
  const { vue, bloc: block } = await open({ ...FACTS, stations: [] });
  assert.match(block.textContent, /No station cooks/);
  assert.equal(buttons(block).includes("choose its machine"), true);
  // Une station le sert, arrêtée : le bouton s'en va et la station est nommée.
  const reading = (facts: unknown): Reading => ({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...holdFacts().recevoir(reading({ ...FACTS, stations: [SILENT] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.equal(buttons(block).includes("choose its machine"), false);
  // Retirée : la ligne et le bouton reviennent.
  vue.dire("surFaits", { ...holdFacts().recevoir(reading({ ...FACTS, stations: [] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.match(block.textContent, /No station cooks/);
  assert.equal(buttons(block).includes("choose its machine"), true);
});
