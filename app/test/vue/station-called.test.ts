// « Cook it on a station that has it » (#1511) n'est plus offert sur la carte d'un besoin que la station n'a pas : il
// déclarait une capacité sur une station que le projet déclare, et l'app ne lit plus ces déclarations (elles se lisaient par
// `installation stations`, que l'app ne lance plus). Les autres issues restent, et un clic sur l'une d'elles s'écrit comme
// avant. La vue est jouée contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { readTracking } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// Le choix d'un besoin en attente, tel que la station le publie : ses quatre issues.
const BROWSER = {
  id: "need:browser",
  need: "browser",
  message: "The tests of parade need a browser, which box does not have.",
  cause: "the repository asks for it",
  status: "pending",
  options: [
    { id: "cook-elsewhere", label: "Cook it on a station that has it", consequence: "the ticket waits for a station that provides it" },
    { id: "provide-here", label: "Provide it on box", consequence: "a browser is installed on box" },
    { id: "adapt-tests", label: "Adapt the tests", consequence: "the cook rewrites the tests" },
    { id: "setup-brings-it", label: "The project's setup brings it itself", consequence: "the setup installs it" },
  ],
};

const vue = (choice: object[]): SeenOfProjects => {
  const readOne = readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix: choice }] }))[0];
  const project: ProjectSeen = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "servi", dit: "", autoriser: [] }],
    servi: null,
    cuitSur: { id: "g1", nom: "box", ici: false },
    ...(readOne?.choix === undefined ? {} : { choix: readOne.choix }),
  };
  return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
};

async function thePage(choice: object[]) {
  const played = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: vue(choice),
    }),
    espace: () => [],
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  for (let tour = 0; tour < 5; tour++) await repos();
  return played;
}

describe("la carte d'un besoin que la station n'a pas", () => {
  test("« Cook it on a station that has it » n'est plus offert ; les trois autres issues le sont", async () => {
    const played = await thePage([BROWSER]);
    const card = played.element("choix-du-projet").dessous("section").find((pose) => pose.dataset.choix === "need:browser") ?? assert.fail("pas de carte");
    assert.deepEqual(card.dessous("li").filter((li) => li.className === "issue").map((li) => li.dataset.issue), ["provide-here", "adapt-tests", "setup-brings-it"]);
    assert.equal(card.dessous("button").some((pose) => pose.textContent === "Cook it on a station that has it"), false);
  });
});
