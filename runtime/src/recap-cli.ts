// La commande du récapitulatif d'un projet, depuis son propre process (#3581) :
//   npm --prefix runtime run recap -- <owner>/<repo>                ce que la cuisine a fait depuis le marqueur, en JSON
//   npm --prefix runtime run recap -- <owner>/<repo> seen <until>   l'app l'a montré : le marqueur avance jusqu'à `until`
import { enProcess } from "./appel.ts";
import { principal } from "./recap/commande.ts";

await enProcess(principal);
