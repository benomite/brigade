// L'autonomie de chaque agent du projet, vue et réglée par le chef (#4036) :
//   npm --prefix runtime run autonomy -- [<agent> <niveau> | manager split-epic <niveau>]
import { enProcess } from "./appel.ts";
import { principal } from "./autonomie/agents/commande.ts";

await enProcess(principal);
