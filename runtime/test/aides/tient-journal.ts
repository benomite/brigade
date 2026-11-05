// Process d'essai : tient pour lui seul le journal du répertoire donné, le dit,
// et le rend dès que le fichier nommé en second paraît — le test le pose juste
// avant de lire : le lecteur attend alors un journal tenu, quelle que soit la
// charge de la machine, comme celui que réveille un journal au repos (#2464).
import { existsSync } from "node:fs";
import { Base } from "../../src/base.ts";
import { cheminJournal } from "../../src/journal.ts";

const base = new Base(cheminJournal(process.argv[2] ?? ""));
const libere = process.argv[3] ?? "";
base.script("PRAGMA locking_mode = EXCLUSIVE; BEGIN IMMEDIATE; COMMIT");
console.log("tenu");
const attente = setInterval(() => {
  if (!existsSync(libere)) return;
  clearInterval(attente);
  base.fermer();
}, 5);
