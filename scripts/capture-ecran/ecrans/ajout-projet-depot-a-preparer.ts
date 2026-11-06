// `benomite/parade` choisi, pas prêt pour brigade (#2627) : ce qui manque — ses bindings et ses labels — et « set it up ».
import { ajoutDuDepot, PAS_PRET } from "./ajout-projet-depot-commun.ts";

export const ecran = ajoutDuDepot("« add a project », benomite/parade choisi et pas prêt : ce qui manque, et « set it up » (#2627)", [], { checkRepoSetup: PAS_PRET });
