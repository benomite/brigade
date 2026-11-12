// Les projets d'une station, sur sa page, la vue jouée (#3403) : une liste qui se lit seulement — les projets de l'app que
// la station sert, chacun un lien vers l'onglet Stations du projet. Un projet n'y est que si cet onglet montre la station ;
// ni « remove », ni « + add a project », ni case, ni champ. Sans projet servi, une phrase le dit. La liste vient de ce que la
// station publie (stations/document.ts), la même que lit l'onglet (stations-tab/etat.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneDeStation, type Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { calibrageRecommande, EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { AUCUN } from "../../src/vue/station/page/ProjetsDeLaStation.js";
import { type Faux, jouerLaVue, ouvrirToutesLesStations, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
// La box porte trois projets : « parade », ajouté depuis l'app ; « cantine » et « brigade », écrits à
// la main dans sa configuration. Le macbook est la station secondaire de « parade » ; l'atelier n'a rien.
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0-47-amd64", etat: "en-ligne", ligne: "online · version 1.4.0 · 3 projects: parade, cantine, brigade", pannes: [], dit: "online", version: "1.4.0", projets: ["parade", "cantine", "brigade"], max: "connectee" };
const MAC: StationVue = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0", ligne: "online · version 1.4.0 · no project", projets: [] };
const ATELIER: StationVue = { ...BOX, id: "g3", nom: "atelier", machine: "Debian 12 · 8 cores", ligne: "online · version 1.4.0 · no project", projets: [] };
const ACCUEIL: Accueil = {
  projets: [],
  stations: [ligneDeStation(BOX, 1, false), ligneDeStation(MAC, 0, false), ligneDeStation(ATELIER, 0, false)],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};
const PARADE: VuDesProjets = {
  a: A,
  projets: [
    {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" },
      stations: [
        { id: "g1", nom: "box", etat: "servi", dit: "served by box", autoriser: [] },
        { id: "g2", nom: "macbook", etat: "attendu", dit: "macbook has not read it yet", autoriser: [] },
      ],
      servi: "served by box 1 min 12 s after “add a project” was opened",
    },
  ],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrageRecommande([]),
};

// Le fichier des projets de l'app déclare « parade » et « cantine » ; « brigade » n'y est pas.
const demarrage = (projetsDesStations: VuDesProjets | undefined) => () => ({
  configuration: pourLaBarre({
    chemin: "/tmp/app.json",
    projets: [
      { nom: "parade", dossier: "/tmp/parade" },
      { nom: "cantine", dossier: "/tmp/cantine" },
    ],
  }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [BOX, MAC, ATELIER] },
  accueil: ACCUEIL,
  ...(projetsDesStations === undefined ? {} : { projetsDesStations }),
});

// L'app ouverte sur l'accueil, puis la page de la station `nom` ouverte d'un clic sur sa ligne.
async function laPage(nom: string, projets: VuDesProjets | undefined = PARADE) {
  const jouee = await jouerLaVue({
    demarrage: demarrage(projets),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    retirerDUneStation: (projet) => ({ retire: projet }),
    espace: () => [],
  });
  await ouvrirToutesLesStations(jouee);
  (jouee.element("toutes-les-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(nom)) ?? assert.fail(`pas de ligne « ${nom} »`)).click();
  await repos();
  const page = jouee.element("station");
  return { jouee, page };
}

// Le bloc des projets de la page, et ses liens : un par projet, dans l'ordre des projets de l'app.
const bloc = (page: Faux) => page.dessous("section").find(({ className }) => className === "projets-servis-par-la-station") ?? assert.fail("pas de bloc des projets");
const liens = (page: Faux) => bloc(page).dessous("a");
const noms = (page: Faux) => liens(page).map(({ dataset }) => dataset.projet);

test("la box sert trois projets, deux sont à l'app : sa page liste ces deux-là, une seule liste, rien d'autre", async () => {
  const { page } = await laPage("box");
  // « brigade » est écrit à la main dans la configuration de la box, mais l'app n'en a pas l'onglet : pas de lien à lui donner.
  assert.deepEqual(noms(page), ["parade", "cantine"]);
  assert.equal(page.dessous("section").filter(({ className }) => className === "projets-servis-par-la-station").length, 1);
  assert.equal(bloc(page).dessous("h3")[0]?.textContent, "Projects it serves");
  assert.doesNotMatch(page.textContent, /Projects it serves.*Projects it serves|no project|none yet|add another repository/s);
  assert.doesNotMatch(page.textContent, new RegExp(AUCUN));
});

test("la page ne propose aucun geste d'édition : ni « remove », ni « + add a project », ni case, ni champ, ni formulaire", async () => {
  const { jouee, page } = await laPage("box");
  const boutons = page.dessous("button").map(({ textContent }) => textContent);
  assert.ok(!boutons.includes("remove"), "pas de « remove »");
  assert.ok(!boutons.some((texte) => /add a project/i.test(texte)), "pas de « + add a project »");
  assert.ok(!boutons.some((texte) => /^authorize on GitHub/.test(texte)));
  assert.equal(page.dessous("input").length, 0, "ni case, ni champ");
  assert.equal(page.dessous("select").length, 0);
  assert.equal(page.dessous("form").length, 0);
  assert.equal(bloc(page).dessous("button").length, 0);
  assert.ok(!jouee.appels.some(({ geste }) => geste === "depotsDuChef" || geste === "retirerDUneStation"));
});

test("la liste se lit sans attendre ce que l'app a demandé : ce que la station publie suffit, et la lecture tardive ne change rien", async () => {
  const { jouee, page } = await laPage("box", undefined);
  assert.deepEqual(noms(page), ["parade", "cantine"]);
  jouee.dire("surProjetsDesStations", PARADE);
  await repos();
  assert.deepEqual(noms(page), ["parade", "cantine"]);
});

test("un projet que l'app a demandé à la station sans qu'elle le serve ne s'y liste pas : l'onglet ne l'y montre pas non plus", async () => {
  const { page } = await laPage("macbook");
  // PARADE nomme le macbook, mais « macbook has not read it yet » : il ne sert rien.
  assert.deepEqual(noms(page), []);
});

test("un clic sur un projet ouvre l'onglet Stations de ce projet, où la station est montrée", async () => {
  const { jouee, page } = await laPage("box");
  const lien = liens(page).find(({ dataset }) => dataset.projet === "cantine") ?? assert.fail("pas de lien « cantine »");
  lien.click();
  await repos();
  // La barre : « Tous les projets », « parade », « cantine », puis « + ».
  assert.equal(jouee.element("projets").children[2]?.ariaCurrent, "true", "l'espace de cantine est ouvert");
  const onglet = jouee.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("l'onglet Stations n'est pas ouvert");
  assert.deepEqual(onglet.dessous("section").filter(({ className }) => className === "carte-de-station").map(({ ariaLabel }) => ariaLabel), ["box"]);
});

test("un clic sur « parade » ouvre aussi l'onglet Stations de parade", async () => {
  const { jouee, page } = await laPage("box");
  (liens(page).find(({ dataset }) => dataset.projet === "parade") ?? assert.fail("pas de lien « parade »")).click();
  await repos();
  assert.equal(jouee.element("projets").children[1]?.ariaCurrent, "true", "l'espace de parade est ouvert");
  assert.ok(jouee.element("rail").children.some(({ dataset }) => dataset.bloc === "stations-tab"));
});

test("une station qui ne sert aucun projet dit, en mots simples, qu'elle n'en sert pas — un bloc jamais vide", async () => {
  for (const nom of ["atelier", "macbook"]) {
    const { page } = await laPage(nom);
    assert.deepEqual(noms(page), []);
    assert.equal(bloc(page).dessous("p").find(({ dataset }) => dataset.ligne === "vide")?.textContent, AUCUN);
  }
  const { page: portee } = await laPage("box");
  assert.ok(!bloc(portee).dessous("p").some(({ dataset }) => dataset.ligne === "vide"), "la box sert des projets : rien ne dit qu'elle n'en a aucun");
});
