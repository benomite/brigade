// Process d'essai : prend le verrou du répertoire donné, le dit, et ne le rend
// jamais de lui-même.
import { prendreVerrou } from "../../src/verrou.ts";

prendreVerrou(process.argv[2] ?? "");
console.log("tenu");
setInterval(() => {}, 1000);
