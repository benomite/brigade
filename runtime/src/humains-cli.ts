// La commande des humains du projet, depuis son propre process (#2929) :
//   npm --prefix runtime run humans                              les humains déclarés, en JSON
//   npm --prefix runtime run humans -- save <login> [<role>…]    ajoute cet humain, ou change ses rôles, par une PR
//   npm --prefix runtime run humans -- remove <login>            retire cet humain, par une PR
import { enProcess } from "./appel.ts";
import { principal } from "./humains/commande.ts";

await enProcess(principal);
