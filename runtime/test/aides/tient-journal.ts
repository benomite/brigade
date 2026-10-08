// Process d'essai : tient pour lui seul le journal du répertoire donné, le dit,
// et le rend un dixième de seconde plus tard — ce que fait, en plus bref, celui
// qui réveille un journal au repos.
import { Base } from "../../src/base.ts";
import { cheminJournal } from "../../src/journal.ts";

const base = new Base(cheminJournal(process.argv[2] ?? ""));
base.script("PRAGMA locking_mode = EXCLUSIVE; BEGIN IMMEDIATE; COMMIT");
console.log("tenu");
setTimeout(() => base.fermer(), 100);
