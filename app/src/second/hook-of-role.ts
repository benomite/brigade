// Les crochets qui redisent le rôle du second après l'init (role-after-init.ts, #2689), tels que les réglages du
// lancement de l'onglet Second les déclarent (launch.ts, `--settings`) : `node role-after-init.ts <moment> <nom>
// <depot> <base> <gh>` — `debut` à chaque début de session (`SessionStart`), `prompt` à chaque message du chef
// (`UserPromptSubmit`). Comme hook-of-the-file.ts, ce module ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, MATCHER, type Target } from "./hook-of-the-file.ts";
import type { Hooks } from "./launch.ts";

// Le début ne lit que le `CLAUDE.md` du dossier : quelques secondes suffisent.
const DELAY_OF_START_S = 10;
// Le prompt lit le `CLAUDE.md` de la branche d'intégration, puis la file : le délai de celui de la file.
const DELAY_OF_PROMPT_S = 45;
// La vue ne lit qu'un fichier du poste.
const DELAY_OF_THE_VUE_S = 10;

export function hooksOfRole(options: { node: string; gh: string; cible: Target; script?: string; separateur?: string }): Hooks {
  const separator = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "role-after-init.ts");
  const command = (moment: "debut" | "prompt" | "vue") =>
    [options.node, script, moment, options.cible.nom, options.cible.depot ?? "", options.cible.base ?? "", options.gh].map((word) => cite1(word, separator)).join(" ");
  return {
    SessionStart: [{ matcher: MATCHER, hooks: [{ type: "command", command: command("debut"), timeout: DELAY_OF_START_S }] }],
    UserPromptSubmit: [
      { hooks: [{ type: "command", command: command("prompt"), timeout: DELAY_OF_PROMPT_S }] },
      { hooks: [{ type: "command", command: command("vue"), timeout: DELAY_OF_THE_VUE_S }] },
    ],
  };
}
