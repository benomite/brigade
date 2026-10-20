// `hand-written-line` : le projet a déjà une ligne écrite à la main dans la
// configuration, qui bloque celle de l'app. Le remède retire la ligne écrite à
// la main ; la station écrit alors la sienne.
import type { Remede } from "../registre.ts";
import { reecrireLaConfiguration, sansLaLigne } from "./ligne.ts";

export const remedeDeLaLigneAMain: Remede = {
  id: "remove-hand-written-line",
  leve: ["hand-written-line"],
  description: "Removes the hand-written line for this project from the station's configuration, so the station writes its own.",
  destructif: true,
  executer(contexte) {
    reecrireLaConfiguration(contexte, (texte) => sansLaLigne(texte, contexte.projet, "hors-du-bloc"), "the station's configuration has no hand-written line for this project to remove");
  },
};
