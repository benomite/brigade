// Acceptance test (#4087). Criterion 1: after GitHub sign-in on a fresh profile, no project opens and no project is added;
// the welcome screen shows two choices side by side, "visit a real kitchen" and "add my project".
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
import type { Opening, StationsDuChef } from "../../src/first-launch.ts";
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
const NO: StationsDuChef = { state: "listed", unreadable: [], stations: [] };
const OPEN: Opening = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
// What would add a project or clone: the opening of a repository, or any call that names a clone or an add.
const additions = (vue: Played) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const buttons = (vue: Played): Fake[] => vue.poses().filter((p) => p.balise === "button" || p.role === "button");
const wording = (p: Fake) => `${p.textContent} ${p.title} ${p.ariaLabel}`.trim();
const finds = (vue: Played, motive: RegExp): Fake | undefined => buttons(vue).find((p) => !p.hidden && motive.test(wording(p)));

test("after sign-in on a fresh profile nothing opens, and the welcome screen offers the two choices", async () => {
  const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: new FakeStorage() });
  await repos();
  assert.deepEqual(additions(vue), [], "no project is added by itself");
  assert.equal(vue.element("espace").textContent, "", "no project is open");
  assert.equal(vue.element("visite").hidden, true, "no tour starts uninvited");
  const visit = finds(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice");
  const add = finds(vue, /add my project/i) ?? assert.fail("no 'add my project' choice");
  assert.equal(visit.parentElement, add.parentElement, "the two choices sit side by side, in the same row");
});
