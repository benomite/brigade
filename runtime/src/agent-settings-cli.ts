// La commande des réglages des agents, depuis son propre process (#4222) :
//   npm --prefix runtime run agent-settings -- <agent>                                  ses réglages, en JSON
//   npm --prefix runtime run agent-settings -- <agent> set <clé> <valeur> --by <auteur>  en change un
import { enProcess } from "./appel.ts";
import { principal } from "./agent-settings/commande.ts";

await enProcess(principal);
