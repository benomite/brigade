// Le parcours « add a project » ouvert sur la page de nas, `benomite/parade` choisi (#2627) : le dépôt est vérifié
// (`checkRepoSetup`) avant d'être ajouté — prêt, la phrase, et l'ajout part ; pas prêt, ce qui manque et « set it up »,
// qui le prépare (`runRepoSetup`). Chaque écran fige les réponses de ces deux lectures.
import type { Ecran, Etape } from "./commun.ts";
import { NAS } from "./station-projets-du-chef.ts";
import { stationsDuChef } from "./stations-une-liste.ts";

export const OUVRIR: Etape = { cliquer: "button.ajout-de-projet" };
export const CHOISIR: Etape = { cliquer: `.etape-projet li[data-depot="benomite/parade"] button` };
export const PREPARER: Etape = { cliquer: ".installation-du-depot button.recommande" };
export const PAS_PRET = { ready: false, missingBindings: ["Branche d'intégration", "Gates"], missingLabels: ["fire", "ready", "blocked-on-human"] };

export function ajoutDuDepot(dit: string, etapes: Etape[], reponses: Record<string, unknown>): Ecran {
  const ecran = stationsDuChef(dit, [NAS, OUVRIR, CHOISIR, ...etapes]);
  return {
    ...ecran,
    donnees: () => {
      const tout = ecran.donnees();
      return { ...tout, reponses: { ...tout.reponses, ajouterAUneStation: { __enAttente: true }, ...reponses } };
    },
  };
}
