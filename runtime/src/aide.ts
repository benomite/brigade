// L'aide de la box : `brigade <projet> help` (ou `--help`) — chaque commande
// sous son nom anglais, avec ce qu'elle fait. Les anciens noms n'y sont pas :
// ils répondent encore, en disant le nouveau (`commandes.ts`, CHANGELOG.md).
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { COMMANDES } from "./commandes.ts";

export function principal({ args, dire, redire }: Appel): void {
  if (args.length > 0) {
    redire("usage: brigade <project> help");
    throw new Sortie(2);
  }
  const large = Math.max(...COMMANDES.map(({ nom }) => nom.length)) + 2;
  dire("usage: brigade <project> <command> [arguments…]");
  dire("");
  dire("Commands:");
  for (const { nom, description } of COMMANDES) dire(`  ${nom.padEnd(large)}${description}`);
}

if (import.meta.main) await enProcess(principal);
