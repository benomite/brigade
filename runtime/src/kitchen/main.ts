// The kitchen's entry point on a station: one loop that serves every project
// of `<BRIGADE_STATION_DIR>/kitchen`, one line each:
//   <name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
// The file is read at every turn: adding a project needs no restart.
// The risk zones of a project are in `.brigade/kitchen.json` on its base
// branch: {"risk": ["runtime/"]}.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { masquerLaConsole } from "../jeton-claude.ts";
import { REGLES_DE_BASE, passerParLaPorte, type Regle } from "../reseau.ts";
import { lirePortes } from "../station/portes.ts";
import { ghCli } from "./github.ts";
import { launcherOf, projectHosts } from "./launch.ts";
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

// The project's kitchen, or why it launches no agent.
function kitchenOf(project: KitchenProject) {
  const state = join(root as string, "kitchen", project.name);
  const git = gitCli(process.env);
  const portsFile = process.env.BRIGADE_STATION_PORTES;
  // Read at each launch: the gate may open the project's port after the kitchen started.
  const portOf = () => (portsFile && existsSync(portsFile) ? (lirePortes(portsFile).projets[project.name] ?? null) : null);
  let risk: string[] = [];
  let hosts: Regle[] = REGLES_DE_BASE;
  const worktrees = join(state, "worktrees");
  const launcher = launcherOf({ project: project.name, env: process.env, claude: claudeBin, state, clone: project.clone, worktrees, hosts: () => hosts, probes: sondesDeLaMachine(claudeBin), portsFile, portOf });
  if ("refused" in launcher) return launcher;
  return {
    // What the base branch declares, read before each turn.
    readBase: async () => {
      try {
        risk = (JSON.parse(await git(project.clone, ["show", `origin/${project.base}:.brigade/kitchen.json`])) as { risk?: string[] }).risk ?? [];
      } catch {
        risk = [];
      }
      hosts = await projectHosts(git, project.clone, project.base);
    },
    kitchen: openKitchen({
      repo: project.repo,
      base: project.base,
      clone: project.clone,
      worktrees,
      state,
      gh: ghCli(process.env.BRIGADE_GH_BIN || "gh", process.env),
      git,
      places: () => project.places,
      riskPaths: () => risk,
      log: log(project.name),
      launch: launcher.launch,
    }),
  };
}

if (import.meta.main) {
  // On a station whose service may only reach localhost, the kitchen's own `gh` and `git` go through its gate too.
  const portsFile = process.env.BRIGADE_STATION_PORTES;
  const stationPort = portsFile && existsSync(portsFile) ? lirePortes(portsFile).station : null;
  if (stationPort !== null) passerParLaPorte(stationPort);
  type Served = Exclude<ReturnType<typeof kitchenOf>, { refused: string }>;
  const kitchens = new Map<string, Served>();
  // A refused project is tried again each turn; its reason is logged when it changes.
  const refusals = new Map<string, string>();
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
        if (!kitchens.has(project.name)) {
          const opened = kitchenOf(project);
          if ("refused" in opened) {
            if (refusals.get(project.name) !== opened.refused) log(project.name)(opened.refused);
            refusals.set(project.name, opened.refused);
            continue;
          }
          refusals.delete(project.name);
          kitchens.set(project.name, opened);
        }
        const served = kitchens.get(project.name) as Served;
        await served.readBase();
        await served.kitchen.turn();
      } catch (error) {
        log(project.name)(`turn failed — ${(error as Error).message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, TURN_MS));
  }
}
