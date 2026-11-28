// L'onglet Stations d'un projet que la station de cet ordinateur fait tourner sans le servir (#3399) : sa cuisine tourne ici
// et `facts` nomme sa ligne, au repos, mais sa liste de projets servis ne porte que d'autres dépôts. L'onglet ne dit pas
// « Cooked by … idle » : personne ne le cuit, et combien de tickets `fire` attendent. « Cook it on this computer » le met
// sur la liste que Settings montre ; l'onglet dit alors que ce Mac le cuit, et Settings le dit `served`. Derrière le
// pont, la liste de ce Mac est tenue par le test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { putAside } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts, type Facts } from "../../src/facts.ts";
import { HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { NOT_SERVED, SERVED } from "../../src/vue/projects-served/projects-served.js";
import { CHOOSE, COOK_HERE, NOBODY } from "../../src/vue/stations-tab/state.js";
import { type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-11-12T10:00:00.000Z";
const REPOSITORY = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [] };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: REPOSITORY, base: "main" };
const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
// Aucune station ne dit le servir sur GitHub.
const NOBODY_ON_GITHUB: ProjectSeen = { nom: "parade", depot: REPOSITORY, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const SEEN: SeenOfProjects = { a: A, projets: [NOBODY_ON_GITHUB], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
// Ce que `facts` dit de la cuisine qui tourne ici : la ligne de ce Mac, au repos — elle tourne, rien ne cuit —, et 8 tickets
// `fire` sur le rail.
const lineOfMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [] };
const FACTS = {
  etat: "ouverte",
  lu: A,
  compteurs: { rail: 8, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  attend: [],
  livres: [],
  stations: [lineOfMac],
} as unknown as Facts;

// La station de ce Mac, dont la liste ne porte que cantine ; `facts` : ce que la cuisine d'ici rend, ou rien de lu (`null`) ;
// `lue` : sans elle, l'app ne lit pas la liste de ce Mac.
async function thePage({ facts = FACTS as Facts | null, lue: readEntry = true } = {}) {
  // La liste de ce Mac : ses dépôts, dans l'ordre où ils y sont entrés.
  const served: string[] = [CANTINE.depot ?? ""];
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }, () => true, (name) => name === "parade"),
      palette: PALETTE,
      exemple: EXAMPLE,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      stations: { a: A, stations: [MAC] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
    ...(readEntry ? { projetsServis: () => ({ depots: [...served] }) } : {}),
    servirUnProjet: (repository: string, serve: boolean) => {
      assert.equal(serve, true);
      if (!served.includes(repository)) served.push(repository);
      return { depots: [...served] };
    },
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  if (facts !== null) {
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    const drawable = heldOnes.attendre(putAside({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? receivedOne;
    vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
    await repos();
  }
  await openTab(vue, "Stations");
  return { vue, servis: served };
}

const tab = (vue: Played) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const top = (vue: Played) => tab(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const sentence = (vue: Played) => top(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";
const cards = (vue: Played) => tab(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
// La ligne de parade dans « projects this computer serves », sous Settings.
const lineServed = (vue: Played) => vue.element("projets-servis").dessous("div").find(({ dataset }) => dataset.projet === "parade") ?? assert.fail("pas de ligne pour parade dans Settings");

describe("un projet que cet ordinateur fait tourner sans le servir (#3399)", () => {
  test("personne ne le cuit, et 8 tickets `fire` attendent : ni « Cooked by », ni carte ; « Cook it on this computer » recommandé", async () => {
    const { vue } = await thePage();
    assert.equal(sentence(vue), `${NOBODY} · 8 fire tickets waiting`);
    assert.equal(sentence(vue), "No station cooks this project · 8 fire tickets waiting");
    assert.equal(tab(vue).textContent.includes("Cooked by"), false);
    assert.equal(tab(vue).textContent.includes("idle, nothing on the rail"), false);
    assert.notEqual(top(vue).dataset.ton, "vert");
    assert.deepEqual(cards(vue), []);
    assert.deepEqual(top(vue).dessous("button").map(({ textContent }) => textContent), [COOK_HERE, CHOOSE]);
    assert.equal(COOK_HERE, "Cook it on this computer");
    // Le bouton recommandé est celui qui le cuit ici.
    assert.equal(button(top(vue), COOK_HERE).className.includes("recommande"), true);
    assert.equal(button(top(vue), CHOOSE).className.includes("recommande"), false);
    // Ni l'en-tête du projet : cet ordinateur n'y est pas nommé comme celui où il cuit.
    assert.equal(vue.element("stations-du-projet").textContent.includes("Cooks on"), false);
  });

  test("« Cook it on this computer » l'ajoute à la liste de ce Mac : l'onglet dit que ce Mac le cuit, et Settings le dit servi", async () => {
    const { vue, servis: served } = await thePage();
    assert.equal(lineServed(vue).dessous("span").find(({ className }) => className === "pas-servi")?.textContent, NOT_SERVED);
    button(top(vue), COOK_HERE).click();
    for (let tour = 0; tour < 6; tour++) await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "servirUnProjet").map(({ args }) => args), [[REPOSITORY, true]]);
    assert.deepEqual(served, [CANTINE.depot, REPOSITORY]);
    assert.equal(sentence(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(top(vue).dataset.ton, "vert");
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook"]);
    assert.equal(top(vue).dessous("button").some(({ textContent }) => textContent === COOK_HERE), false);
    // Les deux endroits disent la même chose : parade, dans « projects this computer serves », y est `served`.
    assert.equal(lineServed(vue).dessous("strong").find(({ className }) => className === "servi")?.textContent, SERVED);
  });

  test("le rail pas encore lu, la ligne ne compte aucun ticket qu'elle n'a pas lu", async () => {
    const { vue } = await thePage({ facts: null });
    assert.equal(sentence(vue), NOBODY);
  });

  test("la liste de ce Mac pas lue : rien n'est décidé à sa place, la ligne de cuisson dit ce qu'elle dit", async () => {
    const { vue } = await thePage({ lue: false });
    assert.equal(sentence(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(tab(vue).dessous("button").some(({ textContent }) => textContent === COOK_HERE), false);
  });
});
