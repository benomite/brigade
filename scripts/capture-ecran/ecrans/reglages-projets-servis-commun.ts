// Les projets que la station de ce Mac sert sur GitHub seul (#2359), dans les réglages de « parade » (Settings, sous
// cette machine) : les projets de l'app — parade et cantine, chacun avec son dépôt — et la liste que la station tient
// (`projetsServis`, app/src/vue/projets-servis/projets-servis.js), vide ou non.
import { configuration, demarrage, type Donnees } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { donnees } from "./reglages-commun.ts";

export function donneesDesProjetsServis(depots: string[]): Donnees {
  const lues = donnees("mac");
  const parade = { ...PROJETS[0]!, depot: "chef/parade", ordinaires: true, limiteCooks: 2 };
  const cantine = { ...PROJETS[1]!, depot: "chef/cantine" };
  return { ...lues, reponses: { ...lues.reponses, demarrage: demarrage(configuration([parade, cantine])), projetsServis: { depots } } };
}
