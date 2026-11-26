// Le savoir-faire du projet, depuis son propre process (#4241) :
//   npm --prefix runtime run know-how                         les entrées, en JSON
//   npm --prefix runtime run know-how -- edit <id> <text…>    en réécrit une
//   npm --prefix runtime run know-how -- remove <id>          en retire une
import { enProcess } from "./appel.ts";
import { principal } from "./savoir-faire/commande.ts";

await enProcess(principal);
