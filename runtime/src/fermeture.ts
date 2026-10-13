// La fermeture, depuis son propre process :
//   npm --prefix runtime run fermeture    l'observation — le ratio ajouté / retiré des derniers merges, les doublons, le code mort
// Elle lit le dépôt du projet et son journal, et n'écrit ni dans l'un ni dans
// l'autre : elle répond pendant que le runtime tourne.
import { enProcess } from "./appel.ts";
import { principal } from "./fermeture/observer.ts";

await enProcess(principal);
