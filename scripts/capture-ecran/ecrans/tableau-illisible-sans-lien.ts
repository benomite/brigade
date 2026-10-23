// Le tableau de `parade` ne se lit pas — dépôt privé, l'app sans compte qui le voit — sur un poste sans lien direct
// (#1588) : la phrase, et « read again » seul.
import { espaceDuTableau, PRIVE } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le tableau de « parade » illisible (dépôt privé) sur un poste sans lien direct (#1588) : la phrase, et « read again » seul", PRIVE, { box: false });
