// Le premier lancement sur un Mac neuf, avant l'avis de macOS (#4081) : l'écran qui dit que Brigade tourne en
// arrière-plan et que macOS va le signaler, son seul bouton « continue », l'app cachée derrière.
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

const ecranDuPremier = premierLancement("Le premier lancement sur un Mac neuf (#4081) : Brigade tourne en arrière-plan, macOS va le dire, un bouton « continue »", LISTEES, [], { avisDeFond: true });

export const ecran = {
  ...ecranDuPremier,
  donnees: () => {
    const donnees = ecranDuPremier.donnees();
    const reponses = donnees.reponses as { demarrage: Record<string, unknown> };
    return { ...donnees, reponses: { ...reponses, demarrage: { ...reponses.demarrage, poste: { nom: "this Mac", mac: true } } } };
  },
};
