// Un badge de l'équipe (#4029) ouvre l'onglet Agents (ticket 4224) quand son clic ouvre le fil de l'agent ; le clic qui
// referme ce fil ne fait que le refermer : l'onglet que le chef a choisi entre-temps reste le sien.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { source as sourceDeLTeam } from "../../src/vue/autonomy/source.js";
import { source } from "../../src/vue/agents/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const unAgent = (name: string) => ({
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

const LES_VRAIES = [{ ...source }, { ...sourceDeLTeam }] as const;
afterEach(() => {
  Object.assign(source, LES_VRAIES[0]);
  Object.assign(sourceDeLTeam, LES_VRAIES[1]);
});

const ongletMontre = (vue: Jouee): string | undefined => vue.element("rail").dataset.onglet;
async function cliquer(pose: Faux | undefined): Promise<void> {
  (pose ?? assert.fail("rien à cliquer")).click();
  for (let i = 0; i < 4; i++) await repos();
}

test("a badge that opens its agent's thread opens the Agents tab; the click that closes the thread leaves the tab the chef chose", async () => {
  Object.assign(source, { lire: async () => [], reglages: async () => ({ fields: [] }) });
  Object.assign(sourceDeLTeam, { lire: async () => ["closer"].map(unAgent), regler: async () => {}, approuver: async () => {} });
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  await cliquer(vue.element("projets").children.at(1));
  const badge = () => vue.poses().find((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith("closer"));
  const rail = () => vue.element("onglets-du-projet").children.find(({ textContent }) => textContent.trim() === "Rail");
  assert.notEqual(ongletMontre(vue), "agents");
  await cliquer(badge());
  assert.equal(ongletMontre(vue), "agents", "the badge that opens the thread opens the Agents tab");
  await cliquer(rail());
  assert.notEqual(ongletMontre(vue), "agents");
  await cliquer(badge());
  assert.notEqual(ongletMontre(vue), "agents", "the click that closes the thread does not open the tab again");
});
