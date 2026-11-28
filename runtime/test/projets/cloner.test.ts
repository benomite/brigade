// Le clone d'un projet : par une doublure de `gh`, à sa place ; déjà cloné, rien ne se refait ;
// un clone vide est rattrapé ; un clone en échec dit pourquoi.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { cloner, CloneEnEchec } from "../../src/projets/cloner.ts";
import { commiter, depotGit, ENV_GIT, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh.ts");

test("le dépôt se clone à sa place par le `gh` de la machine ; déjà cloné, rien ne se refait ; introuvable, rien ne reste", async (t) => {
  const { origine } = depotGit(t);
  const origines = repertoireTemporaire(t);
  const gists = repertoireTemporaire(t);
  mkdirSync(join(origines, "acme"));
  git(origines, "clone", "-q", "--bare", origine, join(origines, "acme/shop.git"));
  const avant = { FAUX_ORIGINES: process.env.FAUX_ORIGINES, FAUX_GISTS: process.env.FAUX_GISTS };
  Object.assign(process.env, { FAUX_ORIGINES: origines, FAUX_GISTS: gists });
  t.after(() => {
    for (const [nom, valeur] of Object.entries(avant)) if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  });
  const racine = repertoireTemporaire(t);
  const clone = join(racine, "clones/shop");

  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone });
  assert.ok(existsSync(join(clone, "LISEZMOI")));
  assert.ok(!existsSync(`${clone}.clonage`));
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone });
  assert.equal(readFileSync(join(gists, "clones"), "utf8").split("\n").filter(Boolean).length, 1);
  // Nommé par son adresse HTTPS : gh clone en HTTPS, quel que soit le protocole git réglé pour son compte.
  assert.deepEqual(readFileSync(join(gists, "clones-nommes"), "utf8").split("\n").filter(Boolean), ["https://github.com/acme/shop.git"]);

  // Introuvable : l'erreur porte la ligne `fatal:` de git, pas la dernière de gh, et tout ce qu'ils ont dit.
  const absent = await cloner({ gh: FAUX_GH, depot: "acme/absent", clone: join(racine, "clones/absent") }).then(
    () => assert.fail("le clone d'un dépôt absent réussit"),
    (erreur: unknown) => erreur,
  );
  assert.ok(absent instanceof CloneEnEchec, String(absent));
  assert.equal(absent.message, "clone de acme/absent en échec — repository 'https://github.com/acme/absent.git/' not found");
  assert.match(absent.erreurs, /^remote: Repository not found\.\n[^]*failed to run git: exit status 128$/);
  assert.ok(!existsSync(join(racine, "clones/absent")));
  assert.ok(!existsSync(join(racine, "clones/absent.clonage")));
});

// Un dépôt vide sur la doublure de GitHub : une origine nue, sans commit, dont la branche par défaut est `main`.
function unDepotVide(t: TestContext) {
  const origines = repertoireTemporaire(t);
  const gists = repertoireTemporaire(t);
  const origine = join(origines, "acme/shop.git");
  mkdirSync(origine, { recursive: true });
  git(origine, "init", "-q", "--bare", "-b", "main");
  // Un commit arrivé sur GitHub, poussé d'ailleurs que du clone de la station.
  const pousser = (fichier: string) => {
    const ailleurs = join(repertoireTemporaire(t), "ailleurs");
    git(dirname(ailleurs), "clone", "-q", origine, ailleurs);
    commiter(ailleurs, fichier);
    git(ailleurs, "push", "-q", "origin", "HEAD:refs/heads/main");
    return git(ailleurs, "rev-parse", "HEAD");
  };
  return { origine, pousser, env: { ...ENV_GIT, FAUX_ORIGINES: origines, FAUX_GISTS: gists } };
}

test("#3197 : un clone fait quand le dépôt était vide est rattrapé au passage suivant — rapatrié, la branche par défaut posée, le commit arrivé y est", async (t) => {
  const { pousser, env } = unDepotVide(t);
  const clone = join(repertoireTemporaire(t), "clones/shop");
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  assert.throws(() => git(clone, "rev-parse", "--verify", "HEAD"), "cloné vide, le clone n'a aucun commit");
  // Toujours vide : rien à poser, rien n'échoue.
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  assert.throws(() => git(clone, "rev-parse", "--verify", "HEAD"));

  const sha = pousser("LISEZMOI");
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  assert.equal(git(clone, "rev-parse", "HEAD"), sha);
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "main");
  assert.equal(git(clone, "rev-parse", "--abbrev-ref", "main@{upstream}"), "origin/main");
  assert.ok(existsSync(join(clone, "LISEZMOI")));
});

test("#3197 : un clone qui a déjà des commits n'est ni rapatrié, ni remis, ni changé de branche", async (t) => {
  const { pousser, env } = unDepotVide(t);
  const premier = pousser("LISEZMOI");
  const clone = join(repertoireTemporaire(t), "clones/shop");
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  git(clone, "checkout", "-q", "-b", "travail");
  commiter(clone, "local.txt");
  const local = git(clone, "rev-parse", "HEAD");
  pousser("ARRIVE");

  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "travail");
  assert.equal(git(clone, "rev-parse", "HEAD"), local);
  assert.equal(git(clone, "rev-parse", "main"), premier);
  // Rien n'a été rapatrié : `origin/main` est resté où le clone l'a vu.
  assert.equal(git(clone, "rev-parse", "origin/main"), premier);
});

test("#3197 : un clone vide dont l'origine ne répond plus lève comme un clone en échec, avec ce que git dit", async (t) => {
  const { origine, env } = unDepotVide(t);
  const clone = join(repertoireTemporaire(t), "clones/shop");
  await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env });
  rmSync(origine, { recursive: true, force: true });
  const erreur = await cloner({ gh: FAUX_GH, depot: "acme/shop", clone, env }).then(
    () => assert.fail("le rattrapage d'un clone dont l'origine a disparu réussit"),
    (lue: unknown) => lue,
  );
  assert.ok(erreur instanceof CloneEnEchec, String(erreur));
  assert.match(erreur.message, /^clone de acme\/shop en échec — .*(does not appear to be a git repository|not found)/);
});

test("cloner.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
