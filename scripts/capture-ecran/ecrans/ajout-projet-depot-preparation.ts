// `benomite/parade` pas prêt, « set it up » cliqué (#2627) : la préparation en cours, sans bouton.
import { ajoutDuDepot, PAS_PRET, PREPARER } from "./ajout-projet-depot-commun.ts";

export const ecran = ajoutDuDepot("« add a project », benomite/parade en préparation, « set it up » cliqué (#2627)", [PREPARER], {
  checkRepoSetup: PAS_PRET,
  runRepoSetup: { __enAttente: true },
});
