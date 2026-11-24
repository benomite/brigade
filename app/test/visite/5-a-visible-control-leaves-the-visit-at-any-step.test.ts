// Acceptance test (#4087). Criterion 5: at any step of the visit, a visible control leaves the visit and lands on the
// welcome screen; from the first step and from a later one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture, StationsDuChef } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { Faux, FauxStockage, jouerLaVue, type Jouee, repos } from "../aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const demarrage = (projets: Projet[]) => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets }, () => false),
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
const OUVERT: Ouverture = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motif.test(`${p.textContent} ${p.title} ${p.ariaLabel}`.trim()));

const QUITTER = /leave the visit|leave|exit/i;
const ETAPE = /Tour of a real kitchen · (\d+) of 6/;
const etape = (vue: Jouee) => ETAPE.exec(vue.element("visite").textContent)?.[1];

async function visiteEnCours() {
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });
  await repos();
  (trouve(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  assert.equal(etape(vue), "1");
  return vue;
}
function surLAccueil(vue: Jouee) {
  assert.equal(vue.element("visite").hidden, true, "the tour is closed");
  assert.ok(trouve(vue, /visit a real kitchen/i) && trouve(vue, /add my project/i), "the welcome screen shows its two choices again");
}

test("from the first step, a visible control leaves the visit for the welcome screen", async () => {
  const vue = await visiteEnCours();
  (trouve(vue, QUITTER) ?? assert.fail("no visible control to leave the visit")).click();
  await repos();
  surLAccueil(vue);
});

test("from a later step, the same control leaves the visit for the welcome screen", async () => {
  const vue = await visiteEnCours();
  for (let fois = 0; fois < 3; fois++) {
    (trouve(vue, /^next$/i) ?? assert.fail("no next step")).click();
    await repos();
  }
  assert.equal(etape(vue), "4");
  (trouve(vue, QUITTER) ?? assert.fail("no visible control to leave the visit at step 4")).click();
  await repos();
  surLAccueil(vue);
});
