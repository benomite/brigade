// The projects the new kitchen serves on this station: `<station dir>/kitchen/projects`, one line each:
//   <name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
// Read by the kitchen, by the station's gates and by its presence; none when the file is absent.
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

export const projectsFile = (stationDir: string) => join(stationDir, "kitchen", "projects");

export function projectsOfTheKitchen(stationDir: string): KitchenProject[] {
  try {
    return readProjects(readFileSync(projectsFile(stationDir), "utf8"), stationDir);
  } catch {
    return [];
  }
}
