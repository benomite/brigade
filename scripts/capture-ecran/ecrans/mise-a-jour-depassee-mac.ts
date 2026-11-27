// « Tous les projets », l'app installée sur un Mac, dans la situation du rapport du chef (#4494) : 1.0.424 tourne,
// 1.0.425 est téléchargée, et 1.0.428 est sortie depuis. La ligne ne nomme que la dernière — « Brigade 1.0.424 is
// running — 1.0.428 is out » —, rien de 1.0.425, et « Update now » va chercher 1.0.428.
import type { StateOfUpdate } from "../../../app/src/update/state.ts";
import { hintOf } from "../../../app/src/update/opinion.ts";
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

const AVIS = { version: "1.0.428", courante: "1.0.424", url: "https://github.com/benomite/brigade/releases/download/app-v1.0.428/Brigade-1.0.428.dmg", indice: hintOf("mac") };

// La même ligne, la mise à jour de l'app à l'état `miseAJour`, et l'avis de 1.0.428.
export function ecranDepasse(dit: string, miseAJour: StateOfUpdate, reponses: Record<string, unknown> = {}): Ecran {
  return {
    ...installee,
    dit,
    donnees: () => {
      const { reponses: deBase, ...reste } = installee.donnees();
      const demarrage = deBase.demarrage as Record<string, unknown>;
      return { ...reste, maintenant: MAINTENANT, reponses: { ...deBase, demarrage: { ...demarrage, miseAJour }, avisDeVersion: AVIS, ...reponses } };
    },
  };
}

export const ecran = ecranDepasse("« Tous les projets » sur un Mac : 1.0.425 téléchargée, 1.0.428 sortie depuis — la ligne ne nomme que 1.0.428, avec « Update now » (#4494)", { etat: "prete", version: "1.0.424", nouvelle: "1.0.425" });
