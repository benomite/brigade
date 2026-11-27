// The kitchen's entry point on a station: one loop that serves every project
// of `<BRIGADE_STATION_DIR>/kitchen`, one line each:
//   <name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
// The file is read at every turn: adding a project needs no restart.
// The risk zones of a project are in `.brigade/kitchen.json` on its base
// branch: {"risk": ["runtime/"]}.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argumentsClaude, environnementCook } from "../claude.ts";
import { configCloison, envelopper } from "../cloison.ts";
import { environnementClaude, masquerLaConsole } from "../jeton-claude.ts";
import { passerParLaPorte, variablesDeRelais } from "../reseau.ts";
import { lirePortes } from "../station/portes.ts";
import { ghCli } from "./github.ts";
import { gitCli, openKitchen } from "./kitchen.ts";
import { projectsFile, readProjects, type KitchenProject } from "./projects.ts";

masquerLaConsole();

const root = process.env.BRIGADE_STATION_DIR;
if (!root) {
  console.error("kitchen: BRIGADE_STATION_DIR is not set");
  process.exit(2);
}
const TURN_MS = Number(process.env.BRIGADE_KITCHEN_TURN_SECONDS || 60) * 1000;
const claudeBin = process.env.BRIGADE_CLAUDE_BIN || "claude";

const log = (project: string) => (line: string) => console.log(`${new Date().toISOString()} ${project}: ${line}`);

function kitchenOf(project: KitchenProject) {
  const state = join(root as string, "kitchen", project.name);
  const git = gitCli(process.env);
  const portsFile = process.env.BRIGADE_STATION_PORTES;
  // Read at each launch: the gate may open the project's port after the kitchen started.
  const portOf = () => (portsFile && existsSync(portsFile) ? (lirePortes(portsFile).projets[project.name] ?? null) : null);
  const cloison = configCloison(process.env, { repertoireEtat: state, clone: project.clone });
  let risk: string[] = [];
  return {
    risk: async () => {
      try {
        risk = (JSON.parse(await git(project.clone, ["show", `origin/${project.base}:.brigade/kitchen.json`])) as { risk?: string[] }).risk ?? [];
      } catch {
        risk = [];
      }
    },
    kitchen: openKitchen({
      repo: project.repo,
      base: project.base,
      clone: project.clone,
      worktrees: join(state, "worktrees"),
      state,
      gh: ghCli(process.env.BRIGADE_GH_BIN || "gh", process.env),
      git,
      places: () => project.places,
      riskPaths: () => risk,
      log: log(project.name),
      launch: (_kind, cwd, write, calibration, input) => {
        // No BRIGADE_ variable and no GitHub token reach an agent: it reads its ticket from its input.
        const { GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...base } = environnementCook(process.env);
        const port = portOf();
        // On a station with gates, an agent never leaves without its project's.
        if (portsFile && port === null) throw new Error(`no network gate is open for ${project.name}: no agent leaves without one`);
        const env = environnementClaude({ ...base, ...(port === null ? {} : variablesDeRelais(port)) }, process.env);
        const launch = envelopper(cloison, { commande: claudeBin, args: argumentsClaude(calibration) }, { cwd, depot: write ? "ecriture" : "lecture" });
        return { command: launch.commande, args: launch.args, input, cwd, env, secrets: {} };
      },
    }),
  };
}

if (import.meta.main) {
  // On a station whose service may only reach localhost, the kitchen's own `gh` and `git` go through its gate too.
  const portsFile = process.env.BRIGADE_STATION_PORTES;
  const stationPort = portsFile && existsSync(portsFile) ? lirePortes(portsFile).station : null;
  if (stationPort !== null) passerParLaPorte(stationPort);
  const kitchens = new Map<string, ReturnType<typeof kitchenOf>>();
  const file = projectsFile(root);
  for (;;) {
    let projects: KitchenProject[] = [];
    try {
      projects = readProjects(readFileSync(file, "utf8"), root);
    } catch (error) {
      console.error(`kitchen: ${file} unreadable — ${(error as Error).message}`);
    }
    for (const project of projects) {
      try {
        if (!kitchens.has(project.name)) kitchens.set(project.name, kitchenOf(project));
        const served = kitchens.get(project.name) as ReturnType<typeof kitchenOf>;
        await served.risk();
        await served.kitchen.turn();
      } catch (error) {
        log(project.name)(`turn failed — ${(error as Error).message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, TURN_MS));
  }
}
