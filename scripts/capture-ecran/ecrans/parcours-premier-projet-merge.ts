// La page d'un projet pas encore prêt (#3166), cet ordinateur choisi, la PR de mise en place ouverte par le second : elle
// attend le merge du chef — sa carte est rouge sur le rail, comptée dans « TODO (N) », « open its card » l'ouvre.
import { CHOISIR_LE_RECOMMANDE, parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";

export const ecran = parcoursPremierProjet("La page d'un projet pas prêt (#3166) : la PR de mise en place attend ton merge — « open its card »", false, [CHOISIR_LE_RECOMMANDE], true);
