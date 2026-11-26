// Acceptance test (#4087). Criterion 4: in the visit, no gesture acting on tickets is shown, even when the signed-in user
// has write access to benomite/brigade.
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
const boutons = (vue: Jouee): Faux[] => vue.poses().filter((p) => p.balise === "button" || p.role === "button");
const libelle = (p: Faux) => `${p.textContent} ${p.title} ${p.ariaLabel}`.trim();
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => boutons(vue).find((p) => !p.hidden && motif.test(libelle(p)));

// Create, move, comment, close, launch: the gestures that act on tickets, by the words of the app's labels and gestures.
const ACTION_SUR_TICKET = /\b(create|new ticket|move|comment|close|launch|approve|merge)\b/i;
const CALL_ECRIT = /creer|deplacer|commenter|fermer|lancer|poster|approuver/i;

test("the visit shows no gesture that acts on tickets, with a user who can write to benomite/brigade", async () => {
  const ecrivain = { login: "maintainer", permission: "admin" } as unknown as { login: string };
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ecrivain, ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });
  await repos();
  (trouve(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  for (let pas = 1; pas <= 6; pas++) {
    assert.equal(vue.element("visite").hidden, false, `step ${pas}: the tour is on`);
    const actions = boutons(vue).filter((p) => !p.hidden && ACTION_SUR_TICKET.test(libelle(p)));
    assert.deepEqual(actions.map(libelle), [], `step ${pas}: a gesture on tickets is shown`);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => CALL_ECRIT.test(action)), [], `step ${pas}: a writing call was made`);
    const suivante = trouve(vue, /^next$/i);
    if (suivante === undefined) break;
    suivante.click();
    await repos();
  }
});
