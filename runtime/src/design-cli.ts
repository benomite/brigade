// La commande des livraisons design retenues pour le chef (#3184) :
//   npm --prefix runtime run design -- validate <owner>/<repo>#<PR>
//   npm --prefix runtime run design -- send-back <owner>/<repo>#<PR> --comment "<what to change>"
import { enProcess } from "./appel.ts";
import { principal } from "./validation-design/commande.ts";

await enProcess(principal);
