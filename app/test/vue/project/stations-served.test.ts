// La liste des projets que sert la station de cet ordinateur se change sur l'onglet Stations d'un projet (#3402) : « Add a
// station » y ajoute cet ordinateur même quand une autre station le cuit déjà, « Stop cooking here » l'en retire. Après
// chaque geste, l'onglet montre la liste écrite — et l'app rouverte la montre encore ; un geste qui ne s'applique pas le
// dit en une ligne, et son bouton reste. La vue est jouée entière contre le faux pont ; derrière lui, la station lit et
// écrit pour de bon sa liste, sa configuration, par `lireProjetsServis`, `ajouterProjetServi` et `retirerProjetServi` du
// runtime, dans un répertoire du test — ce que fait le process principal (main.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, cheminDesProjetsServis, DepotRefuse, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "../../../../runtime/src/station-ordinateur/projets-servis.ts";
import type { Home } from "../../../src/home.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type ProjectVu, type VuDesProjects } from "../../../src/projects/projects.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import { FAIT_ICI } from "../../../src/vue/project/stations/AddStation.js";
import { ENCORE_SERVED, RETIRE } from "../../../src/vue/project/stations/StopStation.js";
import { AJOUTER, ARRETER, OUI_STOP, QUI_D_AUTRE } from "../../../src/vue/stations-tab/stations-tab.js";
import { CET_ORDINATEUR } from "../../../src/vue/lexique.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-12T10:00:00.000Z";
const REPOSITORY = "benomite/parade";
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
// Cet ordinateur : sa station, appairée, qui publie ne rien servir — sa liste, elle, est sur ce disque.
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: REPOSITORY, base: "main" };
const station = (id: string, name: string) => ({ id, nom: name, etat: "servi" as const, dit: "", autoriser: [] });
const SUR_LA_BOX: ProjectVu = { nom: "parade", depot: REPOSITORY, base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const VU: VuDesProjects = { a: A, projets: [SUR_LA_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrationRecommande([]) };

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});
// La station de cet ordinateur dans un répertoire neuf : sa configuration, la seule liste de ses projets.
function laStation() {
  const racine = mkdtempSync(join(tmpdir(), "stations-servies-"));
  racines.push(racine);
  return racine;
}

type Liste = { depots: string[] } | { refus: string };
// Ce que le process principal fait de la liste (main.ts) : la lire, y ajouter ou en retirer un dépôt. `ecrire` remplace
// l'écriture, pour un refus ou une réponse qui ne change rien.
function pontDeLaListe(racine: string, ecrire?: (repository: string, served: boolean) => Liste) {
  const refusal = (error: unknown): Liste => {
    if (error instanceof DepotRefuse || error instanceof ProjetsServisIllisibles) return { refus: error.message };
    throw error;
  };
  return {
    projetsServis: (): Liste => {
      try {
        return { depots: lireProjetsServis(racine) };
      } catch (error) {
        return refusal(error);
      }
    },
    servirUnProjet: (repository: unknown, served: unknown): Liste => {
      if (ecrire !== undefined) return ecrire(String(repository), served === true);
      try {
        return { depots: served === true ? ajouterProjetServi(racine, String(repository)) : retirerProjetServi(racine, String(repository)) };
      } catch (error) {
        return refusal(error);
      }
    },
  };
}

// L'app ouverte sur l'onglet Stations de parade, devant cette station : la box le cuit, et publie le servir.
async function lOnglet(racine: string, ecrire?: (repository: string, served: boolean) => Liste) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX, MAC] } satisfies VuDesStations,
      accueil: HOME,
      projetsDesStations: VU,
    }),
    espace: () => [],
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    ...pontDeLaListe(racine, ecrire),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  await ouvrirOnglet(vue, "Stations");
  await repos();
  return vue;
}

const onglet = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const haut = (vue: Jouee) => onglet(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const cards = (vue: Jouee) => onglet(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const card = (vue: Jouee, name: string) => cards(vue).find(({ ariaLabel }) => ariaLabel === name) ?? assert.fail(`pas de carte « ${name} »`);
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");
const button = (ou: Faux, texte: string) => boutons(ou).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
// Ce que la ligne sous le haut dit du dernier geste.
const dit = (vue: Jouee) => onglet(vue).dessous("p").find(({ className }) => className.includes("dit-des-stations"))?.textContent ?? "";
const choice = (vue: Jouee) => onglet(vue).dessous("section").find(({ className }) => className === "choix-des-stations");
const servedOnes = (vue: Jouee) => vue.appels.filter(({ geste: action }) => action === "servirUnProjet").map(({ args }) => args);

// « Stop cooking here » sur une carte, puis son « yes ».
async function arreter(vue: Jouee, name: string) {
  button(card(vue, name), ARRETER).click();
  await repos();
  button(card(vue, name), OUI_STOP).click();
  await repos();
  await repos();
}

describe("ajouter une station depuis l'onglet (#3402)", () => {
  test("la box le cuit déjà : « Add a station » ouvre le choix, cet ordinateur choisi entre dans la liste, et sa carte est là — encore après une réouverture", async () => {
    const racine = laStation();
    const vue = await lOnglet(racine);
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
    button(haut(vue), AJOUTER).click();
    await repos();
    const ouvert = choice(vue) ?? assert.fail("le choix ne s'ouvre pas");
    assert.equal(ouvert.ariaLabel, QUI_D_AUTRE("parade"));
    button(ouvert, CET_ORDINATEUR).click();
    await repos();
    await repos();
    assert.deepEqual(servedOnes(vue), [[REPOSITORY, true]]);
    // La station l'a pour de bon : sa configuration porte sa ligne, et ses cuisines la lisent.
    assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), `parade ${REPOSITORY}\n`);
    // L'onglet montre ce que la liste dit, avant que la station ne le publie : cet ordinateur le sert.
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    assert.equal(dit(vue), FAIT_ICI(CET_ORDINATEUR, "parade"));
    button(card(vue, "macbook"), ARRETER);

    const rouverte = await lOnglet(racine);
    assert.deepEqual(cards(rouverte).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
  });

  test("un ajout que la station refuse : rien n'est écrit, le choix reste ouvert et dit pourquoi, son bouton est toujours là", async () => {
    const racine = laStation();
    // Un autre projet de la station s'appelle déjà parade : son nom est pris.
    ajouterProjetServi(racine, "ailleurs/parade");
    const vue = await lOnglet(racine);
    button(haut(vue), AJOUTER).click();
    await repos();
    button(choice(vue) ?? assert.fail("pas de choix"), CET_ORDINATEUR).click();
    await repos();
    await repos();
    assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), "parade ailleurs/parade\n");
    const ouvert = choice(vue) ?? assert.fail("le choix s'est refermé sans rien changer");
    assert.match(ouvert.textContent, /nothing was written: this station already serves a project named parade, from ailleurs\/parade: benomite\/parade would take the same name/);
    assert.equal(button(ouvert, CET_ORDINATEUR).disabled, false);
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
  });
});

describe("arrêter une station depuis l'onglet (#3402)", () => {
  test("cet ordinateur le sert : « Stop cooking here » le retire de sa liste, sa carte part et la ligne le dit — encore après une réouverture", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, REPOSITORY);
    const vue = await lOnglet(racine);
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    await arreter(vue, "macbook");
    assert.deepEqual(servedOnes(vue), [[REPOSITORY, false]]);
    assert.deepEqual(lireProjetsServis(racine), []);
    assert.equal(dit(vue), RETIRE("macbook", "parade"));
    assert.deepEqual(cards(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);

    // Rouverte, même si la station publiait encore le servir, l'app lit sa liste : il n'y est plus.
    const rouverte = await lOnglet(racine);
    assert.deepEqual(cards(rouverte).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
  });

  test("un retrait qui laisse le projet dans la liste le dit, et la carte garde son bouton", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, REPOSITORY);
    // La station répond sans l'avoir retiré : c'est le chef qui cliquait « remove » et lisait encore « served ».
    const vue = await lOnglet(racine, () => ({ depots: lireProjetsServis(racine) }));
    await arreter(vue, "macbook");
    assert.equal(dit(vue), ENCORE_SERVED("macbook", "parade"));
    button(card(vue, "macbook"), ARRETER);
  });

  test("un retrait que la station refuse le dit en une ligne, et la carte garde son bouton", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, REPOSITORY);
    const vue = await lOnglet(racine, () => ({ refus: "the station's configuration cannot be written — EACCES" }));
    await arreter(vue, "macbook");
    assert.match(dit(vue), /^nothing was changed: the station's configuration cannot be written/);
    assert.deepEqual(lireProjetsServis(racine), [REPOSITORY]);
    button(card(vue, "macbook"), ARRETER);
  });
});
