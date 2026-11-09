// Sur l'onglet Stations (#1509, épique #1506) : chaque station que la box du projet déclare, une ligne chacune — son nom,
// son plafond de cooks, ses capacités, et où elle tourne, la box ou ce poste, sous deux mots distincts. Un projet qui
// n'en déclare aucune le dit en une ligne, jamais par un blanc. La déclaration arrive avec l'installation du projet
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
import { APPLIQUE, OU, ouTourne, plafondDit, poserLesDeclarees, type Edition } from "../../src/vue/stations-declarees.js";
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
  const vue = await jouerLaVue({ demarrage: demarrage(projet), espace: () => [], service: () => guide(stations), lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [] }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

const bloc = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "stations-de-cuisson");
// Une ligne de station telle qu'elle se lit : son nom, où elle tourne, ses capacités. Le plafond, lui, est celui des
// lignes que le journal déclare : la rangée de réglage « Cooks at once » (composants/reglage), son nom et sa valeur.
const lignesDe = (pose: Faux) => pose.dessous("li").filter(({ className }) => className === "station-de-cuisson");
const lu = (pose: Faux) =>
  lignesDe(pose).map((ligne) => ({
    nom: ligne.dessous("strong").find(({ className }) => className === "mono")?.textContent,
    ou: ligne.dessous("span").find(({ className }) => className === "ou")?.textContent,
    plafond: ((rangee) => (rangee === undefined ? undefined : `${rangee.children[0]?.textContent}: ${rangee.children[1]?.textContent}`))(ligne.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === "cooks")),
    capacites: ligne.dessous("li").filter(({ className }) => className === "capacite mono").map(({ textContent }) => textContent),
  }));

// Le module seul : une ligne de `stations-declarees.js`, telle qu'il la pose.
const luSeul = (pose: Faux) =>
  pose.dessous("li").filter(({ className }) => className === "station-declaree").map((ligne) => {
    const [, plafond, capacites] = ligne.children;
    return { plafond: plafond?.textContent, capacites: capacites?.children.map(({ textContent }) => textContent) };
  });

describe("ce que chaque station déclarée fournit, sur l'onglet Stations", () => {
  test("une station de la box et deux d'autres postes : leur plafond, leurs capacités, et des mots distincts pour où elles tournent", async () => {
    const vue = await ouvrir(DECLAREES);
    const pose = bloc(vue) ?? assert.fail("pas de stations déclarées sur Stations");
    assert.deepEqual(lu(pose), [
      { nom: "box/claude", ou: "box station", plafond: "Cooks at oncethis computer: 3", capacites: ["code", "raisonnement"] },
      { nom: "mac/claude", ou: "remote", plafond: "Cooks at oncethis computer: 1", capacites: ["navigateur-headless", "chrome-connecté"] },
      { nom: "pc/claude", ou: "remote", plafond: "Cooks at oncethis computer: 2", capacites: ["code"] },
    ]);
    // Les mots sont distincts.
    assert.equal(new Set(Object.values(OU)).size, 3);
    const lignes = lignesDe(pose);
    // Le survol dit où : la box par le nom que le chef lui connaît, ce poste qui tire son travail de la box.
    const survols = lignes.map((ligne) => ligne.dessous("span").find(({ className }) => className === "ou")?.title ?? "");
    assert.match(survols[0] ?? "", /^it runs on the project.s main station$/);
    assert.match(survols[1] ?? "", /another workstation/);
    assert.match(survols[2] ?? "", /another workstation/);
  });

  test("tant que l'installation n'a rien lu, aucune station déclarée n'est posée ; le contrôle suivant pose les stations, sans rouvrir l'espace", async () => {
    const vue = await ouvrir(undefined);
    assert.deepEqual(lu(bloc(vue) ?? assert.fail("pas de bloc")), []);
    vue.dire("surGuide", guide(DECLAREES));
    await repos();
    assert.deepEqual(lu(bloc(vue) ?? assert.fail("plus de bloc")).map(({ nom }) => nom), ["box/claude", "mac/claude", "pc/claude"]);
    // Une installation relue sans contrôle ne les efface pas.
    vue.dire("surGuide", guide(undefined));
    await repos();
    assert.equal(lu(bloc(vue) ?? assert.fail("plus de bloc")).length, 3);
  });

  test("le module se lit seul, sur un faux document", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const pose = poserLesDeclarees(doc as never, { stations: DECLAREES }) as unknown as Faux;
    assert.deepEqual(luSeul(pose).map(({ plafond }) => plafond), [plafondDit(3), plafondDit(1), plafondDit(2)]);
    // Une station sans capacité le dit.
    const sans = poserLesDeclarees(doc as never, { stations: { ...DECLAREES, declarees: [{ nom: "box/claude", moteur: "claude", fournit: [], cooks: 1, distante: false }] } }) as unknown as Faux;
    assert.deepEqual(luSeul(sans)[0]?.capacites, ["provides nothing"]);
    // La cuisine tourne sur ce poste : ses stations de la box tournent ici.
    const [box, mac] = DECLAREES.declarees;
    assert.equal(ouTourne(box ?? assert.fail(), { ici: true }), "poste");
    assert.equal(ouTourne(box ?? assert.fail(), { ici: false }), "box");
    assert.equal(ouTourne(mac ?? assert.fail(), { ici: false }), "ailleurs");
  });

  // Le formulaire d'une station (#1510), fait de rangées de réglage (#2920) : chaque contrôle s'applique dès qu'il change.
  test("le formulaire ouvert : deux rangées, aucun « Save » ; un changement envoie la déclaration entière, et sa rangée dit ce qu'il rend", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const appliques: unknown[][] = [];
    const editee: Edition = { nom: "pc/claude", cooks: "2", fournit: ["code"], choix: [{ capacite: "code", dite: "" }, { capacite: "raisonnement", dite: "" }], confirmer: false, envoi: false };
    const poser = () => {
      const pose = poserLesDeclarees(doc as never, {
        stations: DECLAREES,
        editer: { editee, ouvrir() {}, fermer() {}, appliquer: (...args) => void appliques.push(args), confirmer() {}, retirer() {} },
      }) as unknown as Faux;
      return pose.dessous("div").find(({ className }) => className === "edition") ?? assert.fail("pas de formulaire");
    };
    let forme = poser();
    const rangee = (cle: string) => forme.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === cle) ?? assert.fail(`pas de rangée ${cle}`);
    assert.deepEqual(forme.children.filter(({ className }) => className === "reglage").map(({ dataset }) => dataset.cle), ["cooks", "capacites"]);
    assert.deepEqual(forme.dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
    // Le plafond, au `change` du champ : la déclaration entière, ce plafond dedans.
    const champ = rangee("cooks").dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = "5";
    champ.declencher("change");
    // Une case cochée : de même, les capacités dedans.
    const coche = rangee("capacites").dessous("input").find(({ ariaLabel }) => ariaLabel === "raisonnement") ?? assert.fail("pas de case");
    coche.checked = true;
    coche.declencher("change");
    assert.deepEqual(appliques, [
      ["pc/claude", "cooks", { cooks: 5, fournit: ["code"] }],
      ["pc/claude", "capacites", { cooks: 5, fournit: ["code", "raisonnement"] }],
    ]);
    // En route : « applying… » sous sa rangée, ses contrôles attendent.
    Object.assign(editee, { envoi: true, ou: "cooks" });
    forme = poser();
    assert.deepEqual(rangee("cooks").children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]), [["dit en-cours", APPLIQUE]]);
    assert.ok(forme.dessous("input").every(({ disabled }) => disabled));
    // Refusé : le refus sous sa rangée, rien sous l'autre.
    Object.assign(editee, { envoi: false, ou: "capacites", rendu: { refus: "Nothing was saved: pc/claude provides at least one capability — tick one." } });
    forme = poser();
    assert.equal(rangee("capacites").children.find(({ className }) => className === "dit refus")?.dataset.ligne, "erreur");
    assert.deepEqual(rangee("cooks").children.filter(({ className }) => className.startsWith("dit")), []);
  });
});
