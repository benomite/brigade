// `npm --prefix runtime run agents`: the Agents tab's read side (#4220), agents-tab/commande.ts.
import { enProcess } from "./appel.ts";
import { principal } from "./agents-tab/commande.ts";

await enProcess(principal);
