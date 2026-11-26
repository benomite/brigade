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
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture } from "../../src/first-launch.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import {
  buttonDeLaPage,
  ACCOUNT_MANQUE,
  lireLeProject,
  OUVRIR_CE_PROJECT,
  PROJECT,
  PROJECT_EXEMPLE,
  PROJECT_ILLISIBLE,
  PROJECT_MANQUE,
  CONNECTION_EN_ROUTE,
  REPOSITORY_INCONNU,
  READ,
  OUVRIR_UN_PROJECT,
  ouvertureDe,
  PAR_SES_DEPOTS,
  BIENVENUE,
  poserFirstLaunch,
  REESSAYER,
  RELIRE,
  ROUVRIR_LA_PAGE,
  SANS_PROJECT,
  tapeLeCode,
  type StateDuFirst,
  type ActionsDuFirst,
} from "../../src/vue/first-launch.js";
import { connecteEnTantQue, SE_CONNECTER } from "../../src/vue/journey-project/account.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VU = "2026-10-22T09:00:00.000Z";

// Les stations du chef telles que le runtime les rend : son Mac et parade-box, qui portent brigade et parade.
const LISTEES: StationsDuChef = {
  state: "listed",
  unreadable: [],
  stations: [
    { id: "gmac", name: "Mac", machine: "macOS 26.0", kind: "ordinateur", cooks: true, version: "2.4.0", online: true, lastSeen: VU, stoppedAt: null, projects: [{ name: "brigade", repository: "benomite/brigade" }] },
    {
      id: "gbox",
      name: "parade-box",
      machine: "Debian 12 · 8 cores",
      kind: "ordinateur",
      cooks: true,
      version: "2.4.0",
      online: false,
      lastSeen: VU,
      stoppedAt: VU,
      projects: [
        { name: "brigade", repository: "benomite/brigade" },
        { name: "parade", repository: "benomite/parade" },
        { name: "cantine", repository: null },
      ],
    },
  ],
};
// Ce `gh` n'a pas de compte : son code de sortie 4, « authentication required ».
const SANS_ACCOUNT = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Pas de `gh` du tout sur ce PC.
const SANS_GH = echecDeGh("gh", 30_000, { code: "ENOENT", message: "spawn gh ENOENT" }, "");
// GitHub injoignable.
const SANS_RESEAU = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Un clone qui échoue, comme le runtime le rend.
const failureDuClone = (erreurs: string, action = false): Extract<Ouverture, { state: "failed" }> => {
  const failure = lireLEchec("benomite/parade", erreurs, { compte: "chef", jeton: null, proprietaire: true });
  return { state: "failed", project: "parade", repository: "benomite/parade", ...failure, ...(action ? { action: connexionGitHub("gh") } : {}) };
};

// Les cartes des stations.
const cards = (screen: Faux) => screen.dessous("section").filter((card) => card.className.split(" ").includes("station-du-chef"));

function unScreen(state: Partial<StateDuFirst> = {}) {
  const facts: string[] = [];
  const actions: ActionsDuFirst = {
    ouvrir: (station, project, repository) => void facts.push(`ouvrir ${station} ${project} ${repository}`),
    seConnecter: () => void facts.push("se connecter"),
    changerDeCompte: () => void facts.push("changer de compte"),
    relireLeCompte: () => void facts.push("relire le compte"),
    relire: () => void facts.push("relire"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
    ajouterUnProjet: () => void facts.push("ajout"),
  };
  const screen = poserFirstLaunch(doc, { poste: "this computer", ...state }, actions) as Faux;
  const button = (texte: string) => screen.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${screen.dessous("button").map((b) => b.textContent).join(", ")}`);
  // La phrase des stations, sous le compte.
  const tete = () => screen.dessous("h3")[0] ?? assert.fail("pas de phrase des stations");
  const station = (name: string) => cards(screen).find((card) => card.ariaLabel === name) ?? assert.fail(`pas de station « ${name} »`);
  return { ecran: screen, faits: facts, bouton: button, tete, station };
}

describe("les stations listées : chacune avec ses projets, un projet s'ouvre d'un clic", () => {
  test("la tête dit ce qu'on attend du chef ; chaque station a son nom, son état, ses projets en boutons", () => {
    const { tete, station, ecran: screen } = unScreen({ stations: LISTEES });
    assert.equal(tete().textContent, OUVRIR_UN_PROJECT("this computer"));
    assert.equal(OUVRIR_UN_PROJECT("this computer"), "Open one of your projects on this computer: one click, no folder to choose.");
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
    const { station, faits: facts } = unScreen({ stations: LISTEES });
    const parade = station("parade-box").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail();
    assert.equal(parade.title, "benomite/parade");
    parade.click();
    assert.deepEqual(facts, ["ouvrir gbox parade benomite/parade"]);
  });

  test("un projet dont la station ne dit pas le dépôt ne s'ouvre pas, et dit pourquoi au survol", () => {
    const { station, faits: facts } = unScreen({ stations: LISTEES });
    const cantine = station("parade-box").dessous("button").find((button) => button.textContent === "cantine") ?? assert.fail();
    assert.equal(cantine.disabled, true);
    assert.equal(cantine.title, REPOSITORY_INCONNU);
    cantine.click();
    assert.deepEqual(facts, []);
  });

  test("une station sans projet le dit ; une station illisible se compte, sa raison au survol", () => {
    const { station, ecran: screen } = unScreen({ stations: { ...LISTEES, stations: [{ ...LISTEES.stations[0]!, projects: [] }], unreadable: [{ id: "g9", reason: "its state on GitHub is not JSON" }] } });
    assert.equal(station("Mac").dessous("p")[1]?.textContent, SANS_PROJECT);
    const illisibles = screen.dessous("p").find((line) => line.className === "indisponible") ?? assert.fail();
    assert.equal(illisibles.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.equal(illisibles.dessous("button")[0]?.ariaLabel, "g9: its state on GitHub is not JSON");
  });

  test("le projet qui s'ouvre : l'étape de sa copie sous sa station, et rien d'autre ne s'ouvre en même temps", () => {
    const avant = unScreen({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade" } });
    const line = () => avant.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture") ?? assert.fail("pas d'étape");
    assert.equal(line().textContent, ouvertureDe("parade"));
    assert.equal(line().role, "status");
    // Les autres projets attendent : un clone à la fois.
    assert.ok(avant.ecran.dessous("button").filter((button) => button.className === "mono").every((button) => button.disabled));
    assert.equal(avant.station("Mac").dessous("p").some((pose) => pose.className === "ouverture"), false);
    const pendant = unScreen({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", etape: { stage: "cloning", sentence: "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.", percent: 42 } } });
    assert.equal(pendant.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.");
  });

  test("le clone qui échoue : la phrase du runtime, son détail au survol, la page qui le lève, et « try again »", () => {
    const failure = failureDuClone("ERROR: Permission to benomite/parade.git denied to chef.\nfatal: unable to access 'https://github.com/benomite/parade.git/': The requested URL returned error: 403");
    assert.equal(failure.cause, "access-denied");
    const { station, faits: facts, bouton: button } = unScreen({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec: failure } });
    const refusal = station("parade-box").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, failure.reason);
    assert.match(refusal.dessous("button")[0]?.ariaLabel ?? "", /denied to chef/);
    assert.doesNotMatch(refusal.dessous("span")[0]?.textContent ?? "", /fatal:|403/);
    button(buttonDeLaPage("https://github.com/benomite/parade")).click();
    button(REESSAYER).click();
    assert.deepEqual(facts, ["page https://github.com/benomite/parade", "ouvrir gbox parade benomite/parade"]);
    // Ratée, l'ouverture ne retient plus les autres projets.
    assert.equal(station("Mac").dessous("button")[0]?.disabled, false);
  });

  test("un clone retenu faute de compte GitHub : le bouton de connexion, aux mots de l'étape du compte, recommandé", () => {
    const failure = failureDuClone("remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true);
    assert.equal(failure.cause, "sign-in-required");
    const { faits: facts, bouton: button } = unScreen({ stations: LISTEES, compte: { login: "chef" }, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec: failure } });
    const connection = button(SE_CONNECTER);
    assert.equal(connection.className, "recommande");
    connection.click();
    assert.deepEqual(facts, ["se connecter"]);
  });
});

describe("une connexion à GitHub requise : l'étape du compte la fait d'un bouton", () => {
  test("le bouton de l'étape du compte lance la connexion ; la phrase des stations dit pourquoi elles attendent, sans second bouton", () => {
    assert.equal(SANS_ACCOUNT.state, "sign-in-required");
    const { tete, bouton: button, faits: facts, ecran: screen } = unScreen({ stations: SANS_ACCOUNT, compte: { nonConnecte: true } });
    assert.equal(tete().textContent, "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.");
    const connection = button(SE_CONNECTER);
    assert.equal(connection.className, "recommande");
    connection.click();
    assert.deepEqual(facts, ["se connecter"]);
    assert.equal(cards(screen).length, 0);
    assert.equal(screen.dessous("button").filter((candidat) => /sign in|connect/i.test(candidat.textContent)).length, 1);
  });

  test("lancée, le bouton attend ; le code à taper se lit, en monospace, et la page se rouvre d'un bouton", () => {
    assert.equal(unScreen({ stations: SANS_ACCOUNT, compte: { nonConnecte: true }, connexion: { enRoute: true } }).bouton(CONNECTION_EN_ROUTE).disabled, true);
    const { ecran: screen, bouton: button, faits: facts } = unScreen({ stations: SANS_ACCOUNT, compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    const dit = screen.dessous("p").find((pose) => pose.className === "code-de-connexion") ?? assert.fail("pas de code");
    assert.equal(dit.textContent, tapeLeCode("A1B2-C3D4"));
    assert.equal(dit.dessous("strong")[0]?.className, "mono");
    assert.equal(button(CONNECTION_EN_ROUTE).disabled, true);
    button(ROUVRIR_LA_PAGE).click();
    assert.deepEqual(facts, ["page https://github.com/login/device"]);
  });

  test("ratée, la connexion dit pourquoi en une phrase, son détail au survol, et le bouton la relance", () => {
    const { ecran: screen, bouton: button, faits: facts } = unScreen({ stations: SANS_ACCOUNT, compte: { nonConnecte: true }, connexion: { refus: "GitHub sign-in did not finish (code 1): authentication timed out.", detail: "! First copy your one-time code: A1B2-C3D4\nerror: authentication timed out" } });
    const refusal = screen.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail();
    assert.equal(refusal.dessous("span")[0]?.textContent, "GitHub sign-in did not finish (code 1): authentication timed out.");
    assert.match(refusal.dessous("button")[0]?.ariaLabel ?? "", /one-time code/);
    button(SE_CONNECTER).click();
    assert.deepEqual(facts, ["se connecter"]);
  });
});

describe("les stations ne se lisent pas : la raison en une phrase, jamais un écran vide", () => {
  test("sans `gh` : la phrase du runtime, son détail au survol, le bouton de sa page, et « read again »", () => {
    assert.equal(SANS_GH.state, "unavailable");
    const { tete, bouton: button, faits: facts } = unScreen({ stations: SANS_GH });
    // Ses mots entre accents graves posés en code, comme sur toute phrase du runtime.
    assert.equal(tete().dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer, and brigade reads your stations on GitHub through it.");
    assert.deepEqual(tete().dessous("code").map((code) => [code.textContent, code.className]), [["gh", "mono"]]);
    assert.equal(tete().dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(button("get the GitHub CLI").className, "recommande");
    button("get the GitHub CLI").click();
    button(RELIRE).click();
    assert.deepEqual(facts, ["page https://cli.github.com", "relire"]);
  });

  test("sans réseau : la phrase, et « read again », recommandé faute de page", () => {
    const { tete, bouton: button } = unScreen({ stations: SANS_RESEAU, compte: { login: "chef" } });
    assert.equal(tete().dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so your stations could not be read: check its network connection.");
    assert.equal(button(RELIRE).className, "recommande");
  });

  test("la page qui lève la panne n'est offerte qu'une fois : l'étape du compte, qui bute sur la même, l'offre déjà", () => {
    const { ecran: screen } = unScreen({ stations: SANS_GH, compte: { refus: "The GitHub CLI (`gh`) is not installed on this computer, and brigade reads your GitHub account through it.", lien: "https://cli.github.com" } });
    assert.equal(screen.dessous("button").filter((button) => button.textContent === "get the GitHub CLI").length, 1);
    assert.equal(screen.dessous("button").filter((button) => button.className === "recommande").length, 1);
  });

  test("aucune station appairée : la phrase du runtime ; la lecture en route : la phrase qui le dit", () => {
    const aucune = unScreen({ stations: { state: "listed", stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows." } });
    assert.equal(aucune.tete().textContent, "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows.");
    assert.equal(unScreen().tete().textContent, READ);
  });

  test("dans chaque état, l'écran « Add a project » reste à un clic, sous le reste", () => {
    for (const stations of [undefined, LISTEES, SANS_ACCOUNT, SANS_GH]) {
      const { ecran: screen, bouton: button, faits: facts } = unScreen(stations === undefined ? {} : { stations });
      assert.ok(screen.textContent.trim() !== "");
      assert.equal(screen.children.at(-1)?.dessous("button")[0]?.textContent, PAR_SES_DEPOTS);
      button(PAR_SES_DEPOTS).click();
      assert.deepEqual(facts, ["ajout"]);
    }
  });
});

describe("le premier lancement : sa phrase d'accueil, puis le compte — jamais tapé, et aucun bloc d'étapes (#3181)", () => {
  test("la phrase d'accueil ouvre l'écran ; le compte connecté se dit dessous ; ni étapes numérotées, ni « Your GitHub account »", () => {
    const { ecran: screen } = unScreen({ stations: LISTEES, compte: { login: "chef" } });
    assert.equal(screen.children[0]?.textContent, BIENVENUE);
    const account = screen.children[1] ?? assert.fail();
    assert.ok(account.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("chef")));
    assert.deepEqual([...screen.dessous("ol"), ...screen.dessous("li")], []);
    assert.doesNotMatch(screen.textContent, /Your GitHub account|Add a project/);
  });
});

describe("le premier lancement demande le projet de qui l'ouvre, sans rien de présupposé", () => {
  const champs = (screen: Faux) => screen.dessous("input");
  const taper = (champ: Faux | undefined, valeur: string) => {
    if (champ === undefined) assert.fail("pas de champ");
    champ.value = valeur;
    champ.declencher("input");
  };
  test("un seul champ, vide, à l'exemple neutre, dans chaque état de la lecture des stations : aucun ne demande le compte", () => {
    for (const stations of [undefined, LISTEES, SANS_ACCOUNT, SANS_GH, SANS_RESEAU]) {
      for (const account of [undefined, { login: "chef" }, { nonConnecte: true as const }]) {
        const { ecran: screen } = unScreen({ ...(stations === undefined ? {} : { stations }), ...(account === undefined ? {} : { compte: account }) });
        assert.deepEqual(champs(screen).map((champ) => [champ.value, champ.placeholder]), [["", PROJECT_EXEMPLE]]);
        assert.deepEqual(screen.dessous("label").map((name) => name.textContent), [PROJECT]);
      }
    }
    assert.match(PROJECT_EXEMPLE, /^owner\/repo/);
  });

  test("un dépôt tapé s'ouvre par la copie du runtime, sous un nom tiré du dépôt, sans station", () => {
    const { ecran: screen, bouton: button, faits: facts } = unScreen();
    const [project] = champs(screen);
    taper(project, "Some-Owner/My_Repo");
    button(OUVRIR_CE_PROJECT).click();
    assert.deepEqual(facts, ["ouvrir  my-repo Some-Owner/My_Repo"]);
  });

  test("un nom seul est complété par le compte connecté ; sans compte, la phrase le dit et rien ne part", () => {
    const sans = unScreen({ compte: { nonConnecte: true } });
    taper(champs(sans.ecran)[0], "parade");
    sans.bouton(OUVRIR_CE_PROJECT).click();
    assert.deepEqual(sans.faits, []);
    assert.match(sans.ecran.dessous("p").find((p) => p.className === "refus-champ")?.textContent ?? "", /Connect to GitHub above/);
    const connecte = unScreen({ compte: { login: "someone" } });
    taper(champs(connecte.ecran)[0], "parade");
    connecte.bouton(OUVRIR_CE_PROJECT).click();
    assert.deepEqual(connecte.faits, ["ouvrir  parade someone/parade"]);
  });

  test("un chemin de dossier n'est pas un dépôt : aucun dossier n'est demandé ni pris (#3181), la phrase le dit et rien ne part", () => {
    for (const chemin of ["/work/thing", "~/code/thing", "./thing", "C:\\code\\thing"]) {
      const { ecran: screen, bouton: button, faits: facts } = unScreen({ compte: { login: "chef" } });
      const project = champs(screen)[0];
      taper(project, chemin);
      button(OUVRIR_CE_PROJECT).click();
      assert.deepEqual(facts, [], chemin);
      assert.equal(screen.dessous("p").find((p) => p.className === "refus-champ")?.textContent, PROJECT_ILLISIBLE.replaceAll("`", ""), chemin);
    }
  });

  test("ce qui se lit mal ne part pas, et dit pourquoi ; l'adresse GitHub se reconnaît", () => {
    assert.deepEqual(lireLeProject("", ""), { refus: PROJECT_MANQUE });
    assert.deepEqual(lireLeProject("", "parade"), { refus: ACCOUNT_MANQUE });
    assert.deepEqual(lireLeProject("x", "a b/c"), { refus: PROJECT_ILLISIBLE });
    assert.deepEqual(lireLeProject("", "https://github.com/owner/repo.git"), { depot: "owner/repo", nom: "repo" });
  });

  test("ce qui est tapé reste d'un affichage à l'autre, et l'ouverture lancée d'ici se dit sous le formulaire", () => {
    const saisie = { projet: "someone/parade" };
    const { ecran: screen, bouton: button } = unScreen({ saisie, ouverture: { station: "", projet: "parade", depot: "someone/parade" } });
    assert.deepEqual(champs(screen).map((champ) => champ.value), ["someone/parade"]);
    assert.ok(screen.dessous("p").some((p) => p.textContent === ouvertureDe("parade")));
    assert.equal(button(OUVRIR_CE_PROJECT).disabled, true);
  });
});

// La vue jouée entière : l'app neuve, sans aucun projet dans son fichier.
const demarrage = (projects: Project[]) => ({
  configuration: pourLaBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: projects }),
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
// Une réponse du pont qui ne vient qu'au moment voulu : le faux pont la rend telle quelle, la vue l'attend.
const queued = (attendre: (resoudre: (ouverture: Ouverture) => void) => void) => new Promise<Ouverture>(attendre) as unknown as Ouverture;
const PARADE: Project = { nom: "parade", dossier: "C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade", depot: "benomite/parade", base: "main" };

describe("la vue jouée : l'app ouverte pour la première fois sur un PC neuf", () => {
  test("elle s'ouvre sur les stations du chef, lues par le runtime ; un clic ouvre parade, sans dossier, et son espace s'ouvre", async () => {
    let ouvrir: (ouverture: Ouverture) => void = () => {};
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => LISTEES,
      ouvrirDUneStation: () => queued((resoudre) => (ouvrir = resoudre)),
      espace: () => [],
    });
    const tous = vue.element("tous");
    assert.equal(tous.hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(tous.dessous("h3")[0]?.textContent, OUVRIR_UN_PROJECT("this computer"));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "stationsDuChef").length, 1);
    const parade = tous.dessous("button").find((button) => button.textContent === "parade") ?? assert.fail();
    parade.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "benomite/parade"]);
    const step = () => vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent;
    assert.equal(step(), ouvertureDe("parade"));
    // Chaque étape du runtime se dit à sa place ; celle d'un autre dépôt n'y touche pas.
    vue.dire("surOuverture", "benomite/parade", { stage: "cloning", sentence: "Cloning benomite/parade — 42%.", percent: 42 });
    vue.dire("surOuverture", "benomite/brigade", { stage: "cloning", sentence: "Cloning benomite/brigade — 7%.", percent: 7 });
    assert.equal(step(), "Cloning benomite/parade — 42%.");
    // Ouvert : le fichier l'a, puis la réponse arrive — son espace s'ouvre.
    vue.dire("surConfiguration", pourLaBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
    ouvrir({ state: "open", project: "parade", repository: "benomite/parade", folder: PARADE.dossier, cloned: true });
    await repos();
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("tous").hidden, true);
  });

  test("la réponse arrivée avant le fichier : l'espace s'ouvre dès que le projet y est", async () => {
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => LISTEES,
      ouvrirDUneStation: () => ({ state: "open", project: "parade", repository: "benomite/parade", folder: PARADE.dossier, cloned: true }),
      espace: () => [],
    });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("espace").textContent, "");
    vue.dire("surConfiguration", pourLaBar({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
    await repos();
    assert.equal(vue.element("espace").textContent, "parade");
  });

  test("le clone qui échoue : la raison reste à l'écran, sous sa station", async () => {
    const failure = failureDuClone("fatal: unable to access 'https://github.com/benomite/parade.git/': Could not resolve host: github.com");
    assert.equal(failure.cause, "network");
    const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => LISTEES, compteGitHub: () => ({ login: "chef" }), ouvrirDUneStation: () => failure, espace: () => [] });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    const refusal = vue.element("tous").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, failure.reason);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("connexion requise : le bouton de l'étape du compte lance le geste du runtime, le code se lit ; connecté, le compte et les stations sont relus", async () => {
    let lues = 0;
    let comptes = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => (++lues === 1 ? SANS_ACCOUNT : LISTEES),
      compteGitHub: () => (++comptes === 1 ? { nonConnecte: true } : { login: "chef" }),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    const tous = vue.element("tous");
    assert.equal(tous.dessous("h3")[0]?.textContent, SANS_ACCOUNT.state === "sign-in-required" ? SANS_ACCOUNT.reason : "");
    (tous.dessous("button").find((button) => button.textContent === SE_CONNECTER) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "seConnecterAGitHub").length, 1);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(lues, 2);
    assert.equal(comptes, 2);
    assert.equal(vue.element("tous").dessous("h3")[0]?.textContent, OUVRIR_UN_PROJECT("this computer"));
    assert.ok(vue.element("tous").dessous("p").some((pose) => pose.textContent === connecteEnTantQue("chef")));
  });

  test("connecté pour un clone retenu faute de compte : l'ouverture repart d'elle-même", async () => {
    let essais = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => LISTEES,
      ouvrirDUneStation: () => (++essais === 1 ? failureDuClone("fatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true) : queued(() => {})),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
    await repos();
    (vue.element("tous").dessous("button").find((button) => button.textContent === SE_CONNECTER) ?? assert.fail()).click();
    await repos();
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(essais, 2);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, ouvertureDe("parade"));
  });

  test("« T » ramène à l'accueil du premier lancement (4082), le bouton du bas à l'écran « Add a project »", async () => {
    const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => LISTEES, espace: () => [] });
    (vue.element("tous").dessous("button").find((button) => button.textContent === PAR_SES_DEPOTS) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    (vue.poses().find((pose) => pose.id === "entree-tous") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(vue.element("tous").dessous("p").some((line) => line.textContent === BIENVENUE), true);
  });
});
