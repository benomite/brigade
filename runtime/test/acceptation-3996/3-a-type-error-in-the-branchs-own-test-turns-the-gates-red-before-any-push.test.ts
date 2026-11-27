// #3996, critère 3 : les gates de la station jouent le contrôle de types des deux zones, et une erreur de types dans un
// test de la branche elle-même les rougit avant tout push. Par la station, sur le vrai dépôt, avec le vrai `gates.sh` du
// dépôt dans le worktree du cook : le test de la branche est bon pour `node` (les types s'y effacent) mais pas pour le
// contrôle de types de sa zone — le cas des tests gelés poussés avec une erreur TS2307 ou TS2345.
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const TICKET = 12;
const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
const SELECTION = join(import.meta.dirname, "../../../.claude/brigade/tests-touches.mjs");
const SKIP = posixOnly("plays this repository's real gates.sh in the cook's worktree; on Windows its Python check reads the role paths with backslashes");

// Le projet que le cook livre : le contrôle de types de `zone` y est rouge sur un fichier de test qui porte la marque
// TYPE_ERROR (le faux `tsc` que les gates cherchent est un fichier exécutable). Sans rôle V1, les contrôles plugin des
// gates y sont rouges aussi (#4630) : le test lit dans le commentaire d'échec que le rouge vient bien des types.
function poserLeProjet(cwd: string, zone: "runtime" | "app", trace: string) {
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(dirname(join(cwd, fichier)), { recursive: true });
    writeFileSync(join(cwd, fichier), contenu);
  };
  poser("CLAUDE.md", `## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : \`${BASE}\`\n`);
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/start.md"], agents: [] }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  poser("commands/start.md", "");
  mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
  copyFileSync(GATES, join(cwd, ".claude/brigade/gates.sh"));
  copyFileSync(SELECTION, join(cwd, ".claude/brigade/tests-touches.mjs"));
  chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
  const typage = `import { readdirSync, readFileSync, appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(trace)}, "types\\n");\nconst rouges = readdirSync("test").filter((f) => readFileSync("test/" + f, "utf8").includes("TYPE_ERROR"));\nif (rouges.length) { console.log("test/" + rouges[0] + ": TS2345 type error"); process.exit(2); }\n`;
  for (const z of ["runtime", "app"]) {
    poser(`${z}/package.json`, JSON.stringify({ scripts: { test: 'node --test "test/**/*.test.ts"', typecheck: "node typage.mjs" } }));
    poser(`${z}/typage.mjs`, typage);
    poser(`${z}/src/a.ts`, "export const a = 1;\n");
    poser(`${z}/test/a.test.ts`, "");
    poser(`${z}/node_modules/.bin/tsc`, "#!/bin/sh\n");
    chmodSync(join(cwd, z, "node_modules/.bin/tsc"), 0o755);
  }
  // Le test de la branche elle-même : il passe sous `node`, il ne passe pas le contrôle de types.
  poser(`${zone}/test/gele.test.ts`, 'import { test } from "node:test";\nconst n: number = "deux"; // TYPE_ERROR\ntest("frozen", () => void n);\n');
}

async function livrer(t: TestContext, zone: "runtime" | "app") {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "types-joues");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- It works");
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools")) poserLeProjet(cwd, zone, trace.replaceAll("\\", "/"));
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nIt works.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const env = { PATH: process.env.PATH ?? "", HOME: repertoireTemporaire(t), BRIGADE_GATES_VERROU: "aucun" };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, env, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const dit = [...(faux.commentaires.get(TICKET) ?? [])].map((c) => c.body).join("\n");
  return { poussee: git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)) !== "", jouee: existsSync(trace), dit };
}

describe("a type error in the branch's own test file", () => {
  test("in the runtime zone turns the gates red before the delivery is pushed", { skip: SKIP }, async (t) => {
    const { poussee, jouee, dit } = await livrer(t, "runtime");
    assert.equal(jouee, true, "the gates played the type check");
    assert.match(dit, /FAIL  contrôle de types du runtime en échec[\s\S]*TS2345 type error/, "the type check is what turned the gates red");
    assert.equal(poussee, false, "nothing was pushed");
  });

  test("in the app zone turns the gates red before the delivery is pushed", { skip: SKIP }, async (t) => {
    const { poussee, jouee, dit } = await livrer(t, "app");
    assert.equal(jouee, true, "the gates played the type check");
    assert.match(dit, /FAIL  contrôle de types de l'app en échec[\s\S]*TS2345 type error/, "the type check is what turned the gates red");
    assert.equal(poussee, false, "nothing was pushed");
  });
});
