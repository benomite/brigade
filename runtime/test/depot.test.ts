// Les gestes git de la station, sur un vrai dépôt local : le worktree d'un
// cook, ce qu'il a commité, et la branche poussée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot } from "../src/depot.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

function projet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  return { origine, clone, worktrees, depot: ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) };
}

// Chaque test a son origine et son clone : ils se jouent de front.
describe("le dépôt de la station", { concurrency: 8 }, () => {
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

  test("un répertoire de worktrees relatif se lit depuis le répertoire du process, pas depuis le clone", async (t) => {
    const { clone } = depotGit(t);
    const absolu = join(repertoireTemporaire(t), "etat", "worktrees");
    const depot = ouvrirDepot({ clone, base: BASE, worktrees: relative(process.cwd(), absolu), env: ENV_GIT });

    const { worktree } = await depot.preparer("15-abc");

    assert.equal(worktree, join(absolu, "15-abc"));
    assert.equal(existsSync(join(absolu, "15-abc", "LISEZMOI")), true);
    assert.equal(depot.commits(worktree), 0);
  });

  test("le worktree part de la base telle qu'elle est sur l'origine, pas telle que le clone l'a connue", async (t) => {
    const { origine, depot } = projet(t);
    const ailleurs = join(repertoireTemporaire(t), "ailleurs");
    git(repertoireTemporaire(t), "clone", "-q", origine, ailleurs);
    commiter(ailleurs, "recent.txt");
    git(ailleurs, "push", "-q", "origin", BASE);

    const { worktree } = await depot.preparer("15-abc");

    assert.equal(git(worktree, "rev-parse", "HEAD"), git(ailleurs, "rev-parse", "HEAD"));
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
    commiter(worktree);

    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", "cook/15-abc"), git(worktree, "rev-parse", "HEAD"));
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

  test("un fichier renommé ou supprimé compte parmi les changements, à son ancien chemin", async (t) => {
    const { origine, clone, depot } = projet(t);
    // La base porte un workflow et des gates.
    for (const fichier of [".github/workflows/ci.yml", ".claude/brigade/gates.sh"]) {
      mkdirSync(join(clone, fichier, ".."), { recursive: true });
      commiter(clone, fichier);
    }
    git(clone, "push", "-q", origine, `HEAD:${BASE}`);
    const { worktree } = await depot.preparer("15-abc");

    git(worktree, "mv", ".github/workflows/ci.yml", "ci-off.yml");
    git(worktree, "rm", "-q", ".claude/brigade/gates.sh");
    git(worktree, "commit", "-q", "-m", "plus de juges");

    assert.deepEqual(depot.changes(worktree), [".claude/brigade/gates.sh", ".github/workflows/ci.yml", "ci-off.yml"]);
  });

  test("une branche de cook rebasée par un renvoi se pousse quand même : elle n'appartient qu'à la station", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);

    // Le cook de renvoi réécrit son commit : la branche n'avance plus, elle diverge.
    git(worktree, "commit", "-q", "--amend", "-m", "le même travail, rebasé");
    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", "cook/15-abc"), depot.tete(worktree));
  });

  test("la pass lit d'un worktree son commit, sa propreté, et ce qu'il change depuis la base", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("15-abc");
    commiter(worktree);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    commiter(worktree, ".claude/brigade/gates.sh");

    assert.equal(depot.tete(worktree), git(worktree, "rev-parse", "HEAD"));
    assert.deepEqual(depot.changes(worktree), [".claude/brigade/gates.sh", "travail.txt"]);
    assert.equal(depot.propre(worktree), true);

    // Un fichier non suivi ne salit rien ; un fichier suivi modifié, si.
    writeFileSync(join(worktree, "brouillon.txt"), "pas commité\n");
    assert.equal(depot.propre(worktree), true);
    writeFileSync(join(worktree, "travail.txt"), "modifié après le commit\n");
    assert.equal(depot.propre(worktree), false);
  });
});
