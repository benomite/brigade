// La porte de confiance, au chef (#4421) :
//   npm --prefix runtime run trust -- author <login>
//   npm --prefix runtime run trust -- accept|check issue|comment <id>
import { enProcess } from "./appel.ts";
import { principal } from "./trust/commande.ts";

await enProcess(principal);
