// La commande des tickets sensibles retenus pour le chef (#3223) :
//   npm --prefix runtime run sensitive -- merge <owner>/<repo>#<PR>
//   npm --prefix runtime run sensitive -- send-back <owner>/<repo>#<PR> --note "<note>"
import { enProcess } from "./appel.ts";
import { principal } from "./sensible/commande.ts";

await enProcess(principal);
