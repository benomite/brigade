// La même file de « parade », « yes, open it as a PR » cliqué sur la correction proposée (#999) : la
// box a écrit la réponse, et la carte quitte la file — les colonnes du rail remontent.
import { OUI } from "../../../app/src/correction.ts";
import { ecran as correction } from "./correction.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...correction,
  dit: "La même file, « yes » cliqué : la réponse est écrite, la carte de la correction a quitté la file",
  etapes: [...correction.etapes, { cliquer: "#rail .correction button.recommande" }],
  donnees: () => {
    const donnees = correction.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, corriger: { tranchee: OUI, dit: "your “yes” is recorded: the correction leaves as a PR, through the pass" } } };
  },
};
