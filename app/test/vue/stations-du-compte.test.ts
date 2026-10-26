// Les stations enregistrées sous le compte GitHub du chef (#1706, épique 1702), sur l'accueil : une ligne par station,
// disponible ou non ; ouverte, les projets du chef à cocher, chaque case écrite aussitôt ; sans station, la commande qui
// en installe une. Les stations sont écrites par les fonctions mêmes du runtime (`stationDuGist`, `echecDeGh`) : ce que
// le bloc pose est ce qu'il recevra. La vue jouée entière va jusqu'au gist : ce qui est coché est écrit selon le
// contrat (stations-du-compte.ts), relu par le lecteur du runtime au lancement suivant, et coché encore.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
import {
  AUCUNE,
  CHOISIR,
  COPIEE,
  COPIER,
  DEPOTS_ILLISIBLES,
  EN_SON_ABSENCE,
  ENVOI,
  ILLISIBLES,
  INSTALLER,
  LECTURE,
  LECTURE_DES_DEPOTS,
  poserStationsDuCompte,
  RELIRE,
  SANS_DEPOT,
  type EtatDuCompte,
  type GestesDuCompte,
} from "../../src/vue/stations-du-compte.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VU = "2026-10-26T09:42:00.000Z";
const LU = Date.parse(VU) + 1_000;

// L'enregistrement qu'une station publie (runtime/src/enregistrement-station/README.md), tel quel.
const enregistrement = (name: string, platform: string, machine: string, stoppedAt: string | null) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen: VU, refreshMs: 120_000, stoppedAt });
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

function unBloc(etat: EtatDuCompte) {
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
  const bloc = poserStationsDuCompte(doc, etat, gestes) as Faux;
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

describe("la liste : chaque station du compte, disponible ou non", () => {
  test("une ligne par station, dans l'ordre du lecteur : son nom, sa plateforme, sa disponibilité et ce qu'elle sert", () => {
    const { bloc, ligne, textes } = unBloc({ stations: LISTEES });
    assert.ok(textes().includes(CHOISIR), "ce qu'on attend du chef n'est pas dit en tête");
    assert.deepEqual(
      bloc.dessous("button").filter(({ className }) => className === "ligne").map((pose) => pose.dessous("strong")[0]?.textContent),
      ["box", "mac"],
    );
    assert.match(ligne("box").textContent, /Linux · available · serves 1 project/);
    assert.match(ligne("mac").textContent, /macOS · unavailable · no project chosen yet/);
  });

  test("la pastille dit la disponibilité : un disque vert, un anneau gris — la machine et la version au survol", () => {
    const { ligne } = unBloc({ stations: LISTEES });
    const pastille = (nom: string) => ligne(nom).children.find(({ className }) => className === "pastille") ?? assert.fail("pas de pastille");
    assert.deepEqual([pastille("box").dataset.ton, pastille("box").dataset.forme], ["vert", "disque"]);
    assert.deepEqual([pastille("mac").dataset.ton, pastille("mac").dataset.forme], ["gris", "anneau"]);
    assert.match(ligne("mac").title, /macOS 24\.1\.0 · version 1\.4\.0 · last sign of life 2026-10-26 09:42 UTC/);
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

  test("une registration illisible se dit en une ligne, sa raison au survol", () => {
    const { enEchec, auSurvol } = unBloc({ stations: { ...LISTEES, unreadable: [{ id: "f00", reason: "its registration is not JSON" }] } });
    const [ligne, ...autres] = enEchec();
    assert.ok(ligne !== undefined && autres.length === 0);
    assert.equal(ligne.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.match(auSurvol(ligne), /f00: its registration is not JSON/);
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

  test("une station indisponible le dit, et ses cases restent à cocher", () => {
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

describe("sans station : le bloc dit comment en installer une", () => {
  test("la phrase, puis la commande d'installation de chaque système, que copie un bouton", () => {
    const { bloc, textes, faits } = unBloc({ stations: AUCUNE_LISTEE });
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
    const { bloc, bouton, faits } = unBloc({ stations: AUCUNE_LISTEE, copiee: INSTALLER[0]?.commande ?? "" });
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => textContent === COPIER || textContent === COPIEE).map(({ textContent }) => textContent), [COPIEE, COPIER]);
    bouton(RELIRE).click();
    assert.deepEqual(faits, ["relire"]);
  });
});

describe("avant la liste : la lecture, la connexion qui manque, la lecture qui échoue", () => {
  test("en lecture, il le dit", () => {
    assert.ok(unBloc({}).textes().includes(LECTURE));
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

// La vue jouée entière : l'app, qui a un projet, s'ouvre sur l'accueil.
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const demarrage = () => ({
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
});
const blocDe = (vue: Jouee) => vue.element("accueil-stations").dessous("section").filter(({ className }) => className === "stations-du-compte");
async function accueil(vue: Jouee) {
  vue.element("entree-tous").click();
  await repos();
  const [bloc, ...autres] = blocDe(vue);
  assert.ok(bloc !== undefined && autres.length === 0, "pas de bloc des stations du compte sur l'accueil");
  return bloc;
}

describe("la vue jouée : l'accueil lit les stations du compte, et ce qui est coché tient d'un lancement à l'autre", () => {
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
    const reponses = { demarrage, espace: () => [], stationsDuCompte: lire, depotsDuChef: () => DEPOTS, choisirLesProjets: (id: string, depots: string[]) => choisir(id, depots) };

    const vue = await jouerLaVue(reponses);
    const premier = lecteurs(await accueil(vue));
    assert.match(premier.ligne("box").textContent, /available · no project chosen yet/);
    premier.ligne("box").click();
    await repos();
    assert.ok(vue.appels.some(({ geste }) => geste === "depotsDuChef"), "les dépôts du chef ne sont pas lus");
    const ouvert = lecteurs(blocDe(vue)[0] ?? assert.fail());
    assert.deepEqual(ouvert.cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", false], ["acme/site", false]]);
    cocher(ouvert.caseDe("acme/site"), true);
    await repos();
    assert.deepEqual(vue.dernier("choisirLesProjets"), [BOX.id, ["acme/site"]]);
    assert.deepEqual(ecrits, [[contrat.FICHIER_SELECTION]], "l'app écrit un autre fichier que la sélection");
    const apres = lecteurs(blocDe(vue)[0] ?? assert.fail());
    assert.match(apres.ligne("box").textContent, /serves 1 project/);
    assert.equal(apres.caseDe("acme/site").checked, true);

    // Relancée : la sélection est relue dans le gist, par le lecteur du runtime.
    const relancee = await jouerLaVue(reponses);
    const relu = lecteurs(await accueil(relancee));
    assert.match(relu.ligne("box").textContent, /serves 1 project/);
    relu.ligne("box").click();
    await repos();
    const rouvert = lecteurs(blocDe(relancee)[0] ?? assert.fail());
    assert.deepEqual(rouvert.cases().map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["acme/shop", false], ["acme/site", true]]);
  });

  test("sans station sous le compte, l'accueil dit comment en installer une", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], stationsDuCompte: () => AUCUNE_LISTEE });
    const bloc = await accueil(vue);
    assert.ok(lecteurs(bloc).textes().some((texte) => texte.startsWith(AUCUNE)));
    assert.equal(bloc.dessous("code").length, INSTALLER.length);
  });

  test("un pont qui ne lit pas les stations du compte ne pose rien", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [] });
    vue.element("entree-tous").click();
    await repos();
    assert.deepEqual(blocDe(vue), []);
  });
});
