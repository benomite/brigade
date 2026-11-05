// Les réglages de chaque station, sur l'onglet Stations (#2488, épique #2484) : pour chacune, son plafond de cooks, ses
// capacités, si elle prend les tickets ordinaires et si elle sert le projet, chacun avec son niveau. Un changement fait
// ici part par le stockage qui existe déjà — la déclaration des stations (`changerUneStation`), l'option des tickets
// ordinaires de ce poste (`reglerOrdinaires`) — et se relit tel quel quand l'app est relancée : le faux pont de ce test
// tient ce stockage, comme le process principal. La vue jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { blocDesOrdinaires, type StationDesFaits } from "../../../src/ordinaires.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Guide, StationChangee, StationsLues, StationVoulue } from "../../../src/service.ts";
import { NIVEAUX_DITS } from "../../../src/vue/niveaux.js";
import { ARRETER, ORDINAIRES_D_AILLEURS, poserBlocReglagesStation, REGLAGES, SAUVER } from "../../../src/vue/projet/stations/ReglagesStation.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-05T10:04:12.000Z";
const PARADE = "parade";

// Ce que le process principal garde, d'un lancement de l'app à l'autre : la déclaration des stations du projet, que sa
// station principale tient, et l'option des tickets ordinaires de ce poste, dans le fichier des projets.
type Stockage = { stations: StationsLues; projet: Projet };
const stockage = (): Stockage => ({
  stations: {
    proposees: [],
    absent: null,
    declarees: [
      { nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"], cooks: 2, distante: false },
      { nom: "pc/claude", moteur: "claude", fournit: ["code", "navigateur-headless"], cooks: 1, distante: true },
    ],
  },
  projet: { nom: PARADE, dossier: "/tmp/parade", limiteCooks: 2 },
});

// Ce que `facts` dit des stations : pc/claude prend aussi les tickets ordinaires.
const station = (nom: string, distante: boolean, ordinaires: boolean): StationDesFaits => ({ station: nom, distante, plafond: null, ordinaires, bacASable: null, prendOrdinaires: ordinaires, cuisson: "cooking", cooks: [] });
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-05T10:04:11.000Z",
  dernierTick: "2026-11-05T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  stations: [station("mac/claude", false, false), station("pc/claude", true, true)],
};

const guide = (stations: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station of this computer runs with the app" },
  termine: true,
  controle: { a: A, stations },
});

const demarrage = (projet: Projet) => () => ({
  // « parade » cuit sur ce poste : sa station de la box est celle de ce Mac.
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [projet] }, () => true, (nom) => nom === PARADE),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Le faux process principal : il lit et écrit `tenu`, comme main.ts et service.ts lisent et écrivent leur stockage.
function changer(tenu: Stockage, nom: string, voulu: StationVoulue): StationChangee {
  const declarees = tenu.stations.declarees;
  if ("retiree" in voulu) tenu.stations = { ...tenu.stations, declarees: declarees.filter((lue) => lue.nom !== nom) };
  else tenu.stations = { ...tenu.stations, declarees: declarees.map((lue) => (lue.nom === nom ? { ...lue, cooks: voulu.cooks, fournit: [...voulu.fournit] } : lue)) };
  return { fait: "retiree" in voulu ? `${nom} no longer serves ${PARADE}` : `${nom} saved` };
}

// Un lancement de l'app : « parade » ouverte, ses faits lus, l'onglet Stations montré.
async function lancer(tenu: Stockage): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: demarrage(tenu.projet),
    espace: () => [],
    service: () => guide(tenu.stations),
    ordinaires: () => blocDesOrdinaires(tenu.projet, "darwin", FAITS.stations, true),
    reglerOrdinaires: (_, actif, limite) => {
      tenu.projet = { ...tenu.projet, ordinaires: actif, ...(limite === null ? {} : { limiteCooks: limite }) };
      return undefined;
    },
    changerUneStation: (_, nom, voulu) => changer(tenu, nom, voulu),
    lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

const bloc = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "reglages-station") ?? assert.fail("pas de bloc « Station settings »");
const stationDe = (vue: Jouee, nom: string) => bloc(vue).dessous("section").find(({ dataset }) => dataset.station === nom) ?? assert.fail(`pas de réglages pour ${nom}`);
const ligneDe = (pose: Faux, cle: string) => pose.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === cle) ?? assert.fail(`pas de ligne « ${cle} »`);
const caseDe = (ligne: Faux) => ligne.dessous("input").find(({ type }) => type === "checkbox") ?? assert.fail("pas de case");
const boutonDe = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

// Une station telle que l'écran la dit : chaque réglage, son niveau, sa valeur, et s'il se change d'ici.
const lu = (pose: Faux) =>
  pose.children
    .filter(({ className }) => className === "reglage")
    .map((ligne) => {
      const [nom, valeur, champ] = ligne.children;
      const niveau = nom?.children.find(({ className }) => className === "niveau");
      const entrees = champ?.dessous("input") ?? [];
      return {
        cle: ligne.dataset.cle,
        nom: nom?.textContent.replace(niveau?.textContent ?? "", ""),
        niveau: niveau?.textContent,
        valeur: valeur?.children[0]?.textContent,
        reglable: entrees.some(({ disabled }) => !disabled),
      };
    });

describe("l'onglet Stations : les réglages de chaque station (#2488)", () => {
  test("pour chaque station, les quatre réglages, chacun avec son niveau, et ce qui se change d'ici", async () => {
    const vue = await lancer(stockage());
    const machine = NIVEAUX_DITS.machine.libelle;
    assert.deepEqual(
      bloc(vue).dessous("section").map(({ dataset }) => dataset.station),
      ["mac/claude", "pc/claude"],
    );
    assert.deepEqual(lu(stationDe(vue, "mac/claude")), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "2 cooks at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, macos", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "not taken", reglable: true },
      { cle: "sert", nom: "serves this project", niveau: machine, valeur: "serves it", reglable: true },
    ]);
    // pc/claude joue ailleurs : ses tickets ordinaires sont ce que `facts` dit d'elle, et le survol dit pourquoi ils ne se
    // changent pas d'ici.
    const pc = stationDe(vue, "pc/claude");
    assert.deepEqual(lu(pc), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "1 cook at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, navigateur-headless", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "taken", reglable: false },
      { cle: "sert", nom: "serves this project", niveau: machine, valeur: "serves it", reglable: true },
    ]);
    assert.equal(caseDe(ligneDe(pc, "ordinaires")).checked, true);
    assert.ok(ligneDe(pc, "ordinaires").dessous("button").some(({ ariaLabel }) => ariaLabel === ORDINAIRES_D_AILLEURS));
    // Les cases des capacités : celles de chaque station du projet, cochées comme elle les déclare.
    const cochees = (pose: Faux) => ligneDe(pose, "capacites").dessous("input").filter(({ type, checked }) => type === "checkbox" && checked).map(({ ariaLabel }) => ariaLabel);
    assert.deepEqual(cochees(pc), ["code", "navigateur-headless"]);
    assert.deepEqual(REGLAGES.map(({ cle }) => cle), ["cooks", "capacites", "ordinaires", "sert"]);
  });

  test("le plafond et les capacités changés ici sont enregistrés, et se relisent tels quels à la relance de l'app", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const pc = stationDe(vue, "pc/claude");
    const sauver = boutonDe(pc, SAUVER);
    // Rien de changé : rien à enregistrer.
    assert.equal(sauver.disabled, true);
    const cooks = ligneDe(pc, "cooks").dessous("input")[0] ?? assert.fail("pas de champ");
    cooks.value = "4";
    cooks.declencher("input");
    const macos = ligneDe(pc, "capacites").dessous("input").find(({ ariaLabel }) => ariaLabel === "macos") ?? assert.fail("pas de case macos");
    macos.checked = true;
    macos.declencher("change");
    assert.equal(sauver.disabled, false);
    sauver.click();
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 4, fournit: ["code", "navigateur-headless", "macos"] }]);
    assert.ok(stationDe(vue, "pc/claude").dessous("p").some(({ textContent }) => textContent === "pc/claude saved"));
    // La déclaration relue arrive par le contrôle suivant.
    vue.dire("surGuide", guide(tenu.stations));
    await repos();
    assert.equal(lu(stationDe(vue, "pc/claude"))[0]?.valeur, "4 cooks at once");

    // L'app relancée : la même valeur, lue du même stockage.
    const relancee = await lancer(tenu);
    const apres = lu(stationDe(relancee, "pc/claude"));
    assert.equal(apres[0]?.valeur, "4 cooks at once");
    assert.equal(apres[1]?.valeur, "code, navigateur-headless, macos");
    assert.equal(lu(stationDe(relancee, "mac/claude"))[0]?.valeur, "2 cooks at once");
  });

  test("les tickets ordinaires de la station de ce poste se cochent ici, et le restent à la relance", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const coche = caseDe(ligneDe(stationDe(vue, "mac/claude"), "ordinaires"));
    coche.checked = true;
    coche.declencher("change");
    await repos();
    // La limite de cooks de ce poste reste celle qu'elle était.
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, true, 2]);
    assert.equal(lu(stationDe(vue, "mac/claude"))[2]?.valeur, "taken");

    const relancee = await lancer(tenu);
    assert.equal(lu(stationDe(relancee, "mac/claude"))[2]?.valeur, "taken");
    assert.equal(caseDe(ligneDe(stationDe(relancee, "mac/claude"), "ordinaires")).checked, true);
  });

  // Le bac à sable de la station locale (#2489), sur le même onglet, écrit la même option : les deux blocs disent la même.
  test("les tickets ordinaires cochés ici se lisent dans la station locale, et décochés là, ici", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const locale = () => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "station-locale") ?? assert.fail("pas de bloc de la station locale");
    const bacASable = () => locale().dessous("div").find(({ className, dataset }) => className === "reglage" && dataset.cle === "ordinaires") ?? assert.fail("pas de bac à sable");
    await repos();
    assert.equal(bacASable().children[1]?.children[0]?.textContent, "not taken");
    const coche = caseDe(ligneDe(stationDe(vue, "mac/claude"), "ordinaires"));
    coche.checked = true;
    coche.declencher("change");
    await repos();
    assert.equal(bacASable().children[1]?.children[0]?.textContent, "taken");
    const option = caseDe(bacASable());
    option.checked = false;
    option.declencher("change");
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, false, 2]);
    assert.equal(lu(stationDe(vue, "mac/claude"))[2]?.valeur, "not taken");
    assert.equal(caseDe(ligneDe(stationDe(vue, "mac/claude"), "ordinaires")).checked, false);
  });

  test("ne plus servir le projet demande confirmation, retire la station, et elle n'y revient pas à la relance", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const coche = caseDe(ligneDe(stationDe(vue, "pc/claude"), "sert"));
    coche.checked = false;
    coche.declencher("change");
    await repos();
    // Rien ne part avant le « oui » : la confirmation dit ce qu'il en coûte.
    assert.equal(vue.appels.some(({ geste }) => geste === "changerUneStation"), false);
    const sert = ligneDe(stationDe(vue, "pc/claude"), "sert");
    assert.match(sert.dessous("p").map(({ textContent }) => textContent).join(" "), /Stop serving parade on pc\/claude\?/);
    boutonDe(sert, ARRETER).click();
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { retiree: true }]);
    vue.dire("surGuide", guide(tenu.stations));
    await repos();
    assert.deepEqual(bloc(vue).dessous("section").map(({ dataset }) => dataset.station), ["mac/claude"]);

    const relancee = await lancer(tenu);
    assert.deepEqual(bloc(relancee).dessous("section").map(({ dataset }) => dataset.station), ["mac/claude"]);
    // La seule station qui reste ne se retire pas.
    assert.equal(caseDe(ligneDe(stationDe(relancee, "mac/claude"), "sert")).disabled, true);
  });

  test("sans réglages, le module ne pose que sa coquille ; sans station lue, une ligne le dit", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const coquille = poserBlocReglagesStation(doc as never) as unknown as Faux;
    assert.deepEqual(coquille.children.map(({ balise }) => balise), ["h3"]);
    const gestes = { sauver() {}, ordinaires() {}, confirmer() {}, retirer() {} };
    const pasLue = poserBlocReglagesStation(doc as never, { stations: undefined, projet: PARADE, saisies: new Map(), gestes }) as unknown as Faux;
    assert.equal(pasLue.dessous("p").at(-1)?.className, "vide");
  });
});
