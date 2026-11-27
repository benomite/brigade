// Les types de ligne-de-la-pause.js, pour le contrôle de types du runtime, qui charge la vue sans `allowJs`
// (../pr-du-ticket.d.ts dit pourquoi, ticket 3924). Un export ajouté au module s'ajoute ici.
import type { Fabrique } from "../briques.js";
import type { PauseDuCompte } from "./pause-quota.ts";

export declare const LIMITES: Record<string, string>;
export declare const RIEN_A_FAIRE: string;
export declare const REPRISE_INCONNUE: string;
export declare const MEME_RAISON: string;
export declare const PROJET_EN_PAUSE: string;
export declare const PANNES_HORS_PAUSE: string[];
export declare function dansCombien(ms: number): string;
export declare const enCours: (pause: PauseDuCompte | undefined, maintenant: number) => pause is PauseDuCompte;
export declare function pauseDesProjets(pauses: readonly (PauseDuCompte | undefined)[], maintenant: number): PauseDuCompte | undefined;
export declare function phrasesDeLaPause(pause: PauseDuCompte, maintenant: number): { titre: string; reprise: string; rien: string };
export declare function tenirLaPause(element: HTMLElement, doc: Fabrique, options: { maintenant(): number; auRetour(): void }): { suivre(lue: PauseDuCompte | undefined): void; battre(): void };
type RailBloqueVu = { cause: string } | { illisible: string };
type AttenteVue = { raison: string };
export declare function ceQueLeRailDit<R extends RailBloqueVu, A extends AttenteVue>(tableau: { pauseQuota?: PauseDuCompte; railBloque?: R; attenteDuRail?: A }, maintenant: number, redemarre?: boolean): { railBloque?: R; attenteDuRail?: A; enPause: boolean };
export declare function ligneDuProjetEnPause(doc: Fabrique, enPause: boolean): HTMLElement[];
