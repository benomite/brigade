// Un projet pas préparé pour Brigade (#2628, épique #2584) : l'avis — ce qui manque en une phrase — et son seul bouton,
// sur la page du projet (la bande) et à côté de « TODO (N) », hors des colonnes (#3458). `checkRepoSetup` rend ce qui manque ; `runRepoSetup` n'est pas
// cliqué ici, sauf pour `depot-non-prepare-refus` (la préparation rate : une phrase et « Retry »).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const MANQUE = { ready: false, missingBindings: ["Gates", "Worktrees"], missingLabels: ["fire", "waiting", "chef-todo"] };

export function depotNonPrepare(dit: string, refus?: string): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, ...(refus === undefined ? [] : [{ cliquer: ".avis-depot[data-lieu=page] button.recommande" }])],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS.map((projet) => ({ ...projet, depot: `chef/${projet.nom}`, base: "main" })))), espace: [SECOND], checkRepoSetup: MANQUE, ...(refus === undefined ? {} : { runRepoSetup: { __enAttente: true } }) },
      envois: cuisine(RENDUS),
    }),
  };
}

export const ecran: Ecran = depotNonPrepare("Le projet « parade » n'est pas préparé pour Brigade (#2628) : l'avis sur sa page et à côté de « TODO (N) », hors des colonnes, avec son bouton");
