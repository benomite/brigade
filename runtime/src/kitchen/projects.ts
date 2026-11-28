// The projects the new kitchen serves: `<station dir>/kitchen/projects`, one line `<name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]` each (none when absent).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type KitchenProject = { name: string; repo: string; base: string; places: number; clone: string };

export function readProjects(text: string, stationDir: string): KitchenProject[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .flatMap((line) => {
      const [name, repo, base, ...settings] = line.split(/\s+/);
      if (name === undefined || repo === undefined) return [];
      const setting = (key: string) => settings.find((one) => one.startsWith(`${key}=`))?.slice(key.length + 1);
      return [{ name, repo, base: base ?? "main", places: Number(setting("PLACES") ?? 4), clone: setting("CLONE") ?? join(stationDir, name, "depot") }];
    });
}

// A project's worktrees live beside its clone, never under the station dir: on macOS the station dir is one the sandbox forbids a cook to read (#4783).
export const worktreesOf = (project: KitchenProject) => join(dirname(project.clone), ".brigade-worktrees", project.name);

export const projectsFile = (stationDir: string) => join(stationDir, "kitchen", "projects");

export function projectsOfTheKitchen(stationDir: string): KitchenProject[] {
  try { return readProjects(readFileSync(projectsFile(stationDir), "utf8"), stationDir); } catch { return []; }
}
