// La station du dépôt qui juge une livraison aux tests gelés faux (#3799), commune
// aux tests de `gele-faux.ts` qui passent par elle : un vrai dépôt git, un faux
// GitHub, un faux `claude` qui est le cook (il commite les tests gelés, puis le
// code) ou le relecteur, dont la relecture est verte.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer, type OptionsDuDepot } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { ENV_GIT, repertoireTemporaire } from "../outils.ts";

export const TICKET = 41;
export const BRANCHE = brancheDuTicket(TICKET);
export const GELE = "lib/41.test.ts";
const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\n";
export const ENTETE = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./somme.ts";\n';
export const BON_CAS = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';

const git = (repertoire: string, ...args: string[]) => execFileSync("git", ["-C", repertoire, ...args], { env: ENV_GIT, encoding: "utf8" }).trim();

// Une origine dont `main` porte `somme` bogué, et les fichiers `base` (chemin →
// contenu ; exécutable sous `node_modules/.bin/` ou en `.sh`), et le clone de la station.
function depotDeLaStation(t: TestContext, base: Record<string, string>): { origine: string; depot: OptionsDuDepot["depot"] } {
  const racine = repertoireTemporaire(t);
  const [origine, source, clone, worktrees] = ["origine.git", "source", "clone", "worktrees"].map((nom) => join(racine, nom)) as [string, string, string, string];
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origine], { env: ENV_GIT });
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", source], { env: ENV_GIT });
  git(source, "remote", "add", "origin", origine);
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', "lib/somme.ts": BOGUE, ...base })) {
    mkdirSync(dirname(join(source, chemin)), { recursive: true });
    writeFileSync(join(source, chemin), contenu);
    if (chemin.startsWith("node_modules/.bin/") || chemin.endsWith(".sh")) chmodSync(join(source, chemin), 0o755);
  }
  git(source, "add", "--force", ".");
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

// La station, tour après tour jusqu'au merge : le cook livre les tests gelés
// `tests` (un commit à trailer) puis le code, et revient les mains vides quand
// on le relance. `station` : ce qui change des options de la station.
export async function livre(t: TestContext, tests: string, { tours = 5, base = {}, station: reglages = {} }: { tours?: number; base?: Record<string, string>; station?: Partial<OptionsDuDepot> } = {}) {
  const repertoire = repertoireTemporaire(t);
  const { origine, depot } = depotDeLaStation(t, base);
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
  const avertis: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "high" }), env: { PATH: process.env.PATH }, flux: repertoire, lancer, avertir: (ligne) => void avertis.push(ligne), ...reglages });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours && faux.mergee(TICKET) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const commentaires = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  const pr = faux.prs.find((p) => p.issue === TICKET);
  const surLaPR = pr === undefined ? [] : (faux.commentaires.get(pr.number) ?? []).map((c) => c.body);
  const surLaBranche = () => (git(origine, "branch", "--list", BRANCHE) === "" ? null : git(origine, "ls-tree", "--name-only", BRANCHE, GELE) === "" ? "" : git(origine, "show", `${BRANCHE}:${GELE}`));
  return { faux, ticket: faux.ticket(TICKET), cooks: () => cooks, commentaires, surLaPR, avertis, testsGelesSurLaBranche: surLaBranche };
}
