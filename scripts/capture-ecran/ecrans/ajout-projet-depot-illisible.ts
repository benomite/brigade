// `benomite/parade` choisi, sa vérification refusée (#2627) : une phrase, la raison au survol, et « try again ».
import { ajoutDuDepot } from "./ajout-projet-depot-commun.ts";

export const ecran = ajoutDuDepot("« add a project », la vérification de benomite/parade refusée : une phrase et « try again » (#2627)", [], {
  checkRepoSetup: { __rejet: "GitHub could not be reached to read the label `product` on benomite/parade (HTTP 502)." },
});
