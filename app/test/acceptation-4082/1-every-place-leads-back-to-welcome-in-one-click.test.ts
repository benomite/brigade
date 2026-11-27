// Test d'acceptation gelé (#4082). Critère 1 : sans projet ajouté, chaque endroit où le novice peut aller dans l'app le
// ramène à l'écran d'accueil en un clic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { WELCOME } from "../../src/vue/first-launch.js";
import { type Fake, FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";

// A new computer: no project added, no station, the welcome screen is the first screen.
const startup = () => ({
  configuration: forTheBar({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }, () => false),
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
async function computerNew() {
  const storage = new FakeStorage();
  const vue = await playTheVue({ demarrage: startup, stationsDuChef: () => NO, compteGitHub: () => ({ login: "chef" }), depotsDuChef: () => ({ depots: [] }), espace: () => [] }, { stockage: storage });
  await repos();
  return vue;
}
const onTheHome = (vue: { element(id: string): Fake }) => {
  const all = vue.element("tous");
  return !all.hidden && [all, ...all.descendants()].some(({ textContent }) => textContent === WELCOME) && vue.element("ajout").hidden;
};
// Everything the newcomer can click in one go from where they stand: the sidebar entries and the buttons of the open screen.
const clicables = (vue: { element(id: string): Fake }) => [vue.element("projets"), vue.element("tous"), vue.element("ajout")].flatMap((root) => (root.hidden ? [] : root.dessous("button")));

const places = (vue: { element(id: string): Fake }) => vue.element("projets").dessous("button");
// Plays a fresh new computer, clicks the given places in order, then the \`candidat\`-th thing in reach: is the welcome screen back?
async function afterTheClics(path: number[], candidate?: number) {
  const vue = await computerNew();
  for (const place of path) {
    (places(vue)[place] ?? assert.fail(`no place #${place} in the sidebar`)).click();
    await repos();
  }
  if (candidate === undefined) return { vue, revenu: onTheHome(vue), enPortee: clicables(vue).length };
  clicables(vue)[candidate]?.click();
  await repos();
  return { vue, revenu: onTheHome(vue), enPortee: 0 };
}
// From where the clicks led, does ONE more click bring the welcome screen back (or are they already on it)?
async function oneClickBringsBack(path: number[]) {
  const here = await afterTheClics(path);
  if (here.revenu) return true;
  for (let candidate = 0; candidate < here.enPortee; candidate++) if ((await afterTheClics(path, candidate)).revenu) return true;
  return false;
}
test("with no project added, from every place of the sidebar one click leads back to the welcome screen", async () => {
  const departure = await afterTheClics([]);
  assert.ok(departure.revenu, "a new computer opens on the welcome screen");
  const count = places(departure.vue).length;
  assert.ok(count >= 2, "the sidebar offers its places");
  for (let place = 0; place < count; place++) {
    assert.ok(await oneClickBringsBack([place]), `place #${place} of the sidebar leaves the welcome screen with no way back in one click`);
  }
});
