// « Tous les projets », l'app installée (#1011) quand une version plus haute est publiée (#1014) : la
// version qui tourne, et le message avec ses deux choix — installer maintenant, ou plus tard.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SANS_CLONE } from "./reglages-code-installee.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

export const ecran: Ecran = {
  ...installee,
  dit: "« Tous les projets », l'app installée : sa version, et une mise à jour disponible — installer maintenant, ou plus tard",
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: { ...demarrage(configuration(PROJETS)), code: SANS_CLONE, miseAJour: { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" } } },
    envois: cuisine(RENDUS),
  }),
};
