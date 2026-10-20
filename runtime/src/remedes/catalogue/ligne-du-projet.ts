// `configuration-invalid` : les réglages de la station pour ce projet sont
// incomplets ou faux. Le remède retire la ligne que la station a écrite pour
// lui : elle la réécrit aussitôt, à neuf, d'après ce que l'app demande.
import type { Remede } from "../registre.ts";
import { reecrireLaConfiguration, sansLaLigne } from "./ligne.ts";

export const remedeDeLaLigneDuProjet: Remede = {
  id: "rewrite-project-line",
  leve: ["configuration-invalid"],
  description: "Erases the station's line for this project from its configuration, and lets the station write it again from scratch.",
  destructif: true,
  executer(contexte) {
    reecrireLaConfiguration(contexte, (texte) => sansLaLigne(texte, contexte.projet, "dans-le-bloc"), "the station's configuration has no line written by the app for this project");
  },
};
