// L'app Android, le téléphone appairé, quand une version plus haute est publiée (#1528, #2431), en 412 × 915 :
// la ligne en tête, la version qui tourne et la dernière, son lien Download vers l'.apk — sans premier lancement au survol.
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as relance } from "./telephone-relance.ts";

export const ecran: Ecran = {
  ...relance,
  dit: "L'app Android appairée, une version plus haute publiée : la ligne de tête et son lien Download vers l'.apk",
  donnees: () => {
    const { reponses, ...reste } = relance.donnees();
    const indice = indiceDe("android");
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", courante: "1.4.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/brigade-1.5.0.apk", ...(indice === undefined ? {} : { indice }) } } };
  },
};
