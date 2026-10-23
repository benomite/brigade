// « Tous les projets », l'app installée sous Windows quand une version plus haute est publiée (#1528) : le
// bandeau en tête, son lien Download vers l'installeur .exe, et la ligne de SmartScreen pour le premier lancement.
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

export const ecran: Ecran = {
  ...installee,
  dit: "« Tous les projets » sous Windows, une version plus haute publiée : le bandeau, son lien Download vers le .exe et la ligne de SmartScreen",
  donnees: () => {
    const { reponses, ...reste } = installee.donnees();
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/Brigade-Setup-1.5.0.exe", indice: indiceDe("windows") } } };
  },
};
