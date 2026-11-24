// Test d'acceptation gelé (#4082). Critère 3 : le novice n'a jamais besoin de quitter l'app pour retrouver l'écran d'accueil,
// quel que soit le chemin de clics qu'il a pris dans la barre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationsDuChef } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { BIENVENUE } from "../../src/vue/premier-lancement.js";
import { CLE_DE_LA_VISITE } from "../../src/vue/visite/visite.js";
import { type Faux, FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

// A new computer: no project added, no station, the welcome screen is the first screen.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const AUCUNE: StationsDuChef = { state: "listed", unreadable: [], stations: [] };
async function ordinateurNeuf() {
  const stockage = new FauxStockage();
  stockage.setItem(CLE_DE_LA_VISITE, "passed");
  const vue = await jouerLaVue({ demarrage, stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "chef" }), depotsDuChef: () => ({ depots: [] }), espace: () => [] }, { stockage });
  await repos();
  return vue;
}
const surLAccueil = (vue: { element(id: string): Faux }) => {
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
  if (candidat === undefined) return { vue, revenu: surLAccueil(vue), enPortee: clicables(vue).length };
  clicables(vue)[candidat]?.click();
  await repos();
  return { vue, revenu: surLAccueil(vue), enPortee: 0 };
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
