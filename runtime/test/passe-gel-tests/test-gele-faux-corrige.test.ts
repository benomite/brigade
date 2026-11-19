// Un test d'acceptation gelé faux ne fait pas tourner le ticket en boucle (#3799) :
// un cas déjà vert sur la base, que le cook n'a pas le droit de toucher, est
// corrigé ou retiré par la station, et le ticket continue sans le chef. Par la
// station : un vrai dépôt git, un faux GitHub, un faux `claude` qui est le cook
// (il commite les tests gelés, puis le code) ou le relecteur.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { A_LA_MAIN, brancheDuTicket, stationDuDepot, type Lancer, type OptionsDuDepot } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { ENV_GIT, repertoireTemporaire } from "../outils.ts";

const TICKET = 41;
const BRANCHE = brancheDuTicket(TICKET);
const GELE = "lib/41.test.ts";
const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\n";
const ENTETE = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./somme.ts";\n';
const BON_CAS = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const MAUVAIS_CAS = 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n';
const TESTS_GELES = ENTETE + BON_CAS + MAUVAIS_CAS;

const git = (repertoire: string, ...args: string[]) => execFileSync("git", ["-C", repertoire, ...args], { env: ENV_GIT, encoding: "utf8" }).trim();

// Une origine dont `main` porte `somme` bogué, et le clone de la station.
function depotDeLaStation(t: TestContext): { origine: string; depot: OptionsDuDepot["depot"] } {
  const racine = repertoireTemporaire(t);
  const [origine, source, clone, worktrees] = ["origine.git", "source", "clone", "worktrees"].map((nom) => join(racine, nom)) as [string, string, string, string];
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origine], { env: ENV_GIT });
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", source], { env: ENV_GIT });
  git(source, "remote", "add", "origin", origine);
  mkdirSync(join(source, "lib"), { recursive: true });
  writeFileSync(join(source, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(source, "lib", "somme.ts"), BOGUE);
  git(source, "add", ".");
  git(source, "commit", "--quiet", "-m", "somme");
  git(source, "push", "--quiet", "origin", "HEAD:main");
  execFileSync("git", ["clone", "--quiet", origine, clone], { env: ENV_GIT });
  const connait = (branche: string) => git(clone, "branch", "--list", branche) !== "";
  const depot: OptionsDuDepot["depot"] = {
    connait,
    preparer: async (run) => {
      const worktree = join(worktrees, run);
      git(clone, "worktree", "add", "--quiet", "-b", `cook/${run}`, worktree, "origin/main");
      return { worktree, branche: `cook/${run}` };
    },
    reprendre: async (run, branche) => {
      const worktree = join(worktrees, run);
      git(clone, "worktree", "add", "--quiet", worktree, branche);
      return worktree;
    },
    retirer: (worktree) => void git(clone, "worktree", "remove", "--force", worktree),
    ranger: async (worktree) => {
      git(clone, "worktree", "remove", "--force", worktree);
      return null;
    },
    pousser: (branche) => void git(clone, "push", "--quiet", "--force", "origin", branche),
    commits: (branche) => (connait(branche) ? Number(git(clone, "rev-list", "--count", `origin/main..${branche}`)) : 0),
    changes: (branche) => git(clone, "diff", "--name-only", `origin/main...${branche}`).split("\n").filter(Boolean),
    diff: (branche) => git(clone, "diff", `origin/main...${branche}`),
    essayer: async (nom) => {
      const worktree = join(worktrees, nom);
      git(clone, "worktree", "add", "--quiet", "--detach", worktree, "origin/main");
      return worktree;
    },
    jeter: (nom) => {
      try {
        git(clone, "worktree", "remove", "--force", join(worktrees, nom ?? ""));
      } catch {
        // Rien à jeter.
      }
    },
    lancerGit: async (args, worktree) => {
      try {
        return { code: 0, stdout: execFileSync("git", args, { cwd: worktree, env: ENV_GIT, encoding: "utf8" }), stderr: "" };
      } catch (erreur) {
        return { code: 1, stdout: "", stderr: String((erreur as { stderr?: unknown }).stderr ?? erreur) };
      }
    },
  };
  return { origine, depot };
}

// La station : le cook livre les tests gelés (un commit à trailer) puis le
// code, et revient les mains vides quand on le relance ; la relecture est verte.
async function livre(t: TestContext, tests: string, tours = 5) {
  const repertoire = repertoireTemporaire(t);
  const { origine, depot } = depotDeLaStation(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers");
  let cooks = 0;
  const lancer: Lancer = ({ args, flux, cwd }) => {
    const relecteur = args.includes("--tools");
    if (!relecteur) {
      cooks += 1;
      if (git(cwd, "log", "--format=%B", "origin/main..HEAD").includes("Acceptance-Tests: frozen") === false) {
        writeFileSync(join(cwd, GELE), tests);
        execFileSync("git", ["add", GELE], { cwd, env: ENV_GIT });
        execFileSync("git", ["commit", "--quiet", "-m", "test(#41): frozen acceptance tests", "-m", "Acceptance-Tests: frozen"], { cwd, env: ENV_GIT });
        writeFileSync(join(cwd, "lib", "somme.ts"), CORRIGE);
        execFileSync("git", ["commit", "--quiet", "-am", "fix(#41): somme adds"], { cwd, env: ENV_GIT });
      }
    }
    const lecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: relecteur ? JSON.stringify(lecture) : "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "high" }), env: { PATH: process.env.PATH }, flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours && faux.mergee(TICKET) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const commentaires = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  const surLaBranche = () => (git(origine, "branch", "--list", BRANCHE) === "" ? null : git(origine, "ls-tree", "--name-only", BRANCHE, GELE) === "" ? "" : git(origine, "show", `${BRANCHE}:${GELE}`));
  return { faux, ticket: faux.ticket(TICKET), cooks: () => cooks, commentaires, testsGelesSurLaBranche: surLaBranche };
}

test("a frozen acceptance test that already passes on main does not loop the ticket: the wrong case is corrected or dropped, the right one is kept, and the delivery is merged with no gesture from the chef", async (t) => {
  const { faux, ticket, cooks, testsGelesSurLaBranche } = await livre(t, TESTS_GELES, 5);
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box", "the ticket goes on to its merge");
  assert.ok(cooks() <= 2, `at most one relaunch of the cook, not a loop: ${cooks()} runs`);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "nothing goes to the chef");
  const gele = testsGelesSurLaBranche() ?? "";
  assert.equal(gele.includes(MAUVAIS_CAS.trim()), false, "the case that already passes on main is no longer there as written");
  assert.ok(gele.includes(BON_CAS.trim()), "the case that proves the ticket is kept");
});
