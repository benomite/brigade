// La même file de « parade », « yes, open it as a PR » cliqué sur une station dont le runtime ne
// connaît pas encore le geste `correction` (#999) : rien n'est écrit, la carte reste, et sous ses
// deux réponses une ligne le dit — ce que la box a rendu, au survol.
import { SANS_GESTE } from "../../../app/src/correction.ts";
import { ecran as correction } from "./correction.ts";
import type { Ecran } from "./commun.ts";

const DETAIL = "$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade correction yes 412\nbrigade: “correction” is not a command of the runtime — brigade parade help lists them\n→ exit code 66";

export const ecran: Ecran = {
  ...correction,
  dit: "La même file, « yes » cliqué sur une station qui ne connaît pas encore le geste : rien n'est écrit, la carte reste et le dit en une ligne",
  etapes: [...correction.etapes, { cliquer: "#rail .correction button.recommande" }],
  donnees: () => {
    const donnees = correction.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, corriger: { refus: SANS_GESTE, detail: DETAIL } } };
  },
};
