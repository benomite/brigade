// Le crochet `SessionStart` qui donne au second la commande pour parquer et déparquer un ticket (parking.ts, #4262), tel
// que les réglages du lancement de l'onglet Second le déclarent (lancement.ts, `--settings`) : `node parking.ts context
// <depot>`, à l'ouverture de la session, à sa reprise et après chaque compaction. Comme crochet-de-la-file.ts, ce module
// ne lit rien : seul Node s'y importe.
import { join, sep } from "node:path";
import { cite1, EVENEMENT, MATCHER, type Cible } from "./crochet-de-la-file.ts";
import type { Crochets } from "./lancement.ts";

// Le crochet ne lit rien : quelques secondes suffisent.
const DELAI_DU_CROCHET_S = 10;

export function crochetsDuParking(options: { node: string; cible: Cible; script?: string; separateur?: string }): Crochets {
  const separateur = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "parking.ts");
  const mots = [options.node, script, "context", options.cible.depot ?? ""].map((mot) => cite1(mot, separateur));
  return { [EVENEMENT]: [{ matcher: MATCHER, hooks: [{ type: "command", command: mots.join(" "), timeout: DELAI_DU_CROCHET_S }] }] };
}
