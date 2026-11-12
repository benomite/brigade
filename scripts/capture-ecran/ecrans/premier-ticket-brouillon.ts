// Le premier ticket de `cantine` (#3306) : la réponse du chef envoyée, le second a écrit l'issue — son titre, son corps —,
// « Yes, put it on the rail », et le champ des changements avec « ask for changes ». Rien n'est créé.
import { parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";
import { JUSQU_AU_BROUILLON, REDIGE } from "./premier-ticket-commun.ts";

export const ecran = parcoursPremierProjet("Le premier ticket écrit dans l'app (#3306) : le brouillon du second, « Yes, put it on the rail » et « ask for changes »", true, JUSQU_AU_BROUILLON, false, { aucune: true }, { redigerLePremierTicket: REDIGE });
