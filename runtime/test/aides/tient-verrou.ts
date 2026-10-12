// Process d'essai : prend le verrou du répertoire donné, le dit, et ne le rend
// jamais de lui-même.
import { prendreVerrou } from "../../src/verrou.ts";

// Désigné tant que le process vit : un verrou que plus rien ne désigne est
// rendu avec ce que le ramasse-miettes reprend.
const verrou = prendreVerrou(process.argv[2] ?? "");
console.log("tenu");
setInterval(() => void verrou, 1000);
