// La carte ouverte d'un toucher depuis la liste (ticket 2915, Phone.dc.html) : la question de #21, un bouton par choix — le
// premier, recommandé, rempli de l'accent —, le champ pour répondre dans ses mots et « Send ».
import type { Ecran } from "./commun.ts";
import { ecran as liste } from "./cartes-du-chef-liste.ts";
import { donneesDe, QUESTION } from "./demo-commun.ts";

export const CARTE = ".carte-a-ouvrir";

export const ecran: Ecran = {
  ...liste,
  dit: "Le téléphone, 390 × 844 : la carte de #21 ouverte — sa question, un bouton par choix, le champ de texte libre et « Send »",
  etapes: [{ cliquer: CARTE }],
  donnees: () => donneesDe(QUESTION),
};
