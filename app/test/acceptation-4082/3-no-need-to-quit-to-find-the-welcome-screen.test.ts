// Test d'acceptation gelé (#4082). Critère 3 : le novice n'a jamais besoin de quitter l'app pour retrouver l'écran d'accueil,
// quel que soit le chemin de clics qu'il a pris dans la barre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationsDuChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { BIENVENUE } from "../../src/vue/first-launch.js";
import { type Faux, FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

// A new computer: no project added, no station, the welcome screen is the first screen.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const AUCUNE: StationsDuChef = { state: "listed", unreadable: [], stations: [] };
async function ordinateurNeuf() {
  const stockage = new FauxStockage();
  const vue = await jouerLaVue({ demarrage, stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "chef" }), depotsDuChef: () => ({ depots: [] }), espace: () => [] }, { stockage });
  await repos();
  return vue;
}
const surLHome = (vue: { element(id: string): Faux }) => {
  const tous = vue.element("tous");
  return !tous.hidden && [tous, ...tous.descendants()].some(({ textContent }) => textContent === BIENVENUE) && vue.element("ajout").hidden;
};
// Everything the newcomer can click in one go from where they stand: the sidebar entries and the buttons of the open screen.
const clicables = (vue: { element(id: string): Faux }) => [vue.element("projets"), vue.element("tous"), vue.element("ajout")].flatMap((racine) => (racine.hidden ? [] : racine.dessous("button")));

const places = (vue: { element(id: string): Faux }) => vue.element("projets").dessous("button");
// Plays a fresh new computer, clicks the given places in order, then the \`candidat\`-th thing in reach: is the welcome screen back?
async function apresLesClics(chemin: number[], candidat?: number) {
  const vue = await ordinateurNeuf();
  for (const place of chemin) {
    (places(vue)[place] ?? assert.fail(`no place #${place} in the sidebar`)).click();
    await repos();
  }
  if (candidat === undefined) return { vue, revenu: surLHome(vue), enPortee: clicables(vue).length };
  clicables(vue)[candidat]?.click();
  await repos();
  return { vue, revenu: surLHome(vue), enPortee: 0 };
}
// From where the clicks led, does ONE more click bring the welcome screen back (or are they already on it)?
async function unClicRamene(chemin: number[]) {
  const ici = await apresLesClics(chemin);
  if (ici.revenu) return true;
  for (let candidat = 0; candidat < ici.enPortee; candidat++) if ((await apresLesClics(chemin, candidat)).revenu) return true;
  return false;
}
test("whatever order the newcomer clicks the sidebar in, the welcome screen is one click away — never a quit", async () => {
  const nombre = places((await apresLesClics([])).vue).length;
  assert.ok(nombre >= 2, "the sidebar offers its places");
  const chemins: number[][] = [];
  for (let a = 0; a < nombre; a++) for (let b = 0; b < nombre; b++) chemins.push([a, b]);
  for (const chemin of chemins) assert.ok(await unClicRamene(chemin), `after clicking places ${chemin.join(" then ")}, the welcome screen is out of reach without quitting`);
});
