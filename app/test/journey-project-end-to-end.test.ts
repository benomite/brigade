// « Add a project », de bout en bout (#3181) : l'écran ne fait que choisir le dépôt. Sur un ordinateur neuf — aucun projet,
// aucune station appairée, `gh` connecté —, « + » ouvre la liste des dépôts du compte, les derniers poussés d'abord, et un
// clic sur l'un crée le projet dans la colonne de gauche et ouvre sa page : deux clics, rien de tapé. Ni dossier, ni
// branche demandés — celle d'intégration est la branche par défaut que GitHub donne —, ni bloc d'étapes, ni compte à
// choisir, ni fichier de configuration nommé, ni erreur avant un geste. La vue est jouée telle qu'elle est (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Opening } from "../src/first-launch.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { ADD, EXPECTED, NO, CLONE_IN, PASTE, SINCE_ONE_COMPUTER, UNREADABLE, READING, SEARCH, REREAD, WITHOUT_ACCOUNT, TITLE } from "../src/vue/addition-project/addition.js";
import { ITSELF_CONNECT } from "../src/vue/addition-project/account.js";
import { NOT_ONE_REPOSITORY } from "../src/vue/addition-project/step-project.js";
import { RETRY } from "../src/vue/lexicon.js";
import { type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const COPIES = "/home/chef/Brigade";
const NOT_ONE = { state: "listed" as const, stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet." };
// Les dépôts du compte, tels que GitHub les rend : les derniers poussés d'abord — le sien, puis celui d'une organisation.
const REPOSITORIES = [
  { depot: "chef/parade", base: "main" },
  { depot: "atelier-org/cantine", base: "trunk" },
  { depot: "chef/vieux", base: "master" },
];

// Un ordinateur neuf : le fichier des projets est vide.
const startup = () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// L'app neuve, son pont doublé : `ouvrir` rend la copie qu'on lui dicte, après avoir écrit le projet dans le fichier,
// comme le process principal (first-launch.ts) — la liste arrive par `surConfiguration`.
async function theApp(answers: Answers & { copie?: (name: string, repository: string) => Opening } = {}) {
  let vue: Played | undefined;
  const { copie: copy = (name: string, repository: string) => ({ state: "open" as const, project: name, repository: repository, folder: `${COPIES}/${name}`, cloned: true }), ...others } = answers;
  vue = await playTheVue({
    demarrage: startup,
    compteGitHub: () => ({ login: "octo-chef" }),
    depotsDuChef: () => ({ depots: REPOSITORIES }),
    ouvrirDUneStation: (name, repository, base) => {
      const rendered = copy(name, repository);
      if (rendered.state === "open") vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: rendered.folder, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return rendered;
    },
    espace: () => [],
    ...others,
  });
  return vue;
}

const screen = (vue: Played) => vue.element("ajout").dessous("section").find((pose) => pose.className.split(" ").includes("ajout-d-un-projet")) ?? assert.fail("pas d'écran « Add a project »");
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${or.dessous("button").map((b) => b.textContent).join(", ")}`);
const repositoriesSeen = (vue: Played) => screen(vue).dessous("li").filter((line) => line.className === "depot").map((line) => line.dataset.depot);
const field = (vue: Played, name: string) => screen(vue).dessous("input").find((entry) => entry.ariaLabel === name) ?? assert.fail(`pas de champ « ${name} »`);
const errors = (vue: Played) => screen(vue).dessous("p").filter((pose) => pose.dataset.ligne === "erreur");
async function openTheAddition(vue: Played) {
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
}

describe("un nouveau venu connecté à GitHub est dans la page de son projet deux clics après « Add a project »", () => {
  test("« + », puis un dépôt : le projet est dans la colonne de gauche, sa page ouverte, sa branche celle de GitHub, son clone dit en une ligne", async () => {
    const vue = await theApp();
    // Premier clic : « Add a project ».
    await openTheAddition(vue);
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(screen(vue).dessous("h2")[0]?.textContent, TITLE);
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === EXPECTED));
    // Les dépôts du compte et de ses organisations, dans l'ordre où GitHub les rend : les derniers poussés d'abord.
    assert.deepEqual(repositoriesSeen(vue), REPOSITORIES.map(({ depot: repository }) => repository));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length, 1);
    // Deuxième clic : le dépôt.
    button(screen(vue), "chef/parade").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "chef/parade", "main"]);
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("ajout").hidden, true, "l'écran d'ajout n'est plus là une fois le dépôt choisi");
    const column = vue.element("projets").children.map((entry) => entry.ariaLabel);
    assert.ok(column.includes("parade"), `le projet est dans la colonne de gauche : ${column.join(", ")}`);
    assert.equal(vue.element("projets").children.find((entry) => entry.ariaLabel === "parade")?.ariaCurrent, "true", "et c'est sa page qui est ouverte");
    assert.equal(vue.element("avis").hidden, false);
    assert.equal(vue.element("avis").dessous("strong")[0]?.textContent, CLONE_IN(`${COPIES}/parade`));
    assert.equal(vue.element("avis").dessous("strong")[0]?.textContent, "Cloned into ~/Brigade/parade", "le dossier du compte s'écrit ~");
    assert.equal(CLONE_IN("/x/parade"), "Cloned into /x/parade");
    assert.equal(CLONE_IN("/Users/chef/Brigade/parade"), "Cloned into ~/Brigade/parade");
    assert.equal(CLONE_IN("C:\\Users\\chef\\Brigade\\parade"), "Cloned into ~\\Brigade\\parade");
    // Rien d'autre n'a été demandé : ni dossier, ni connexion, ni station.
    assert.equal(vue.appels.some(({ geste: action }) => ["choisirDossier", "lireClone", "ajouter", "seConnecterAGitHub", "ajouterAUneStation", "confierAUneStation", "servirUnProjet"].includes(action)), false);
  });

  test("une copie qui existe déjà sur cet ordinateur est reprise : aucun clone n'est annoncé", async () => {
    const vue = await theApp({ copie: (name, repository) => ({ state: "open", project: name, repository: repository, folder: `/home/chef/code/${name}`, cloned: false }) });
    await openTheAddition(vue);
    button(screen(vue), "atelier-org/cantine").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["cantine", "atelier-org/cantine", "trunk"]);
    assert.equal(vue.element("espace").textContent, "cantine");
    assert.equal(vue.element("avis").hidden, true);
  });

  test("l'écran : rien à taper pour les siens, ni bloc d'étapes, ni compte, ni fichier de configuration, ni erreur avant un geste", async () => {
    const vue = await theApp();
    await openTheAddition(vue);
    const all = screen(vue);
    assert.deepEqual(all.dessous("input").map((entry) => entry.ariaLabel), [SEARCH, PASTE]);
    assert.deepEqual(all.dessous("label"), []);
    assert.deepEqual(all.dessous("ol"), []);
    assert.doesNotMatch(all.textContent, /Your GitHub account|switch GitHub account|Connected to GitHub|app\.json|\.config|folder|integration branch|The station that cooks it|Ready/i);
    assert.deepEqual(errors(vue), []);
    assert.equal(vue.element("ajout").dessous("form").length, 0);
  });

  test("la recherche filtre la liste, sans égard à la casse ; rien ne correspond, l'écran le dit", async () => {
    const vue = await theApp();
    await openTheAddition(vue);
    const search = field(vue, SEARCH);
    search.value = "CHEF/";
    search.declencher("input");
    assert.deepEqual(repositoriesSeen(vue), ["chef/parade", "chef/vieux"]);
    search.value = "rien-de-tel";
    search.declencher("input");
    assert.deepEqual(repositoriesSeen(vue), []);
    assert.ok(screen(vue).dessous("li").some((line) => line.textContent === NO));
  });
});

describe("un dépôt public qui n'est pas au chef : son lien ou son owner/name, collé", () => {
  test("son lien GitHub collé : le dépôt est lu sur GitHub, puis ouvert avec sa branche par défaut", async () => {
    const vue = await theApp({ lireUnDepot: (repository) => ({ depot: repository, base: "dev" }) });
    await openTheAddition(vue);
    const pastes = field(vue, PASTE);
    pastes.value = "https://github.com/autrui/outil.git";
    pastes.declencher("input");
    button(screen(vue), ADD).click();
    await repos();
    assert.deepEqual(vue.dernier("lireUnDepot"), ["autrui/outil"]);
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["outil", "autrui/outil", "dev"]);
    assert.equal(vue.element("espace").textContent, "outil");
  });

  test("ce qui n'est pas un dépôt, ou que GitHub ne rend pas, se dit sous le champ — après le geste, et rien ne s'ouvre", async () => {
    const vue = await theApp({ lireUnDepot: (repository) => ({ refus: `${repository} was not found on GitHub, or it is private` }) });
    await openTheAddition(vue);
    const pastes = field(vue, PASTE);
    pastes.value = "pas un dépôt";
    pastes.declencher("input");
    pastes.declencher("keydown", { key: "Enter" });
    await repos();
    assert.equal(errors(vue)[0]?.textContent, NOT_ONE_REPOSITORY);
    assert.equal(vue.appels.some(({ geste: action }) => action === "lireUnDepot"), false);
    const still = field(vue, PASTE);
    still.value = "autrui/cache";
    still.declencher("input");
    button(screen(vue), ADD).click();
    await repos();
    assert.equal(errors(vue)[0]?.textContent, "autrui/cache was not found on GitHub, or it is private");
    assert.equal(vue.appels.some(({ geste: action }) => action === "ouvrirDUneStation"), false);
    assert.equal(vue.element("ajout").hidden, false);
  });
});

describe("ce qui ne se lit pas, ou n'est pas encore là", () => {
  test("sans compte connecté : une phrase et le bouton « connect to GitHub », rien d'autre — et aucune erreur", async () => {
    const vue = await theApp({ compteGitHub: () => ({ nonConnecte: true }) });
    await openTheAddition(vue);
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === WITHOUT_ACCOUNT));
    assert.deepEqual(screen(vue).dessous("button").map((b) => b.textContent), [ITSELF_CONNECT]);
    assert.deepEqual(screen(vue).dessous("input"), []);
    assert.deepEqual(errors(vue), []);
  });

  test("connecté au bout du bouton : les dépôts se relisent, du compte qui vient de se connecter", async () => {
    let accounts = 0;
    const vue = await theApp({ compteGitHub: () => (++accounts === 1 ? { nonConnecte: true } : { login: "octo-chef" }), seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }) });
    await openTheAddition(vue);
    button(screen(vue), ITSELF_CONNECT).click();
    await repos();
    const before = vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length;
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "depotsDuChef").length, before + 1);
    assert.deepEqual(repositoriesSeen(vue), REPOSITORIES.map(({ depot: repository }) => repository));
  });

  test("la liste en route se dit ; ratée, la raison en une ligne, son détail au survol, et « read again » la relit — le collage reste possible", async () => {
    let readings = 0;
    let render: (readOne: { depots: typeof REPOSITORIES }) => void = () => {};
    const vue = await theApp({ depotsDuChef: () => (++readings === 1 ? { refus: "GitHub gave no answer within 30 s" } : new Promise((resolve) => (render = resolve))) });
    await openTheAddition(vue);
    const [refusal] = errors(vue);
    assert.equal(refusal?.dessous("span")[0]?.textContent, UNREADABLE);
    assert.equal(refusal?.dessous("button")[0]?.ariaLabel, "GitHub gave no answer within 30 s");
    assert.ok(field(vue, PASTE));
    button(screen(vue), REREAD).click();
    await repos();
    assert.ok(screen(vue).dessous("p").some((pose) => pose.textContent === READING));
    render({ depots: REPOSITORIES });
    await repos();
    assert.deepEqual(repositoriesSeen(vue), REPOSITORIES.map(({ depot: repository }) => repository));
    assert.deepEqual(errors(vue), []);
  });

  test("un clone qui échoue : la raison reste sur l'écran d'ajout, et « Try again » rouvre le même dépôt avec sa branche", async () => {
    let trials = 0;
    const vue = await theApp({
      copie: (name, repository) =>
        ++trials === 1
          ? { state: "failed", project: name, repository: repository, cause: "network", reason: `GitHub cannot be reached from this computer, so ${repository} could not be cloned.` }
          : { state: "open", project: name, repository: repository, folder: `${COPIES}/${name}`, cloned: true },
    });
    await openTheAddition(vue);
    button(screen(vue), "chef/vieux").click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(errors(vue)[0]?.dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so chef/vieux could not be cloned.");
    button(screen(vue), RETRY).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["vieux", "chef/vieux", "master"]);
    assert.equal(vue.element("espace").textContent, "vieux");
  });

  test("sur le téléphone, qui n'ajoute aucun projet, l'écran le dit en une ligne : ni compte, ni dépôts lus", async () => {
    const vue = await theApp({ demarrage: () => ({ ...startup(), telephone: {} }) });
    await openTheAddition(vue);
    assert.deepEqual(screen(vue).dessous("p").map((pose) => pose.textContent), [SINCE_ONE_COMPUTER]);
    assert.equal(vue.appels.some(({ geste: action }) => action === "depotsDuChef" || action === "compteGitHub"), false);
  });

  test("pendant l'ouverture, l'étape de la copie se dit sous la liste et aucun autre dépôt ne se choisit", async () => {
    const vue = await theApp({ ouvrirDUneStation: () => new Promise<Opening>(() => {}) });
    await openTheAddition(vue);
    button(screen(vue), "chef/parade").click();
    await repos();
    vue.dire("surOuverture", "chef/parade", { stage: "cloning", sentence: `Cloning chef/parade into ${COPIES}/parade — 42%.`, percent: 42 });
    assert.equal(screen(vue).dessous("p").find((pose) => pose.className === "ouverture")?.textContent, `Cloning chef/parade into ${COPIES}/parade — 42%.`);
    assert.equal(button(screen(vue), "atelier-org/cantine").disabled, true);
    assert.equal(button(screen(vue), ADD).disabled, true);
  });
});
