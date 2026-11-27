// L'onglet Stations d'un projet (#3195), la vue jouée : une seule ligne en tête, une carte par station qui sert le projet,
// « Details » replié, et « Move to another station » qui ouvre le choix — cet ordinateur d'abord — puis suit le déménagement
// sur la ligne du haut jusqu'à son terme, ou dit ce qui le bloque passée la minute (horloge simulée). Ni la cuisine locale,
// ni « + station », ni « not read yet », ni une station qui ne sert pas le projet ; « Add a station » (#3402) est le seul
// geste d'ajout.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type Demenagement, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { AJOUTER, ARRETER, DEPLACER, DETAILS } from "../../src/vue/stations-tab/stations-tab.js";
import { CHOISIR, PERSONNE, VERS_ICI } from "../../src/vue/stations-tab/etat.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-11T10:00:00.000Z";
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const station = (id: string, nom: string) => ({ id, nom, etat: "servi" as const, dit: "", autoriser: [] });
// parade, confié depuis l'app à sa box, où il cuit.
const SUR_LA_BOX: ProjetVu = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box"), station("gmac", "macbook")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const vuDes = (projet: ProjetVu): VuDesProjets => ({ a: A, projets: [projet], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) });

async function laPage(stations: StationVue[], vu: VuDesProjets, demenager: () => Demenagement = () => ({ demenage: { projet: "parade", de: "parade-box", vers: "macbook" } })) {
  const jouee = await jouerLaVue({
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
      stations: { a: A, stations } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: vu,
    }),
    demenagerLaCuisine: demenager,
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  await ouvrirOnglet(jouee, "Stations");
  return jouee;
}

const onglet = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const haut = (vue: Jouee) => onglet(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const phrase = (vue: Jouee) => haut(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";
const cartes = (vue: Jouee) => onglet(vue).dessous("section").filter(({ className }) => className === "carte-de-station");
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

describe("l'onglet Stations : une ligne en tête, une carte par station qui sert le projet (#3195)", () => {
  test("servi par la box : « Cooked by parade-box · online · idle… », vert ; une seule carte ; le Mac, qui ne le sert pas, nulle part", async () => {
    const vue = await laPage([BOX, MAC], vuDes(SUR_LA_BOX));
    assert.equal(onglet(vue).dessous("div").filter(({ className }) => className === "haut-des-stations").length, 1);
    assert.equal(phrase(vue), "Cooked by parade-box · online · idle, nothing on the rail");
    assert.equal(haut(vue).dataset.ton, "vert");
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["parade-box"]);
    const texte = onglet(vue).textContent;
    for (const absent of ["macbook", "+ station", "not read yet", "Local station", "All stations", "Station settings", "kitchen", "does not serve"]) assert.equal(texte.includes(absent), false, absent);
    // Un seul geste d'ajout, sous la ligne du haut : « Add a station » (#3402), qui ouvre le même choix que « Choose who cooks it ».
    assert.deepEqual(haut(vue).dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), [AJOUTER]);
    // L'en-tête du projet ne redit pas, au-dessus de l'onglet, qui le cuit.
    assert.equal(vue.element("stations-du-projet").hidden, true);
  });

  test("chaque carte : ce qu'elle est, son état, ce qu'elle tient, ses deux gestes, et « Details » replié", async () => {
    const vue = await laPage([BOX, MAC], vuDes(SUR_LA_BOX));
    const [box] = cartes(vue);
    assert.ok(box);
    assert.match(box.textContent, /always-on box: cooks while your computer sleeps/);
    assert.match(box.textContent, /online/);
    assert.match(box.textContent, /idle/);
    for (const geste of [DEPLACER, ARRETER]) bouton(box, geste);
    const details = box.dessous("details")[0] ?? assert.fail("pas de « Details »");
    assert.equal((details as unknown as { open?: boolean }).open, false);
    assert.equal(details.dessous("summary")[0]?.textContent.startsWith(DETAILS), true);
    // La connexion à Claude de la box se lit dans « Details », et nulle part ailleurs.
    assert.match(details.textContent, /Claude connection/);
    assert.equal(box.children.filter((enfant) => enfant !== details).some(({ textContent }) => textContent.includes("Claude connection")), false);
  });

  test("aucune station ne le sert : « No station cooks this project » et un seul bouton, qui ouvre le choix — cet ordinateur d'abord", async () => {
    const vue = await laPage([{ ...BOX, projets: [] }, MAC], vuDes({ ...SUR_LA_BOX, suiviPar: undefined, cuitSur: null, stations: [] }));
    assert.equal(phrase(vue), PERSONNE);
    assert.notEqual(haut(vue).dataset.ton, "vert");
    assert.deepEqual(cartes(vue), []);
    assert.deepEqual(haut(vue).dessous("button").map(({ textContent }) => textContent), [CHOISIR]);
  });

  test("la box hors ligne : elle le cuit, mais rien ne cuit ; « Move to this computer », d'un clic, le déménage ici", async () => {
    const vue = await laPage([{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC], vuDes(SUR_LA_BOX));
    assert.equal(phrase(vue), "parade-box cooks this project, but it is offline for 3 h: nothing cooks");
    assert.equal(haut(vue).dataset.ton, "rouge");
    // Comment la ramener, au survol de la ligne.
    assert.match(haut(vue).dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /switch parade-box on, or start its brigade-station service there/);
    bouton(haut(vue), VERS_ICI).click();
    await repos();
    assert.deepEqual(vue.dernier("demenagerLaCuisine"), ["parade", "gmac"]);
  });
});

describe("« Move to another station » : le choix, puis la ligne du haut suit le déménagement (#3195)", () => {
  test("cet ordinateur d'abord ; choisi, « Moving from A to B: waiting for … » depuis le clic ; passée la minute, ce qui le bloque ; fini, « Cooked by B »", async (t) => {
    const depart = Date.parse("2026-11-11T10:05:00.000Z");
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: depart });
    const vue = await laPage([BOX, MAC], vuDes(SUR_LA_BOX));
    const [box] = cartes(vue);
    bouton(box ?? assert.fail(), DEPLACER).click();
    await repos();
    const choix = onglet(vue).dessous("section").find(({ className }) => className === "choix-des-stations") ?? assert.fail("pas de choix");
    assert.deepEqual(choix.dessous("li").map(({ dataset }) => dataset.choix), ["gmac"]);
    assert.equal(choix.dessous("li")[0]?.dessous("button")[0]?.textContent, "this computer");
    choix.dessous("li")[0]?.dessous("button")[0]?.click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("demenagerLaCuisine"), ["parade", "gmac"]);
    assert.equal(phrase(vue), "Moving from parade-box to macbook: waiting for macbook to take the kitchen over, since 10:05 UTC");
    assert.equal(haut(vue).dataset.ton, "jaune");
    // La station visée a sa carte, qui démarre ; aucune phrase « kitchen moves to » ne double la ligne du haut.
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["macbook", "parade-box"]);
    assert.equal(onglet(vue).textContent.includes("moves to"), false);

    // Une minute passe, rien n'est publié : la ligne dit ce qui le bloque.
    t.mock.timers.tick(60_000);
    await repos();
    assert.match(haut(vue).textContent, /Not done after a minute: macbook has not answered for 1 min/);

    // Les stations publient la fin : le Mac le sert, la box plus.
    vue.dire("surStations", { a: A, stations: [{ ...BOX, projets: [] }, { ...MAC, projets: ["parade"] }] });
    vue.dire("surProjetsDesStations", vuDes({ ...SUR_LA_BOX, cuitSur: { id: "gmac", nom: "macbook", ici: true } }));
    await repos();
    assert.equal(phrase(vue), "Cooked by macbook · online · idle, nothing on the rail");
    assert.equal(haut(vue).dataset.ton, "vert");
    assert.deepEqual(cartes(vue).map(({ ariaLabel }) => ariaLabel), ["macbook"]);
  });

  test("refusé par le runtime : la ligne du haut reste la même, la raison se dit en une ligne", async () => {
    const vue = await laPage([BOX, MAC], vuDes(SUR_LA_BOX), () => ({ refus: "this computer has no sandbox", detail: "sandbox-exec missing" }));
    bouton(cartes(vue)[0] ?? assert.fail(), DEPLACER).click();
    await repos();
    onglet(vue).dessous("li")[0]?.dessous("button")[0]?.click();
    await repos();
    await repos();
    assert.equal(phrase(vue), "Cooked by parade-box · online · idle, nothing on the rail");
    assert.match(onglet(vue).textContent, /parade stays on parade-box: this computer has no sandbox/);
  });
});
