// The kitchen's entry point on a station: one loop that serves every project of `<BRIGADE_STATION_DIR>/kitchen/projects`
// (format in projects.ts, read at every turn: no restart). Risk zones: `.brigade/kitchen.json` on the base branch, {"risk": ["runtime/"], "release": "auto"|"chef"} (who merges an epic's PR).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { projectHosts } from "../bac-a-sable/kitchen-sandbox.ts";
import { masquerLaConsole } from "../jeton-claude.ts";
import { annoncerEnService } from "../mise-a-jour/en-service.ts";
import { REGLES_DE_BASE, passerParLaPorte, type Regle } from "../reseau.ts";
import { lirePortes } from "../station/portes.ts";
import { ghCli } from "./github.ts";
import { launcherOf } from "../bac-a-sable/kitchen-launch.ts";
import { gitCli, openKitchen } from "./kitchen.ts";
import { projectsFile, readProjects, worktreesOf, type KitchenProject } from "./projects.ts";

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
  let release: "auto" | "chef" = "auto";
  let hosts: Regle[] = REGLES_DE_BASE;
  const worktrees = worktreesOf(project);
  const launcher = launcherOf({ project: project.name, env: process.env, claude: claudeBin, state, clone: project.clone, worktrees, hosts: () => hosts, probes: sondesDeLaMachine(claudeBin), portsFile, portOf });
  if ("refused" in launcher) return launcher;
  return {
    // What the base branch declares, read before each turn.
    readBase: async () => {
      const declared = await git(project.clone, ["show", `origin/${project.base}:.brigade/kitchen.json`]).then((text) => JSON.parse(text) as { risk?: string[]; release?: string }, () => ({}) as { risk?: string[]; release?: string });
      risk = declared.risk ?? [];
      release = declared.release === "chef" ? "chef" : "auto";
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
      release: () => release,
      secrets: Object.fromEntries(["GH_TOKEN", "GITHUB_TOKEN"].flatMap((name) => (process.env[name] ? [[name, process.env[name] as string]] : []))),
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
  // What the station's update and the app wait for: this kitchen started, and the projects it serves.
  annoncerEnService(root, () => ({ servis: [...kitchens.keys()], refuses: Object.fromEntries(refusals) }), { dire: console.error });
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
        const served = kitchens.get(project.name) ?? kitchenOf(project);
        if ("refused" in served) {
          if (refusals.get(project.name) !== served.refused) log(project.name)(served.refused);
          refusals.set(project.name, served.refused);
          continue;
        }
        kitchens.set(project.name, served);
        await served.readBase();
        await served.kitchen.turn();
      } catch (error) {
        log(project.name)(`turn failed — ${(error as Error).message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, TURN_MS));
  }
}
