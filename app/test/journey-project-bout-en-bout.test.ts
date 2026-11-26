// « Add a project », de bout en bout (#3181) : l'écran ne fait que choisir le dépôt. Sur un ordinateur neuf — aucun projet,
// aucune station appairée, `gh` connecté —, « + » ouvre la liste des dépôts du compte, les derniers poussés d'abord, et un
// clic sur l'un crée le projet dans la colonne de gauche et ouvre sa page : deux clics, rien de tapé. Ni dossier, ni
// branche demandés — celle d'intégration est la branche par défaut que GitHub donne —, ni bloc d'étapes, ni compte à
// choisir, ni fichier de configuration nommé, ni erreur avant un geste. La vue est jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Ouverture } from "../src/first-launch.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { AJOUTER, ATTENDU, AUCUN, CLONE_DANS, COLLER, DEPUIS_UN_ORDINATEUR, ILLISIBLES, READ, RECHERCHE, RELIRE, SANS_ACCOUNT, TITRE } from "../src/vue/journey-project/addition.js";
import { SE_CONNECTER } from "../src/vue/journey-project/account.js";
import { PAS_UN_REPOSITORY } from "../src/vue/journey-project/step-project.js";
import { REESSAYER } from "../src/vue/first-launch.js";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "./aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const COPIES = "/home/chef/Brigade";
const AUCUNE = { state: "listed" as const, stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet." };
// Les dépôts du compte, tels que GitHub les rend : les derniers poussés d'abord — le sien, puis celui d'une organisation.
const DEPOTS = [
  { depot: "chef/parade", base: "main" },
  { depot: "atelier-org/cantine", base: "trunk" },
  { depot: "chef/vieux", base: "master" },
];

// Un ordinateur neuf : le fichier des projets est vide.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'app neuve, son pont doublé : `ouvrir` rend la copie qu'on lui dicte, après avoir écrit le projet dans le fichier,
// comme le process principal (first-launch.ts) — la liste arrive par `surConfiguration`.
async function lApp(answers: Answers & { copie?: (name: string, repository: string) => Ouverture } = {}) {
  let vue: Jouee | undefined;
  const { copie = (name: string, repository: string) => ({ state: "open" as const, project: name, repository: repository, folder: `${COPIES}/${name}`, cloned: true }), ...autres } = answers;
  vue = await jouerLaVue({
    demarrage,
    stationsDuChef: () => AUCUNE,
    compteGitHub: () => ({ login: "octo-chef" }),
    depotsDuChef: () => ({ depots: DEPOTS }),
    ouvrirDUneStation: (name, repository, base) => {
      const rendu = copie(name, repository);
      if (rendu.state === "open") vue?.dire("surConfiguration", pourLaBar({ chemin: CHEMIN, projets: [{ nom: name, dossier: rendu.folder, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return rendu;
    },
    espace: () => [],
    ...autres,
  });
  return vue;
}

const screen = (vue: Jouee) => vue.element("ajout").dessous("section").find((pose) => pose.className.split(" ").includes("ajout-d-un-projet")) ?? assert.fail("pas d'écran « Add a project »");
const button = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${ou.dessous("button").map((b) => b.textContent).join(", ")}`);
const depotsVus = (vue: Jouee) => screen(vue).dessous("li").filter((line) => line.className === "depot").map((line) => line.dataset.depot);
const champ = (vue: Jouee, name: string) => screen(vue).dessous("input").find((entree) => entree.ariaLabel === name) ?? assert.fail(`pas de champ « ${name} »`);
const erreurs = (vue: Jouee) => screen(vue).dessous("p").filter((pose) => pose.dataset.ligne === "erreur");
async function ouvrirLAddition(vue: Jouee) {
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
}

describe("un nouveau venu connecté à GitHub est dans la page de son projet deux clics après « Add a project »", () => {
  test("« + », puis un dépôt : le projet est dans la colonne de gauche, sa page ouverte, sa branche celle de GitHub, son clone dit en une ligne", async () => {
    const vue = await lApp();
    // Premier clic : « Add a project ».
    await ouvrirLAddition(vue);
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(screen(vue).dessous("h2")[0]?.textContent, TITRE);
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === ATTENDU));
    // Les dépôts du compte et de ses organisations, dans l'ordre où GitHub les rend : les derniers poussés d'abord.
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot: repository }) => repository));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length, 1);
    // Deuxième clic : le dépôt.
    button(screen(vue), "chef/parade").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "chef/parade", "main"]);
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("ajout").hidden, true, "l'écran d'ajout n'est plus là une fois le dépôt choisi");
    const colonne = vue.element("projets").children.map((entree) => entree.ariaLabel);
    assert.ok(colonne.includes("parade"), `le projet est dans la colonne de gauche : ${colonne.join(", ")}`);
    assert.equal(vue.element("projets").children.find((entree) => entree.ariaLabel === "parade")?.ariaCurrent, "true", "et c'est sa page qui est ouverte");
    assert.equal(vue.element("avis").hidden, false);
    assert.equal(vue.element("avis").dessous("strong")[0]?.textContent, CLONE_DANS(`${COPIES}/parade`));
    assert.equal(vue.element("avis").dessous("strong")[0]?.textContent, "Cloned into ~/Brigade/parade", "le dossier du compte s'écrit ~");
    assert.equal(CLONE_DANS("/x/parade"), "Cloned into /x/parade");
    assert.equal(CLONE_DANS("/Users/chef/Brigade/parade"), "Cloned into ~/Brigade/parade");
    assert.equal(CLONE_DANS("C:\\Users\\chef\\Brigade\\parade"), "Cloned into ~\\Brigade\\parade");
    // Rien d'autre n'a été demandé : ni dossier, ni connexion, ni station.
    assert.equal(vue.appels.some(({ geste: action }) => ["choisirDossier", "lireClone", "ajouter", "seConnecterAGitHub", "ajouterAUneStation", "confierAUneStation", "servirUnProjet"].includes(action)), false);
  });

  test("une copie qui existe déjà sur cet ordinateur est reprise : aucun clone n'est annoncé", async () => {
    const vue = await lApp({ copie: (name, repository) => ({ state: "open", project: name, repository: repository, folder: `/home/chef/code/${name}`, cloned: false }) });
    await ouvrirLAddition(vue);
    button(screen(vue), "atelier-org/cantine").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["cantine", "atelier-org/cantine", "trunk"]);
    assert.equal(vue.element("espace").textContent, "cantine");
    assert.equal(vue.element("avis").hidden, true);
  });

  test("l'écran : rien à taper pour les siens, ni bloc d'étapes, ni compte, ni fichier de configuration, ni erreur avant un geste", async () => {
    const vue = await lApp();
    await ouvrirLAddition(vue);
    const tout = screen(vue);
    assert.deepEqual(tout.dessous("input").map((entree) => entree.ariaLabel), [RECHERCHE, COLLER]);
    assert.deepEqual(tout.dessous("label"), []);
    assert.deepEqual(tout.dessous("ol"), []);
    assert.doesNotMatch(tout.textContent, /Your GitHub account|switch GitHub account|Connected to GitHub|app\.json|\.config|folder|integration branch|The station that cooks it|Ready/i);
    assert.deepEqual(erreurs(vue), []);
    assert.equal(vue.element("ajout").dessous("form").length, 0);
  });

  test("la recherche filtre la liste, sans égard à la casse ; rien ne correspond, l'écran le dit", async () => {
    const vue = await lApp();
    await ouvrirLAddition(vue);
    const recherche = champ(vue, RECHERCHE);
    recherche.value = "CHEF/";
    recherche.declencher("input");
    assert.deepEqual(depotsVus(vue), ["chef/parade", "chef/vieux"]);
    recherche.value = "rien-de-tel";
    recherche.declencher("input");
    assert.deepEqual(depotsVus(vue), []);
    assert.ok(screen(vue).dessous("li").some((line) => line.textContent === AUCUN));
  });
});

describe("un dépôt public qui n'est pas au chef : son lien ou son owner/name, collé", () => {
  test("son lien GitHub collé : le dépôt est lu sur GitHub, puis ouvert avec sa branche par défaut", async () => {
    const vue = await lApp({ lireUnDepot: (repository) => ({ depot: repository, base: "dev" }) });
    await ouvrirLAddition(vue);
    const colle = champ(vue, COLLER);
    colle.value = "https://github.com/autrui/outil.git";
    colle.declencher("input");
    button(screen(vue), AJOUTER).click();
    await repos();
    assert.deepEqual(vue.dernier("lireUnDepot"), ["autrui/outil"]);
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["outil", "autrui/outil", "dev"]);
    assert.equal(vue.element("espace").textContent, "outil");
  });

  test("ce qui n'est pas un dépôt, ou que GitHub ne rend pas, se dit sous le champ — après le geste, et rien ne s'ouvre", async () => {
    const vue = await lApp({ lireUnDepot: (repository) => ({ refus: `${repository} was not found on GitHub, or it is private` }) });
    await ouvrirLAddition(vue);
    const colle = champ(vue, COLLER);
    colle.value = "pas un dépôt";
    colle.declencher("input");
    colle.declencher("keydown", { key: "Enter" });
    await repos();
    assert.equal(erreurs(vue)[0]?.textContent, PAS_UN_REPOSITORY);
    assert.equal(vue.appels.some(({ geste: action }) => action === "lireUnDepot"), false);
    const encore = champ(vue, COLLER);
    encore.value = "autrui/cache";
    encore.declencher("input");
    button(screen(vue), AJOUTER).click();
    await repos();
    assert.equal(erreurs(vue)[0]?.textContent, "autrui/cache was not found on GitHub, or it is private");
    assert.equal(vue.appels.some(({ geste: action }) => action === "ouvrirDUneStation"), false);
    assert.equal(vue.element("ajout").hidden, false);
  });
});

describe("ce qui ne se lit pas, ou n'est pas encore là", () => {
  test("sans compte connecté : une phrase et le bouton « connect to GitHub », rien d'autre — et aucune erreur", async () => {
    const vue = await lApp({ compteGitHub: () => ({ nonConnecte: true }) });
    await ouvrirLAddition(vue);
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === SANS_ACCOUNT));
    assert.deepEqual(screen(vue).dessous("button").map((b) => b.textContent), [SE_CONNECTER]);
    assert.deepEqual(screen(vue).dessous("input"), []);
    assert.deepEqual(erreurs(vue), []);
  });

  test("connecté au bout du bouton : les dépôts se relisent, du compte qui vient de se connecter", async () => {
    let comptes = 0;
    const vue = await lApp({ compteGitHub: () => (++comptes === 1 ? { nonConnecte: true } : { login: "octo-chef" }), seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }) });
    await ouvrirLAddition(vue);
    button(screen(vue), SE_CONNECTER).click();
    await repos();
    const avant = vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length;
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length, avant + 1);
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot: repository }) => repository));
  });

  test("la liste en route se dit ; ratée, la raison en une ligne, son détail au survol, et « read again » la relit — le collage reste possible", async () => {
    let lectures = 0;
    let rendre: (lu: { depots: typeof DEPOTS }) => void = () => {};
    const vue = await lApp({ depotsDuChef: () => (++lectures === 1 ? { refus: "GitHub gave no answer within 30 s" } : new Promise((resoudre) => (rendre = resoudre))) });
    await ouvrirLAddition(vue);
    const [refusal] = erreurs(vue);
    assert.equal(refusal?.dessous("span")[0]?.textContent, ILLISIBLES);
    assert.equal(refusal?.dessous("button")[0]?.ariaLabel, "GitHub gave no answer within 30 s");
    assert.ok(champ(vue, COLLER));
    button(screen(vue), RELIRE).click();
    await repos();
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === READ));
    rendre({ depots: DEPOTS });
    await repos();
    assert.deepEqual(depotsVus(vue), DEPOTS.map(({ depot: repository }) => repository));
    assert.deepEqual(erreurs(vue), []);
  });

  test("un clone qui échoue : la raison reste sur l'écran d'ajout, et « Try again » rouvre le même dépôt avec sa branche", async () => {
    let essais = 0;
    const vue = await lApp({
      copie: (name, repository) =>
        ++essais === 1
          ? { state: "failed", project: name, repository: repository, cause: "network", reason: `GitHub cannot be reached from this computer, so ${repository} could not be cloned.` }
          : { state: "open", project: name, repository: repository, folder: `${COPIES}/${name}`, cloned: true },
    });
    await ouvrirLAddition(vue);
    button(screen(vue), "chef/vieux").click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(erreurs(vue)[0]?.dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so chef/vieux could not be cloned.");
    button(screen(vue), REESSAYER).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["vieux", "chef/vieux", "master"]);
    assert.equal(vue.element("espace").textContent, "vieux");
  });

  test("sur le téléphone, qui n'ajoute aucun projet, l'écran le dit en une ligne : ni compte, ni dépôts lus", async () => {
    const vue = await lApp({ demarrage: () => ({ ...demarrage(), telephone: {} }) });
    await ouvrirLAddition(vue);
    assert.deepEqual(screen(vue).dessous("p").map((pose) => pose.textContent), [DEPUIS_UN_ORDINATEUR]);
    assert.equal(vue.appels.some(({ geste: action }) => action === "depotsDuChef" || action === "compteGitHub"), false);
  });

  test("pendant l'ouverture, l'étape de la copie se dit sous la liste et aucun autre dépôt ne se choisit", async () => {
    const vue = await lApp({ ouvrirDUneStation: () => new Promise<Ouverture>(() => {}) });
    await ouvrirLAddition(vue);
    button(screen(vue), "chef/parade").click();
    await repos();
    vue.dire("surOuverture", "chef/parade", { stage: "cloning", sentence: `Cloning chef/parade into ${COPIES}/parade — 42%.`, percent: 42 });
    assert.equal(screen(vue).dessous("p").find((pose) => pose.className === "ouverture")?.textContent, `Cloning chef/parade into ${COPIES}/parade — 42%.`);
    assert.equal(button(screen(vue), "atelier-org/cantine").disabled, true);
    assert.equal(button(screen(vue), AJOUTER).disabled, true);
  });
});
