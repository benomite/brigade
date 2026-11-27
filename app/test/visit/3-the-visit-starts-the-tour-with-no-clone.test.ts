// Acceptance test (#4087). Criterion 3: choosing "visit a real kitchen" shows Brigade's own kitchen read-only and starts the
// guided tour; no clone runs and nothing is written to ~/Brigade.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening, StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { Fake, FakeStorage, playTheVue, type Played, repos } from "../helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const startup = (projects: Project[]) => ({
  configuration: forTheBar({ chemin: PATH, projets: projects }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const NO: StationsOfChef = { state: "listed", unreadable: [], stations: [] };
const OPEN: Opening = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const additions = (vue: Played) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const finds = (vue: Played, motive: RegExp): Fake | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motive.test(`${p.textContent} ${p.title} ${p.ariaLabel}`));

test("choosing 'visit a real kitchen' starts the tour on benomite/brigade, with no clone and no add", async () => {
  const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: new FakeStorage() });
  await repos();
  (finds(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  assert.equal(vue.element("visite").hidden, false, "the guided tour is shown");
  assert.match(vue.element("visite").textContent, /Tour of a real kitchen · 1 of 6/, "it starts at the first step");
  assert.deepEqual(additions(vue), [], "no clone runs and no project is added, so nothing is written to ~/Brigade");
  const calls = vue.appels.map(({ geste: action, args }) => `${action} ${JSON.stringify(args)}`).join("\n");
  assert.match(calls, /benomite\/brigade/, "the data shown is read from Brigade's own kitchen, benomite/brigade");
});
