// #3893, critère 2 : dans ce cas, aucun commit de l'origine n'est perdu ni écrasé : le commit étranger et celui du cook
// sont tous deux ancêtres de la tête de la branche après le push.
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

test("after the push, the foreign commit and the cook's commit are both ancestors of the branch head", async (t) => {
  const { origine, depot } = projet(t);
  const { worktree, branche } = await depot.preparer("833-github");
  commiter(worktree, "critere-1.test.ts");
  const duCook = git(worktree, "rev-parse", "HEAD");
  const duChef = poserSurLOrigine(origine, branche, { "du-chef.txt": "du chef\n" });

  depot.pousser(branche);

  const tete = git(origine, "rev-parse", branche);
  assert.doesNotThrow(() => git(origine, "merge-base", "--is-ancestor", duChef, tete), "the foreign commit was lost");
  assert.doesNotThrow(() => git(origine, "merge-base", "--is-ancestor", duCook, tete), "the cook's commit was lost");
});
