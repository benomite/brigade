// #3870, critère 3 : ce qu'une station n'a pas pu — ici, installer les dépendances — se dit en une ligne sur sa carte de
// l'onglet Stations, pour que le chef sache quoi réparer ou décocher.
// Test d'acceptation gelé (#3725) : la ligne de la station dans les `facts` porte `lacks`, et la carte la dit une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { putAside } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, machineProposed, EFFORTS, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { openTab, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-11-19T13:30:00.000Z";
const REPOSITORY = "benomite/brigade";
const GAP = "dependencies cannot be installed";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PROJECT: Project = { nom: "brigade", dossier: "/tmp/brigade", depot: REPOSITORY, base: "main" };
const OTHER: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
const SEEN_PROJECT: ProjectSeen = { nom: "brigade", depot: REPOSITORY, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const SEEN: SeenOfProjects = { a: A, projets: [SEEN_PROJECT], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
const lineOfMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [], lacks: GAP };
const FACTS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], stations: [lineOfMac] } as unknown as Facts;

test("a station that lacked what a ticket needs says it in one line on its card in the Stations tab", async () => {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT, OTHER] }, () => true, (name) => name === "brigade"),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « brigade »")).click();
  await repos();
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  const drawable = heldOnes.attendre(putAside({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? receivedOne;
  vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await openTab(vue, "Stations");
  const tab = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
  const card = tab.dessous("section").find(({ className }) => className === "carte-de-station") ?? assert.fail("pas de carte de station");
  const lines = card.textContent.split("\n").filter((line) => line.includes(GAP));
  assert.equal(lines.length, 1, `la carte dit « ${GAP} » : ${card.textContent}`);
});
