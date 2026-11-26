// Les types de pr-du-ticket.js, pour le contrôle de types du runtime, qui charge la vue sans `allowJs` : ses tests
// d'acceptation du ticket 3924 (runtime/test/arret-cuisine/) passent par app/test/aides/fausse-vue.ts, dont le pont tire
// la lecture du rail qui l'importe.
export declare const PR_DU_TICKET: (ticket: number) => string;
export declare function direLaPrParSonTicket(texte: string, ticket: number, pr?: number): string;
