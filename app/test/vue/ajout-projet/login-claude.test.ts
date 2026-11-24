// « Add a project », Claude Code pas connecté sur cet ordinateur (#4057) : l'ouverture retenue n'est pas ratée. La fin du
// login la relance, et le projet ouvert garde sa page guidée (#3166), comme une ouverture qui passe du premier coup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { PAS_CONNECTE, type Ouverture } from "../../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { Faux, jouerLaVue, type Jouee, repos } from "../../aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-24T10:04:12.000Z";
const DEPOT = "chef/secondes";
const SECOND: Terminal = { id: 1, projet: "secondes", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [] } as unknown as VuDesStations,
});
const faits = (): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 9, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
});

test("Add a project, not logged in: once the login ends and the project opens, its guided page comes as for any opening", async () => {
  let essais = 0;
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage,
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    choisirLesProjets: (_, depots) => ({ selection: depots }),
    depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
    ouvrirDUneStation: (nom, depot, base): Ouverture => {
      if (++essais === 1) return { state: "login", project: nom, repository: depot, cause: "login", reason: PAS_CONNECTE(nom) };
      vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
      return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
    },
    seConnecterAClaude: () => ({ fait: "the login page opens in your browser" }),
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    departDuProjet: () => ({ aucune: true }),
    checkRepoSetup: () => ({ ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] }),
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("no « + »")).click();
  await repos();
  (vue.element("ajout").dessous("button").find((bouton: Faux) => bouton.textContent === DEPOT) ?? assert.fail("no repository")).click();
  await repos();
  assert.equal(essais, 1, "the opening is held back");
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(essais, 2, "the login's end opens the project again");
  const jouee = vue;
  jouee.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits()) }] }), demande: jouee.dernier("faits")[0] as number });
  await repos();
  await repos();
  assert.notEqual(vue.element("main").dataset.parcours, undefined, "the guided page of the project is open");
});
