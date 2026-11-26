// « Add a project », Claude Code pas connecté sur cet ordinateur (#4057) : l'ouverture retenue n'est pas ratée. La fin du
// login la relance, et le projet ouvert garde sa page guidée (#3166), comme une ouverture qui passe du premier coup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { PAS_CONNECTE, type Ouverture } from "../../../src/first-launch.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { Faux, jouerLaVue, type Jouee, repos } from "../../aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-24T10:04:12.000Z";
const REPOSITORY = "chef/secondes";
const SECOND: Terminal = { id: 1, projet: "secondes", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [] } as unknown as VuDesStations,
});
const facts = (): Facts => ({
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
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base): Ouverture => {
      if (++essais === 1) return { state: "login", project: name, repository: repository, cause: "login", reason: PAS_CONNECTE(name) };
      vue?.dire("surConfiguration", pourLaBar({ chemin: CHEMIN, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
    },
    seConnecterAClaude: () => ({ fait: "the login page opens in your browser" }),
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    departDuProjet: () => ({ aucune: true }),
    checkRepoSetup: () => ({ ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] }),
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("no « + »")).click();
  await repos();
  (vue.element("ajout").dessous("button").find((button: Faux) => button.textContent === REPOSITORY) ?? assert.fail("no repository")).click();
  await repos();
  assert.equal(essais, 1, "the opening is held back");
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(essais, 2, "the login's end opens the project again");
  const jouee = vue;
  jouee.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] }), demande: jouee.dernier("faits")[0] as number });
  await repos();
  await repos();
  assert.notEqual(vue.element("main").dataset.parcours, undefined, "the guided page of the project is open");
});
