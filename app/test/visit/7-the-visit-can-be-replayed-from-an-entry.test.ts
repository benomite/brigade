// Acceptance test (#4087). Criterion 7: the visit can be replayed later from an entry in the app (settings or help area);
// it starts again, read-only and without clone.
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
import { FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

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
const MIEN: Project = { nom: "mine", dossier: "/home/chef/Brigade/mine", depot: "chef/mine", base: "main" };

test("an entry in the app replays the visit, read-only and without clone", async () => {
  const stockage = new FauxStockage();
  stockage.setItem("brigade.visite", JSON.stringify({ montree: "2026-11-10T09:00:00.000Z" }));
  const vue = await jouerLaVue({ demarrage: () => demarrage([MIEN]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage });
  await repos();
  assert.equal(vue.element("visite").hidden, true, "the visit is not on");
  const libelle = (p: { textContent: string; title: string; ariaLabel: string }) => `${p.textContent} ${p.title} ${p.ariaLabel}`;
  const entree = vue.poses().find((p) => !p.hidden && /replay the visit/i.test(libelle(p))) ?? assert.fail("no entry to replay the visit");
  entree.click();
  await repos();
  assert.equal(vue.element("visite").hidden, false, "the visit starts again");
  assert.match(vue.element("visite").textContent, /Tour of a real kitchen · 1 of 6/);
  assert.deepEqual(vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action)), [], "no clone, no add");
  const actions = vue.poses().filter((p) => (p.balise === "button" || p.role === "button") && !p.hidden && /^(create|new ticket|move|comment|close|launch)\b/i.test(p.textContent));
  assert.deepEqual(actions.map((p) => p.textContent), [], "no gesture on tickets");
});
