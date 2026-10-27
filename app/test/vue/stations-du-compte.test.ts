// Les stations enregistrées sous le compte GitHub du chef (#1706, épique 1702), dans la liste des stations de l'accueil
// (#1778, épique 1777) : une ligne par machine — une machine appairée se dit par sa présence, et son enregistrement ne
// pose ni seconde ligne, ni section « Under your GitHub account » ; une machine seulement enregistrée a sa ligne, en
// ligne ou non, avec les projets qu'elle sert ; ouverte, les projets du chef à cocher, chaque case écrite aussitôt ; sans
// station, la commande qui en installe une. Les stations sont écrites par les fonctions mêmes du runtime (`stationDuGist`,
// `echecDeGh`) : ce que la vue pose est ce qu'elle recevra. La vue jouée entière va jusqu'au gist : ce qui est coché est
// écrit selon le contrat (stations-du-compte.ts), relu par le lecteur du runtime au lancement suivant, et coché encore.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Accueil, type LigneDeStation, ligneDeStation } from "../../src/accueil.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { choixDesProjets, type StationEnregistree, type StationsDuCompte } from "../../src/stations-du-compte.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import {
  AUCUNE,
  COPIEE,
  COPIER,
  DEPOTS_ILLISIBLES,
  EN_SON_ABSENCE,
  ENVOI,
  ILLISIBLES,
  INSTALLER,
  LECTURE_DES_DEPOTS,
  lectureDuCompte,
  ligneDeLEnregistree,
  RELIRE,
  SANS_DEPOT,
  uneLigneParMachine,
  type EtatDuCompte,
  type GestesDuCompte,
} from "../../src/vue/stations-du-compte.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VU = "2026-10-26T09:42:00.000Z";
const LU = Date.parse(VU) + 1_000;

// L'enregistrement qu'une station publie (runtime/src/enregistrement-station/README.md), tel quel.
const enregistrement = (name: string, platform: string, machine: string, stoppedAt: string | null, lastSeen = VU) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen, refreshMs: 120_000, stoppedAt });
// Une station telle que le lecteur du runtime la rend de son gist.
function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "chef", LU);
  return "illisible" in station ? assert.fail(station.illisible) : station;
}
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: VU });

// La box tourne et sert acme/shop ; le Mac s'est arrêté proprement, et rien ne lui est encore choisi.
const BOX = lue("a1b2c3", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("box", "linux", "Linux 6.1.0", null), [contrat.FICHIER_SELECTION]: selection(["acme/shop"]) });
const MAC = lue("d4e5f6", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", VU) });
const LISTEES: StationsDuCompte = { state: "listed", stations: [BOX, MAC], unreadable: [] };
const AUCUNE_LISTEE: StationsDuCompte = { state: "listed", stations: [], unreadable: [], reason: "No station is registered under this GitHub account yet: install brigade's station on a machine, and sign it in to this account." };
const DEPOTS = { depots: [{ depot: "acme/shop", base: "main" }, { depot: "acme/site", base: "main" }] };
// Ce `gh` n'a pas de compte ; ou GitHub ne répond pas.
const SANS_COMPTE = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
const SANS_RESEAU = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Ce que la vue pose d'après les stations du compte : la ligne de chacune, puis ce que leur lecture dit sous la liste.
function unBloc(etat: EtatDuCompte, vide = false) {
  const faits: string[] = [];
  const gestes: GestesDuCompte = {
    ouvrir: (id) => void faits.push(`ouvrir ${id}`),
    fermer: () => void faits.push("fermer"),
    choisir: (id, depots) => void faits.push(`choisir ${id} [${depots.join(", ")}]`),
    relire: () => void faits.push("relire"),
    seConnecter: () => void faits.push("se connecter"),
    ouvrirLaPage: (url) => void faits.push(`page ${url}`),
    copier: (commande) => void faits.push(`copier ${commande}`),
  };
  const bloc = new Faux("div");
  const stations = etat.stations?.state === "listed" ? etat.stations.stations : [];
  bloc.append(...stations.map((station) => ligneDeLEnregistree(doc, station, etat, gestes) as Faux), ...(lectureDuCompte(doc, etat, gestes, vide) as Faux[]));
  return { bloc, faits, ...lecteurs(bloc) };
}

// Ce qui se lit du bloc : la ligne d'une station, ses cases, un bouton par son texte, ses lignes en échec.
function lecteurs(bloc: Faux) {
  const ligne = (nom: string) => bloc.dessous("button").find((bouton) => bouton.className === "ligne" && bouton.dessous("strong")[0]?.textContent === nom) ?? assert.fail(`pas de ligne « ${nom} »`);
  const cases = () => bloc.dessous("input").filter((entree) => entree.type === "checkbox");
  const caseDe = (depot: string) => cases().find((entree) => entree.ariaLabel === depot) ?? assert.fail(`pas de case « ${depot} » : ${cases().map(({ ariaLabel }) => ariaLabel).join(", ")}`);
  const bouton = (texte: string) => bloc.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${bloc.dessous("button").map((b) => b.textContent).join(", ")}`);
  const textes = () => bloc.dessous("p").map((p) => p.textContent);
  const enEchec = () => bloc.dessous("p").filter((p) => p.className === "indisponible");
  const auSurvol = (pose: Faux) => pose.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel).join("\n");
  return { ligne, cases, caseDe, bouton, textes, enEchec, auSurvol };
}
const cocher = (coche: Faux, voulue: boolean) => {
  coche.checked = voulue;
  coche.declencher("change");
};

describe("une ligne par machine : appairée, elle se dit par sa présence ; seulement enregistrée, par son enregistrement", () => {
  const appairee = (nom: string) => ({ nom });
  const noms = (lignes: ReturnType<typeof uneLigneParMachine<{ nom: string }>>) => lignes.map((ligne) => ("appairee" in ligne ? `appairée ${ligne.appairee.nom}` : `enregistrée ${ligne.enregistree.name}`));

  test("une machine appairée et enregistrée ne fait qu'une ligne, celle de sa présence — même nommée dans une autre casse", () => {
    assert.deepEqual(noms(uneLigneParMachine([appairee("box")], [BOX])), ["appairée box"]);
    assert.deepEqual(noms(uneLigneParMachine([appairee("Box")], [BOX])), ["appairée Box"]);
  });

  test("une machine seulement enregistrée a sa ligne, glissée à son nom : les appairées gardent leur ordre", () => {
    const nas = lue("e2d4", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0", null) });
    const alpha = lue("e0a0", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("alpha", "linux", "Linux 6.1.0", null) });
    assert.deepEqual(noms(uneLigneParMachine([appairee("box"), appairee("parade-box")], [nas, BOX, MAC, alpha])), ["enregistrée alpha", "appairée box", "enregistrée mac", "enregistrée nas", "appairée parade-box"]);
  });

  test("deux enregistrements d'une même machine n'en font qu'une : celui qui est en ligne, sinon le dernier vu", () => {
    const ancien = lue("0ld", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", "2026-10-20T08:00:00.000Z", "2026-10-20T08:00:00.000Z") });
    const enLigne = lue("n3w", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", null) });
    assert.deepEqual(uneLigneParMachine([], [ancien, enLigne]), [{ enregistree: enLigne }]);
    assert.deepEqual(uneLigneParMachine([], [MAC, ancien]), [{ enregistree: MAC }]);
  });
});

describe("la ligne d'une station seulement enregistrée : en ligne ou non, et les projets qu'elle sert", () => {
  test("son nom, en ligne ou non, puis les projets qu'elle sert — ou qu'aucun ne lui est encore choisi", () => {
    const { bloc, ligne } = unBloc({ stations: LISTEES });
    assert.deepEqual(
      bloc.dessous("button").filter(({ className }) => className === "ligne").map((pose) => pose.dessous("strong")[0]?.textContent),
      ["box", "mac"],
    );
    assert.match(ligne("box").textContent, /online · acme\/shop/);
    assert.match(ligne("mac").textContent, /offline · no project chosen yet/);
    const sans = unBloc({ stations: { ...LISTEES, stations: [{ ...BOX, selection: [] }] } });
    assert.match(sans.ligne("box").textContent, /online · no project/);
  });

  test("la pastille dit en ligne ou non : un disque vert, un anneau gris — la plateforme, la machine et la version au survol", () => {
    const { ligne } = unBloc({ stations: LISTEES });
    const pastille = (nom: string) => ligne(nom).children.find(({ className }) => className === "pastille") ?? assert.fail("pas de pastille");
    assert.deepEqual([pastille("box").dataset.ton, pastille("box").dataset.forme], ["vert", "disque"]);
    assert.deepEqual([pastille("mac").dataset.ton, pastille("mac").dataset.forme], ["gris", "anneau"]);
    assert.match(ligne("mac").title, /macOS · macOS 24\.1\.0 · version 1\.4\.0 · last sign of life 2026-10-26 09:42 UTC/);
  });

  test("un clic sur une ligne l'ouvre, un autre la referme", () => {
    const fermee = unBloc({ stations: LISTEES });
    assert.equal(fermee.ligne("box").ariaExpanded, "false");
    fermee.ligne("box").click();
    assert.deepEqual(fermee.faits, [`ouvrir ${BOX.id}`]);
    assert.deepEqual(fermee.cases(), [], "une station fermée ne montre pas ses cases");
    const ouverte = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS });
    assert.equal(ouverte.ligne("box").ariaExpanded, "true");
    ouverte.ligne("box").click();
    assert.deepEqual(ouverte.faits, ["fermer"]);
  });

  test("une registration illisible se dit en une ligne sous la liste, sa raison au survol, et « read again »", () => {
    const { enEchec, auSurvol, bouton, faits } = unBloc({ stations: { ...LISTEES, unreadable: [{ id: "f00", reason: "its registration is not JSON" }] } });
    const [ligne, ...autres] = enEchec();
    assert.ok(ligne !== undefined && autres.length === 0);
    assert.equal(ligne.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.match(auSurvol(ligne), /f00: its registration is not JSON/);
    bouton(RELIRE).click();
    assert.deepEqual(faits, ["relire"]);
  });

  test("tout listé, rien ne se dit sous la liste : ni titre, ni « read again »", () => {
    const { bloc } = unBloc({ stations: LISTEES });
    assert.deepEqual(bloc.dessous("h3"), []);
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => textContent === RELIRE), []);
  });
});

describe("la sélection : les projets du chef à cocher, chaque case écrite aussitôt", () => {
  test("ouverte, une station montre les dépôts du chef, cochés s'il les lui a choisis", () => {
    const { cases } = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS });
    assert.deepEqual(cases().map(({ ariaLabel, checked, disabled }) => [ariaLabel, checked, disabled]), [["acme/shop", true, false], ["acme/site", false, false]]);
  });

  test("cocher ou décocher envoie la sélection entière, dans l'ordre des cases", () => {
    const coche = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS });
    cocher(coche.caseDe("acme/site"), true);
    const decoche = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS });
    cocher(decoche.caseDe("acme/shop"), false);
    assert.deepEqual([...coche.faits, ...decoche.faits], [`choisir ${BOX.id} [acme/shop, acme/site]`, `choisir ${BOX.id} []`]);
  });

  test("un dépôt qu'elle sert et que la liste du chef ne nomme plus garde sa case, cochée — et se décoche", () => {
    const ancienne = { ...BOX, selection: ["acme/old"] };
    const { cases, caseDe, faits } = unBloc({ stations: { ...LISTEES, stations: [ancienne] }, ouverte: BOX.id, depots: DEPOTS });
    assert.deepEqual(cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", false], ["acme/site", false], ["acme/old", true]]);
    cocher(caseDe("acme/old"), false);
    assert.deepEqual(faits, [`choisir ${BOX.id} []`]);
  });

  test("une station hors ligne le dit, et ses cases restent à cocher", () => {
    const { textes, cases, caseDe, faits } = unBloc({ stations: LISTEES, ouverte: MAC.id, depots: DEPOTS });
    assert.ok(textes().includes(EN_SON_ABSENCE), textes().join(" | "));
    assert.deepEqual(cases().map(({ checked, disabled }) => [checked, disabled]), [[false, false], [false, false]]);
    cocher(caseDe("acme/site"), true);
    assert.deepEqual(faits, [`choisir ${MAC.id} [acme/site]`]);
  });

  test("pendant l'écriture, les cases attendent ; refusée, la raison tient en une ligne, son détail au survol", () => {
    const enRoute = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS, envoi: BOX.id });
    assert.ok(enRoute.cases().every(({ disabled }) => disabled), "une case reste cliquable pendant l'écriture");
    assert.ok(enRoute.textes().includes(ENVOI));
    const refusee = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: DEPOTS, refus: { id: BOX.id, refus: "not saved: GitHub did not take the change", detail: "HTTP 502: Bad Gateway" } });
    const [ligne, ...autres] = refusee.enEchec();
    assert.ok(ligne !== undefined && autres.length === 0);
    assert.equal(ligne.dessous("span")[0]?.textContent, "not saved: GitHub did not take the change");
    assert.match(refusee.auSurvol(ligne), /HTTP 502/);
    // La case n'a pas changé : la sélection posée est celle du gist.
    assert.equal(refusee.caseDe("acme/shop").checked, true);
    assert.ok(refusee.cases().every(({ disabled }) => !disabled));
  });

  test("les dépôts du chef en lecture, sans aucun, ou illisibles : chacun se dit, et ce qu'elle sert reste décochable", () => {
    assert.ok(unBloc({ stations: LISTEES, ouverte: BOX.id }).textes().includes(LECTURE_DES_DEPOTS));
    assert.ok(unBloc({ stations: LISTEES, ouverte: MAC.id, depots: { depots: [] } }).textes().includes(SANS_DEPOT));
    const illisibles = unBloc({ stations: LISTEES, ouverte: BOX.id, depots: { refus: "`gh` is not on this machine" } });
    assert.equal(illisibles.enEchec()[0]?.dessous("span")[0]?.textContent, DEPOTS_ILLISIBLES);
    assert.deepEqual(illisibles.cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", true]]);
  });
});

describe("sans aucune station dans la liste : dessous, comment en installer une", () => {
  test("la phrase, puis la commande d'installation de chaque système, que copie un bouton", () => {
    const { bloc, textes, faits } = unBloc({ stations: AUCUNE_LISTEE }, true);
    // La phrase, puis son aide au survol.
    assert.ok(textes().some((texte) => texte.startsWith(AUCUNE)), textes().join(" | "));
    assert.deepEqual(bloc.dessous("code").map(({ textContent }) => textContent), INSTALLER.map(({ commande }) => commande));
    assert.match(INSTALLER[0]?.commande ?? "", /installer-station\.sh \| sh$/);
    assert.match(INSTALLER[1]?.commande ?? "", /installer-station\.ps1 \| iex$/);
    const copier = bloc.dessous("button").filter(({ textContent }) => textContent === COPIER);
    assert.equal(copier.length, 2);
    copier[1]?.click();
    assert.deepEqual(faits, [`copier ${INSTALLER[1]?.commande}`]);
  });

  test("copiée, son bouton le dit ; « read again » relit", () => {
    const { bloc, bouton, faits } = unBloc({ stations: AUCUNE_LISTEE, copiee: INSTALLER[0]?.commande ?? "" }, true);
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => textContent === COPIER || textContent === COPIEE).map(({ textContent }) => textContent), [COPIEE, COPIER]);
    bouton(RELIRE).click();
    assert.deepEqual(faits, ["relire"]);
  });

  test("une station appairée dans la liste : rien ne dit d'en installer une", () => {
    assert.deepEqual(unBloc({ stations: AUCUNE_LISTEE }, false).bloc.children, []);
  });
});

describe("sous la liste : la lecture en route, la connexion qui manque, la lecture qui échoue", () => {
  test("en lecture, rien ne s'y pose", () => {
    assert.deepEqual(unBloc({}).bloc.children, []);
  });

  test("sans compte GitHub : la phrase du runtime, et le bouton de la connexion", () => {
    assert.equal(SANS_COMPTE.state, "sign-in-required");
    if (SANS_COMPTE.state !== "sign-in-required") return;
    const { bouton, faits } = unBloc({ stations: SANS_COMPTE });
    bouton(SANS_COMPTE.action.label).click();
    assert.deepEqual(faits, ["se connecter"]);
  });

  test("GitHub injoignable : une ligne, la raison au survol, et « read again »", () => {
    const { enEchec, auSurvol, bouton, faits } = unBloc({ stations: SANS_RESEAU });
    const [ligne, ...autres] = enEchec();
    assert.ok(ligne !== undefined && autres.length === 0);
    assert.equal(ligne.dessous("span")[0]?.textContent, ILLISIBLES);
    assert.match(auSurvol(ligne), new RegExp(SANS_RESEAU.reason.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    bouton(RELIRE).click();
    assert.deepEqual(faits, ["relire"]);
  });
});

// La vue jouée entière : l'app, qui a un projet, s'ouvre sur l'accueil — avec, quand ils sont donnés, les stations
// appairées et leurs lignes telles que le process principal les dit (accueil.ts).
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const demarrage = (stations?: VuDesStations, accueil?: Accueil) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
  ...(accueil === undefined ? {} : { accueil }),
});
// Les stations appairées, et l'accueil qui les dit : chaque ligne écrite par `ligneDeStation`, comme le process principal.
function appairees(...stations: StationVue[]): { stations: VuDesStations; accueil: Accueil } {
  const lignes: LigneDeStation[] = stations.map((station) => ligneDeStation(station, 0, false));
  return { stations: { a: VU, stations }, accueil: { projets: [], stations: lignes, sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } };
}
const presence = (id: string, nom: string, projets: string[]): StationVue => ({ id, nom, machine: "Debian 12", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "1.4.0", projets, max: null });

const section = (vue: Jouee) => vue.element("accueil-stations");
// Les lignes de la liste des stations : chaque bouton `ligne`, par le nom qu'il porte.
const lignesDe = (vue: Jouee) => section(vue).dessous("button").filter(({ className }) => className === "ligne");
const nomsDe = (vue: Jouee) => lignesDe(vue).map((ligne) => ligne.dessous("strong")[0]?.textContent);
async function accueil(vue: Jouee) {
  vue.element("entree-tous").click();
  await repos();
  return lecteurs(section(vue));
}

describe("la vue jouée : une seule liste de stations, une ligne par machine", () => {
  test("une machine appairée et enregistrée sous le compte ne fait qu'une ligne : celle de sa présence, avec ses projets", async () => {
    // parade-box fait la cuisine de deux projets, mais rien ne lui est choisi sous le compte ; nas n'est qu'enregistrée.
    const box = lue("e3e5", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0", null) });
    const nas = lue("e2d4", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0", null), [contrat.FICHIER_SELECTION]: selection(["acme/shop"]) });
    const { stations, accueil: lignes } = appairees(presence("f0a1", "parade-box", ["brigade", "espace"]));
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lignes), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [nas, box], unreadable: [] }) });
    const lus = await accueil(vue);
    assert.deepEqual(nomsDe(vue), ["nas", "parade-box"], "chaque machine, une fois");
    assert.match(lus.ligne("parade-box").textContent, /online · idle · brigade, espace/);
    assert.doesNotMatch(section(vue).textContent, /no project chosen yet|runs no kitchen/, "parade-box sert des projets : rien ne dit le contraire");
    assert.match(lus.ligne("nas").textContent, /online · acme\/shop/);
    // Une seule liste : ni titre, ni section des stations du compte qui en porterait une seconde.
    assert.deepEqual(section(vue).dessous("h3"), []);
    assert.doesNotMatch(vue.element("tous").textContent, /Under your GitHub account/);
    assert.deepEqual(section(vue).dessous("ul"), []);
  });

  test("cocher un projet l'écrit dans le gist de la station ; relancée, l'app le montre coché", async () => {
    // Le gist de la box, tel que GitHub le garde : son enregistrement, puis ce que l'app y écrit.
    const gist: Record<string, string> = { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("box", "linux", "Linux 6.1.0", null) };
    const ecrits: string[][] = [];
    const choisir = choixDesProjets({
      ecrire: async (_id, fichiers) => {
        ecrits.push(Object.keys(fichiers));
        Object.assign(gist, fichiers);
      },
      contrat: async () => contrat,
      maintenant: () => LU,
    });
    const lire = (): StationsDuCompte => ({ state: "listed", stations: [lue(BOX.id, gist)], unreadable: [] });
    const { stations, accueil: lignes } = appairees();
    const reponses = { demarrage: () => demarrage(stations, lignes), espace: () => [], stationsDuCompte: lire, depotsDuChef: () => DEPOTS, choisirLesProjets: (id: string, depots: string[]) => choisir(id, depots) };

    const vue = await jouerLaVue(reponses);
    const premier = await accueil(vue);
    assert.match(premier.ligne("box").textContent, /online · no project chosen yet/);
    premier.ligne("box").click();
    await repos();
    assert.ok(vue.appels.some(({ geste }) => geste === "depotsDuChef"), "les dépôts du chef ne sont pas lus");
    const ouvert = lecteurs(section(vue));
    assert.deepEqual(ouvert.cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", false], ["acme/site", false]]);
    cocher(ouvert.caseDe("acme/site"), true);
    await repos();
    assert.deepEqual(vue.dernier("choisirLesProjets"), [BOX.id, ["acme/site"]]);
    assert.deepEqual(ecrits, [[contrat.FICHIER_SELECTION]], "l'app écrit un autre fichier que la sélection");
    const apres = lecteurs(section(vue));
    assert.match(apres.ligne("box").textContent, /online · acme\/site/);
    assert.equal(apres.caseDe("acme/site").checked, true);

    // Relancée : la sélection est relue dans le gist, par le lecteur du runtime.
    const relancee = await jouerLaVue(reponses);
    const relu = await accueil(relancee);
    assert.match(relu.ligne("box").textContent, /online · acme\/site/);
    relu.ligne("box").click();
    await repos();
    const rouvert = lecteurs(section(relancee));
    assert.deepEqual(rouvert.cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", false], ["acme/site", true]]);
  });

  test("sans aucune station, ni appairée ni sous le compte, l'accueil dit comment en installer une", async () => {
    const { stations, accueil: lignes } = appairees();
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lignes), espace: () => [], stationsDuCompte: () => AUCUNE_LISTEE });
    const lus = await accueil(vue);
    assert.ok(lus.textes().some((texte) => texte.startsWith(AUCUNE)));
    assert.equal(section(vue).dessous("code").length, INSTALLER.length);
    assert.ok(!lus.textes().some((texte) => texte.startsWith("no station yet")), "l'absence se dit une fois");
  });

  test("un pont qui ne lit pas les stations du compte ne pose que les stations appairées", async () => {
    const { stations, accueil: lignes } = appairees(presence("f0a1", "parade-box", ["brigade"]));
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lignes), espace: () => [] });
    await accueil(vue);
    assert.deepEqual(nomsDe(vue), ["parade-box"]);
    assert.equal(section(vue).dessous("section").every(({ hidden }) => hidden), true);
  });
});
