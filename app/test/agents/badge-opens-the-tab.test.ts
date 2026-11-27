// Un badge de l'équipe (#4029) ouvre l'onglet Agents (ticket 4224) quand son clic ouvre le fil de l'agent ; le clic qui
// referme ce fil ne fait que le refermer : l'onglet que le chef a choisi entre-temps reste le sien.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { source as sourceOfTheTeam } from "../../src/vue/autonomy/source.js";
import { source } from "../../src/vue/agents/source.js";
import { playTheVue, repos, type Fake, type Played } from "../helpers/false-vue.ts";

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const oneAgent = (name: string) => ({
  agent: name,
  state: `state-of-${name}`,
  lastGesture: { line: `last gesture of ${name}`, at: "2026-11-23T09:30:00.000Z" },
  nextRun: { text: `${name}: next pass in 3 h`, at: "2026-11-23T15:00:00.000Z" },
  thread: `thread-${name}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
});

const THE_REAL = [{ ...source }, { ...sourceOfTheTeam }] as const;
afterEach(() => {
  Object.assign(source, THE_REAL[0]);
  Object.assign(sourceOfTheTeam, THE_REAL[1]);
});

const tabShows = (vue: Played): string | undefined => vue.element("rail").dataset.onglet;
async function click(pose: Fake | undefined): Promise<void> {
  (pose ?? assert.fail("rien à cliquer")).click();
  for (let i = 0; i < 4; i++) await repos();
}

test("a badge that opens its agent's thread opens the Agents tab; the click that closes the thread leaves the tab the chef chose", async () => {
  Object.assign(source, { lire: async () => [], reglages: async () => ({ fields: [] }) });
  Object.assign(sourceOfTheTeam, { lire: async () => ["closer"].map(oneAgent), regler: async () => {}, approuver: async () => {} });
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  await click(vue.element("projets").children.at(1));
  const badge = () => vue.poses().find((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith("closer"));
  const rail = () => vue.element("onglets-du-projet").children.find(({ textContent }) => textContent.trim() === "Rail");
  assert.notEqual(tabShows(vue), "agents");
  await click(badge());
  assert.equal(tabShows(vue), "agents", "the badge that opens the thread opens the Agents tab");
  await click(rail());
  assert.notEqual(tabShows(vue), "agents");
  await click(badge());
  assert.notEqual(tabShows(vue), "agents", "the click that closes the thread does not open the tab again");
});
