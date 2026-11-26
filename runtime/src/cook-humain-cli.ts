// `npm --prefix runtime run human-cooks` : la liste des tickets qui attendent un cook humain (cook-humain/commande.ts).
import { enProcess } from "./appel.ts";
import { principal } from "./cook-humain/commande.ts";

await enProcess(principal);
