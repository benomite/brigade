// « Tous les projets » au lancement de l'app Android (#1170) quand la vérification rend une offre :
// l'invite en tête de l'espace — la version offerte, ses notes, « Update » et « Not now ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { ecran as lancement } from "./tous-les-projets.ts";

export const ecran: Ecran = {
  ...lancement,
  dit: "« Tous les projets » au lancement de l'app Android : l'invite d'une version plus haute — ses notes, « Update » et « Not now »",
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    envois: {
      ...cuisine(RENDUS),
      tous: [
        { sur: "surOffreApk", args: [{ kind: "offer", version: "1.5.0", notes: "Faster launch.\nFixes the pairing code.", apkUrl: "https://github.com/benomite/brigade/releases/download/android-v1.5.0/brigade.apk" }] },
        ...cuisine(RENDUS).tous,
      ],
    },
  }),
};
