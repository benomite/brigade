// Les types de bandeau-arret.js, pour le contrôle de types du runtime, dont les tests d'acceptation du ticket 3924
// (runtime/test/arret-cuisine/) montent le bandeau sans `allowJs`.
import type { ArretDeLaCuisine } from "../../../../runtime/src/arret-cuisine/arret-cuisine.ts";

export declare function monterLeBandeau(doc: { createElement(balise: string): any }, hote: { replaceChildren(...noeuds: any[]): void }): { maj(arret: ArretDeLaCuisine | null | undefined): void };
