import { readFileSync } from "node:fs";
import { join } from "node:path";

// La doc du runtime vit en pages sous docs/runtime/, dans l'ordre de l'index : les tests la lisent
// d'un bloc, comme l'ancien docs/runtime.md, pour y chercher une commande ou une section.
export const SOURCE_DOC = "docs/runtime/";

export function docRuntime(root: string): string {
  const folder = join(root, "docs/runtime");
  const index = readFileSync(join(folder, "README.md"), "utf8");
  const pages = [...index.matchAll(/\]\(([a-z-]+\.md)\)/g)].map((m) => m[1] as string);
  return pages.map((page) => readFileSync(join(folder, page), "utf8")).join("\n");
}
