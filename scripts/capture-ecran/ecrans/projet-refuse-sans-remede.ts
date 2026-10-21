// La page de « parade » refusé par sa box pour une raison qu'aucun bouton ne lève (#1205) : la consigne écrite
// reste, et la phrase que la box publie dit pourquoi il n'y a pas de bouton (runtime/src/remedes/registre.ts).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./cuisine-demenagee.ts";
import { COOKS, refuse } from "./projet-refuse.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » refusé par sa box sans remède : la consigne écrite, et pourquoi il n'y a pas de bouton (#1205)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, COOKS],
  donnees: () =>
    donnees(
      refuse({
        code: "already-served",
        message: "Another brigade process on this machine is already serving this project.",
        action: "Stop the other process, then wait: the station takes the project over by itself.",
        noRemedy: "The app cannot tell whether the other brigade process may be stopped, so only you can stop it.",
      }),
    ),
};
