// Les crochets qui redisent le rôle du second après l'init (role-apres-init.ts, #2689), tels que les réglages du
// lancement de l'onglet Second les déclarent (lancement.ts, `--settings`) : `node role-apres-init.ts <moment> <nom>
// <depot> <base> <gh>` — `debut` à chaque début de session (`SessionStart`), `prompt` à chaque message du chef
// (`UserPromptSubmit`). Comme crochet-de-la-file.ts, ce module ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, MATCHER, type Cible } from "./crochet-de-la-file.ts";
import type { Crochets } from "./lancement.ts";

// Le début ne lit que le `CLAUDE.md` du dossier : quelques secondes suffisent.
const DELAI_DU_DEBUT_S = 10;
// Le prompt lit le `CLAUDE.md` de la branche d'intégration, puis la file : le délai de celui de la file.
const DELAI_DU_PROMPT_S = 45;

export function crochetsDuRole(options: { node: string; gh: string; cible: Cible; script?: string; separateur?: string }): Crochets {
  const separateur = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "role-apres-init.ts");
  const commande = (moment: "debut" | "prompt") =>
    [options.node, script, moment, options.cible.nom, options.cible.depot ?? "", options.cible.base ?? "", options.gh].map((mot) => cite1(mot, separateur)).join(" ");
  return {
    SessionStart: [{ matcher: MATCHER, hooks: [{ type: "command", command: commande("debut"), timeout: DELAI_DU_DEBUT_S }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: commande("prompt"), timeout: DELAI_DU_PROMPT_S }] }],
  };
}
