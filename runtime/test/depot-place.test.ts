// La place du worktree d'un run, laissée par un essai coupé (#2179, #2224) :
// à part de `depot.test.ts`, dont les tests tournent à huit de front, pour
// tenir sous les 2 s de la règle (#2129).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirDepot } from "../src/depot.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

test("la place du worktree d'un run, laissée par un essai coupé — worktree connu de git ou répertoire oublié —, ne bloque pas le cook suivant", async (t) => {
  const { clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  const depot = ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT });
  // Un worktree que git connaît encore, et sa branche, avec un commit.
  const premier = await depot.preparer("7-github");
  commiter(premier.worktree, "reste.txt");
  // Un répertoire que git a oublié, à la place d'un autre run.
  mkdirSync(join(worktrees, "8-github"), { recursive: true });
  writeFileSync(join(worktrees, "8-github", "oublie.txt"), "x\n");
  const second = await depot.preparer("7-github");
  const autre = await depot.preparer("8-github");
  assert.equal(existsSync(join(second.worktree, "reste.txt")), false);
  assert.equal(git(second.worktree, "rev-parse", "HEAD"), git(second.worktree, "rev-parse", `origin/${BASE}`));
  assert.equal(existsSync(join(autre.worktree, "oublie.txt")), false);
});

test("une station reprend une branche qu'une autre a poussée sans l'avoir jamais eue chez elle (#2311)", async (t) => {
  const { origine, clone } = depotGit(t);
  const une = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "w1"), env: ENV_GIT });
  const { worktree, branche } = await une.preparer("9-github");
  commiter(worktree, "livre.txt");
  une.pousser(branche);
  // Une autre station : son propre clone de la même origine, sans la branche.
  const autreClone = join(repertoireTemporaire(t), "autre");
  git(repertoireTemporaire(t), "clone", "-q", origine, autreClone);
  const autre = ouvrirDepot({ clone: autreClone, base: BASE, worktrees: join(repertoireTemporaire(t), "w2"), env: ENV_GIT });
  const repris = await autre.reprendre("review-9-github", branche);
  assert.equal(existsSync(join(repris, "livre.txt")), true);
});
