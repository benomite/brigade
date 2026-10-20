// Les projets d'une station, sur sa page, la vue jouée (#878) : tous ceux qu'elle porte — ceux que sa
// configuration sert, qu'ils viennent de l'app ou d'une ligne écrite à la main, et ceux que l'app lui
// demande —, chacun marqué « main » ou « secondary ». Un clic ouvre le projet ; le vide ne se dit que
// s'il n'y a vraiment rien ; « + add a project » ouvre le parcours d'ajout. La liste vient de ce que
// la station publie (stations/document.ts) : une station sert tous les projets de sa configuration,
// et les publie tous (runtime/test/station/station.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneDeStation, type Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { calibrageRecommande, EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

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
      stations: [
        { id: "g1", nom: "box", principale: true, etat: "servi", dit: "served by box", autoriser: [] },
        { id: "g2", nom: "macbook", principale: false, etat: "secondaire", dit: "not its main station: it runs neither its manager nor its pass", autoriser: [] },
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
      { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } },
      { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } },
    ],
    hotes: ["box"],
  }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  (jouee.element("accueil-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(nom)) ?? assert.fail(`pas de ligne « ${nom} »`)).click();
  await repos();
  const page = jouee.element("station");
  return { jouee, page };
}

// Les lignes de projet de la page : une par projet, sous « Projects ».
const lignes = (page: Faux) => {
  assert.equal(page.children[5]?.textContent, "Projects");
  return (page.children[6] ?? assert.fail("pas de liste")).dessous("button").filter(({ className }) => className === "ligne");
};
const ligne = (page: Faux, projet: string) => lignes(page).find(({ dataset }) => dataset.projet === projet) ?? assert.fail(`pas de ligne « ${projet} »`);
// La marque d'une ligne : « main » ou « secondary », sur la ligne même.
const marque = (pose: Faux) => pose.children.find(({ className }) => className.split(" ").includes("pilule"))?.textContent;

test("la box porte trois projets, dont deux installés hors de l'app : sa page les liste tous les trois, chacun marqué comme ayant la box pour principale", async () => {
  const { page } = await laPage("box");
  assert.deepEqual(
    lignes(page).map(({ ariaLabel }) => ariaLabel),
    ["brigade — main — served", "cantine — main — served", "parade — main — served"],
  );
  assert.deepEqual(lignes(page).map(marque), ["main", "main", "main"]);
  // Celui que l'app a ajouté se dit au survol, comme ceux écrits à la main.
  assert.match(ligne(page, "parade").title, /benomite\/parade · main/);
  assert.match(ligne(page, "parade").title, /served by box 1 min 12 s after/);
  assert.match(ligne(page, "cantine").title, /installed on this station outside the app/);
  assert.doesNotMatch(page.textContent, /no project|none yet/);
});

test("ses projets se lisent sans attendre la lecture de ce que l'app lui a demandé : ce que la station publie suffit", async () => {
  const { jouee, page } = await laPage("box", undefined);
  assert.deepEqual(
    lignes(page).map(({ dataset }) => dataset.projet),
    ["brigade", "cantine", "parade"],
  );
  assert.doesNotMatch(page.textContent, /no project/);
  // Ce que l'app a demandé arrive ensuite : la ligne de « parade » en prend le détail, et son geste.
  jouee.dire("surProjetsDesStations", PARADE);
  await repos();
  assert.equal(lignes(page).length, 3);
  assert.match(ligne(page, "parade").title, /benomite\/parade/);
  assert.ok(page.dessous("button").some(({ textContent }) => textContent === "remove"));
});

test("une station secondaire : le projet est marqué « secondary » sur sa ligne, et dit où tourne sa principale", async () => {
  const { page } = await laPage("macbook");
  assert.deepEqual(
    lignes(page).map(({ ariaLabel }) => ariaLabel),
    ["parade — secondary — its manager and its pass run on box"],
  );
  assert.equal(marque(ligne(page, "parade")), "secondary");
});

test("un projet que l'app demande et que la station ne sert pas encore est listé, avec ce qu'elle en dit", async () => {
  const enAttente: VuDesProjets = {
    ...PARADE,
    projets: [
      ...PARADE.projets,
      {
        nom: "espace",
        depot: "benomite/espace",
        base: "main",
        stations: [{ id: "g1", nom: "box", principale: true, etat: "a-autoriser", dit: "authorize brigade on benomite/espace, on GitHub: one click per page", autoriser: ["https://github.com/apps/brigade-cook/installations/new"] }],
        servi: null,
      },
    ],
  };
  const { page } = await laPage("box", enAttente);
  assert.deepEqual(
    lignes(page).map(({ dataset }) => dataset.projet),
    ["brigade", "cantine", "espace", "parade"],
  );
  assert.equal(ligne(page, "espace").ariaLabel, "espace — main — waiting for your authorization on GitHub");
  assert.ok(page.dessous("button").some(({ textContent }) => textContent === "authorize on GitHub: brigade-cook"));
});

test("un clic sur un projet l'ouvre : son espace s'il est dans les projets de l'app, sinon « Add a project », où il se déclare", async () => {
  const { jouee, page } = await laPage("box");
  ligne(page, "cantine").click();
  await repos();
  // La barre : « Tous les projets », « parade », « cantine », puis « + ».
  const barre = jouee.element("projets").children;
  assert.equal(barre[2]?.ariaCurrent, "true", "l'espace de cantine est ouvert");
  assert.equal(barre[0]?.ariaCurrent, "false");

  const { jouee: autre, page: autrePage } = await laPage("box");
  ligne(autrePage, "brigade").click();
  await repos();
  assert.equal(autre.element("entree-ajout").ariaCurrent, "true", "brigade n'est pas dans les projets de l'app : « Add a project » s'ouvre");
  assert.match(ligne(autrePage, "brigade").title, /not in this app's projects yet/);
});

test("le vide ne se dit que sur une station qui ne porte vraiment aucun projet", async () => {
  const { page } = await laPage("atelier");
  assert.equal(lignes(page).length, 0);
  assert.equal(page.children[6]?.textContent, "no project on this station yet");
  for (const nom of ["box", "macbook"]) {
    const { page: portee } = await laPage(nom);
    assert.ok(lignes(portee).length > 0);
    assert.doesNotMatch(portee.textContent, /no project/, `${nom} porte un projet : rien ne dit qu'elle n'en a aucun`);
  }
});

test("« + add a project » est sur la page, et ouvre le parcours d'ajout", async () => {
  for (const nom of ["box", "atelier"]) {
    const { jouee, page } = await laPage(nom);
    const formulaire = page.dessous("form")[0] ?? assert.fail("pas de parcours");
    assert.equal(formulaire.hidden, true);
    const ajouter = page.dessous("button").find(({ textContent }) => textContent === "+ add a project") ?? assert.fail(`${nom} : pas de « + add a project »`);
    ajouter.click();
    await repos();
    await repos();
    assert.equal(formulaire.hidden, false);
    assert.equal(ajouter.hidden, true);
    assert.ok(jouee.appels.some(({ geste }) => geste === "depotsDuChef"));
  }
});
