// « Add a project », de bout en bout (#3181) : l'écran ne fait que choisir le dépôt. Sur un ordinateur neuf — aucun projet,
// aucune station appairée, `gh` connecté —, « + » ouvre la liste des dépôts du compte, les derniers poussés d'abord, et un
// clic sur l'un crée le projet dans la colonne de gauche et ouvre sa page : deux clics, rien de tapé. Ni dossier, ni
// branche demandés — celle d'intégration est la branche par défaut que GitHub donne —, ni bloc d'étapes, ni compte à
// choisir, ni fichier de configuration nommé, ni erreur avant un geste. La vue est jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Ouverture } from "../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { AJOUTER, ATTENDU, AUCUN, CLONE_DANS, COLLER, DEPUIS_UN_ORDINATEUR, ILLISIBLES, LECTURE, RECHERCHE, RELIRE, SANS_COMPTE, TITRE } from "../src/vue/parcours-projet/ajout.js";
import { SE_CONNECTER } from "../src/vue/parcours-projet/compte.js";
import { PAS_UN_DEPOT } from "../src/vue/parcours-projet/etape-projet.js";
import { REESSAYER } from "../src/vue/premier-lancement.js";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const COPIES = "/home/chef/.local/share/brigade/projects";
const AUCUNE = { state: "listed" as const, stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet." };
// Les dépôts du compte, tels que GitHub les rend : les derniers poussés d'abord — le sien, puis celui d'une organisation.
const DEPOTS = [
  { depot: "chef/parade", base: "main" },
  { depot: "atelier-org/cantine", base: "trunk" },
  { depot: "chef/vieux", base: "master" },
];

// Un ordinateur neuf : le fichier des projets est vide.
const demarrage = () => ({
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
});

// L'app neuve, son pont doublé : `ouvrir` rend la copie qu'on lui dicte, après avoir écrit le projet dans le fichier,
// comme le process principal (premier-lancement.ts) — la liste arrive par `surConfiguration`.
async function lApp(reponses: Reponses & { copie?: (nom: string, depot: string) => Ouverture } = {}) {
  let vue: Jouee | undefined;
  const { copie = (nom: string, depot: string) => ({ state: "open" as const, project: nom, repository: depot, folder: `${COPIES}/${nom}`, cloned: true }), ...autres } = reponses;
  vue = await jouerLaVue({
    demarrage,
    stationsDuChef: () => AUCUNE,
    compteGitHub: () => ({ login: "octo-chef" }),
    depotsDuChef: () => ({ depots: DEPOTS }),
    ouvrirDUneStation: (nom, depot, base) => {
      const rendu = copie(nom, depot);
      if (rendu.state === "open") vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: rendu.folder, depot, base: base ?? "main" } satisfies Projet] }), []);
      return rendu;
    },
    espace: () => [],
    ...autres,
  });
  return vue;
}

const ecran = (vue: Jouee) => vue.element("ajout").dessous("section").find((pose) => pose.className.split(" ").includes("ajout-d-un-projet")) ?? assert.fail("pas d'écran « Add a project »");
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${ou.dessous("button").map((b) => b.textContent).join(", ")}`);
const depotsVus = (vue: Jouee) => ecran(vue).dessous("li").filter((ligne) => ligne.className === "depot").map((ligne) => ligne.dataset.depot);
const champ = (vue: Jouee, nom: string) => ecran(vue).dessous("input").find((entree) => entree.ariaLabel === nom) ?? assert.fail(`pas de champ « ${nom} »`);
const erreurs = (vue: Jouee) => ecran(vue).dessous("p").filter((pose) => pose.dataset.ligne === "erreur");
async function ouvrirLAjout(vue: Jouee) {
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
}

describe("un nouveau venu connecté à GitHub est dans la page de son projet deux clics après « Add a project »", () => {
  test("« + », puis un dépôt : le projet est dans la colonne de gauche, sa page ouverte, sa branche celle de GitHub, son clone dit en une ligne", async () => {
    const vue = await lApp();
    // Premier clic : « Add a project ».
    await ouvrirLAjout(vue);
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(ecran(vue).dessous("h2")[0]?.textContent, TITRE);
    assert.ok(ecran(vue).dessous("p").some((pose) => pose.textContent === ATTENDU));
    // Les dépôts du compte et de ses organisations, dans l'ordre où GitHub les rend : les derniers poussés d'abord.
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot }) => depot));
    assert.equal(vue.appels.filter(({ geste }) => geste === "depotsDuChef").length, 1);
    // Deuxième clic : le dépôt.
    bouton(ecran(vue), "chef/parade").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "chef/parade", "main"]);
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("ajout").hidden, true, "l'écran d'ajout n'est plus là une fois le dépôt choisi");
    const colonne = vue.element("projets").children.map((entree) => entree.ariaLabel);
    assert.ok(colonne.includes("parade"), `le projet est dans la colonne de gauche : ${colonne.join(", ")}`);
    assert.equal(vue.element("projets").children.find((entree) => entree.ariaLabel === "parade")?.ariaCurrent, "true", "et c'est sa page qui est ouverte");
    assert.equal(vue.element("avis").hidden, false);
    assert.equal(vue.element("avis").dessous("strong")[0]?.textContent, CLONE_DANS(`${COPIES}/parade`));
    assert.equal(CLONE_DANS("/x/parade"), "Cloned into /x/parade");
    // Rien d'autre n'a été demandé : ni dossier, ni connexion, ni station.
    assert.equal(vue.appels.some(({ geste }) => ["choisirDossier", "lireClone", "ajouter", "seConnecterAGitHub", "ajouterAUneStation", "confierAUneStation", "servirUnProjet"].includes(geste)), false);
  });

  test("une copie qui existe déjà sur cet ordinateur est reprise : aucun clone n'est annoncé", async () => {
    const vue = await lApp({ copie: (nom, depot) => ({ state: "open", project: nom, repository: depot, folder: `/home/chef/code/${nom}`, cloned: false }) });
    await ouvrirLAjout(vue);
    bouton(ecran(vue), "atelier-org/cantine").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["cantine", "atelier-org/cantine", "trunk"]);
    assert.equal(vue.element("espace").textContent, "cantine");
    assert.equal(vue.element("avis").hidden, true);
  });

  test("l'écran : rien à taper pour les siens, ni bloc d'étapes, ni compte, ni fichier de configuration, ni erreur avant un geste", async () => {
    const vue = await lApp();
    await ouvrirLAjout(vue);
    const tout = ecran(vue);
    assert.deepEqual(tout.dessous("input").map((entree) => entree.ariaLabel), [RECHERCHE, COLLER]);
    assert.deepEqual(tout.dessous("label"), []);
    assert.deepEqual(tout.dessous("ol"), []);
    assert.doesNotMatch(tout.textContent, /Your GitHub account|switch GitHub account|Connected to GitHub|app\.json|\.config|folder|integration branch|The station that cooks it|Ready/i);
    assert.deepEqual(erreurs(vue), []);
    assert.equal(vue.element("ajout").dessous("form").length, 0);
  });

  test("la recherche filtre la liste, sans égard à la casse ; rien ne correspond, l'écran le dit", async () => {
    const vue = await lApp();
    await ouvrirLAjout(vue);
    const recherche = champ(vue, RECHERCHE);
    recherche.value = "CHEF/";
    recherche.declencher("input");
    assert.deepEqual(depotsVus(vue), ["chef/parade", "chef/vieux"]);
    recherche.value = "rien-de-tel";
    recherche.declencher("input");
    assert.deepEqual(depotsVus(vue), []);
    assert.ok(ecran(vue).dessous("li").some((ligne) => ligne.textContent === AUCUN));
  });
});

describe("un dépôt public qui n'est pas au chef : son lien ou son owner/name, collé", () => {
  test("son lien GitHub collé : le dépôt est lu sur GitHub, puis ouvert avec sa branche par défaut", async () => {
    const vue = await lApp({ lireUnDepot: (depot) => ({ depot, base: "dev" }) });
    await ouvrirLAjout(vue);
    const colle = champ(vue, COLLER);
    colle.value = "https://github.com/autrui/outil.git";
    colle.declencher("input");
    bouton(ecran(vue), AJOUTER).click();
    await repos();
    assert.deepEqual(vue.dernier("lireUnDepot"), ["autrui/outil"]);
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["outil", "autrui/outil", "dev"]);
    assert.equal(vue.element("espace").textContent, "outil");
  });

  test("ce qui n'est pas un dépôt, ou que GitHub ne rend pas, se dit sous le champ — après le geste, et rien ne s'ouvre", async () => {
    const vue = await lApp({ lireUnDepot: (depot) => ({ refus: `${depot} was not found on GitHub, or it is private` }) });
    await ouvrirLAjout(vue);
    const colle = champ(vue, COLLER);
    colle.value = "pas un dépôt";
    colle.declencher("input");
    colle.declencher("keydown", { key: "Enter" });
    await repos();
    assert.equal(erreurs(vue)[0]?.textContent, PAS_UN_DEPOT);
    assert.equal(vue.appels.some(({ geste }) => geste === "lireUnDepot"), false);
    const encore = champ(vue, COLLER);
    encore.value = "autrui/cache";
    encore.declencher("input");
    bouton(ecran(vue), AJOUTER).click();
    await repos();
    assert.equal(erreurs(vue)[0]?.textContent, "autrui/cache was not found on GitHub, or it is private");
    assert.equal(vue.appels.some(({ geste }) => geste === "ouvrirDUneStation"), false);
    assert.equal(vue.element("ajout").hidden, false);
  });
});

describe("ce qui ne se lit pas, ou n'est pas encore là", () => {
  test("sans compte connecté : une phrase et le bouton « connect to GitHub », rien d'autre — et aucune erreur", async () => {
    const vue = await lApp({ compteGitHub: () => ({ nonConnecte: true }) });
    await ouvrirLAjout(vue);
    assert.ok(ecran(vue).dessous("p").some((pose) => pose.textContent === SANS_COMPTE));
    assert.deepEqual(ecran(vue).dessous("button").map((b) => b.textContent), [SE_CONNECTER]);
    assert.deepEqual(ecran(vue).dessous("input"), []);
    assert.deepEqual(erreurs(vue), []);
  });

  test("connecté au bout du bouton : les dépôts se relisent, du compte qui vient de se connecter", async () => {
    let comptes = 0;
    const vue = await lApp({ compteGitHub: () => (++comptes === 1 ? { nonConnecte: true } : { login: "octo-chef" }), seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }) });
    await ouvrirLAjout(vue);
    bouton(ecran(vue), SE_CONNECTER).click();
    await repos();
    const avant = vue.appels.filter(({ geste }) => geste === "depotsDuChef").length;
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "depotsDuChef").length, avant + 1);
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot }) => depot));
  });

  test("la liste en route se dit ; ratée, la raison en une ligne, son détail au survol, et « read again » la relit — le collage reste possible", async () => {
    let lectures = 0;
    let rendre: (lu: { depots: typeof DEPOTS }) => void = () => {};
    const vue = await lApp({ depotsDuChef: () => (++lectures === 1 ? { refus: "GitHub gave no answer within 30 s" } : new Promise((resoudre) => (rendre = resoudre))) });
    await ouvrirLAjout(vue);
    const [refus] = erreurs(vue);
    assert.equal(refus?.dessous("span")[0]?.textContent, ILLISIBLES);
    assert.equal(refus?.dessous("button")[0]?.ariaLabel, "GitHub gave no answer within 30 s");
    assert.ok(champ(vue, COLLER));
    bouton(ecran(vue), RELIRE).click();
    await repos();
    assert.ok(ecran(vue).dessous("p").some((pose) => pose.textContent === LECTURE));
    rendre({ depots: DEPOTS });
    await repos();
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot }) => depot));
    assert.deepEqual(erreurs(vue), []);
  });

  test("un clone qui échoue : la raison reste sur l'écran d'ajout, et « Try again » rouvre le même dépôt avec sa branche", async () => {
    let essais = 0;
    const vue = await lApp({
      copie: (nom, depot) =>
        ++essais === 1
          ? { state: "failed", project: nom, repository: depot, cause: "network", reason: `GitHub cannot be reached from this computer, so ${depot} could not be cloned.` }
          : { state: "open", project: nom, repository: depot, folder: `${COPIES}/${nom}`, cloned: true },
    });
    await ouvrirLAjout(vue);
    bouton(ecran(vue), "chef/vieux").click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(erreurs(vue)[0]?.dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so chef/vieux could not be cloned.");
    bouton(ecran(vue), REESSAYER).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["vieux", "chef/vieux", "master"]);
    assert.equal(vue.element("espace").textContent, "vieux");
  });

  test("sur le téléphone, qui n'ajoute aucun projet, l'écran le dit en une ligne : ni compte, ni dépôts lus", async () => {
    const vue = await lApp({ demarrage: () => ({ ...demarrage(), telephone: {} }) });
    await ouvrirLAjout(vue);
    assert.deepEqual(ecran(vue).dessous("p").map((pose) => pose.textContent), [DEPUIS_UN_ORDINATEUR]);
    assert.equal(vue.appels.some(({ geste }) => geste === "depotsDuChef" || geste === "compteGitHub"), false);
  });

  test("pendant l'ouverture, l'étape de la copie se dit sous la liste et aucun autre dépôt ne se choisit", async () => {
    const vue = await lApp({ ouvrirDUneStation: () => new Promise<Ouverture>(() => {}) });
    await ouvrirLAjout(vue);
    bouton(ecran(vue), "chef/parade").click();
    await repos();
    vue.dire("surOuverture", "chef/parade", { stage: "cloning", sentence: `Cloning chef/parade into ${COPIES}/parade — 42%.`, percent: 42 });
    assert.equal(ecran(vue).dessous("p").find((pose) => pose.className === "ouverture")?.textContent, `Cloning chef/parade into ${COPIES}/parade — 42%.`);
    assert.equal(bouton(ecran(vue), "atelier-org/cantine").disabled, true);
    assert.equal(bouton(ecran(vue), AJOUTER).disabled, true);
  });
});
