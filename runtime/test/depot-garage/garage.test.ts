// Le travail d'un cook qui n'est pas une livraison, garé sur l'origine hors de
// toute branche (#3996) : sous `refs/brigade/parked/<branche>`, qu'aucun
// déclencheur de workflow n'écoute. La branche du ticket n'y porte que ses
// livraisons. Une station qui n'a pas la branche repart du travail garé, et la
// livraison suivante le retire de l'origine.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirDepot } from "../../src/depot.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const BRANCHE = "cook/12-github";
const GARAGE = `refs/brigade/parked/${BRANCHE}`;

const ouvrir = (t: TestContext, clone: string) => ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
const surLOrigine = (origine: string, reference: string) => git(origine, "for-each-ref", "--format=%(objectname)", reference);

// Une seconde station du projet : un clone neuf de la même origine, sans la branche du cook.
function autreClone(t: TestContext, origine: string): string {
  const clone = join(repertoireTemporaire(t), "autre");
  git(dirname(clone), "clone", "-q", "-b", BASE, origine, clone);
  return clone;
}

// Le cook a commité `travail.txt` sur sa branche, que la station gare.
async function garerUnTravail(t: TestContext) {
  const lieux = depotGit(t);
  const depot = ouvrir(t, lieux.clone);
  const { worktree, branche } = await depot.preparer("12-github");
  commiter(worktree);
  await depot.ranger(worktree, branche);
  depot.garer(branche);
  return { ...lieux, depot };
}

test("parked work goes to the origin outside any branch, and the clone keeps its branch", async (t) => {
  const { origine, clone, depot } = await garerUnTravail(t);

  assert.equal(surLOrigine(origine, GARAGE), git(clone, "rev-parse", `refs/heads/${BRANCHE}`));
  assert.equal(git(origine, "branch", "--list", BRANCHE), "", "the ticket's branch carries no work that is not a delivery");
  assert.equal(await depot.elaguer(BRANCHE), false, "the parked work is no branch of the origin: the clone keeps it");
});

test("a station without the branch resumes from the parked work, when the origin has no branch yet", async (t) => {
  const { origine } = await garerUnTravail(t);
  const autre = ouvrir(t, autreClone(t, origine));

  const worktree = await autre.reprendre("12-github", BRANCHE);

  assert.equal(existsSync(join(worktree, "travail.txt")), true);
});

test("a station without the branch resumes from the parked work when it carries the branch's delivery", async (t) => {
  const { origine, clone, depot } = await garerUnTravail(t);
  depot.pousser(BRANCHE);
  const worktree = await depot.reprendre("12-github", BRANCHE);
  commiter(worktree, "suite.txt");
  await depot.ranger(worktree, BRANCHE);
  depot.garer(BRANCHE);
  assert.notEqual(git(clone, "rev-parse", `refs/heads/${BRANCHE}`), surLOrigine(origine, `refs/heads/${BRANCHE}`));
  const autre = ouvrir(t, autreClone(t, origine));

  const repris = await autre.reprendre("12-github", BRANCHE);

  assert.equal(existsSync(join(repris, "suite.txt")), true);
});

test("parked work that does not carry the branch's delivery is passed by: the branch resumes from the origin", async (t) => {
  const { origine } = await garerUnTravail(t);
  // Une livraison que le travail garé ne porte pas, poussée d'ailleurs.
  const tiers = autreClone(t, origine);
  git(tiers, "checkout", "-q", "-b", BRANCHE);
  commiter(tiers, "livraison.txt");
  git(tiers, "push", "-q", "origin", BRANCHE);
  const autre = ouvrir(t, autreClone(t, origine));

  const repris = await autre.reprendre("12-github", BRANCHE);

  assert.equal(existsSync(join(repris, "livraison.txt")), true);
  assert.equal(existsSync(join(repris, "travail.txt")), false);
});

test("the delivery push takes the parked work off the origin", async (t) => {
  const { origine, depot } = await garerUnTravail(t);

  depot.pousser(BRANCHE);

  assert.notEqual(surLOrigine(origine, `refs/heads/${BRANCHE}`), "");
  assert.equal(surLOrigine(origine, GARAGE), "", "no parked copy is left behind the delivery");
});
