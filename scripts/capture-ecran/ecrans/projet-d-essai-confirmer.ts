// « delete demo project » cliqué (#3734) : l'encart pose la question qui nomme le dépôt, « Yes, delete … » et « Cancel ».
import { CREE, projetDEssai } from "./projet-d-essai-commun.ts";

export const ecran = projetDEssai("La suppression de la démo (#3734) : la confirmation qui nomme son dépôt", { sample: CREE }, [{ cliquer: "#projet-d-essai .supprimer-la-demo button" }]);
