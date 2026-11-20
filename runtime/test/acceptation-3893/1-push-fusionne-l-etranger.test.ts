// #3893, critère 1 : le push de l'étape des tests, refusé parce que l'origine porte sur cook/<n>-github des commits
// que la station n'y a pas poussés, rapatrie la branche, la fusionne au travail local et pousse de nouveau.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirDepot } from "../../src/depot.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

// Ce qu un autre clone pousse sur la branche du ticket, dans une origine nue : un commit parti de la base.
function poserSurLOrigine(origine: string, branche: string, fichiers: Record<string, string>): string {
  const donnees = (texte: string) => `data ${Buffer.byteLength(texte)}\n${texte}\n`;
  const flux = [`commit refs/heads/${branche}\n`, "mark :1\n", "committer chef <chef@brigade.test> now\n", donnees("écrit ailleurs"), `from refs/heads/${BASE}^0\n`];
  for (const [chemin, contenu] of Object.entries(fichiers)) flux.push(`M 100644 inline ${chemin}\n${donnees(contenu)}`);
  flux.push("get-mark :1\n");
  return execFileSync("git", ["fast-import", "--quiet", "--force", "--date-format=now"], { cwd: origine, env: ENV_GIT, input: flux.join(""), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function projet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  return { origine, depot: ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) };
}

test("a push refused for a foreign commit on origin fetches the branch, merges it and pushes again", async (t) => {
  const { origine, depot } = projet(t);
  const { worktree, branche } = await depot.preparer("833-github");
  commiter(worktree, "critere-1.test.ts");
  poserSurLOrigine(origine, branche, { "du-chef.txt": "du chef\n" });

  assert.doesNotThrow(() => depot.pousser(branche));

  assert.equal(git(origine, "rev-parse", branche), depot.tete(branche));
});
