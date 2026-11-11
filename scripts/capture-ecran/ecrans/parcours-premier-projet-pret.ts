// La page d'un projet déjà prêt pour Brigade (#3166), cet ordinateur choisi : la mise en place n'est pas posée, le rail
// reprend la page, et au-dessus le second demande au chef ce qu'il veut changer d'abord (#3306).
import { CHOISIR_LE_RECOMMANDE, parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";

export const ecran = parcoursPremierProjet("Un projet déjà prêt (#3166) : cet ordinateur choisi, le rail reprend la page — au-dessus, la question du premier ticket (#3306)", true, [CHOISIR_LE_RECOMMANDE]);
