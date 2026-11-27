// Le crochet `SessionStart` qui donne au second la commande pour parquer et déparquer un ticket (parking.ts, #4262), tel
// que les réglages du lancement de l'onglet Second le déclarent (launch.ts, `--settings`) : `node parking.ts context
// <depot>`, à l'ouverture de la session, à sa reprise et après chaque compaction. Comme hook-of-the-file.ts, ce module
// ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, EVENT, MATCHER, type Target } from "./hook-of-the-file.ts";
import type { Hooks } from "./launch.ts";

// Le crochet ne lit rien : quelques secondes suffisent.
const DELAY_OF_HOOK_S = 10;

export function hooksOfParking(options: { node: string; cible: Target; script?: string; separateur?: string }): Hooks {
  const separator = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "parking.ts");
  const words = [options.node, script, "context", options.cible.depot ?? ""].map((word) => cite1(word, separator));
  return { [EVENT]: [{ matcher: MATCHER, hooks: [{ type: "command", command: words.join(" "), timeout: DELAY_OF_HOOK_S }] }] };
}
