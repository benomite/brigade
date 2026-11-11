// Le premier ticket de `cantine` (#3306) : « Yes, put it on the rail » cliqué, le runtime a créé l'issue avec ses labels —
// « #12 is on the rail: the kitchen serves it. »
import { parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";
import { CREE, JUSQU_AU_BROUILLON, OUI, REDIGE } from "./premier-ticket-commun.ts";

export const ecran = parcoursPremierProjet("Le premier ticket sur le rail (#3306) : le « oui » du chef, l'issue créée", true, [...JUSQU_AU_BROUILLON, OUI], false, { aucune: true }, { redigerLePremierTicket: REDIGE, creerLePremierTicket: CREE });
