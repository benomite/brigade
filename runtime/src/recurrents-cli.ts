// La commande des tickets récurrents du projet, depuis son propre process (#3230) :
//   npm --prefix runtime run recurring                                   les tickets récurrents, en JSON
//   npm --prefix runtime run recurring -- declare --title <t> --rhythm … en déclare un
//   npm --prefix runtime run recurring -- pause|resume|remove <id>       le suspend, le reprend, le retire
import { enProcess } from "./appel.ts";
import { principal } from "./recurrents/commande.ts";

await enProcess(principal);
