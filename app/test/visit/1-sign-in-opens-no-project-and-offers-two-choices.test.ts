// Acceptance test (#4087). Criterion 1: after GitHub sign-in on a fresh profile, no project opens and no project is added;
// the welcome screen shows two choices side by side, "visit a real kitchen" and "add my project".
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
// What would add a project or clone: the opening of a repository, or any call that names a clone or an add.
const ajouts = (vue: Jouee) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const boutons = (vue: Jouee): Faux[] => vue.poses().filter((p) => p.balise === "button" || p.role === "button");
const libelle = (p: Faux) => `${p.textContent} ${p.title} ${p.ariaLabel}`.trim();
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => boutons(vue).find((p) => !p.hidden && motif.test(libelle(p)));

test("after sign-in on a fresh profile nothing opens, and the welcome screen offers the two choices", async () => {
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });
  await repos();
  assert.deepEqual(ajouts(vue), [], "no project is added by itself");
  assert.equal(vue.element("espace").textContent, "", "no project is open");
  assert.equal(vue.element("visite").hidden, true, "no tour starts uninvited");
  const visiter = trouve(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice");
  const ajouter = trouve(vue, /add my project/i) ?? assert.fail("no 'add my project' choice");
  assert.equal(visiter.parentElement, ajouter.parentElement, "the two choices sit side by side, in the same row");
});
