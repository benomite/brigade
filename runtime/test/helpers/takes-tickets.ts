// Process d'essai : une station qui, au signal, prend des tickets sur le rail
// du répertoire donné jusqu'à ce qu'il n'en reste plus, puis dit lesquels.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../../src/rail.ts";

const [repertoire = "", station = ""] = process.argv.slice(2);
const journal = ouvrirJournal(repertoire);
const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 });
console.log("prêt");
while (!existsSync(join(repertoire, "feu"))) {}

const pris: number[] = [];
for (let ticket = rail.prendre(station); ticket; ticket = rail.prendre(station)) {
  pris.push(ticket.ticket);
  // Un rail qui prêterait sans fin le même ticket ne doit pas figer la suite.
  if (pris.length > 1000) process.exit(1);
}
journal.fermer();
console.log(`pris ${JSON.stringify(pris)}`);
