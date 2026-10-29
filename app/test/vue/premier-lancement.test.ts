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
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import {
  boutonDeLaPage,
  COMPTE,
  COMPTE_EXEMPLE,
  COMPTE_MANQUE,
  lireLeProjet,
  OUVRIR_CE_PROJET,
  PROJET,
  PROJET_EXEMPLE,
  PROJET_ILLISIBLE,
  PROJET_MANQUE,
  CONNEXION_EN_ROUTE,
  DEPOT_INCONNU,
  LECTURE,
  OUVRIR_UN_PROJET,
  ouvertureDe,
  PAR_UN_DOSSIER,
  poserPremierLancement,
  REESSAYER,
  RELIRE,
  ROUVRIR_LA_PAGE,
  SANS_PROJET,
  tapeLeCode,
  type EtatDuPremier,
  type GestesDuPremier,
} from "../../src/vue/premier-lancement.js";
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
const SANS_COMPTE = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Pas de `gh` du tout sur ce PC.
const SANS_GH = echecDeGh("gh", 30_000, { code: "ENOENT", message: "spawn gh ENOENT" }, "");
// GitHub injoignable.
const SANS_RESEAU = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Un clone qui échoue, comme le runtime le rend.
const echecDuClone = (erreurs: string, action = false): Extract<Ouverture, { state: "failed" }> => {
  const echec = lireLEchec("benomite/parade", erreurs, { compte: "chef", jeton: null, proprietaire: true });
  return { state: "failed", project: "parade", repository: "benomite/parade", ...echec, ...(action ? { action: connexionGitHub("gh") } : {}) };
};

function unEcran(etat: Partial<EtatDuPremier> = {}) {
  const faits: string[] = [];
  const gestes: GestesDuPremier = {
    ouvrir: (station, projet, depot) => void faits.push(`ouvrir ${station} ${projet} ${depot}`),
    seConnecter: () => void faits.push("se connecter"),
    relire: () => void faits.push("relire"),
    ouvrirLaPage: (url) => void faits.push(`page ${url}`),
    ajouterUnDossier: () => void faits.push("ajout"),
    ouvrirUnDossier: (dossier) => void faits.push(`dossier ${dossier}`),
  };
  const ecran = poserPremierLancement(doc, { poste: "this PC", ...etat }, gestes) as Faux;
  const bouton = (texte: string) => ecran.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${ecran.dessous("button").map((b) => b.textContent).join(", ")}`);
  const tete = () => ecran.dessous("h2")[0] ?? assert.fail("pas de phrase en tête");
  const station = (nom: string) => ecran.dessous("section").find((carte) => carte.ariaLabel === nom) ?? assert.fail(`pas de station « ${nom} »`);
  return { ecran, faits, bouton, tete, station };
}

describe("les stations listées : chacune avec ses projets, un projet s'ouvre d'un clic", () => {
  test("la tête dit ce qu'on attend du chef ; chaque station a son nom, son état, ses projets en boutons", () => {
    const { tete, station, ecran } = unEcran({ stations: LISTEES });
    assert.equal(tete().textContent, OUVRIR_UN_PROJET("this PC"));
    assert.equal(OUVRIR_UN_PROJET("this PC"), "Open one of your projects on this PC: one click, no folder to choose.");
    assert.deepEqual(
      ecran.dessous("section").map((carte) => ({ nom: carte.dessous("strong")[0]?.textContent, etat: carte.dessous("p")[0]?.dessous("span").at(-1)?.textContent, projets: carte.dessous("button").map((bouton) => bouton.textContent) })),
      [
        { nom: "Mac", etat: "online", projets: ["brigade"] },
        { nom: "parade-box", etat: "offline", projets: ["brigade", "parade", "cantine"] },
      ],
    );
    // Sa machine et sa version au survol ; sa pastille, un disque vert ou un anneau gris.
    assert.equal(station("Mac").dessous("p")[0]?.title, "macOS 26.0 · version 2.4.0");
    assert.deepEqual(
      ecran.dessous("span").filter((pose) => pose.className === "pastille").map((pose) => [pose.dataset.ton, pose.dataset.forme]),
      [
        ["vert", "disque"],
        ["gris", "anneau"],
      ],
    );
    assert.ok(ecran.dessous("section").every((carte) => carte.className.split(" ").includes("carte")));
  });

  test("un clic sur un projet l'ouvre : sa station, son nom et son dépôt — aucun dossier n'est demandé", () => {
    const { station, faits } = unEcran({ stations: LISTEES });
    const parade = station("parade-box").dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail();
    assert.equal(parade.title, "benomite/parade");
    parade.click();
    assert.deepEqual(faits, ["ouvrir gbox parade benomite/parade"]);
  });

  test("un projet dont la station ne dit pas le dépôt ne s'ouvre pas, et dit pourquoi au survol", () => {
    const { station, faits } = unEcran({ stations: LISTEES });
    const cantine = station("parade-box").dessous("button").find((bouton) => bouton.textContent === "cantine") ?? assert.fail();
    assert.equal(cantine.disabled, true);
    assert.equal(cantine.title, DEPOT_INCONNU);
    cantine.click();
    assert.deepEqual(faits, []);
  });

  test("une station sans projet le dit ; une station illisible se compte, sa raison au survol", () => {
    const { station, ecran } = unEcran({ stations: { ...LISTEES, stations: [{ ...LISTEES.stations[0]!, projects: [] }], unreadable: [{ id: "g9", reason: "its state on GitHub is not JSON" }] } });
    assert.equal(station("Mac").dessous("p")[1]?.textContent, SANS_PROJET);
    const illisibles = ecran.dessous("p").find((ligne) => ligne.className === "indisponible") ?? assert.fail();
    assert.equal(illisibles.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.equal(illisibles.dessous("button")[0]?.ariaLabel, "g9: its state on GitHub is not JSON");
  });

  test("le projet qui s'ouvre : l'étape de sa copie sous sa station, et rien d'autre ne s'ouvre en même temps", () => {
    const avant = unEcran({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade" } });
    const ligne = () => avant.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture") ?? assert.fail("pas d'étape");
    assert.equal(ligne().textContent, ouvertureDe("parade"));
    assert.equal(ligne().role, "status");
    // Les autres projets attendent : un clone à la fois.
    assert.ok(avant.ecran.dessous("button").filter((bouton) => bouton.className === "mono").every((bouton) => bouton.disabled));
    assert.equal(avant.station("Mac").dessous("p").some((pose) => pose.className === "ouverture"), false);
    const pendant = unEcran({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", etape: { stage: "cloning", sentence: "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.", percent: 42 } } });
    assert.equal(pendant.station("parade-box").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, "Cloning benomite/parade into C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade — 42%.");
  });

  test("le clone qui échoue : la phrase du runtime, son détail au survol, la page qui le lève, et « try again »", () => {
    const echec = echecDuClone("ERROR: Permission to benomite/parade.git denied to chef.\nfatal: unable to access 'https://github.com/benomite/parade.git/': The requested URL returned error: 403");
    assert.equal(echec.cause, "access-denied");
    const { station, faits, bouton } = unEcran({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec } });
    const refus = station("parade-box").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refus.dessous("span")[0]?.textContent, echec.reason);
    assert.match(refus.dessous("button")[0]?.ariaLabel ?? "", /denied to chef/);
    assert.doesNotMatch(refus.dessous("span")[0]?.textContent ?? "", /fatal:|403/);
    bouton(boutonDeLaPage("https://github.com/benomite/parade")).click();
    bouton(REESSAYER).click();
    assert.deepEqual(faits, ["page https://github.com/benomite/parade", "ouvrir gbox parade benomite/parade"]);
    // Ratée, l'ouverture ne retient plus les autres projets.
    assert.equal(station("Mac").dessous("button")[0]?.disabled, false);
  });

  test("un clone retenu faute de compte GitHub : le bouton de connexion du runtime, recommandé", () => {
    const echec = echecDuClone("remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true);
    assert.equal(echec.cause, "sign-in-required");
    const { faits, bouton } = unEcran({ stations: LISTEES, ouverture: { station: "gbox", projet: "parade", depot: "benomite/parade", echec } });
    const connexion = bouton("Sign in to GitHub");
    assert.equal(connexion.className, "recommande");
    connexion.click();
    assert.deepEqual(faits, ["se connecter"]);
  });
});

describe("une connexion à GitHub requise : une phrase et un bouton", () => {
  test("la phrase du runtime en tête, et le bouton qui lance son geste", () => {
    assert.equal(SANS_COMPTE.state, "sign-in-required");
    const { tete, bouton, faits, ecran } = unEcran({ stations: SANS_COMPTE });
    assert.equal(tete().textContent, "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.");
    const connexion = bouton("Sign in to GitHub");
    assert.equal(connexion.className, "recommande");
    connexion.click();
    assert.deepEqual(faits, ["se connecter"]);
    assert.equal(ecran.dessous("section").length, 0);
  });

  test("lancée, le bouton attend ; le code à taper se lit, en monospace, et la page se rouvre d'un bouton", () => {
    assert.equal(unEcran({ stations: SANS_COMPTE, connexion: { enRoute: true } }).bouton(CONNEXION_EN_ROUTE).disabled, true);
    const { ecran, bouton, faits } = unEcran({ stations: SANS_COMPTE, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    const dit = ecran.dessous("p").find((pose) => pose.className === "code-de-connexion") ?? assert.fail("pas de code");
    assert.equal(dit.textContent, tapeLeCode("A1B2-C3D4"));
    assert.equal(dit.dessous("strong")[0]?.className, "mono");
    assert.equal(bouton(CONNEXION_EN_ROUTE).disabled, true);
    bouton(ROUVRIR_LA_PAGE).click();
    assert.deepEqual(faits, ["page https://github.com/login/device"]);
  });

  test("ratée, la connexion dit pourquoi en une phrase, son détail au survol, et le bouton la relance", () => {
    const { ecran, bouton, faits } = unEcran({ stations: SANS_COMPTE, connexion: { refus: "GitHub sign-in did not finish (code 1): authentication timed out.", detail: "! First copy your one-time code: A1B2-C3D4\nerror: authentication timed out" } });
    const refus = ecran.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail();
    assert.equal(refus.dessous("span")[0]?.textContent, "GitHub sign-in did not finish (code 1): authentication timed out.");
    assert.match(refus.dessous("button")[0]?.ariaLabel ?? "", /one-time code/);
    bouton("Sign in to GitHub").click();
    assert.deepEqual(faits, ["se connecter"]);
  });
});

describe("les stations ne se lisent pas : la raison en une phrase, jamais un écran vide", () => {
  test("sans `gh` : la phrase du runtime, son détail au survol, le bouton de sa page, et « read again »", () => {
    assert.equal(SANS_GH.state, "unavailable");
    const { tete, bouton, faits } = unEcran({ stations: SANS_GH });
    // Ses mots entre accents graves posés en code, comme sur toute phrase du runtime.
    assert.equal(tete().dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer, and brigade reads your stations on GitHub through it.");
    assert.deepEqual(tete().dessous("code").map((code) => [code.textContent, code.className]), [["gh", "mono"]]);
    assert.equal(tete().dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(bouton("get the GitHub CLI").className, "recommande");
    bouton("get the GitHub CLI").click();
    bouton(RELIRE).click();
    assert.deepEqual(faits, ["page https://cli.github.com", "relire"]);
  });

  test("sans réseau : la phrase, et « read again », recommandé faute de page", () => {
    const { tete, bouton } = unEcran({ stations: SANS_RESEAU });
    assert.equal(tete().dessous("span")[0]?.textContent, "GitHub cannot be reached from this computer, so your stations could not be read: check its network connection.");
    assert.equal(bouton(RELIRE).className, "recommande");
  });

  test("aucune station appairée : la phrase du runtime ; la lecture en route : la phrase qui le dit", () => {
    const aucune = unEcran({ stations: { state: "listed", stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows." } });
    assert.equal(aucune.tete().textContent, "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows.");
    assert.equal(unEcran().tete().textContent, LECTURE);
  });

  test("dans chaque état, l'ajout par un dossier reste à un clic, sous le reste", () => {
    for (const stations of [undefined, LISTEES, SANS_COMPTE, SANS_GH]) {
      const { ecran, bouton, faits } = unEcran(stations === undefined ? {} : { stations });
      assert.ok(ecran.textContent.trim() !== "");
      assert.equal(ecran.children.at(-1)?.dessous("button")[0]?.textContent, PAR_UN_DOSSIER);
      bouton(PAR_UN_DOSSIER).click();
      assert.deepEqual(faits, ["ajout"]);
    }
  });
});

describe("le premier lancement demande le compte et le projet de qui l'ouvre, sans rien de présupposé", () => {
  const champs = (ecran: Faux) => ecran.dessous("input");
  const taper = (champ: Faux | undefined, valeur: string) => {
    if (champ === undefined) assert.fail("pas de champ");
    champ.value = valeur;
    champ.declencher("input");
  };
  test("deux champs vides aux exemples neutres, dans chaque état de la lecture des stations", () => {
    for (const stations of [undefined, LISTEES, SANS_COMPTE, SANS_GH, SANS_RESEAU]) {
      const { ecran } = unEcran(stations === undefined ? {} : { stations });
      assert.deepEqual(champs(ecran).map((champ) => [champ.value, champ.placeholder]), [["", COMPTE_EXEMPLE], ["", PROJET_EXEMPLE]]);
      assert.deepEqual(ecran.dessous("label").map((nom) => nom.textContent), [COMPTE, PROJET]);
    }
    assert.equal(COMPTE_EXEMPLE, "your-github-login");
    assert.match(PROJET_EXEMPLE, /^owner\/repo/);
  });

  test("un dépôt tapé s'ouvre par la copie du runtime, sous un nom tiré du dépôt, sans station", () => {
    const { ecran, bouton, faits } = unEcran();
    const [, projet] = champs(ecran);
    taper(projet, "Some-Owner/My_Repo");
    bouton(OUVRIR_CE_PROJET).click();
    assert.deepEqual(faits, ["ouvrir  my-repo Some-Owner/My_Repo"]);
  });

  test("un nom seul est complété par le compte tapé ; sans compte, la phrase le dit et rien ne part", () => {
    const { ecran, bouton, faits } = unEcran();
    const [compte, projet] = champs(ecran);
    taper(projet, "parade");
    bouton(OUVRIR_CE_PROJET).click();
    assert.deepEqual(faits, []);
    assert.match(ecran.dessous("p").find((p) => p.className === "refus-champ")?.textContent ?? "", /Type your GitHub account too/);
    taper(compte, "someone");
    bouton(OUVRIR_CE_PROJET).click();
    assert.deepEqual(faits, ["ouvrir  parade someone/parade"]);
  });

  test("un chemin de dossier part à l'écran d'ajout, tel quel", () => {
    for (const chemin of ["/work/thing", "~/code/thing", "./thing", "C:\\code\\thing"]) {
      const { ecran, bouton, faits } = unEcran();
      const projet = champs(ecran)[1];
      taper(projet, chemin);
      bouton(OUVRIR_CE_PROJET).click();
      assert.deepEqual(faits, [`dossier ${chemin}`]);
    }
  });

  test("ce qui se lit mal ne part pas, et dit pourquoi ; l'adresse GitHub se reconnaît", () => {
    assert.deepEqual(lireLeProjet("", ""), { refus: PROJET_MANQUE });
    assert.deepEqual(lireLeProjet("", "parade"), { refus: COMPTE_MANQUE });
    assert.deepEqual(lireLeProjet("x", "a b/c"), { refus: PROJET_ILLISIBLE });
    assert.deepEqual(lireLeProjet("", "https://github.com/owner/repo.git"), { depot: "owner/repo", nom: "repo" });
  });

  test("ce qui est tapé reste d'un affichage à l'autre, et l'ouverture lancée d'ici se dit sous le formulaire", () => {
    const saisie = { compte: "someone", projet: "someone/parade" };
    const { ecran, bouton } = unEcran({ saisie, ouverture: { station: "", projet: "parade", depot: "someone/parade" } });
    assert.deepEqual(champs(ecran).map((champ) => champ.value), ["someone", "someone/parade"]);
    assert.ok(ecran.dessous("p").some((p) => p.textContent === ouvertureDe("parade")));
    assert.equal(bouton(OUVRIR_CE_PROJET).disabled, true);
  });
});

// La vue jouée entière : l'app neuve, sans aucun projet dans son fichier.
const demarrage = (projets: Projet[]) => ({
  configuration: pourLaBarre({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets }),
  poste: { nom: "this PC", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
// Une réponse du pont qui ne vient qu'au moment voulu : le faux pont la rend telle quelle, la vue l'attend.
const enAttente = (attendre: (resoudre: (ouverture: Ouverture) => void) => void) => new Promise<Ouverture>(attendre) as unknown as Ouverture;
const PARADE: Projet = { nom: "parade", dossier: "C:\\Users\\chef\\.local\\share\\brigade\\projects\\parade", depot: "benomite/parade", base: "main" };

describe("la vue jouée : l'app ouverte pour la première fois sur un PC neuf", () => {
  test("elle s'ouvre sur les stations du chef, lues par le runtime ; un clic ouvre parade, sans dossier, et son espace s'ouvre", async () => {
    let ouvrir: (ouverture: Ouverture) => void = () => {};
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => LISTEES,
      ouvrirDUneStation: () => enAttente((resoudre) => (ouvrir = resoudre)),
      espace: () => [],
    });
    const tous = vue.element("tous");
    assert.equal(tous.hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(tous.dessous("h2")[0]?.textContent, OUVRIR_UN_PROJET("this PC"));
    assert.equal(vue.appels.filter(({ geste }) => geste === "stationsDuChef").length, 1);
    const parade = tous.dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail();
    parade.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDUneStation"), ["parade", "benomite/parade"]);
    assert.equal(vue.appels.some(({ geste }) => geste === "choisirDossier"), false);
    const etape = () => vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent;
    assert.equal(etape(), ouvertureDe("parade"));
    // Chaque étape du runtime se dit à sa place ; celle d'un autre dépôt n'y touche pas.
    vue.dire("surOuverture", "benomite/parade", { stage: "cloning", sentence: "Cloning benomite/parade — 42%.", percent: 42 });
    vue.dire("surOuverture", "benomite/brigade", { stage: "cloning", sentence: "Cloning benomite/brigade — 7%.", percent: 7 });
    assert.equal(etape(), "Cloning benomite/parade — 42%.");
    // Ouvert : le fichier l'a, puis la réponse arrive — son espace s'ouvre.
    vue.dire("surConfiguration", pourLaBarre({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
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
    (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("espace").textContent, "");
    vue.dire("surConfiguration", pourLaBarre({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets: [PARADE] }), []);
    await repos();
    assert.equal(vue.element("espace").textContent, "parade");
  });

  test("le clone qui échoue : la raison reste à l'écran, sous sa station", async () => {
    const echec = echecDuClone("fatal: unable to access 'https://github.com/benomite/parade.git/': Could not resolve host: github.com");
    assert.equal(echec.cause, "network");
    const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => LISTEES, ouvrirDUneStation: () => echec, espace: () => [] });
    (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail()).click();
    await repos();
    const refus = vue.element("tous").dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refus.dessous("span")[0]?.textContent, echec.reason);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("connexion requise : le bouton lance le geste du runtime, le code se lit ; connecté, les stations sont relues", async () => {
    let lues = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => (++lues === 1 ? SANS_COMPTE : LISTEES),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    const tous = vue.element("tous");
    assert.equal(tous.dessous("h2")[0]?.textContent, SANS_COMPTE.state === "sign-in-required" ? SANS_COMPTE.reason : "");
    (tous.dessous("button").find((bouton) => bouton.textContent === "Sign in to GitHub") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "seConnecterAGitHub").length, 1);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(lues, 2);
    assert.equal(vue.element("tous").dessous("h2")[0]?.textContent, OUVRIR_UN_PROJET("this PC"));
  });

  test("connecté pour un clone retenu faute de compte : l'ouverture repart d'elle-même", async () => {
    let essais = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => LISTEES,
      ouvrirDUneStation: () => (++essais === 1 ? echecDuClone("fatal: Authentication failed for 'https://github.com/benomite/parade.git/'", true) : enAttente(() => {})),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail()).click();
    await repos();
    (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === "Sign in to GitHub") ?? assert.fail()).click();
    await repos();
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(essais, 2);
    assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, ouvertureDe("parade"));
  });

  test("« T » mène à « Tous les projets », « + » à l'ajout par un dossier — comme avant", async () => {
    const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => LISTEES, espace: () => [] });
    (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === PAR_UN_DOSSIER) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("ajout").hidden, false);
    (vue.poses().find((pose) => pose.id === "entree-tous") ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("tous").dessous("h2")[0]?.textContent, "Projects");
  });
});
