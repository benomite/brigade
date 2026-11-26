// Acceptance test (#4087). Criterion 3: choosing "visit a real kitchen" shows Brigade's own kitchen read-only and starts the
// guided tour; no clone runs and nothing is written to ~/Brigade.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture, StationsDuChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { Faux, FauxStockage, jouerLaVue, type Jouee, repos } from "../aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const demarrage = (projects: Project[]) => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: projects }, () => false),
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
const OUVERT: Ouverture = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const ajouts = (vue: Jouee) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motif.test(`${p.textContent} ${p.title} ${p.ariaLabel}`));

test("choosing 'visit a real kitchen' starts the tour on benomite/brigade, with no clone and no add", async () => {
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });
  await repos();
  (trouve(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  assert.equal(vue.element("visite").hidden, false, "the guided tour is shown");
  assert.match(vue.element("visite").textContent, /Tour of a real kitchen · 1 of 6/, "it starts at the first step");
  assert.deepEqual(ajouts(vue), [], "no clone runs and no project is added, so nothing is written to ~/Brigade");
  const calls = vue.appels.map(({ geste: action, args }) => `${action} ${JSON.stringify(args)}`).join("\n");
  assert.match(calls, /benomite\/brigade/, "the data shown is read from Brigade's own kitchen, benomite/brigade");
});
