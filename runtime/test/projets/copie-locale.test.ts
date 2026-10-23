// La copie locale d'un projet qu'on ouvre depuis un ordinateur neuf (#1429) :
// clonée dans le dossier que l'app gère quand il n'y en a pas, reprise quand
// il y en a une, et un échec dit en une phrase qui en nomme la cause. Le `gh`
// est une doublure (`faux-gh.ts`) qui clone des origines nues, sans réseau.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { origineDu, ouvrirLaCopieLocale, principal, type CopieLocale, type OptionsDOuverture, type Progres } from "../../src/projets/copie-locale.ts";
import { appeler, depotGit, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh.ts");

// GitHub : acme/shop y existe ; le compte de ce `gh` est « chef ».
function unGitHub(t: TestContext) {
  const { origine } = depotGit(t);
  const origines = repertoireTemporaire(t);
  const gists = repertoireTemporaire(t);
  mkdirSync(join(origines, "acme"));
  git(origines, "clone", "-q", "--bare", origine, join(origines, "acme/shop.git"));
  const racine = join(repertoireTemporaire(t), "projects");
  const env = { ...process.env, FAUX_ORIGINES: origines, FAUX_GISTS: gists, FAUX_COMPTE: "chef" };
  const clones = () => (existsSync(join(gists, "clones")) ? readFileSync(join(gists, "clones"), "utf8").split("\n").filter(Boolean) : []);
  return {
    origines,
    racine,
    env,
    clones,
    ouvrir: async (options: Partial<OptionsDOuverture> & { erreurs?: string } = {}) => {
      const etapes: Progres[] = [];
      const { erreurs, ...reste } = options;
      const etat = await ouvrirLaCopieLocale({
        repository: "acme/shop",
        gh: FAUX_GH,
        root: racine,
        env: erreurs === undefined ? env : { ...env, FAUX_CLONE_ERREURS: erreurs },
        progres: (etape) => etapes.push(etape),
        ...reste,
      });
      return { etat, etapes };
    },
  };
}

// Un échec, dit en une phrase : une seule fin de phrase, la dernière.
function echec(etat: CopieLocale) {
  assert.equal(etat.state, "failed", JSON.stringify(etat));
  assert.ok(etat.state === "failed");
  assert.match(etat.reason, /^[^\n]*\.$/);
  assert.equal(etat.reason.split(/[.!?](\s|$)/).filter((morceau) => morceau.trim() !== "").length, 1, etat.reason);
  return etat;
}

test("sans copie locale, ouvrir le projet le clone dans le dossier que l'app gère, en disant où il en est, et finit le projet ouvert", async (t) => {
  const github = unGitHub(t);
  const { etat, etapes } = await github.ouvrir();
  const dossier = join(github.racine, "shop");
  assert.deepEqual(etat, { state: "open", project: "shop", repository: "acme/shop", folder: dossier, cloned: true });
  assert.ok(existsSync(join(dossier, "LISEZMOI")));
  assert.ok(origineDu("acme/shop", git(dossier, "remote", "get-url", "origin")));
  // Rien n'est laissé à côté de sa place.
  assert.deepEqual(readdirSync(github.racine), ["shop"]);
  // Cloné par son adresse HTTPS, une fois.
  assert.deepEqual(github.clones(), [`acme/shop ${dossier}.clonage`]);

  // Il a dit ce qu'il faisait : chercher, puis cloner — et où git en était.
  assert.deepEqual(
    etapes.filter((etape) => etape.percent === undefined),
    [
      { stage: "looking", sentence: "Looking for a local copy of acme/shop." },
      { stage: "cloning", sentence: `Cloning acme/shop into ${dossier}.`, folder: dossier },
    ],
  );
  const pourcents = etapes.flatMap((etape) => (etape.percent === undefined ? [] : [etape.percent]));
  assert.equal(pourcents.at(-1), 100, JSON.stringify(etapes));
  assert.equal(etapes.at(-1)?.sentence, `Cloning acme/shop into ${dossier} — 100%.`);
});

test("la commande ouvre le projet sans qu'on lui donne de dossier : celui de BRIGADE_PROJECTS_DIR, une ligne par étape puis l'état", async (t) => {
  const github = unGitHub(t);
  const env = { ...github.env, BRIGADE_GH_BIN: FAUX_GH, BRIGADE_PROJECTS_DIR: github.racine } as Record<string, string>;
  const { sortie, fin } = appeler(principal, ["acme/shop"], env);
  assert.equal(await fin, 0);
  const lignes = sortie()
    .trim()
    .split("\n")
    .map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
  assert.deepEqual(lignes.at(-1), { state: "open", project: "shop", repository: "acme/shop", folder: join(github.racine, "shop"), cloned: true });
  assert.ok(lignes.slice(0, -1).every((ligne) => "progress" in ligne));
  assert.ok(existsSync(join(github.racine, "shop", "LISEZMOI")));

  // Un échec : la raison, et le code 1.
  const refuse = appeler(principal, ["acme/prive", "--name", "prive"], env);
  assert.equal(await refuse.fin, 1);
  assert.equal((JSON.parse(refuse.sortie().trim().split("\n").at(-1) ?? "") as { cause: string }).cause, "access-denied");
});

test("une copie locale qui existe déjà est reprise telle quelle : rien n'est recloné", async (t) => {
  const github = unGitHub(t);
  const premiere = await github.ouvrir();
  assert.equal(premiere.etat.state, "open");
  // Un travail en cours dans la copie : il est retrouvé, intact.
  const dossier = join(github.racine, "shop");
  writeFileSync(join(dossier, "en-cours.txt"), "pas commité\n");

  const { etat, etapes } = await github.ouvrir();
  assert.deepEqual(etat, { state: "open", project: "shop", repository: "acme/shop", folder: dossier, cloned: false });
  assert.equal(readFileSync(join(dossier, "en-cours.txt"), "utf8"), "pas commité\n");
  assert.equal(github.clones().length, 1);
  assert.deepEqual(etapes.at(-1), { stage: "reusing", sentence: `Opening the local copy of acme/shop in ${dossier}.`, folder: dossier });

  // Celle que le chef a clonée à la main, ailleurs, et que l'appelant connaît : reprise aussi, sans clone.
  const aLaMain = join(repertoireTemporaire(t), "shop");
  git(github.origines, "clone", "-q", join(github.origines, "acme/shop.git"), aLaMain);
  git(aLaMain, "remote", "set-url", "origin", "git@github.com:acme/shop.git");
  const ailleurs = await github.ouvrir({ root: join(repertoireTemporaire(t), "vide"), folder: aLaMain });
  assert.deepEqual(ailleurs.etat, { state: "open", project: "shop", repository: "acme/shop", folder: aLaMain, cloned: false });
  assert.equal(github.clones().length, 1);
});

test("un dossier géré qui tient autre chose n'est pas écrasé : la raison le nomme", async (t) => {
  const github = unGitHub(t);
  const dossier = join(github.racine, "shop");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "notes.md"), "#\n");
  const pris = echec((await github.ouvrir()).etat);
  assert.equal(pris.cause, "folder-taken");
  assert.equal(pris.reason, `${dossier} already holds files that are not a git clone, so acme/shop is not cloned over it: move that folder away, then open the project again.`);
  assert.deepEqual(readdirSync(dossier), ["notes.md"]);
  assert.deepEqual(github.clones(), []);
});

test("sans git sur l'ordinateur, l'ouverture dit que git manque, et rien n'est cloné", async (t) => {
  const github = unGitHub(t);
  const sansGit = echec((await github.ouvrir({ git: join(github.racine, "pas-de-git") })).etat);
  assert.equal(sansGit.cause, "git-missing");
  assert.equal(sansGit.reason, "Git is not installed on this computer, so acme/shop cannot be cloned: install it, then open the project again.");
  assert.equal(sansGit.link, "https://git-scm.com/downloads");
  assert.deepEqual(github.clones(), []);
  assert.ok(!existsSync(join(github.racine, "shop")));

  // Ce que gh dit quand il ne trouve pas git dans le PATH : la même cause.
  const ditParGh = echec((await github.ouvrir({ erreurs: "unable to find git executable in PATH; please install Git for Windows before retrying" })).etat);
  assert.equal(ditParGh.cause, "git-missing");
  assert.ok(!existsSync(join(github.racine, "shop")));
  assert.ok(!existsSync(join(github.racine, "shop.clonage")));
});

test("accès refusé : GitHub ne montre pas le dépôt au compte, ou refuse sa lecture — la raison nomme le compte et le dépôt", async (t) => {
  const github = unGitHub(t);
  // Privé, et invisible pour ce compte : GitHub répond qu'il n'existe pas, mais son propriétaire existe.
  const invisible = echec((await github.ouvrir({ repository: "acme/prive" })).etat);
  assert.equal(invisible.cause, "access-denied");
  assert.equal(invisible.reason, "GitHub denies chef access to acme/prive, so it cannot be cloned: either chef is not one of its collaborators, or it no longer exists under this name.");
  assert.equal(invisible.link, "https://github.com/acme/prive");
  assert.match(invisible.detail ?? "", /Repository not found/);
  assert.ok(!existsSync(join(github.racine, "prive")));
  assert.ok(!existsSync(join(github.racine, "prive.clonage")));

  // Une lecture refusée en toutes lettres (403).
  const refuse = echec(
    (await github.ouvrir({ erreurs: "remote: Permission to acme/shop.git denied to chef.\nfatal: unable to access 'https://github.com/acme/shop.git/': The requested URL returned error: 403" })).etat,
  );
  assert.equal(refuse.cause, "access-denied");
  assert.equal(refuse.reason, "GitHub denies chef access to acme/shop, so it cannot be cloned: ask an owner of acme/shop to give chef read access.");
  assert.ok(!existsSync(join(github.racine, "shop")));

  // Un propriétaire que GitHub ne connaît pas : le dépôt n'existe pas.
  const absent = echec((await github.ouvrir({ repository: "personne/shop" })).etat);
  assert.equal(absent.cause, "repository-missing");
  assert.equal(absent.reason, "personne/shop cannot be cloned because it does not exist: GitHub has no account or organization named personne.");
});

test("réseau coupé, ordinateur pas connecté à GitHub, `gh` absent : chaque échec dit sa cause en une phrase", async (t) => {
  const github = unGitHub(t);
  const reseau = echec((await github.ouvrir({ erreurs: "Cloning into '/tmp/x'...\nfatal: unable to access 'https://github.com/acme/shop.git/': Could not resolve host: github.com" })).etat);
  assert.equal(reseau.cause, "network");
  assert.equal(reseau.reason, "GitHub cannot be reached from this computer, so acme/shop could not be cloned: check its network connection, then open the project again.");
  assert.doesNotMatch(reseau.detail ?? "", /Cloning into/);

  const deconnecte = echec((await github.ouvrir({ erreurs: "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token." })).etat);
  assert.equal(deconnecte.cause, "sign-in-required");
  assert.equal(deconnecte.reason, "This computer is not signed in to GitHub, so acme/shop cannot be cloned.");
  assert.deepEqual(deconnecte.action?.command.slice(1, 3), ["auth", "login"]);

  const sansGh = echec((await github.ouvrir({ gh: join(github.racine, "pas-de-gh") })).etat);
  assert.equal(sansGh.cause, "gh-missing");
  assert.equal(sansGh.link, "https://cli.github.com");
  assert.match(sansGh.reason, /is not installed on this computer/);

  const inconnu = echec((await github.ouvrir({ erreurs: "fatal: something unexpected happened." })).etat);
  assert.equal(inconnu.cause, "unknown");
  assert.equal(inconnu.reason, "Git could not clone acme/shop: something unexpected happened.");

  // Rien n'est resté là où l'ouverture suivante chercherait une copie.
  assert.ok(!existsSync(join(github.racine, "shop")));
  assert.ok(!existsSync(join(github.racine, "shop.clonage")));
});

test("un dépôt mal écrit, ou un nom qui ne fait pas un dossier, est refusé avant tout clone", async (t) => {
  const github = unGitHub(t);
  assert.equal(echec((await github.ouvrir({ repository: "shop" })).etat).cause, "invalid");
  assert.equal(echec((await github.ouvrir({ repository: "acme/.." })).etat).cause, "invalid");
  assert.equal(echec((await github.ouvrir({ project: "../ailleurs" })).etat).cause, "invalid");
  assert.deepEqual(github.clones(), []);
});

test("l'origine d'une copie se reconnaît en HTTPS, en ssh ou par un chemin, sans tenir compte de la casse", () => {
  assert.ok(origineDu("acme/shop", "https://github.com/acme/shop.git"));
  assert.ok(origineDu("acme/shop", "https://github.com/Acme/Shop"));
  assert.ok(origineDu("acme/shop", "git@github.com:acme/shop.git"));
  assert.ok(origineDu("acme/shop", "C:\\origines\\acme\\shop.git"));
  assert.ok(!origineDu("acme/shop", "https://github.com/acme/shop-2.git"));
  assert.ok(!origineDu("acme/shop", "https://github.com/autre/shop.git"));
});

test("rien ne reste dans le répertoire temporaire", () => rienNeReste());
