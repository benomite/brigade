// « Tous les projets », l'app installée sous Windows quand une version plus haute est publiée (#1528, #2431) :
// la ligne en tête, la version qui tourne et la dernière, son lien Download vers l'installeur .exe (SmartScreen au survol).
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

export const ecran: Ecran = {
  ...installee,
  dit: "« Tous les projets » sous Windows, une version plus haute publiée : la ligne de tête, la version qui tourne et la dernière, son lien Download vers le .exe",
  donnees: () => {
    const { reponses, ...reste } = installee.donnees();
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", courante: "1.4.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/Brigade-Setup-1.5.0.exe", indice: indiceDe("windows") } } };
  },
};
