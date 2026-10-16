// La doc du runtime : un index (docs/runtime/README.md) et des pages (docs/runtime/*.md).
// Les tests qui lisent « la doc » la lisent d'un bloc, où qu'une section se trouve.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function lireDocRuntime(racine: string): string {
  const pages = readdirSync(join(racine, "docs/runtime")).filter((f) => f.endsWith(".md")).sort();
  return pages.map((f) => readFileSync(join(racine, "docs/runtime", f), "utf8")).join("\n");
}
