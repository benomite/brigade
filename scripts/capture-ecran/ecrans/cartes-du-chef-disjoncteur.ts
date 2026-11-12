// La liste des cartes du téléphone quand le disjoncteur retient la cuisine (ticket 3371) : la ligne du disjoncteur en tête —
// ce qui ne va pas, et « Resume » —, puis la question de #21 sous elle. La ligne `kitchen` est celle que la lecture de
// GitHub écrit d'après l'issue `brigade:breaker-open` (app/src/github/breaker-resume.ts, `cuisineRetenueParLeDisjoncteur`).
import type { Ecran, Rendu } from "./commun.ts";
import { donneesDe, QUESTION } from "./demo-commun.ts";
import { HAUTEUR, LARGEUR } from "./cartes-du-chef-liste.ts";

const RETENUE: Rendu = { ...QUESTION, facts: { ...QUESTION.facts, etat: "retenue" }, status: QUESTION.status.replace("kitchen    open", "kitchen    open · breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #21, exit code 1)") };

export const ecran: Ecran = {
  dit: "Le téléphone, 390 × 844 : la liste des cartes avec, en tête, la ligne du disjoncteur ouvert et « Resume » (#3371)",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donneesDe(RETENUE),
};
