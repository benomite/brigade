// Les types de bandeau-arret.js, pour le contrôle de types du runtime, dont les tests d'acceptation du ticket 3924
// (runtime/test/arret-cuisine/) montent le bandeau sans `allowJs`.
import type { ArretDeLaCuisine } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";

// Un statut de panne (ticket 4216) se rend par vue/bandeau-panne/.
export type StatutDePanne = { state: "fault" | "idle"; cause: string; action: { kind: "done"; text: string } | { kind: "button"; label: string; id: string } | null };

// `gestes` : sur le rail de l'app, le geste que le bandeau offre au chef (ticket 4238) ; sans eux, aucun bouton.
export type GestesDeLArret = { ouvrirTicket(ticket: number): void; ouvrirLesChecks(): void; relire(): void; reparer?(id: string): void };
export declare function monterLeBandeau(doc: { createElement(balise: string): any }, hote: { replaceChildren(...noeuds: any[]): void }, gestes?: GestesDeLArret): { maj(arret: ArretDeLaCuisine | StatutDePanne | null | undefined): void };
