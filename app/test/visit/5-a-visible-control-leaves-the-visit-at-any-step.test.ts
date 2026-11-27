// Acceptance test (#4087). Criterion 5: at any step of the visit, a visible control leaves the visit and lands on the
// welcome screen; from the first step and from a later one.
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
const finds = (vue: Played, motive: RegExp): Fake | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motive.test(`${p.textContent} ${p.title} ${p.ariaLabel}`.trim()));

const QUIT = /leave the visit|leave|exit/i;
const STEP = /Tour of a real kitchen · (\d+) of 6/;
const step = (vue: Played) => STEP.exec(vue.element("visite").textContent)?.[1];

async function visitInProgress() {
  const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: new FakeStorage() });
  await repos();
  (finds(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  assert.equal(step(vue), "1");
  return vue;
}
function onTheHome(vue: Played) {
  assert.equal(vue.element("visite").hidden, true, "the tour is closed");
  assert.ok(finds(vue, /visit a real kitchen/i) && finds(vue, /add my project/i), "the welcome screen shows its two choices again");
}

test("from the first step, a visible control leaves the visit for the welcome screen", async () => {
  const vue = await visitInProgress();
  (finds(vue, QUIT) ?? assert.fail("no visible control to leave the visit")).click();
  await repos();
  onTheHome(vue);
});

test("from a later step, the same control leaves the visit for the welcome screen", async () => {
  const vue = await visitInProgress();
  for (let times = 0; times < 3; times++) {
    (finds(vue, /^next$/i) ?? assert.fail("no next step")).click();
    await repos();
  }
  assert.equal(step(vue), "4");
  (finds(vue, QUIT) ?? assert.fail("no visible control to leave the visit at step 4")).click();
  await repos();
  onTheHome(vue);
});
