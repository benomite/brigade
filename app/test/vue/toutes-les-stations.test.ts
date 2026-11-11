// Sur l'onglet Stations, une carte par station qui sert le projet, chacune une fois (#1786, #3195) : celles que `facts`
// donne — rattachées à la station appairée qui porte leur nom —, et celles que la principale déclare sans qu'elles s'y
// soient annoncées. Une station appairée qui ne sert pas le projet n'en a pas. Chacune dit son état — vert seulement en
// ligne, et jamais pour une station que la cuisine ne voit pas (#1830) —, ce qu'elle cuit, et, dans « Details », ses cooks à
// la fois — une rangée de réglage, dont le champ s'applique dès qu'il change (#2920). La vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import { lireStations, type Guide, type StationChangee, type StationsLues, type StationVoulue } from "../../src/service.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { APPLIQUE, plafondDit } from "../../src/vue/stations-declarees.js";
import { PAS_ANNONCEE } from "../../src/vue/stations-tab/etat.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-27T10:04:12.000Z";
const PARADE = "parade";

// Les stations appairées du compte : la box, qui sert parade, ce Mac et un PC.
const appairee = (id: string, nom: string, projets: string[] = []) => ({ id, nom, machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets, max: null }) as const;
const BOX = appairee("gbox", "box", [PARADE]);
const MAC = appairee("gmac", "macbook");
const PC = appairee("gpc", "pc");
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC, PC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };

// parade cuit sur la box ; l'app lui a ajouté ce Mac, que la box dit atteint, et le PC, qui n'a pas encore lu la demande.
const SUR_LA_BOX: ProjetVu = {
  nom: PARADE,
  depot: "benomite/parade",
  base: "main",
  suiviPar: { id: "gbox", nom: "box" },
  stations: [
    { id: "gbox", nom: "box", etat: "servi", dit: "served by box", autoriser: [] },
    { id: "gmac", nom: "macbook", etat: "servi", dit: "it is online on GitHub", autoriser: [] },
    { id: "gpc", nom: "pc", etat: "attendu", dit: "pc has not read it yet", autoriser: [] },
  ],
  servi: null,
  cuitSur: { id: "gbox", nom: "box", ici: false },
  demenagement: null,
};
const vuDes = (...projets: ProjetVu[]): VuDesProjets => ({ a: A, projets, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC), gpc: machineProposee(PC) }, calibrage: calibrageRecommande([]) });

type DuRuntime = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({ station: nom, distante: false, plafond: 3, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [], ...plus });
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// `facts` de la box : elle seule s'y est annoncée — le Mac, déclaré, ne l'a pas encore fait.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-27T10:04:11.000Z",
  dernierTick: "2026-10-27T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/parade/issues/14", activite: null }],
  cooks: [COOK_14],
  attend: [],
};
const STATIONS_DES_FAITS = [station("box/claude", { cooks: [COOK_14] })];

// Ce que la box déclare (`installation stations --json`) : elle-même, et ce Mac que l'app lui a ajouté.
const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "macbook/claude", moteur: "claude", fournit: ["code", "raisonnement", "navigateur-headless"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station runs with the app" },
  termine: true,
  controle: { a: A, stations },
});

const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const demarrage = (vu: VuDesProjets) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations: vu,
});

async function ouvrir(
  vu: VuDesProjets = vuDes(SUR_LA_BOX),
  stations: DuRuntime[] = STATIONS_DES_FAITS,
  declarees: StationsLues = DECLAREES,
  changerUneStation: (projet: string, nom: string, voulu: StationVoulue) => StationChangee | Promise<StationChangee> = (_, nom) => ({ fait: `${nom} saved; the other stations are unchanged` }),
): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(vu), espace: () => [], service: () => guide(declarees), defautsDeStation: () => ({ refus: "pas ici" }), changerUneStation });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

// Les cartes de l'onglet, par leur clé (le gist de la station appairée, sinon son nom), et leur état.
const lignes = (vue: Jouee) => vue.element("rail").dessous("section").filter((pose) => pose.className === "carte-de-station");
const ligne = (vue: Jouee, cle: string) => lignes(vue).find((pose) => pose.dataset.station === cle) ?? assert.fail(`pas de carte pour ${cle}`);
const pilule = (pose: Faux) => pose.dessous("span").find(({ className }) => className === "pilule etat");
const etatDe = (pose: Faux) => [pilule(pose)?.dessous("strong")[0]?.textContent, pilule(pose)?.dataset.ton];
const plafondDe = (pose: Faux) => pose.dessous("div").find(({ className, dataset }) => className === "reglage" && dataset.cle === "cooks") ?? assert.fail(`pas de rangée des cooks sous ${pose.dataset.station}`);
const champDuPlafond = (pose: Faux) => plafondDe(pose).dessous("input")[0] ?? assert.fail(`pas de champ du plafond sous ${pose.dataset.station}`);
const ditSous = (pose: Faux) => plafondDe(pose).children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]);

describe("une carte par station qui sert le projet, chacune une fois (#1786, #3195)", () => {
  test("celle de `facts`, rattachée à sa station appairée ; celle que la box déclare sans qu'elle s'y soit annoncée ; pas celle qui ne le sert pas", async () => {
    const vue = await ouvrir();
    assert.deepEqual(lignes(vue).map(({ dataset }) => dataset.station), ["gbox", "macbook/claude"]);
    // La box est en ligne, et cuit #14 ; le Mac, déclaré, ne s'est pas annoncé : pas de vert. Le PC, ajouté par l'app mais qui
    // ne sert pas le projet, n'est nulle part dans l'onglet.
    assert.deepEqual(lignes(vue).map(etatDe), [["online", "vert"], [PAS_ANNONCEE, "gris"]]);
    assert.match(ligne(vue, "gbox").textContent, /#14/);
    assert.match(ligne(vue, "macbook/claude").textContent, /idle/);
    const onglet = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet");
    assert.doesNotMatch(onglet.textContent, /\bpc\b|what each station provides|not received by the station|check again/);
    // Ses cooks à la fois, dans « Details » : sa rangée, et son champ.
    assert.equal(plafondDe(ligne(vue, "macbook/claude")).children[1]?.children[0]?.textContent, plafondDit(2));
    assert.equal(champDuPlafond(ligne(vue, "macbook/claude")).value, "2");
  });

  test("le Mac s'annonce dans `facts` : il a toujours une seule carte, la sienne, et il est en ligne", async () => {
    const vue = await ouvrir();
    const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [...STATIONS_DES_FAITS, station("macbook/claude", { distante: true })] }) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(lignes(vue).map(({ dataset }) => dataset.station), ["gmac", "gbox"]);
    assert.deepEqual(etatDe(ligne(vue, "gmac")), ["online", "vert"]);
  });

  test("toutes les cartes se disent de la même façon : aucun geste de la cuisine, ni « move the kitchen »", async () => {
    const vue = await ouvrir();
    assert.equal(vue.element("rail").dessous("button").some(({ textContent }) => textContent === "move the kitchen"), false);
    const formes = lignes(vue).map((pose) => pose.children.map(({ balise, className }) => className || balise).slice(0, 2));
    assert.deepEqual(formes, formes.map(() => ["header", "ce-qu-elle-est"]));
  });

  test("le plafond d'une station se règle dans « Details », sans « Save » : changé, il part aussitôt, la déclaration entière avec lui", async () => {
    let lacher = () => {};
    const retenue = new Promise<void>((resolu) => (lacher = resolu));
    const vue = await ouvrir(vuDes(SUR_LA_BOX), STATIONS_DES_FAITS, DECLAREES, async (_, nom) => {
      await retenue;
      return { fait: `${nom} saved; the other stations are unchanged` };
    });
    assert.equal(ligne(vue, "macbook/claude").dessous("button").some(({ textContent }) => /^(save|saving…|set the cap)$/i.test(textContent)), false);
    const champ = champDuPlafond(ligne(vue, "macbook/claude"));
    champ.value = "4";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "macbook/claude", { cooks: 4, fournit: ["code", "raisonnement", "navigateur-headless"] }]);
    // En route : sa rangée le dit, son champ attend.
    assert.deepEqual(ditSous(ligne(vue, "macbook/claude")), [["dit en-cours", APPLIQUE]]);
    assert.equal(champDuPlafond(ligne(vue, "macbook/claude")).disabled, true);
    lacher();
    await repos();
    assert.deepEqual(ditSous(ligne(vue, "macbook/claude")), [["dit fait", "macbook/claude saved; the other stations are unchanged"]]);
    assert.equal(champDuPlafond(ligne(vue, "macbook/claude")).disabled, false);
  });

  test("un plafond refusé : le refus sous sa rangée, et le champ revient à la valeur en vigueur", async () => {
    const vue = await ouvrir(vuDes(SUR_LA_BOX), STATIONS_DES_FAITS, DECLAREES, (_, nom) => ({ refus: `Nothing was saved: how many cooks ${nom} runs at once is a whole number, from 1 to 99.`, detail: "exit 2" }));
    const champ = champDuPlafond(ligne(vue, "macbook/claude"));
    champ.value = "0";
    champ.declencher("input");
    champ.declencher("change");
    await repos();
    const pose = ligne(vue, "macbook/claude");
    assert.deepEqual(ditSous(pose).map(([classe]) => classe), ["dit refus"]);
    assert.match(plafondDe(pose).textContent, /whole number, from 1 to 99/);
    assert.equal(champDuPlafond(pose).value, "2");
  });
});

describe("chaque carte dit sa station telle que `facts` la voit (#1830)", () => {
  // mirrorscreen : la box déclare le Mac mais il ne s'est jamais manifesté à elle ; l'app, elle, le lit en ligne sur GitHub.
  const SANS_DECLARATION = lireStations(JSON.stringify({ etape: { id: "stations", etat: "faite" }, proposees: [], absent: null, declarees: [] })) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
  const LA_BOX = station("box/claude", { cooks: [COOK_14], fournit: ["code", "raisonnement"], presente: true, vueLe: null });
  const LE_MAC = station("macbook/claude", { distante: true, ensemble: true, fournit: ["code", "raisonnement", "navigateur-headless", "macos"], presente: false, vueLe: null });

  test("que la box ne voit pas, le Mac ne cuit pas — jamais vert, même en ligne sur GitHub ; la box, elle, est en ligne", async () => {
    const vue = await ouvrir(vuDes(SUR_LA_BOX), [LA_BOX, LE_MAC], SANS_DECLARATION);
    assert.deepEqual(etatDe(ligne(vue, "gmac")), ["not seen by the kitchen", "rouge"]);
    assert.deepEqual(etatDe(ligne(vue, "gbox")), ["online", "vert"]);
  });

  test("le Mac se manifeste à la box : il est en ligne ; tu depuis, il le redit, et depuis quand", async () => {
    const vue = await ouvrir(vuDes(SUR_LA_BOX), [LA_BOX, { ...LE_MAC, presente: true, vueLe: "2026-10-27T10:03:00.000Z" }], SANS_DECLARATION);
    assert.deepEqual(etatDe(ligne(vue, "gmac")), ["online", "vert"]);
    const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [LA_BOX, { ...LE_MAC, vueLe: "2026-10-27T10:03:00.000Z" }] }) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(etatDe(ligne(vue, "gmac")), ["not seen by the kitchen for 1 min", "rouge"]);
  });
});
