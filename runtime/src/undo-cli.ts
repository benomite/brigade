// L'annulation d'un ticket servi (#3274) :
//   npm --prefix runtime run undo -- <owner>/<repo>#<ticket>
import { enProcess } from "./appel.ts";
import { principal } from "./undo/commande.ts";

await enProcess(principal);
