// Les types de line-of-the-pause.js, pour le contrôle de types du runtime, qui charge la vue sans `allowJs`
// (../pr-of-ticket.d.ts dit pourquoi, ticket 3924). Un export ajouté au module s'ajoute ici.
import type { Fabrique } from "../bricks.js";
import type { PauseOfAccount } from "./pause-quota.ts";

export declare const LIMITS: Record<string, string>;
export declare const NOTHING_A_DO: string;
export declare const RESUMPTION_UNKNOWN: string;
export declare const SAME_REASON: string;
export declare const PROJECT_IN_PAUSE: string;
export declare const OUTAGES_OUTSIDE_PAUSE: string[];
export declare function inHowMany(ms: number): string;
export declare const inProgress: (pause: PauseOfAccount | undefined, now: number) => pause is PauseOfAccount;
export declare function pauseOfProjects(pauses: readonly (PauseOfAccount | undefined)[], now: number): PauseOfAccount | undefined;
export declare function sentencesOfThePause(pause: PauseOfAccount, now: number): { titre: string; reprise: string; rien: string };
export declare function holdThePause(element: HTMLElement, doc: Fabrique, options: { maintenant(): number; auRetour(): void }): { suivre(readEntry: PauseOfAccount | undefined): void; battre(): void };
type RailBlockedSeen = { cause: string } | { illisible: string };
type WaitVue = { raison: string };
export declare function whatTheRailSays<R extends RailBlockedSeen, A extends WaitVue>(board: { pauseQuota?: PauseOfAccount; railBloque?: R; attenteDuRail?: A }, now: number, restarts?: boolean): { railBloque?: R; attenteDuRail?: A; enPause: boolean };
export declare function lineOfProjectInPause(doc: Fabrique, inPause: boolean): HTMLElement[];
