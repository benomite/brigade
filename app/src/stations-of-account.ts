// Les stations enregistrées sous le compte GitHub du chef (#1706, épique #1702), telles que leurs gists les disent, et ce
// que chaque station a fait d'un dépôt choisi pour elle (#1790, épique #1785) : elle sert seule, elle a rejoint la cuisine
// d'une autre, ou elle refuse en une phrase. Les écrans qui les montrent lisent ces formes.
import type { HeldByGitHub } from "./station-freshness.ts";

// Une station telle que son gist la dit : `id`, son gist ; `account`, le propriétaire du gist ; `selection`, les dépôts que
// l'app lui a choisis, null tant qu'elle n'en a écrit aucun.
type Recorded = {
  id: string;
  name: string;
  platform: string;
  machine: string;
  version: string;
  account: string | null;
  available: boolean;
  heldUntil?: string;
  heldBy?: HeldByGitHub;
  registeredAt: string;
  lastSeen: string;
  stoppedAt: string | null;
  refreshMs: number;
  selection: string[] | null;
};
// Les stations du compte, ou pourquoi elles ne se lisent pas : jamais une liste vide sans raison.
type OfAccount =
  | { state: "listed"; stations: Recorded[]; unreadable: Array<{ id: string; reason: string }>; reason?: string }
  | { state: "sign-in-required"; reason: string; action: { id: "github-sign-in"; label: string; command: string[] } }
  | { state: "unavailable"; cause: "gh-missing" | "network" | "timeout" | "rate-limit" | "github"; reason: string; link?: string; detail?: string };

// Ce qu'une station a fait d'un dépôt choisi pour elle, une fois lu : `seule` — aucune autre ne le servait, elle le
// prépare elle-même, comme avant ; `rejointe` — elle cuit dans la cuisine que `principale` fait tourner ; `refusee` —
// elle ne peut pas la rejoindre, n'en ouvre pas une seconde, et `phrase` dit pourquoi. Un dépôt qu'elle n'a pas encore
// lu n'y est pas.
export type IssueOfTheAddition = { depot: string; issue: "seule" } | { depot: string; issue: "rejointe"; principale: string } | { depot: string; issue: "refusee"; phrase: string };
// `offlineSince` : hors ligne, son dernier signe de vie — ou l'instant où elle s'est dite arrêtée (`avecLeurEtat`).
export type StationRecorded = Recorded & { ajouts?: IssueOfTheAddition[]; offlineSince?: string };
export type StationsOfAccount = Exclude<OfAccount, { state: "listed" }> | (Omit<Extract<OfAccount, { state: "listed" }>, "stations"> & { stations: StationRecorded[] });

// La sélection écrite — les dépôts tels qu'ils sont dans le gist —, ou pourquoi elle ne l'est pas : une ligne, son
// détail au survol.
export type Choice = { selection: string[] } | { refus: string; detail?: string };

