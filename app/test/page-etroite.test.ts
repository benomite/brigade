// La page d'un projet sur un écran étroit — le téléphone (#1186) : trois onglets, Rail, Cooks et la conversation avec le
// second, qui prend la place du panneau de droite. Cooks y est en lecture seule : les lignes des stations, leur état,
// leurs cooks, et sur chacune le seul bouton qui la lance ou l'arrête — ni les stations à régler, ni le plafond, ni le
// bac à sable. Rail y est celui d'un écran large ; le dernier onglet ouvert est retenu. Sur un écran large, rien ne
// change : deux onglets, et le second à droite.
// La vue est jouée telle qu'elle est, devant un faux document et un faux écran (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import type { RenduDeCuisson } from "../src/cuisson.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { AUCUN_COOK, BOUTONS as BOUTONS_DE_CUISSON } from "../src/vue/stations-de-cuisson.js";
import { FauxEcran, FauxStockage, type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

type DuRuntime = FaitsDuRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts, #1183) : avec son plafond, ses tickets
// ordinaires et son bac à sable — ce qui se règle, et qu'un écran étroit ne montre pas.
const station = (nom: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({
  station: nom,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: { disponible: true, raison: null, version: "2.1.250", depuis: "2026-10-13T09:30:00.000Z" },
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...plus,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
// #14 cuit sur la box ; le Mac, distant, est arrêté par le chef et #15 y finit ; l'atelier est saturé.
const STATIONS: DuRuntime[] = [
  station("box/claude", { cooks: [COOK_14] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", cooks: [COOK_15] }),
  station("atelier/claude", { cuisson: "saturated" }),
];
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 2, aLaPass: 1, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: "https://github.com/benomite/brigade/issues/15", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", cible: null, depuis: "2026-10-20T10:03:41.000Z" } },
  ],
  cooks: [COOK_14, COOK_15],
  attend: [],
};
// Ce que `station` rend sur un écran large : le plafond de cooks, la machine, le quota.
const STATION = "cooks      1 running — box: 3 at most — 8 cores\nmachine    saturée · charge 7.9\nquota      62 % consommé\n";

function dessinable(stations: DuRuntime[] | undefined): Dessinable {
  const faits = stations === undefined ? FAITS : { ...FAITS, stations };
  return tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
}

// L'espace de parade, ses faits lus, sur un écran étroit ou large.
// `sansStations` : un runtime d'avant #1183, dont `facts` ne donne pas les stations.
async function ouvrir({ etroit = true, stockage, sansStations = false }: { etroit?: boolean; stockage?: FauxStockage; sansStations?: boolean } = {}) {
  const ecran = new FauxEcran(etroit);
  const cuissons: [string, string, string][] = [];
  const vue = await jouerLaVue(
    {
      demarrage,
      espace: () => [SECOND],
      machines: () => [{ id: "poste", titre: "this Mac" }],
      cuireSurLaStation: (projet, nom, geste) => (cuissons.push([projet, nom, geste]), { fait: `${nom} stops cooking ${projet}` }) as RenduDeCuisson,
    },
    { stockage, ecran },
  );
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...dessinable(sansStations ? undefined : STATIONS), demande: vue.dernier("faits")[0] as number });
  await repos();
  return { vue, ecran, cuissons };
}

const onglets = (vue: Jouee) => vue.element("onglets-du-projet").children;
const titres = (vue: Jouee) => onglets(vue).map((onglet) => onglet.textContent);
const montre = (vue: Jouee) => onglets(vue).filter((onglet) => onglet.ariaSelected === "true").map((onglet) => onglet.textContent);
async function taper(vue: Jouee, titre: string): Promise<void> {
  (onglets(vue).find((onglet) => onglet.textContent === titre) ?? assert.fail(`pas d'onglet « ${titre} »`)).click();
  await repos();
}
// Ce qui est à l'écran du projet : le centre, ou le second — jamais les deux sur un écran étroit.
const vu = (vue: Jouee) => ({ centre: !vue.element("centre").hidden, second: !vue.element("second").hidden });
const lignes = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson");
const ligne = (vue: Jouee, nom: string) => lignes(vue).find((li) => li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
const etatDe = (pose: Faux) => pose.dessous("span").find((span) => span.className === "pilule")?.textContent;
const cooksDe = (pose: Faux) => (pose.dessous("ul")[0]?.children ?? []).map((li) => li.textContent);
// Les gestes posés sous un élément : ses boutons, sauf l'icône d'aide qui porte un survol.
const gestes = (pose: Faux) => pose.dessous("button").filter((bouton) => bouton.className !== "aide");
// Un élément de la vue, par son `id`, posé dans l'onglet montré.
const dansLeRail = (vue: Jouee, id: string) => [...vue.element("rail").descendants()].some((pose) => pose.id === id);
const colonnes = (vue: Jouee) => vue.element("rail").dessous("section").filter((pose) => pose.className === "colonne").map((colonne) => colonne.children[0]?.children[0]?.textContent);
// La dernière lecture que la vue a demandée pour une page ou pour Cooks : `station` est celle que nomme « cooks ».
const lecture = (vue: Jouee) => vue.appels.findLast(({ geste }) => geste === "onglet")?.args[1];

describe("la page d'un projet sur un écran étroit : trois onglets", () => {
  test("Rail, Cooks et Second, et chacun se montre d'un tap : le second à la place du centre, jamais à côté", async () => {
    const { vue, ecran } = await ouvrir();
    assert.ok(ecran.requetes.length > 0, "la vue demande la largeur de l'écran");
    assert.deepEqual(titres(vue), ["Rail", "Cooks", "Second"]);
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.deepEqual(vu(vue), { centre: true, second: false });

    await taper(vue, "Second");
    assert.deepEqual(montre(vue), ["Second"]);
    assert.deepEqual(vu(vue), { centre: false, second: true });
    assert.equal(vue.element("main").hasAttribute("data-conversation"), true);
    // Le second y est entier : ses onglets de terminaux et de quoi ouvrir un shell.
    assert.deepEqual(vue.element("terminaux").children.map((onglet) => onglet.textContent), ["second · claude", "+ shell"]);
    // Ni les stations du projet, ni la note d'un onglet ne restent au-dessus de lui.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    assert.equal(vue.element("note").hidden, true);

    await taper(vue, "Cooks");
    assert.deepEqual(montre(vue), ["Cooks"]);
    assert.deepEqual(vu(vue), { centre: true, second: false });
    assert.equal(vue.element("main").hasAttribute("data-conversation"), false);
    assert.equal(vue.element("rail").dataset.onglet, "cooks");

    await taper(vue, "Rail");
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.deepEqual(vu(vue), { centre: true, second: false });
    assert.equal(vue.element("rail").dataset.onglet, "rail");
  });

  test("la conversation ne perd rien d'un onglet à l'autre : le même terminal, avec ce qu'il avait reçu", async () => {
    const { vue } = await ouvrir();
    await taper(vue, "Second");
    vue.dire("surSortie", SECOND.id, "> une conversation en cours\r\n");
    const [terminal] = vue.xterms;
    const [cadre] = vue.element("fil").children;
    for (const titre of ["Rail", "Cooks", "Second", "Rail", "Second"]) {
      await taper(vue, titre);
      assert.equal(vue.xterms.length, 1, titre);
      assert.equal(vue.xterms[0], terminal, titre);
      assert.equal(vue.element("fil").children[0], cadre, titre);
      assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n"], titre);
    }
    // Ce qu'il reçoit pendant qu'un autre onglet est montré l'attend.
    await taper(vue, "Rail");
    vue.dire("surSortie", SECOND.id, "suite\r\n");
    await taper(vue, "Second");
    assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n", "suite\r\n"]);
    assert.equal(cadre?.hidden, false);
    // L'espace n'est pas rouvert pour autant.
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, 1);
  });

  test("une page ouverte par-dessus — Settings — couvre la conversation comme elle couvre Rail, et la referme rend la conversation", async () => {
    const { vue } = await ouvrir();
    await taper(vue, "Second");
    (vue.element("onglets").children.find((onglet) => onglet.textContent === "Settings") ?? assert.fail("pas de Settings")).click();
    await repos();
    assert.deepEqual(montre(vue), []);
    assert.deepEqual(vu(vue), { centre: true, second: false });
    assert.equal(vue.element("contenu").hidden, false);
    await taper(vue, "Second");
    assert.deepEqual(vu(vue), { centre: false, second: true });
  });

  test("le dernier onglet ouvert est retenu : l'app rouvre le projet sur la conversation", async () => {
    const stockage = new FauxStockage();
    const { vue } = await ouvrir({ stockage });
    await taper(vue, "Second");
    const { vue: rouverte } = await ouvrir({ stockage });
    assert.deepEqual(montre(rouverte), ["Second"]);
    assert.deepEqual(vu(rouverte), { centre: false, second: true });
    // Sur un écran large, la conversation n'est pas un onglet : le même projet s'y rouvre sur Rail, le second à droite.
    const { vue: large } = await ouvrir({ stockage, etroit: false });
    assert.deepEqual(titres(large), ["Rail", "Cooks"]);
    assert.deepEqual(montre(large), ["Rail"]);
    assert.deepEqual(vu(large), { centre: true, second: true });
  });

  test("Rail y est celui d'un écran large : ses colonnes, et la ligne qui ouvre Cooks", async () => {
    const { vue } = await ouvrir();
    assert.deepEqual(colonnes(vue), ["On the rail", "Taken", "Pass", "TODO", "WAITING", "Served"]);
    const alerte = vue.element("rail").dessous("p").find((p) => p.className === "alerte-de-cuisine") ?? assert.fail("pas de ligne d'alerte");
    assert.match(alerte.textContent, /atelier\/claude is saturated/);
    (alerte.dessous("button")[0] ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(montre(vue), ["Cooks"]);
  });
});

describe("l'onglet Cooks d'un écran étroit, en lecture seule", () => {
  test("chaque station a sa ligne, son état et ses cooks, et son seul geste est le bouton qui la lance ou l'arrête", async () => {
    const { vue, cuissons } = await ouvrir();
    await taper(vue, "Cooks");
    // Celles de la principale d'abord (#1786).
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "atelier/claude", "mac/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "saturated", "stopped"]);
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksDe(ligne(vue, "atelier/claude")), [AUCUN_COOK]);
    // Tout ce qui se clique dans l'onglet : un bouton par station, rien d'autre.
    assert.deepEqual(gestes(vue.element("rail")).map((bouton) => bouton.ariaLabel), ["stop cooking on box/claude", "stop cooking on atelier/claude", "start cooking on mac/claude"]);
    assert.deepEqual(lignes(vue).map((li) => gestes(li).length), [1, 1, 1]);
    // Ni la carte du projet, ni Taken et Pass — leurs fiches ont leurs gestes —, ni les serveurs de livraison.
    assert.deepEqual(colonnes(vue), []);
    assert.equal(dansLeRail(vue, "carte"), false);
    assert.equal(vue.element("rail").dessous("li").some((li) => li.className === "bon"), false);
    // Le bouton fait ce qu'il fait sur un écran large : le runtime est appelé pour cette station.
    gestes(ligne(vue, "box/claude"))[0]?.click();
    await repos();
    assert.deepEqual(cuissons, [[PARADE, "box/claude", "stop"]]);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length > 0, true);
  });

  test("aucun réglage : ni les stations à régler, ni le plafond, ni le bac à sable", async () => {
    const { vue } = await ouvrir();
    await taper(vue, "Cooks");
    // Les stations à régler — en ajouter une, déménager la cuisine, le bac à sable de celle qu'on choisit — sont rangées.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    // La lecture de `station` — le plafond, la machine, le quota — et le bouton qui règle le plafond ne sont pas posés.
    assert.equal(dansLeRail(vue, "lecture-cuisine"), false);
    assert.equal(dansLeRail(vue, "gestes-cuisine"), false);
    assert.notEqual(lecture(vue), "cooks");
    vue.dire("surLecture", { projet: PARADE, demande: 0, a: A, attend: undefined, sorties: [{ commande: "station", texte: STATION }] }, { projet: PARADE, pages: [], aLancer: [], illisibles: [], empeche: [] });
    await repos();
    const texte = vue.element("rail").textContent;
    for (const reglage of [/cap/i, /at most/, /quota/, /sandbox/i, /\+ station/, /move the kitchen/, /Set the cooks/, /ordinary/i]) assert.doesNotMatch(texte, reglage);
    assert.equal(gestes(vue.element("rail")).length, 3);
  });

  test("le runtime ne donne pas ses stations : une phrase le dit, sans geste", async () => {
    const { vue } = await ouvrir({ sansStations: true });
    await taper(vue, "Cooks");
    assert.deepEqual(lignes(vue), []);
    assert.match(vue.element("rail").textContent, /does not give them yet/);
    assert.deepEqual(gestes(vue.element("rail")), []);
  });
});

describe("sur un écran large, rien ne change", () => {
  test("deux onglets, et le second à droite quel que soit l'onglet ; Cooks porte ses stations et la lecture de `station`", async () => {
    const { vue } = await ouvrir({ etroit: false });
    assert.deepEqual(titres(vue), ["Rail", "Cooks"]);
    assert.deepEqual(vu(vue), { centre: true, second: true });
    await taper(vue, "Cooks");
    assert.deepEqual(vu(vue), { centre: true, second: true });
    assert.deepEqual(colonnes(vue), []);
    // La carte du projet est fondue dans le bloc de ses stations (#1456).
    assert.equal(dansLeRail(vue, "carte"), false);
    assert.equal(dansLeRail(vue, "cuisson-du-projet"), true);
    assert.equal(dansLeRail(vue, "lecture-cuisine"), true);
    assert.equal(lecture(vue), "cooks");
    assert.equal(vue.element("stations-du-projet").hidden, false);
    assert.deepEqual(lignes(vue).map((li) => gestes(li)[0]?.textContent), [BOUTONS_DE_CUISSON.stop.libelle, BOUTONS_DE_CUISSON.stop.libelle, BOUTONS_DE_CUISSON.start.libelle]);
  });

  test("la fenêtre qui se rétrécit passe à trois onglets, et qui s'élargit revient à deux, le second à droite", async () => {
    const { vue, ecran } = await ouvrir({ etroit: false });
    ecran.changer(true);
    await repos();
    assert.deepEqual(titres(vue), ["Rail", "Cooks", "Second"]);
    assert.deepEqual(vu(vue), { centre: true, second: false });
    await taper(vue, "Second");
    ecran.changer(false);
    await repos();
    assert.deepEqual(titres(vue), ["Rail", "Cooks"]);
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.deepEqual(vu(vue), { centre: true, second: true });
  });
});
