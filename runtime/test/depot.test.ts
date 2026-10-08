// Les gestes git de la station, sur un vrai dépôt local : le worktree d'un
// cook, ce qu'il a commité, et la branche poussée.
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirDepot } from "../src/depot.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

function projet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  return { origine, clone, worktrees, depot: ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) };
}

test("un répertoire qui n'est pas un dépôt git est refusé à l'ouverture", (t) => {
  const pasUnDepot = repertoireTemporaire(t);

  assert.throws(
    () => ouvrirDepot({ clone: pasUnDepot, base: BASE, worktrees: join(pasUnDepot, "w"), env: ENV_GIT }),
    (erreur) => erreur instanceof ConfigInvalide && /BRIGADE_REPO_DIR/.test(erreur.message),
  );
});

test("le worktree d'un cook est une branche neuve, partie de la base", async (t) => {
  const { clone, worktrees, depot } = projet(t);

  const { worktree, branche } = await depot.preparer("15-abc");

  assert.equal(worktree, join(worktrees, "15-abc"));
  assert.equal(branche, "cook/15-abc");
  assert.equal(git(worktree, "rev-parse", "--abbrev-ref", "HEAD"), "cook/15-abc");
  assert.equal(git(worktree, "rev-parse", "HEAD"), git(clone, "rev-parse", `origin/${BASE}`));
});

test("le worktree part de la base telle qu'elle est sur l'origine, pas telle que le clone l'a connue", async (t) => {
  const { origine, depot } = projet(t);
  const ailleurs = join(repertoireTemporaire(t), "ailleurs");
  git(repertoireTemporaire(t), "clone", "-q", origine, ailleurs);
  const recent = commiter(ailleurs, "recent.txt");
  git(ailleurs, "push", "-q", "origin", BASE);

  const { worktree } = await depot.preparer("15-abc");

  assert.equal(git(worktree, "rev-parse", "HEAD"), recent);
});

test("l'arbre principal du dépôt n'est jamais touché", async (t) => {
  const { clone, depot } = projet(t);
  const avant = [git(clone, "rev-parse", "HEAD"), git(clone, "rev-parse", "--abbrev-ref", "HEAD"), git(clone, "status", "--porcelain")];

  const { worktree, branche } = await depot.preparer("15-abc");
  commiter(worktree);
  depot.pousser(branche);

  assert.deepEqual([git(clone, "rev-parse", "HEAD"), git(clone, "rev-parse", "--abbrev-ref", "HEAD"), git(clone, "status", "--porcelain")], avant);
  assert.equal(existsSync(join(clone, "travail.txt")), false);
});

test("les commits d'un cook se comptent depuis la base", async (t) => {
  const { depot } = projet(t);
  const { worktree } = await depot.preparer("15-abc");

  assert.equal(depot.commits(worktree), 0);
  commiter(worktree, "un.txt");
  commiter(worktree, "deux.txt");
  assert.equal(depot.commits(worktree), 2);
});

test("la branche poussée arrive sur l'origine, et la base n'y bouge pas", async (t) => {
  const { origine, depot } = projet(t);
  const base = git(origine, "rev-parse", BASE);
  const { worktree, branche } = await depot.preparer("15-abc");
  const livre = commiter(worktree);

  depot.pousser(branche);

  assert.equal(git(origine, "rev-parse", "cook/15-abc"), livre);
  assert.equal(git(origine, "rev-parse", BASE), base);
});

test("un push impossible lève, avec ce que git en dit", async (t) => {
  const { origine, depot } = projet(t);
  const { worktree, branche } = await depot.preparer("15-abc");
  commiter(worktree);
  rmSync(origine, { recursive: true });

  assert.throws(() => depot.pousser(branche), /git push/);
});

test("une origine injoignable fait échouer la préparation, sans laisser de worktree", async (t) => {
  const { origine, worktrees, depot } = projet(t);
  rmSync(origine, { recursive: true });

  await assert.rejects(depot.preparer("15-abc"), /git fetch/);
  assert.equal(existsSync(join(worktrees, "15-abc")), false);
});
