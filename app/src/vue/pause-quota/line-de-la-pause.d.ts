// Les types de line-de-la-pause.js, pour le contrôle de types du runtime, qui charge la vue sans `allowJs`
// (../pr-du-ticket.d.ts dit pourquoi, ticket 3924). Un export ajouté au module s'ajoute ici.
import type { Fabrique } from "../briques.js";
import type { PauseDuAccount } from "./pause-quota.ts";

export declare const LIMITES: Record<string, string>;
export declare const RIEN_A_FAIRE: string;
export declare const RESUMPTION_INCONNUE: string;
export declare const MEME_RAISON: string;
export declare const PROJECT_EN_PAUSE: string;
export declare const OUTAGES_OUTSIDE_PAUSE: string[];
export declare function dansCombien(ms: number): string;
export declare const enCours: (pause: PauseDuAccount | undefined, maintenant: number) => pause is PauseDuAccount;
export declare function pauseDesProjects(pauses: readonly (PauseDuAccount | undefined)[], maintenant: number): PauseDuAccount | undefined;
export declare function phrasesDeLaPause(pause: PauseDuAccount, maintenant: number): { titre: string; reprise: string; rien: string };
export declare function holdLaPause(element: HTMLElement, doc: Fabrique, options: { maintenant(): number; auRetour(): void }): { suivre(lue: PauseDuAccount | undefined): void; battre(): void };
type RailBlockedVu = { cause: string } | { illisible: string };
type WaitVue = { raison: string };
export declare function ceQueLeRailDit<R extends RailBlockedVu, A extends WaitVue>(tableau: { pauseQuota?: PauseDuAccount; railBloque?: R; attenteDuRail?: A }, maintenant: number, redemarre?: boolean): { railBloque?: R; attenteDuRail?: A; enPause: boolean };
export declare function lineDuProjectEnPause(doc: Fabrique, enPause: boolean): HTMLElement[];
