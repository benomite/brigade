// Test d'acceptation gelé (#4082). Critère 2 : la marque Brigade, cliquée depuis l'écran d'accueil, les y garde ou les mène
// à un écran qui montre le chemin du retour.
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
test("the Brigade mark, clicked from the welcome screen, keeps them there or shows the way back", async () => {
  const depart = await apresLesClics([]);
  assert.ok(depart.revenu, "a new computer opens on the welcome screen");
  const marque = places(depart.vue).findIndex((button) => button.id === "entree-tous");
  assert.ok(marque >= 0, "the sidebar carries the Brigade mark");
  assert.ok(await unClicRamene([marque]), "after the mark, the newcomer is neither on the welcome screen nor one click from it");
});
