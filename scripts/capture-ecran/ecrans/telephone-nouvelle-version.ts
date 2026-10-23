// L'app Android, le téléphone appairé, quand une version plus haute est publiée (#1528), en 412 × 915 : le
// bandeau en tête, son lien Download vers l'.apk — et, sur Android, aucune ligne de premier lancement.
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as relance } from "./telephone-relance.ts";

export const ecran: Ecran = {
  ...relance,
  dit: "L'app Android appairée, une version plus haute publiée : le bandeau et son lien Download vers l'.apk, sans ligne de premier lancement",
  donnees: () => {
    const { reponses, ...reste } = relance.donnees();
    const indice = indiceDe("android");
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/brigade-1.5.0.apk", ...(indice === undefined ? {} : { indice }) } } };
  },
};
