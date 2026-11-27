// « Add a server » (#4347, add-server/) : la ligne d'installation d'un serveur, à côté de la liste des stations — l'onglet
// Stations, son choix « Who cooks <projet>? », et la page « who cooks it » d'un projet neuf —, puis le serveur vu arriver
// sous le compte (`stationsDuCompte`), et le projet qui lui est confié par le geste de « Choose who cooks it ».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import type { StationEnregistree, StationsDuCompte } from "../../src/stations-du-compte.ts";
import {
  ADD_A_SERVER,
  PAIRED,
  WAITING,
  INSTALL_COMMAND,
  UNREADABLE,
  WHERE_TO_RUN,
  placeAddServer,
  WHO_COOKS_IT,
  serverSeen,
  ON_A_MAC,
  CHECK_AGAIN,
  type EtatDuServeur,
} from "../../src/vue/add-server/add-server.js";
import { poserParcoursPremierProjet } from "../../src/vue/parcours-premier-projet/parcours-premier-projet.js";
import { poserLOngletDesStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Faux, jouerLaVue, type Jouee, type Reponses, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (id: string, name: string, available = true): StationEnregistree => ({
  id,
  name,
  platform: "linux",
  machine: "Debian 12",
  version: "1.4.0",
  account: "chef",
  available,
  registeredAt: "2026-11-26T10:00:00.000Z",
  lastSeen: "2026-11-26T10:00:00.000Z",
  stoppedAt: null,
  refreshMs: 120_000,
  selection: null,
});
const LISTEE = (stations: StationEnregistree[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });
const texte = (racine: Faux) => [...racine.descendants()].map((n) => n.textContent).join("\n");
const boutons = (racine: Faux) => racine.dessous("button").filter(({ hidden }) => !hidden).map(({ textContent }) => textContent);
const bouton = (racine: Faux, libelle: string) => racine.dessous("button").find((candidat) => candidat.textContent === libelle) ?? assert.fail(`pas de « ${libelle} » : ${boutons(racine).join(", ")}`);
const poser = (etat: EtatDuServeur, gestes = {}) => {
  const racine = new Faux("div");
  racine.append(...(placeAddServer(doc, etat, gestes) as Faux[]));
  return racine;
};
// Ce que le panneau demande de taper : chaque `code` qu'il montre.
const commandes = (racine: Faux) => racine.dessous("code").map(({ textContent }) => textContent);

describe("le serveur attendu, d'après la lecture du compte", () => {
  test("une station qui n'était pas là à l'ouverture est le serveur neuf ; sinon il attend", () => {
    const box = station("g1", "box");
    const neuf = station("g9", "parade-box");
    assert.deepEqual(serverSeen(new Set(["g1"]), LISTEE([box])), { etat: "attente" });
    assert.deepEqual(serverSeen(new Set(["g1"]), LISTEE([box, neuf])), { etat: "appairee", station: neuf });
    assert.deepEqual(serverSeen(new Set(), LISTEE([neuf])), { etat: "appairee", station: neuf });
  });

  test("rien de lu, ou celles d'avant pas encore lues : aucune n'est dite neuve", () => {
    assert.deepEqual(serverSeen(new Set(), undefined), { etat: "attente" });
    assert.deepEqual(serverSeen(undefined, LISTEE([station("g9", "parade-box")])), { etat: "attente" });
  });

  test("une lecture du compte en échec se dit, sa raison et son détail — jamais « paired »", () => {
    assert.deepEqual(serverSeen(new Set(), { state: "unavailable", cause: "network", reason: "GitHub could not be reached.", detail: "dial tcp" }), { etat: "illisible", raison: "GitHub could not be reached.", detail: "dial tcp" });
    assert.deepEqual(serverSeen(new Set(), { state: "sign-in-required", reason: "Sign in to GitHub.", action: { id: "github-sign-in", label: "Sign in to GitHub", command: ["gh"] } }), { etat: "illisible", raison: "Sign in to GitHub.", detail: "" });
  });
});

describe("le panneau", () => {
  test("la ligne est celle que la page d'installation publie, et la seule", () => {
    const publiee = /^curl -fsSL \S+\/station\/installer-station\.sh \| sh$/m.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0];
    assert.equal(INSTALL_COMMAND, publiee);
  });

  test("fermé, rien que le bouton ; un clic pose le panneau — la phrase, la ligne, « copy », le mot pour un Mac, l'attente — et le dit", () => {
    const bascules: boolean[] = [];
    const racine = poser({ ouvert: false, vu: { etat: "attente" } }, { basculer: (ouvert: boolean) => void bascules.push(ouvert) });
    assert.deepEqual(boutons(racine), [ADD_A_SERVER]);
    bouton(racine, ADD_A_SERVER).click();
    for (const phrase of [WHERE_TO_RUN, ON_A_MAC, WAITING]) assert.ok(texte(racine).includes(phrase), phrase);
    assert.deepEqual(commandes(racine), [INSTALL_COMMAND]);
    assert.deepEqual(boutons(racine), [ADD_A_SERVER, "copy", CHECK_AGAIN]);
    assert.equal(bouton(racine, ADD_A_SERVER).ariaExpanded, "true");
    bouton(racine, ADD_A_SERVER).click();
    assert.deepEqual(bascules, [true, false]);
    assert.equal(bouton(racine, ADD_A_SERVER).ariaExpanded, "false");
  });

  test("« copy » copie la ligne ; « check again » relit le compte", () => {
    const faits: string[] = [];
    const racine = poser({ ouvert: true, vu: { etat: "attente" }, copiee: true }, { copier: (commande: string) => void faits.push(commande), verifier: () => void faits.push("verifier") });
    bouton(racine, "copied").click();
    bouton(racine, CHECK_AGAIN).click();
    assert.deepEqual(faits, [INSTALL_COMMAND, "verifier"]);
  });

  test("le serveur arrivé : il le dit, et le projet se confie d'un clic sur son nom — sans projet nommé, rien ne se confie", () => {
    const neuf = station("g9", "parade-box");
    const confies: StationEnregistree[] = [];
    const racine = poser({ ouvert: true, vu: { etat: "appairee", station: neuf }, projet: "parade" }, { confier: (une: StationEnregistree) => void confies.push(une) });
    assert.ok(texte(racine).includes(PAIRED("parade-box")));
    assert.ok(texte(racine).includes(WHO_COOKS_IT("parade")));
    assert.ok(!texte(racine).includes(WAITING));
    assert.equal(bouton(racine, "parade-box").className, "recommande");
    bouton(racine, "parade-box").click();
    assert.deepEqual(confies, [neuf]);
    const sansProjet = poser({ ouvert: true, vu: { etat: "appairee", station: neuf } }, { confier: () => assert.fail("rien à confier") });
    assert.ok(texte(sansProjet).includes(PAIRED("parade-box")));
    assert.deepEqual(boutons(sansProjet), [ADD_A_SERVER, "copy"]);
  });

  test("hors ligne, le serveur se choisit sans être recommandé", () => {
    const racine = poser({ ouvert: true, vu: { etat: "appairee", station: station("g9", "parade-box", false) }, projet: "parade" }, { confier: () => {} });
    assert.equal(bouton(racine, "parade-box").className, "");
  });

  test("la lecture du compte en échec : une ligne, sa raison ; « check again » reste", () => {
    const racine = poser({ ouvert: true, vu: { etat: "illisible", raison: "GitHub could not be reached.", detail: "dial tcp" } });
    assert.ok(texte(racine).includes(`${UNREADABLE}: GitHub could not be reached.`));
    assert.ok(!texte(racine).includes(WAITING));
    // Le « ? » de la ligne porte le détail au survol.
    assert.deepEqual(boutons(racine), [ADD_A_SERVER, "copy", "?", CHECK_AGAIN]);
  });
});

// Critère 2 du ticket : sur chaque écran qui l'offre, le panneau ouvert ne demande de taper que la ligne montrée, et ne
// renvoie à aucune page d'installation.
describe("aucune autre commande, aucune page d'installation, sur chaque écran qui l'offre", () => {
  const GESTES = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
  const BASE = { projet: "parade", poste: "this Mac", lues: true, haut: { etat: "personne", vert: false }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set(), quiCuit: true };
  const OUVERT: EtatDuServeur = { ouvert: true, vu: { etat: "attente" }, projet: "parade" };
  const sansAutre = (racine: Faux) => {
    assert.ok(texte(racine).includes(INSTALL_COMMAND));
    assert.deepEqual(commandes(racine), [INSTALL_COMMAND]);
    assert.doesNotMatch(texte(racine), /installation-station|installer-station\.ps1|\birm\b|\bssh\b|\bsudo\b/i);
  };

  test("l'onglet Stations : sous la ligne du haut, dont les gestes s'effacent tant que le panneau est ouvert", () => {
    const ferme = poserLOngletDesStations(doc as never, BASE as never, GESTES as never) as Faux;
    assert.deepEqual(boutons(ferme), ["Choose who cooks it", ADD_A_SERVER]);
    const ouvert = poserLOngletDesStations(doc as never, { ...BASE, serveur: OUVERT } as never, GESTES as never) as Faux;
    assert.deepEqual(boutons(ouvert), [ADD_A_SERVER, "copy", CHECK_AGAIN]);
    sansAutre(ouvert);
  });

  test("le choix « Who cooks parade? » : sous sa liste", () => {
    const choix = { titre: "Who cooks parade?", choix: [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: true }], deplacement: false };
    const racine = poserLOngletDesStations(doc as never, { ...BASE, choix, serveur: OUVERT } as never, GESTES as never) as Faux;
    assert.deepEqual(boutons(racine), ["this computer", "Cancel", ADD_A_SERVER, "copy", CHECK_AGAIN]);
    sansAutre(racine);
  });

  test("la page « who cooks it » d'un projet neuf : sous ses choix", () => {
    const racine = poserParcoursPremierProjet(
      doc as never,
      { depot: "chef/parade", vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix: [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: true }], serveur: OUVERT },
      { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {} },
    ) as Faux;
    assert.deepEqual(boutons(racine), ["this computer", ADD_A_SERVER, "copy", CHECK_AGAIN]);
    sansAutre(racine);
  });
});

// La page d'un projet neuf, jouée : « Add a project », le dépôt chef/cantine, puis « who cooks it ».
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-26T10:04:12.000Z";
const DEPOT = "chef/cantine";
const FAITS: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] } as never;
async function laPageDeCantine(reponses: Reponses) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
      poste: { nom: "this computer", mac: false },
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "chef" }),
    depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
    ouvrirDUneStation: (nom, depot, base) => {
      vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
      return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [],
    departDuProjet: () => ({ aucune: true }),
    checkRepoSetup: () => ({ ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] }),
    ...reponses,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  bouton(vue.element("ajout"), DEPOT).click();
  await repos();
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const question = (vue: Jouee) => vue.element("parcours-premier-projet");

describe("la page « who cooks it » d'un projet neuf, jouée", () => {
  test("« Add a server », le serveur vu arriver à « check again », puis confié d'un clic : la page passe à la mise en place", async () => {
    let stations = [station("g1", "atelier", false)];
    const choisis: [string, string[]][] = [];
    const vue = await laPageDeCantine({ stationsDuCompte: () => LISTEE(stations), choisirLesProjets: (id, depots) => (choisis.push([id, depots]), { selection: depots }) });
    bouton(question(vue), ADD_A_SERVER).click();
    await repos();
    assert.ok(texte(question(vue)).includes(INSTALL_COMMAND));
    assert.ok(texte(question(vue)).includes(WAITING));
    stations = [...stations, station("g9", "parade-box")];
    bouton(question(vue), CHECK_AGAIN).click();
    await repos();
    assert.ok(texte(question(vue)).includes(PAIRED("parade-box")));
    assert.ok(!texte(question(vue)).includes(PAIRED("atelier")), "a station known before is not the new server");
    // La liste du haut le propose aussi, relue ; le panneau le confie.
    const panneau = question(vue).dessous("section").find(({ className }) => className === "ajout-de-serveur") ?? assert.fail("pas de panneau");
    bouton(panneau, "parade-box").click();
    await repos();
    assert.deepEqual(choisis, [["g9", [DEPOT]]]);
    assert.equal(vue.element("main").dataset.parcours, "setup");
  });

  test("la lecture du compte qui échoue se dit dans le panneau : rien n'est dit arrivé", async () => {
    let echoue = false;
    const vue = await laPageDeCantine({
      stationsDuCompte: () => {
        if (echoue) throw new Error("gh: dial tcp: i/o timeout");
        return LISTEE([]);
      },
    });
    bouton(question(vue), ADD_A_SERVER).click();
    await repos();
    echoue = true;
    bouton(question(vue), CHECK_AGAIN).click();
    await repos();
    assert.match(texte(question(vue)), /your stations could not be read: Your stations could not be read/);
    assert.ok(!texte(question(vue)).includes("checked in"));
  });
});
