// La même file de « parade », « yes, open it as a PR » cliqué quand GitHub refuse le commentaire sur le
// tableau de la cuisine (#1741) : rien n'est posté, la carte reste et ses deux réponses aussi, et une ligne
// le dit dessous — ce que GitHub a répondu, au survol.
import { ecran as correction } from "./correction.ts";
import type { Ecran } from "./commun.ts";

const DETAIL = "POST repos/acme/parade/issues/1/comments → HTTP 403: Resource not accessible by integration";

export const ecran: Ecran = {
  ...correction,
  dit: "La même file, « yes » cliqué quand GitHub refuse le commentaire sur le tableau : rien n'est posté, la carte reste et le dit en une ligne",
  etapes: [...correction.etapes, { cliquer: "#rail .correction button.recommande" }],
  donnees: () => {
    const donnees = correction.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, corriger: { refus: "The gesture could not be posted on the Kitchen board of acme/parade: HTTP 403.", detail: DETAIL } } };
  },
};
