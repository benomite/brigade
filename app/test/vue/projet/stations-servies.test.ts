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
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import { FAIT_ICI } from "../../../src/vue/projet/stations/AjoutStation.js";
import { ENCORE_SERVI, RETIRE } from "../../../src/vue/projet/stations/ArretStation.js";
import { AJOUTER, ARRETER, OUI_ARRET, QUI_D_AUTRE } from "../../../src/vue/stations-tab/stations-tab.js";
import { CET_ORDINATEUR } from "../../../src/vue/lexique.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-12T10:00:00.000Z";
const DEPOT = "benomite/parade";
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
// Cet ordinateur : sa station, appairée, qui publie ne rien servir — sa liste, elle, est sur ce disque.
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: DEPOT, base: "main" };
const station = (id: string, nom: string) => ({ id, nom, etat: "servi" as const, dit: "", autoriser: [] });
const SUR_LA_BOX: ProjetVu = { nom: "parade", depot: DEPOT, base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const VU: VuDesProjets = { a: A, projets: [SUR_LA_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };

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
function pontDeLaListe(racine: string, ecrire?: (depot: string, servi: boolean) => Liste) {
  const refus = (erreur: unknown): Liste => {
    if (erreur instanceof DepotRefuse || erreur instanceof ProjetsServisIllisibles) return { refus: erreur.message };
    throw erreur;
  };
  return {
    projetsServis: (): Liste => {
      try {
        return { depots: lireProjetsServis(racine) };
      } catch (erreur) {
        return refus(erreur);
      }
    },
    servirUnProjet: (depot: unknown, servi: unknown): Liste => {
      if (ecrire !== undefined) return ecrire(String(depot), servi === true);
      try {
        return { depots: servi === true ? ajouterProjetServi(racine, String(depot)) : retirerProjetServi(racine, String(depot)) };
      } catch (erreur) {
        return refus(erreur);
      }
    },
  };
}

// L'app ouverte sur l'onglet Stations de parade, devant cette station : la box le cuit, et publie le servir.
async function lOnglet(racine: string, ecrire?: (depot: string, servi: boolean) => Liste) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX, MAC] } satisfies VuDesStations,
      accueil: ACCUEIL,
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
const cartes = (vue: Jouee) => onglet(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const carte = (vue: Jouee, nom: string) => cartes(vue).find(({ ariaLabel }) => ariaLabel === nom) ?? assert.fail(`pas de carte « ${nom} »`);
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");
const bouton = (ou: Faux, texte: string) => boutons(ou).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
// Ce que la ligne sous le haut dit du dernier geste.
const dit = (vue: Jouee) => onglet(vue).dessous("p").find(({ className }) => className.includes("dit-des-stations"))?.textContent ?? "";
const choix = (vue: Jouee) => onglet(vue).dessous("section").find(({ className }) => className === "choix-des-stations");
const servis = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "servirUnProjet").map(({ args }) => args);

// « Stop cooking here » sur une carte, puis son « yes ».
async function arreter(vue: Jouee, nom: string) {
  bouton(carte(vue, nom), ARRETER).click();
  await repos();
  bouton(carte(vue, nom), OUI_ARRET).click();
  await repos();
  await repos();
}

describe("ajouter une station depuis l'onglet (#3402)", () => {
  test("la box le cuit déjà : « Add a station » ouvre le choix, cet ordinateur choisi entre dans la liste, et sa carte est là — encore après une réouverture", async () => {
    const racine = laStation();
    const vue = await lOnglet(racine);
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
    bouton(haut(vue), AJOUTER).click();
    await repos();
    const ouvert = choix(vue) ?? assert.fail("le choix ne s'ouvre pas");
    assert.equal(ouvert.ariaLabel, QUI_D_AUTRE("parade"));
    bouton(ouvert, CET_ORDINATEUR).click();
    await repos();
    await repos();
    assert.deepEqual(servis(vue), [[DEPOT, true]]);
    // La station l'a pour de bon : sa configuration porte sa ligne, et ses cuisines la lisent.
    assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), `parade ${DEPOT}\n`);
    // L'onglet montre ce que la liste dit, avant que la station ne le publie : cet ordinateur le sert.
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    assert.equal(dit(vue), FAIT_ICI(CET_ORDINATEUR, "parade"));
    bouton(carte(vue, "macbook"), ARRETER);

    const rouverte = await lOnglet(racine);
    assert.deepEqual(cartes(rouverte).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
  });

  test("un ajout que la station refuse : rien n'est écrit, le choix reste ouvert et dit pourquoi, son bouton est toujours là", async () => {
    const racine = laStation();
    // Un autre projet de la station s'appelle déjà parade : son nom est pris.
    ajouterProjetServi(racine, "ailleurs/parade");
    const vue = await lOnglet(racine);
    bouton(haut(vue), AJOUTER).click();
    await repos();
    bouton(choix(vue) ?? assert.fail("pas de choix"), CET_ORDINATEUR).click();
    await repos();
    await repos();
    assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), "parade ailleurs/parade\n");
    const ouvert = choix(vue) ?? assert.fail("le choix s'est refermé sans rien changer");
    assert.match(ouvert.textContent, /nothing was written: this station already serves a project named parade, from ailleurs\/parade: benomite\/parade would take the same name/);
    assert.equal(bouton(ouvert, CET_ORDINATEUR).disabled, false);
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
  });
});

describe("arrêter une station depuis l'onglet (#3402)", () => {
  test("cet ordinateur le sert : « Stop cooking here » le retire de sa liste, sa carte part et la ligne le dit — encore après une réouverture", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, DEPOT);
    const vue = await lOnglet(racine);
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    await arreter(vue, "macbook");
    assert.deepEqual(servis(vue), [[DEPOT, false]]);
    assert.deepEqual(lireProjetsServis(racine), []);
    assert.equal(dit(vue), RETIRE("macbook", "parade"));
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);

    // Rouverte, même si la station publiait encore le servir, l'app lit sa liste : il n'y est plus.
    const rouverte = await lOnglet(racine);
    assert.deepEqual(cartes(rouverte).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
  });

  test("un retrait qui laisse le projet dans la liste le dit, et la carte garde son bouton", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, DEPOT);
    // La station répond sans l'avoir retiré : c'est le chef qui cliquait « remove » et lisait encore « served ».
    const vue = await lOnglet(racine, () => ({ depots: lireProjetsServis(racine) }));
    await arreter(vue, "macbook");
    assert.equal(dit(vue), ENCORE_SERVI("macbook", "parade"));
    bouton(carte(vue, "macbook"), ARRETER);
  });

  test("un retrait que la station refuse le dit en une ligne, et la carte garde son bouton", async () => {
    const racine = laStation();
    ajouterProjetServi(racine, DEPOT);
    const vue = await lOnglet(racine, () => ({ refus: "the station's configuration cannot be written — EACCES" }));
    await arreter(vue, "macbook");
    assert.match(dit(vue), /^nothing was changed: the station's configuration cannot be written/);
    assert.deepEqual(lireProjetsServis(racine), [DEPOT]);
    bouton(carte(vue, "macbook"), ARRETER);
  });
});
