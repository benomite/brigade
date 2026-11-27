// « Add a project », Claude Code pas connecté sur cet ordinateur (#4057) : l'ouverture retenue n'est pas ratée. La fin du
// login la relance, et le projet ouvert garde sa page guidée (#3166), comme une ouverture qui passe du premier coup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { NOT_CONNECTED, type Opening } from "../../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { SeenOfStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { Fake, playTheVue, type Played, repos } from "../../helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const A = "2026-11-24T10:04:12.000Z";
const REPOSITORY = "chef/secondes";
const SECOND: Terminal = { id: 1, projet: "secondes", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [] } as unknown as SeenOfStations,
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
  let trials = 0;
  let vue: Played | undefined;
  vue = await playTheVue({
    demarrage: startup,
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    choisirLesProjets: (_, repositories) => ({ selection: repositories }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base): Opening => {
      if (++trials === 1) return { state: "login", project: name, repository: repository, cause: "login", reason: NOT_CONNECTED(name) };
      vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
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
  (vue.element("ajout").dessous("button").find((button: Fake) => button.textContent === REPOSITORY) ?? assert.fail("no repository")).click();
  await repos();
  assert.equal(trials, 1, "the opening is held back");
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(trials, 2, "the login's end opens the project again");
  const played = vue;
  played.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] }), demande: played.dernier("faits")[0] as number });
  await repos();
  await repos();
  assert.notEqual(vue.element("main").dataset.parcours, undefined, "the guided page of the project is open");
});
