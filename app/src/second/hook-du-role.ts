// Les crochets qui redisent le rôle du second après l'init (role-apres-init.ts, #2689), tels que les réglages du
// lancement de l'onglet Second les déclarent (launch.ts, `--settings`) : `node role-apres-init.ts <moment> <nom>
// <depot> <base> <gh>` — `debut` à chaque début de session (`SessionStart`), `prompt` à chaque message du chef
// (`UserPromptSubmit`). Comme hook-de-la-file.ts, ce module ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, MATCHER, type Cible } from "./hook-de-la-file.ts";
import type { Crochets } from "./launch.ts";

// Le début ne lit que le `CLAUDE.md` du dossier : quelques secondes suffisent.
const DELAY_DU_DEBUT_S = 10;
// Le prompt lit le `CLAUDE.md` de la branche d'intégration, puis la file : le délai de celui de la file.
const DELAY_DU_PROMPT_S = 45;
// La vue ne lit qu'un fichier du poste.
const DELAY_DE_LA_VUE_S = 10;

export function crochetsDuRole(options: { node: string; gh: string; cible: Cible; script?: string; separateur?: string }): Crochets {
  const separateur = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "role-apres-init.ts");
  const command = (moment: "debut" | "prompt" | "vue") =>
    [options.node, script, moment, options.cible.nom, options.cible.depot ?? "", options.cible.base ?? "", options.gh].map((word) => cite1(word, separateur)).join(" ");
  return {
    SessionStart: [{ matcher: MATCHER, hooks: [{ type: "command", command: command("debut"), timeout: DELAY_DU_DEBUT_S }] }],
    UserPromptSubmit: [
      { hooks: [{ type: "command", command: command("prompt"), timeout: DELAY_DU_PROMPT_S }] },
      { hooks: [{ type: "command", command: command("vue"), timeout: DELAY_DE_LA_VUE_S }] },
    ],
  };
}
