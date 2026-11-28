// Le gist de la station tenue dans `root`, ou null tant qu'elle n'en a pas : ce que la station garde d'elle (`appairage.json`).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE_LOCAL = "appairage.json";

export function localGist(root: string): string | null {
  try {
    const { gist } = JSON.parse(readFileSync(join(root, FILE_LOCAL), "utf8")) as { gist?: unknown };
    return typeof gist === "string" && gist !== "" ? gist : null;
  } catch {
    return null;
  }
}
