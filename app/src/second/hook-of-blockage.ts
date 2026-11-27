// Le crochet du second pour une question de blocage (blockage-of-second.ts, #4121), tel que les réglages du lancement
// de l'onglet Second le déclarent (launch.ts, `--settings`) : `node blockage-of-second.ts <nom>` à chaque message du
// chef (`UserPromptSubmit`). Comme hook-of-the-file.ts, ce module ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, type Target } from "./hook-of-the-file.ts";
import type { Hooks } from "./launch.ts";

// La vue ne lit qu'un fichier du poste.
const DELAY_OF_THE_VUE_S = 10;

export function hooksOfBlockage(options: { node: string; cible: Target; script?: string; separateur?: string }): Hooks {
  const separator = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "blockage-of-second.ts");
  const command = [options.node, script, options.cible.nom].map((word) => cite1(word, separator)).join(" ");
  return { UserPromptSubmit: [{ hooks: [{ type: "command", command, timeout: DELAY_OF_THE_VUE_S }] }] };
}
