// Acceptance test (#4087). Criterion 4: in the visit, no gesture acting on tickets is shown, even when the signed-in user
// has write access to benomite/brigade.
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
const boutons = (vue: Jouee): Faux[] => vue.poses().filter((p) => p.balise === "button" || p.role === "button");
const libelle = (p: Faux) => `${p.textContent} ${p.title} ${p.ariaLabel}`.trim();
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => boutons(vue).find((p) => !p.hidden && motif.test(libelle(p)));

// Create, move, comment, close, launch: the gestures that act on tickets, by the words of the app's labels and gestures.
const GESTE_SUR_TICKET = /\b(create|new ticket|move|comment|close|launch|approve|merge)\b/i;
const APPEL_ECRIT = /creer|deplacer|commenter|fermer|lancer|poster|approuver/i;

test("the visit shows no gesture that acts on tickets, with a user who can write to benomite/brigade", async () => {
  const ecrivain = { login: "maintainer", permission: "admin" } as unknown as { login: string };
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ecrivain, ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });
  await repos();
  (trouve(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  for (let pas = 1; pas <= 6; pas++) {
    assert.equal(vue.element("visite").hidden, false, `step ${pas}: the tour is on`);
    const gestes = boutons(vue).filter((p) => !p.hidden && GESTE_SUR_TICKET.test(libelle(p)));
    assert.deepEqual(gestes.map(libelle), [], `step ${pas}: a gesture on tickets is shown`);
    assert.deepEqual(vue.appels.filter(({ geste }) => APPEL_ECRIT.test(geste)), [], `step ${pas}: a writing call was made`);
    const suivante = trouve(vue, /^next$/i);
    if (suivante === undefined) break;
    suivante.click();
    await repos();
  }
});
