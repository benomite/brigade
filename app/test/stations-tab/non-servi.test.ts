// L'onglet Stations d'un projet que la station de cet ordinateur fait tourner sans le servir (#3399) : sa cuisine tourne ici
// et `facts` nomme sa ligne, au repos, mais sa liste de projets servis ne porte que d'autres dépôts. L'onglet ne dit pas
// « Cooked by … idle » : personne ne le cuit, et combien de tickets `fire` attendent. « Cook it on this computer » le met
// sur la liste que Settings montre ; l'onglet dit alors que ce Mac le cuit, et Settings le dit `served`. Derrière le
// pont, la liste est celle du runtime, écrite pour de bon dans un répertoire du test.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, lireProjetsServis } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { PAS_SERVI, SERVI } from "../../src/vue/projets-servis/projets-servis.js";
import { CHOISIR, CUIRE_ICI, PERSONNE } from "../../src/vue/stations-tab/etat.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-12T10:00:00.000Z";
const DEPOT = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: DEPOT, base: "main" };
const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
// Aucune station ne dit le servir sur GitHub.
const PERSONNE_SUR_GITHUB: ProjetVu = { nom: "parade", depot: DEPOT, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const VU: VuDesProjets = { a: A, projets: [PERSONNE_SUR_GITHUB], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
// Ce que `facts` dit de la cuisine qui tourne ici : la ligne de ce Mac, au repos — elle tourne, rien ne cuit —, et 8 tickets
// `fire` sur le rail.
const ligneDuMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [] };
const FAITS = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 8, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  livres: [],
  stations: [ligneDuMac],
} as unknown as Faits;

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});

// La station de ce Mac, dont la liste ne porte que cantine ; `facts` : ce que la cuisine d'ici rend, ou rien de lu (`null`) ;
// `lue` : sans elle, l'app ne lit pas la liste de ce Mac.
async function laPage({ facts = FAITS as Faits | null, lue = true } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "non-servi-"));
  racines.push(racine);
  ajouterProjetServi(racine, CANTINE.depot ?? "");
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }, () => true, (nom) => nom === "parade"),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: VU,
    }),
    espace: () => [],
    ...(lue ? { projetsServis: () => ({ depots: lireProjetsServis(racine) }) } : {}),
    servirUnProjet: (depot: string, servi: boolean) => {
      assert.equal(servi, true);
      return { depots: ajouterProjetServi(racine, depot) };
    },
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  if (facts !== null) {
    const tenus = tenirFaits();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    const dessinable = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? recue;
    vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
    await repos();
  }
  await ouvrirOnglet(vue, "Stations");
  return { vue, racine };
}

const onglet = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const haut = (vue: Jouee) => onglet(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const phrase = (vue: Jouee) => haut(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";
const cartes = (vue: Jouee) => onglet(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
// La ligne de parade dans « projects this computer serves », sous Settings.
const ligneServie = (vue: Jouee) => vue.element("projets-servis").dessous("div").find(({ dataset }) => dataset.projet === "parade") ?? assert.fail("pas de ligne pour parade dans Settings");

describe("un projet que cet ordinateur fait tourner sans le servir (#3399)", () => {
  test("personne ne le cuit, et 8 tickets `fire` attendent : ni « Cooked by », ni carte ; « Cook it on this computer » recommandé", async () => {
    const { vue } = await laPage();
    assert.equal(phrase(vue), `${PERSONNE} · 8 fire tickets waiting`);
    assert.equal(phrase(vue), "No station cooks this project · 8 fire tickets waiting");
    assert.equal(onglet(vue).textContent.includes("Cooked by"), false);
    assert.equal(onglet(vue).textContent.includes("idle, nothing on the rail"), false);
    assert.notEqual(haut(vue).dataset.ton, "vert");
    assert.deepEqual(cartes(vue), []);
    assert.deepEqual(haut(vue).dessous("button").map(({ textContent }) => textContent), [CUIRE_ICI, CHOISIR]);
    assert.equal(CUIRE_ICI, "Cook it on this computer");
    // Le bouton recommandé est celui qui le cuit ici.
    assert.equal(bouton(haut(vue), CUIRE_ICI).className.includes("recommande"), true);
    assert.equal(bouton(haut(vue), CHOISIR).className.includes("recommande"), false);
    // Ni l'en-tête du projet : cet ordinateur n'y est pas nommé comme celui où il cuit.
    assert.equal(vue.element("stations-du-projet").textContent.includes("Cooks on"), false);
  });

  test("« Cook it on this computer » l'ajoute à la liste de ce Mac : l'onglet dit que ce Mac le cuit, et Settings le dit servi", async () => {
    const { vue, racine } = await laPage();
    assert.equal(ligneServie(vue).dessous("span").find(({ className }) => className === "pas-servi")?.textContent, PAS_SERVI);
    bouton(haut(vue), CUIRE_ICI).click();
    for (let tour = 0; tour < 6; tour++) await repos();
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "servirUnProjet").map(({ args }) => args), [[DEPOT, true]]);
    assert.deepEqual(lireProjetsServis(racine), [CANTINE.depot, DEPOT]);
    assert.equal(phrase(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(haut(vue).dataset.ton, "vert");
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["macbook"]);
    assert.equal(haut(vue).dessous("button").some(({ textContent }) => textContent === CUIRE_ICI), false);
    // Les deux endroits disent la même chose : parade, dans « projects this computer serves », y est `served`.
    assert.equal(ligneServie(vue).dessous("strong").find(({ className }) => className === "servi")?.textContent, SERVI);
  });

  test("le rail pas encore lu, la ligne ne compte aucun ticket qu'elle n'a pas lu", async () => {
    const { vue } = await laPage({ facts: null });
    assert.equal(phrase(vue), PERSONNE);
  });

  test("la liste de ce Mac pas lue : rien n'est décidé à sa place, la ligne de cuisson dit ce qu'elle dit", async () => {
    const { vue } = await laPage({ lue: false });
    assert.equal(phrase(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(onglet(vue).dessous("button").some(({ textContent }) => textContent === CUIRE_ICI), false);
  });
});
