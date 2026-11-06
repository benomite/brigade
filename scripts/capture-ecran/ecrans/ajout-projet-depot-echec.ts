// `benomite/parade` pas prêt, « set it up » cliqué, la préparation refusée (#2627) : une phrase, la raison au survol, et
// « try again ».
import { ajoutDuDepot, PAS_PRET, PREPARER } from "./ajout-projet-depot-commun.ts";

export const ecran = ajoutDuDepot("« add a project », la préparation de benomite/parade refusée : une phrase et « try again » (#2627)", [PREPARER], {
  checkRepoSetup: PAS_PRET,
  runRepoSetup: { __rejet: "GitHub refused to create the label fire: the token cannot write to benomite/parade." },
});
