// Les types de bandeau-arret.js, pour le contrôle de types du runtime, dont les tests d'acceptation du ticket 3924
// (runtime/test/arret-cuisine/) montent le bandeau sans `allowJs`.
import type { ArretDeLaCuisine } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";

// `gestes` : sur le rail de l'app, le geste que le bandeau offre au chef (ticket 4238) ; sans eux, aucun bouton.
export type GestesDeLArret = { ouvrirTicket(ticket: number): void; ouvrirLesChecks(): void; relire(): void };
export declare function monterLeBandeau(doc: { createElement(balise: string): any }, hote: { replaceChildren(...noeuds: any[]): void }, gestes?: GestesDeLArret): { maj(arret: ArretDeLaCuisine | null | undefined): void };
