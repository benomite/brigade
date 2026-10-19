// La fermeture, depuis son propre process :
//   npm --prefix runtime run closing              l'observation — le ratio ajouté / retiré des derniers merges, les doublons, le code mort
//   npm --prefix runtime run closing -- write     la passe qui écrit — demandée au runtime, qui la lance sous sa condition d'exécution et ses garde-fous, dès qu'elle est remplie
//   npm --prefix runtime run closing -- cancel    renonce à la demande qui attend
// L'observation lit le dépôt du projet et son journal, et n'écrit ni dans l'un
// ni dans l'autre : elle répond pendant que le runtime tourne. `write` et
// `cancel` n'écrivent qu'au journal : c'est le runtime qui range.
import { enProcess } from "./appel.ts";
import { principal } from "./closing/command.ts";

await enProcess(principal);
