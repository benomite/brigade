// Le premier lancement sur un ordinateur neuf (#1434, épique 1427) : les stations que le chef a appairées et les
// projets qu'elles portent, tels que le runtime les lit (#1428) ; un projet ouvert d'un clic, sans dossier à
// choisir, sa copie faite par le runtime (#1429) — l'étape dite sous sa station, puis son espace ouvert ; une
// connexion à GitHub qui manque, une phrase et un bouton qui lance le geste du runtime ; une lecture ou un clone qui
// échoue, la phrase du runtime, son détail au survol. Jamais un écran vide. Les états sont écrits par les fonctions
// mêmes du runtime (`echecDeGh`, `lireLEchec`, `connexionGitHub`) : ce que l'écran pose est ce qu'il recevra.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connexionGitHub, echecDeGh, type StationsDuChef } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { lireLEchec } from "../../../runtime/src/projets/copie-locale.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import {
  buttonOfThePage,
  ACCOUNT_MISSING,
  readTheProject,
  OPEN_THIS_PROJECT,
  PROJECT,
  PROJECT_EXAMPLE,
  PROJECT_UNREADABLE,
  PROJECT_MISSING,
  CONNECTION_IN_ROUTE,
  REPOSITORY_UNKNOWN,
  READING,
  OPEN_ONE_PROJECT,
  openingOf,
  BY_ITS_REPOSITORIES,
  WELCOME,
  setFirstLaunch,
  RETRY,
  REREAD,
  REOPEN_THE_PAGE,
  WITHOUT_PROJECT,
  tapeTheCode,
  type StateOfFirst,
  type ActionsOfFirst,
} from "../../src/vue/first-launch.js";
import { connectedAs, ITSELF_CONNECT } from "../../src/vue/journey-project/account.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const SEEN = "2026-10-22T09:00:00.000Z";

// Les stations du chef telles que le runtime les rend : son Mac et parade-box, qui portent brigade et parade.
const LISTED: StationsDuChef = {
  state: "listed",
  unreadable: [],
  stations: [
    { id: "gmac", name: "Mac", machine: "macOS 26.0", kind: "ordinateur", cooks: true, version: "2.4.0", online: true, lastSeen: SEEN, stoppedAt: null, projects: [{ name: "brigade", repository: "benomite/brigade" }] },
    {
      id: "gbox",
      name: "parade-box",
      machine: "Debian 12 · 8 cores",
      kind: "ordinateur",
      cooks: true,
      version: "2.4.0",
      online: false,
      lastSeen: SEEN,
      stoppedAt: SEEN,
      projects: [
        { name: "brigade", repository: "benomite/brigade" },
        { name: "parade", repository: "benomite/parade" },
        { name: "cantine", repository: null },
      ],
    },
  ],
};
// Ce `gh` n'a pas de compte : son code de sortie 4, « authentication required ».
const WITHOUT_ACCOUNT = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Pas de `gh` du tout sur ce PC.
const WITHOUT_GH = echecDeGh("gh", 30_000, { code: "ENOENT", message: "spawn gh ENOENT" }, "");
// GitHub injoignable.
const WITHOUT_NETWORK = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Un clone qui échoue, comme le runtime le rend.
const failureOfClone = (errors: string, action = false): Extract<Opening, { state: "failed" }> => {
  const failure = lireLEchec("benomite/parade", errors, { compte: "chef", jeton: null, proprietaire: true });
  return { state: "failed", project: "parade", repository: "benomite/parade", ...failure, ...(action ? { action: connexionGitHub("gh") } : {}) };
};

// Les cartes des stations.
const cards = (screen: Fake) => screen.dessous("section").filter((card) => card.className.split(" ").includes("station-du-chef"));

function oneScreen(state: Partial<StateOfFirst> = {}) {
  const facts: string[] = [];
  const actions: ActionsOfFirst = {
    ouvrir: (station, project, repository) => void facts.push(`ouvrir ${station} ${project} ${repository}`),
    seConnecter: () => void facts.push("se connecter"),
    changerDeCompte: () => void facts.push("changer de compte"),
    relireLeCompte: () => void facts.push("relire le compte"),
    relire: () => void facts.push("relire"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
    ajouterUnProjet: () => void facts.push("ajout"),
  };
  const screen = setFirstLaunch(doc, { poste: "this computer", ...state }, actions) as Fake;
  const button = (text: string) => screen.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${screen.dessous("button").map((b) => b.textContent).join(", ")}`);
  // La phrase des stations, sous le compte.
  const head = () => screen.dessous("h3")[0] ?? assert.fail("pas de phrase des stations");
  const station = (name: string) => cards(screen).find((card) => card.ariaLabel === name) ?? assert.fail(`pas de station « ${name} »`);
  return { ecran: screen, faits: facts, bouton: button, tete: head, station };
}

describe("les stations listées : chacune avec ses projets, un projet s'ouvre d'un clic", () => {
  test("la tête dit ce qu'on attend du chef ; chaque station a son nom, son état, ses projets en boutons", () => {
    const { tete: head, station, ecran: screen } = oneScreen({ stations: LISTED });
    assert.equal(head().textContent, OPEN_ONE_PROJECT("this computer"));
    assert.equal(OPEN_ONE_PROJECT("this computer"), "Open one of your projects on this computer: one click, no folder to choose.");
    assert.deepEqual(
      cards(screen).map((card) => ({ nom: card.dessous("strong")[0]?.textContent, etat: card.dessous("p")[0]?.dessous("span").at(-1)?.textContent, projets: card.dessous("button").map((button) => button.textContent) })),
      [
        { nom: "Mac", etat: "online", projets: ["brigade"] },
        { nom: "parade-box", etat: "offline", projets: ["brigade", "parade", "cantine"] },
      ],
    );
    // Sa machine et sa version au survol ; sa pastille, un disque vert ou un anneau gris.
    assert.equal(station("Mac").dessous("p")[0]?.title, "macOS 26.0 · version 2.4.0");
    assert.deepEqual(
      screen.dessous("span").filter((pose) => pose.className === "pastille").map((pose) => [pose.dataset.ton, pose.dataset.forme]),
      [
        ["vert", "disque"],
        ["gris", "anneau"],
      ],
    );
    assert.ok(cards(screen).every((card) => card.className.split(" ").includes("carte")));
  });

  test("un clic sur un projet l'ouvre : sa station, son nom et son dépôt — aucun dossier n'est demandé", () => {
    const { station, faits: facts } = oneScreen({ stations: LISTED });
    const parade = station("parade-box").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail();
    assert.equal(parade.title, "benomite/parade");
    parade.click();
    assert.deepEqual(facts, ["ouvrir gbox parade benomite/parade"]);
  });

  test("un projet dont la station ne dit pas le dépôt ne s'ouvre pas, et dit pourquoi au survol", () => {
    const { station, faits: facts } = oneScreen({ stations: LISTED });
    const cantine = station("parade-box").dessous("button").find((button) => button.textContent === "cantine") ?? assert.fail();
    assert.equal(cantine.disabled, true);
    assert.equal(cantine.title, REPOSITORY_UNKNOWN);
    cantine.click();
    assert.deepEqual(facts, []);
  });

  test("une station sans projet le dit ; une station illisible se compte, sa raison au survol", () => {
    const { station, ecran: screen } = oneScreen({ stations: { ...LISTED, stations: [{ ...LISTED.stations[0]!, projects: [] }], unreadable: [{ id: "g9", reason: "its state on GitHub is not JSON" }] } });
    assert.equal(station("Mac").dessous("p")[1]?.textContent, WITHOUT_PROJECT);
    const unreadable = screen.dessous("p").find((line) => line.className === "indisponible") ?? assert.fail();
    assert.equal(unreadable.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.equal(unreadable.dessous("button")[0]?.ariaLabel, "g9: its state on GitHub is not JSON");
  });

  test("le projet qui s'ouvre : l'étape de sa copie sous sa station, et rien d'autre ne s'ouvre en même temps", () => {
    const before = oneScreen({ stations: LISTED, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade" } });
    const line = () => before.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture") ?? assert.fail("pas d'étape");
    assert.equal(line().textContent, openingOf("parade"));
    assert.equal(line().role, "status");
    // Les autres projets attendent : un clone à la fois.
    assert.ok(before.ecran.dessous("button").filter((button) => button.className === "mono").every((button) => button.disabled));
    assert.equal(before.station("Mac").dessous("p").some((pose) => pose.className === "ouverture"), false);
    const during = oneScreen({ stations: LISTED, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", etape: { stage: "cloning", sentence: "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.", percent: 42 } } });
    assert.equal(during.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.");
  });

  test("le clone qui échoue : la phrase du runtime, son détail au survol, la page qui le lève, et « try again »", () => {
    const failure = failureOfClone("ERROR: Permission to benomite/parade.git denied to chef.\nfatal: unable to access 'https://github.com/benomite/parade.git/': The requested URL returned error: 403");
    assert.equal(failure.cause, "access-denied");
    const { station, faits: facts, bouton: button } = oneScreen({ stations: LISTED, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec: failure } });
    const refusal = station("parade-box").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, failure.reason);
    assert.match(refusal.dessous("button")[0]?.ariaLabel ?? "", /denied to chef/);
    assert.doesNotMatch(refusal.dessous("span")[0]?.textContent ?? "", /fatal:|403/);
    button(buttonOfThePage("https://github.com/benomite/parade")).click();
    button(RETRY).click();
    assert.deepEqual(facts, ["page https://github.com/benomite/parade", "ouvrir gbox parade benomite/parade"]);
    // Ratée, l'ouverture ne retient plus les autres projets.
    assert.equal(station("Mac").dessous("button")[0]?.disabled, false);
  });

  test("un clone retenu faute de compte GitHub : le bouton de connexion, aux mots de l'étape du compte, recommandé", () => {
    const failure = failureOfClone("remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true);
    assert.equal(failure.cause, "sign-in-required");
    const { faits: facts, bouton: button } = oneScreen({ stations: LISTED, compte: { login: "chef" }, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec: failure } });
    const connection = button(ITSELF_CONNECT);
    assert.equal(connection.className, "recommande");
    connection.click();
    assert.deepEqual(facts, ["se connecter"]);
  });
});

describe("une connexion à GitHub requise : l'étape du compte la fait d'un bouton", () => {
  test("le bouton de l'étape du compte lance la connexion ; la phrase des stations dit pourquoi elles attendent, sans second bouton", () => {
    assert.equal(WITHOUT_ACCOUNT.state, "sign-in-required");
    const { tete: head, bouton: button, faits: facts, ecran: screen } = oneScreen({ stations: WITHOUT_ACCOUNT, compte: { nonConnecte: true } });
    assert.equal(head().textContent, "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.");
    const connection = button(ITSELF_CONNECT);
    assert.equal(connection.className, "recommande");
    connection.click();
    assert.deepEqual(facts, ["se connecter"]);
    assert.equal(cards(screen).length, 0);
    assert.equal(screen.dessous("button").filter((candidate) => /sign in|connect/i.test(candidate.textContent)).length, 1);
  });

  test("lancée, le bouton attend ; le code à taper se lit, en monospace, et la page se rouvre d'un bouton", () => {
    assert.equal(oneScreen({ stations: WITHOUT_ACCOUNT, compte: { nonConnecte: true }, connexion: { enRoute: true } }).bouton(CONNECTION_IN_ROUTE).disabled, true);
    const { ecran: screen, bouton: button, faits: facts } = oneScreen({ stations: WITHOUT_ACCOUNT, compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    const said = screen.dessous("p").find((pose) => pose.className === "code-de-connexion") ?? assert.fail("pas de code");
    assert.equal(said.textContent, tapeTheCode("A1B2-C3D4"));
    assert.equal(said.dessous("strong")[0]?.className, "mono");
    assert.equal(button(CONNECTION_IN_ROUTE).disabled, true);
    button(REOPEN_THE_PAGE).click();
    assert.deepEqual(facts, ["page https://github.com/login/device"]);
  });

  test("ratée, la connexion dit pourquoi en une phrase, son détail au survol, et le bouton la relance", () => {
    const { ecran: screen, bouton: button, faits: facts } = oneScreen({ stations: WITHOUT_ACCOUNT, compte: { nonConnecte: true }, connexion: { refus: "GitHub sign-in did not finish (code 1): authentication timed out.", detail: "! First copy your one-time code: A1B2-C3D4\nerror: authentication timed out" } });
    const refusal = screen.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail();
    assert.equal(refusal.dessous("span")[0]?.textContent, "GitHub sign-in did not finish (code 1): authentication timed out.");
    assert.match(refusal.dessous("button")[0]?.ariaLabel ?? "", /one-time code/);
    button(ITSELF_CONNECT).click();
    assert.deepEqual(facts, ["se connecter"]);
  });
});

describe("les stations ne se lisent pas : la raison en une phrase, jamais un écran vide", () => {
  test("sans `gh` : la phrase du runtime, son détail au survol, le bouton de sa page, et « read again »", () => {
    assert.equal(WITHOUT_GH.state, "unavailable");
    const { tete: head, bouton: button, faits: facts } = oneScreen({ stations: WITHOUT_GH });
    // Ses mots entre accents graves posés en code, comme sur toute phrase du runtime.
    assert.equal(head().dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer, and brigade reads your stations on GitHub through it.");
    assert.deepEqual(head().dessous("code").map((code) => [code.textContent, code.className]), [["gh", "mono"]]);
    assert.equal(head().dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(button("get the GitHub CLI").className, "recommande");
    button("get the GitHub CLI").click();
    button(REREAD).click();
    assert.deepEqual(facts, ["page https://cli.github.com", "relire"]);
  });

  test("sans réseau : la phrase, et « read again », recommandé faute de page", () => {
    const { tete: head, bouton: button } = oneScreen({ stations: WITHOUT_NETWORK, compte: { login: "chef" } });
    assert.equal(head().dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so your stations could not be read: check its network connection.");
    assert.equal(button(REREAD).className, "recommande");
  });

  test("la page qui lève la panne n'est offerte qu'une fois : l'étape du compte, qui bute sur la même, l'offre déjà", () => {
    const { ecran: screen } = oneScreen({ stations: WITHOUT_GH, compte: { refus: "The GitHub CLI (`gh`) is not installed on this computer, and brigade reads your GitHub account through it.", lien: "https://cli.github.com" } });
    assert.equal(screen.dessous("button").filter((button) => button.textContent === "get the GitHub CLI").length, 1);
    assert.equal(screen.dessous("button").filter((button) => button.className === "recommande").length, 1);
  });

  test("aucune station appairée : la phrase du runtime ; la lecture en route : la phrase qui le dit", () => {
    const no = oneScreen({ stations: { state: "listed", stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows." } });
    assert.equal(no.tete().textContent, "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows.");
    assert.equal(oneScreen().tete().textContent, READING);
  });

  test("dans chaque état, l'écran « Add a project » reste à un clic, sous le reste", () => {
    for (const stations of [undefined, LISTED, WITHOUT_ACCOUNT, WITHOUT_GH]) {
      const { ecran: screen, bouton: button, faits: facts } = oneScreen(stations === undefined ? {} : { stations });
      assert.ok(screen.textContent.trim() !== "");
      assert.equal(screen.children.at(-1)?.dessous("button")[0]?.textContent, BY_ITS_REPOSITORIES);
      button(BY_ITS_REPOSITORIES).click();
      assert.deepEqual(facts, ["ajout"]);
    }
  });
});

describe("le premier lancement : sa phrase d'accueil, puis le compte — jamais tapé, et aucun bloc d'étapes (#3181)", () => {
  test("la phrase d'accueil ouvre l'écran ; le compte connecté se dit dessous ; ni étapes numérotées, ni « Your GitHub account »", () => {
    const { ecran: screen } = oneScreen({ stations: LISTED, compte: { login: "chef" } });
    assert.equal(screen.children[0]?.textContent, WELCOME);
    const account = screen.children[1] ?? assert.fail();
    assert.ok(account.dessous("p").some((pose) => pose.textContent === connectedAs("chef")));
    assert.deepEqual([...screen.dessous("ol"), ...screen.dessous("li")], []);
    assert.doesNotMatch(screen.textContent, /Your GitHub account|Add a project/);
  });
});

describe("le premier lancement demande le projet de qui l'ouvre, sans rien de présupposé", () => {
  const fields = (screen: Fake) => screen.dessous("input");
  const type = (field: Fake | undefined, value: string) => {
    if (field === undefined) assert.fail("pas de champ");
    field.value = value;
    field.declencher("input");
  };
  test("un seul champ, vide, à l'exemple neutre, dans chaque état de la lecture des stations : aucun ne demande le compte", () => {
    for (const stations of [undefined, LISTED, WITHOUT_ACCOUNT, WITHOUT_GH, WITHOUT_NETWORK]) {
      for (const account of [undefined, { login: "chef" }, { nonConnecte: true as const }]) {
        const { ecran: screen } = oneScreen({ ...(stations === undefined ? {} : { stations }), ...(account === undefined ? {} : { compte: account }) });
        assert.deepEqual(fields(screen).map((field) => [field.value, field.placeholder]), [["", PROJECT_EXAMPLE]]);
        assert.deepEqual(screen.dessous("label").map((name) => name.textContent), [PROJECT]);
      }
    }
    assert.match(PROJECT_EXAMPLE, /^owner\/repo/);
  });

  test("un dépôt tapé s'ouvre par la copie du runtime, sous un nom tiré du dépôt, sans station", () => {
    const { ecran: screen, bouton: button, faits: facts } = oneScreen();
    const [project] = fields(screen);
    type(project, "Some-Owner/My_Repo");
    button(OPEN_THIS_PROJECT).click();
    assert.deepEqual(facts, ["ouvrir  my-repo Some-Owner/My_Repo"]);
  });

  test("un nom seul est complété par le compte connecté ; sans compte, la phrase le dit et rien ne part", () => {
    const without = oneScreen({ compte: { nonConnecte: true } });
    type(fields(without.ecran)[0], "parade");
    without.bouton(OPEN_THIS_PROJECT).click();
    assert.deepEqual(without.faits, []);
    assert.match(without.ecran.dessous("p").find((p) => p.className === "refus-champ")?.textContent ?? "", /Connect to GitHub above/);
    const connected = oneScreen({ compte: { login: "someone" } });
    type(fields(connected.ecran)[0], "parade");
    connected.bouton(OPEN_THIS_PROJECT).click();
    assert.deepEqual(connected.faits, ["ouvrir  parade someone/parade"]);
  });

  test("un chemin de dossier n'est pas un dépôt : aucun dossier n'est demandé ni pris (#3181), la phrase le dit et rien ne part", () => {
    for (const path of ["/work/thing", "~/code/thing", "./thing", "C:\\code\\thing"]) {
      const { ecran: screen, bouton: button, faits: facts } = oneScreen({ compte: { login: "chef" } });
      const project = fields(screen)[0];
      type(project, path);
      button(OPEN_THIS_PROJECT).click();
      assert.deepEqual(facts, [], path);
      assert.equal(screen.dessous("p").find((p) => p.className === "refus-champ")?.textContent, PROJECT_UNREADABLE.replaceAll("`", ""), path);
    }
  });

  test("ce qui se lit mal ne part pas, et dit pourquoi ; l'adresse GitHub se reconnaît", () => {
    assert.deepEqual(readTheProject("", ""), { refus: PROJECT_MISSING });
    assert.deepEqual(readTheProject("", "parade"), { refus: ACCOUNT_MISSING });
    assert.deepEqual(readTheProject("x", "a b/c"), { refus: PROJECT_UNREADABLE });
    assert.deepEqual(readTheProject("", "https://github.com/owner/repo.git"), { depot: "owner/repo", nom: "repo" });
  });

  test("ce qui est tapé reste d'un affichage à l'autre, et l'ouverture lancée d'ici se dit sous le formulaire", () => {
    const input = { projet: "someone/parade" };
    const { ecran: screen, bouton: button } = oneScreen({ saisie: input, ouverture: { station: "", projet: "parade", depot: "someone/parade" } });
    assert.deepEqual(fields(screen).map((field) => field.value), ["someone/parade"]);
    assert.ok(screen.dessous("p").some((p) => p.textContent === openingOf("parade")));
    assert.equal(button(OPEN_THIS_PROJECT).disabled, true);
  });
});

// La vue jouée entière : l'app neuve, sans aucun projet dans son fichier.
const startup = (projects: Project[]) => ({
  configuration: forTheBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: projects }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
// Une réponse du pont qui ne vient qu'au moment voulu : le faux pont la rend telle quelle, la vue l'attend.
const queued = (wait: (resolve: (opening: Opening) => void) => void) => new Promise<Opening>(wait) as unknown as Opening;
const PARADE: Project = { nom: "parade", dossier: "C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade", depot: "benomite/parade", base: "main" };

describe("la vue jouée : l'app ouverte pour la première fois sur un PC neuf", () => {
  test("elle s'ouvre sur les stations du chef, lues par le runtime ; un clic ouvre parade, sans dossier, et son espace s'ouvre", async () => {
    let open: (opening: Opening) => void = () => {};
    const vue = await playTheVue({
      demarrage: () => startup([]),
      stationsDuChef: () => LISTED,
      ouvrirDUneStation: () => queued((resolve) => (open = resolve)),
      espace: () => [],
    });
    const all = vue.element("tous");
    assert.equal(all.hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(all.dessous("h3")[0]?.textContent, OPEN_ONE_PROJECT("this computer"));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "stationsDuChef").length, 1);
    const parade = all.dessous("button").find((button) => button.textContent === "parade") ?? assert.fail();
    parade.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "benomite/parade"]);
    const step = () => vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent;
    assert.equal(step(), openingOf("parade"));
    // Chaque étape du runtime se dit à sa place ; celle d'un autre dépôt n'y touche pas.
    vue.dire("surOuverture", "benomite/parade", { stage: "cloning", sentence: "Cloning benomite/parade — 42%.", percent: 42 });
    vue.dire("surOuverture", "benomite/brigade", { stage: "cloning", sentence: "Cloning benomite/brigade — 7%.", percent: 7 });
    assert.equal(step(), "Cloning benomite/parade — 42%.");
    // Ouvert : le fichier l'a, puis la réponse arrive — son espace s'ouvre.
    vue.dire("surConfiguration", forTheBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
    open({ state: "open", project: "parade", repository: "benomite/parade", folder: PARADE.dossier, cloned: true });
    await repos();
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("tous").hidden, true);
  });

  test("la réponse arrivée avant le fichier : l'espace s'ouvre dès que le projet y est", async () => {
    const vue = await playTheVue({
      demarrage: () => startup([]),
      stationsDuChef: () => LISTED,
      ouvrirDUneStation: () => ({ state: "open", project: "parade", repository: "benomite/parade", folder: PARADE.dossier, cloned: true }),
      espace: () => [],
    });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("espace").textContent, "");
    vue.dire("surConfiguration", forTheBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
    await repos();
    assert.equal(vue.element("espace").textContent, "parade");
  });

  test("le clone qui échoue : la raison reste à l'écran, sous sa station", async () => {
    const failure = failureOfClone("fatal: unable to access 'https://github.com/benomite/parade.git/': Could not resolve host: github.com");
    assert.equal(failure.cause, "network");
    const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => LISTED, compteGitHub: () => ({ login: "chef" }), ouvrirDUneStation: () => failure, espace: () => [] });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    const refusal = vue.element("tous").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, failure.reason);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("connexion requise : le bouton de l'étape du compte lance le geste du runtime, le code se lit ; connecté, le compte et les stations sont relus", async () => {
    let readEntries = 0;
    let accounts = 0;
    const vue = await playTheVue({
      demarrage: () => startup([]),
      stationsDuChef: () => (++readEntries === 1 ? WITHOUT_ACCOUNT : LISTED),
      compteGitHub: () => (++accounts === 1 ? { nonConnecte: true } : { login: "chef" }),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    const all = vue.element("tous");
    assert.equal(all.dessous("h3")[0]?.textContent, WITHOUT_ACCOUNT.state === "sign-in-required" ? WITHOUT_ACCOUNT.reason : "");
    (all.dessous("button").find((button) => button.textContent === ITSELF_CONNECT) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "seConnecterAGitHub").length, 1);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeTheCode("A1B2-C3D4"));
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(readEntries, 2);
    assert.equal(accounts, 2);
    assert.equal(vue.element("tous").dessous("h3")[0]?.textContent, OPEN_ONE_PROJECT("this computer"));
    assert.ok(vue.element("tous").dessous("p").some((pose) => pose.textContent === connectedAs("chef")));
  });

  test("connecté pour un clone retenu faute de compte : l'ouverture repart d'elle-même", async () => {
    let trials = 0;
    const vue = await playTheVue({
      demarrage: () => startup([]),
      stationsDuChef: () => LISTED,
      ouvrirDUneStation: () => (++trials === 1 ? failureOfClone("fatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true) : queued(() => {})),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    (vue.element("tous").dessous("button").find((button) => button.textContent === ITSELF_CONNECT) ?? assert.fail()).click();
    await repos();
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(trials, 2);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, openingOf("parade"));
  });

  test("« T » ramène à l'accueil du premier lancement (4082), le bouton du bas à l'écran « Add a project »", async () => {
    const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => LISTED, espace: () => [] });
    (vue.element("tous").dessous("button").find((button) => button.textContent === BY_ITS_REPOSITORIES) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    (vue.poses().find((pose) => pose.id === "entree-tous") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(vue.element("tous").dessous("p").some((line) => line.textContent === WELCOME), true);
  });
});
