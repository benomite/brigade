// Un mot au cook d'un ticket en cuisine (#4047) :
//   npm --prefix runtime run send-word -- <owner>/<repo>#<ticket> <word…>
import { enProcess } from "./appel.ts";
import { principal } from "./mot-au-cook/commande.ts";

await enProcess(principal);
