// « Tous les projets », l'app installée sur un Mac quand une version plus haute est publiée (#1528) : le
// bandeau en tête — « Version 1.5.0 available — Download », le lien direct du .dmg, la ligne qui dit
// comment ouvrir l'app non signée la première fois, et la croix qui l'écarte pour cette version.
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

export const ecran: Ecran = {
  ...installee,
  dit: "« Tous les projets » sur un Mac, une version plus haute publiée : le bandeau, son lien Download vers le .dmg et la ligne du premier lancement",
  donnees: () => {
    const { reponses, ...reste } = installee.donnees();
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/Brigade-1.5.0.dmg", indice: indiceDe("mac") } } };
  },
};
