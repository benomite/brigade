// La même file de « parade », « yes, open it as a PR » cliqué sur la correction proposée (#999) : la
// réponse est postée sur le tableau de la cuisine du projet, sans la box (#1741) — la carte reste, ses
// deux réponses inactives, et une ligne le dit dessous, le commentaire posté au survol. La box la tranche
// à son tick suivant ; la carte quitte la file à la lecture du tableau qui ne la porte plus.
import { OUI } from "../../../app/src/correction.ts";
import { POSTE } from "../../../app/src/tableau-gestes/rail.ts";
import { ecran as correction } from "./correction.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...correction,
  dit: "La même file, « yes » cliqué : la réponse est postée sur le tableau de la cuisine, la carte le dit sous ses réponses, le commentaire au survol",
  etapes: [...correction.etapes, { cliquer: "#rail .correction button.recommande" }],
  donnees: () => {
    const donnees = correction.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, corriger: { postee: OUI, dit: POSTE, detail: "https://github.com/acme/parade/issues/1#issuecomment-5012" } } };
  },
};
