// Le crochet `SessionStart` qui lit la file du projet pour le second (file.ts), tel que les réglages du lancement de
// l'onglet Second le déclarent (lancement.ts, `--settings`) : `node file.ts <nom> <depot> <gh>`, à l'ouverture de la
// session, à sa reprise et après chaque compaction. Ce module ne lit rien : il est chargé par terminaux.ts, que le
// lancement de l'app charge avant toute dépendance (rattrapage.ts) — seul Node s'y importe.
import { join, sep } from "node:path";
import type { Crochets } from "./lancement.ts";

export const EVENEMENT = "SessionStart";
// Les trois façons dont une session commence : neuve, reprise, ou après une compaction.
export const MATCHER = "startup|resume|compact";
// Le délai de `claude` pour le crochet, en secondes : celui de la lecture, trente secondes, et de la marge.
const DELAI_DU_CROCHET_S = 45;

// Le projet tel que la file se lit : son nom, et son dépôt GitHub quand le fichier des projets le donne — sinon
// celui de l'`origin` du dossier de la session.
export type Cible = { nom: string; depot?: string };

// Citée pour le shell qui joue le crochet. Sous Windows, `claude` le joue par le `bash` de Git, qui lit `C:/…`.
const cite1 = (mot: string, separateur: string) => `'${(separateur === "\\" ? mot.replaceAll("\\", "/") : mot).replaceAll("'", `'\\''`)}'`;

// Le crochet des réglages du second : `node file.ts <nom> <depot> <gh>`.
export function crochetsDeLaFile(options: { node: string; gh: string; cible: Cible; script?: string; separateur?: string }): Crochets {
  const separateur = options.separateur ?? sep;
  const script = options.script ?? join(import.meta.dirname, "file.ts");
  const mots = [options.node, script, options.cible.nom, options.cible.depot ?? "", options.gh].map((mot) => cite1(mot, separateur));
  return { [EVENEMENT]: [{ matcher: MATCHER, hooks: [{ type: "command", command: mots.join(" "), timeout: DELAI_DU_CROCHET_S }] }] };
}
