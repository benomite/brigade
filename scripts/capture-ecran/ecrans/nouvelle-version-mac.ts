// « Tous les projets », l'app installée sur un Mac quand une version plus haute est publiée (#1528, #2431) : la
// ligne en tête — « Brigade 1.4.0 is running — 1.5.0 is out — Download », le lien direct du .dmg, qui dit au survol
// comment ouvrir l'app non signée la première fois. Rien ne l'écarte.
import { indiceDe } from "../../../app/src/mise-a-jour/avis.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

export const ecran: Ecran = {
  ...installee,
  dit: "« Tous les projets » sur un Mac, une version plus haute publiée : la ligne de tête, la version qui tourne et la dernière, son lien Download vers le .dmg",
  donnees: () => {
    const { reponses, ...reste } = installee.donnees();
    return { ...reste, maintenant: MAINTENANT, reponses: { ...reponses, avisDeVersion: { version: "1.5.0", courante: "1.4.0", url: "https://github.com/benomite/brigade/releases/download/app-v1.5.0/Brigade-1.5.0.dmg", indice: indiceDe("mac") } } };
  },
};
