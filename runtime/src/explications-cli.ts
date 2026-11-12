// La commande des explications des mots de la cuisine, depuis son propre process (#3308) :
//   npm --prefix runtime run explanations -- --chef <login>                les mots dont ce chef a vu l'explication, en JSON
//   npm --prefix runtime run explanations -- seen <word> --chef <login>    il a vu ou écarté celle de ce mot
//   npm --prefix runtime run explanations -- reset --chef <login>          chaque explication se montre de nouveau
import { enProcess } from "./appel.ts";
import { principal } from "./explications/commande.ts";

await enProcess(principal);
