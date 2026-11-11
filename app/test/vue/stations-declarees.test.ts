// Sur l'onglet Stations (#1509, épique #1506, puis #3195) : chaque station que la box du projet déclare a sa carte — son
// nom, ce qu'elle est en clair (la box, cet ordinateur, un autre ordinateur), et dans « Details » son plafond de cooks et ses
// capacités. « Stop cooking here », sur sa carte, la retire, après confirmation. La déclaration arrive avec l'installation du projet
// (`controle.stations`, service.ts) : à l'ouverture de l'espace, puis à chaque contrôle. La vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../src/service.ts";
import { plafondDit } from "../../src/vue/stations-declarees.js";
import { ARRETER, OUI_ARRET } from "../../src/vue/stations-tab/stations-tab.js";
import { ANNULER } from "../../src/vue/lexique.js";
import type { StationVoulue } from "../../src/service.ts";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const PARADE = "parade";

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-23T10:04:11.000Z",
  dernierTick: "2026-10-23T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

// Ce que `installation stations --json` rend (runtime/src/declarer-stations.ts, `faitsDesStations`), lu par l'app
// telle qu'elle est : une station de la box, deux d'autres postes.
const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: null }],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "mac/claude", moteur: "claude", fournit: ["navigateur-headless", "chrome-connecté"], cooks: 1, distante: true },
        { nom: "pc/claude", moteur: "claude", fournit: ["code"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsLues | undefined): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station of this computer runs with the app" },
  termine: true,
  ...(stations === undefined ? {} : { controle: { a: A, stations } }),
});

const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade" };

const demarrage = (projet: Projet) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [projet] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(stations: StationsLues | undefined, projet: Projet = PROJET): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: demarrage(projet),
    espace: () => [],
    service: () => guide(stations),
    lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    changerUneStation: (_: string, nom: string, voulu: StationVoulue) => ({ fait: "retiree" in voulu ? `${nom} no longer serves ${PARADE}` : `${nom} saved` }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [] }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

// Les cartes de l'onglet : le nom de chacune, ce qu'elle est, et dans « Details » son plafond et ses capacités.
const cartes = (vue: Jouee) => vue.element("rail").dessous("section").filter(({ className }) => className === "carte-de-station");
const carte = (vue: Jouee, nom: string) => cartes(vue).find(({ dataset }) => dataset.station === nom) ?? assert.fail(`pas de carte ${nom}`);
const rangee = (pose: Faux, cle: string) => pose.dessous("div").find(({ className, dataset }) => className === "reglage" && dataset.cle === cle);
const lu = (vue: Jouee) =>
  cartes(vue).map((pose) => ({
    nom: pose.dataset.station,
    est: pose.dessous("p").find(({ className }) => className === "ce-qu-elle-est")?.textContent,
    plafond: rangee(pose, "cooks")?.children[1]?.children[0]?.textContent,
    capacites: rangee(pose, "capacites")?.children[1]?.children[0]?.textContent,
  }));
const bouton = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

describe("chaque station que le projet déclare, sur l'onglet Stations", () => {
  test("une station de la box et deux d'autres postes : une carte chacune, ce qu'elle est, et dans « Details » son plafond et ses capacités", async () => {
    const vue = await ouvrir(DECLAREES);
    assert.deepEqual(lu(vue), [
      { nom: "box/claude", est: "always-on box: cooks while your computer sleeps", plafond: plafondDit(3), capacites: "code, raisonnement" },
      { nom: "mac/claude", est: "another computer: cooks while Brigade is open on it", plafond: plafondDit(1), capacites: "navigateur-headless, chrome-connecté" },
      { nom: "pc/claude", est: "another computer: cooks while Brigade is open on it", plafond: plafondDit(2), capacites: "code" },
    ]);
    // Aucune ne s'est encore annoncée : aucune n'est dite en ligne, et la ligne du haut le dit sans vert.
    assert.deepEqual(cartes(vue).map(({ dataset }) => dataset.etat), ["illisible", "illisible", "illisible"]);
    assert.match(cartes(vue)[0]?.textContent ?? "", /not signed in yet/);
  });

  test("tant que l'installation n'a rien lu, aucune station déclarée n'est posée ; le contrôle suivant pose les stations, sans rouvrir l'espace", async () => {
    const vue = await ouvrir(undefined);
    assert.deepEqual(lu(vue), []);
    vue.dire("surGuide", guide(DECLAREES));
    await repos();
    assert.deepEqual(lu(vue).map(({ nom }) => nom), ["box/claude", "mac/claude", "pc/claude"]);
    // Une installation relue sans contrôle ne les efface pas.
    vue.dire("surGuide", guide(undefined));
    await repos();
    assert.equal(lu(vue).length, 3);
  });

  test("« Stop cooking here » est sur la carte de la station ; sa confirmation s'ouvre dessous, « Cancel » la referme, « yes » la retire", async () => {
    const vue = await ouvrir(DECLAREES);
    bouton(carte(vue, "mac/claude"), ARRETER).click();
    await repos();
    const confirmation = () => carte(vue, "mac/claude").children.find(({ className }) => className === "confirmation");
    assert.match(confirmation()?.dessous("p")[0]?.textContent ?? "", /^Stop cooking parade on mac\/claude\?$/);
    assert.equal(confirmation()?.dessous("p").filter(({ className }) => className === "prix").length, 1);
    assert.equal(carte(vue, "pc/claude").children.some(({ className }) => className === "confirmation"), false);
    bouton(confirmation() ?? assert.fail("pas de confirmation"), ANNULER).click();
    await repos();
    assert.equal(confirmation(), undefined);
    assert.equal(vue.appels.some(({ geste }) => geste === "changerUneStation"), false);
    bouton(carte(vue, "mac/claude"), ARRETER).click();
    await repos();
    bouton(confirmation() ?? assert.fail("pas de confirmation"), OUI_ARRET).click();
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "mac/claude", { retiree: true }]);
  });
});
