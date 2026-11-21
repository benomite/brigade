// L'étape où la pass en est d'une livraison, dans l'un des quatre mots que la carte de l'app montre en pass (#3923) :
// la CI tourne (les gates de la pass, puis le jugement qui attend la CI du commit), la relecture, l'attente de main, le
// merge. Rien n'est lu ici : l'étape se déduit de l'activité que la pass a déjà (activites.ts), de sa phase et de l'état
// de la base. Une activité qui n'est aucune de ces étapes (la pass décide, elle attend, le chef tranche) n'en porte pas.
import type { ActiviteDeTicket } from "../activites.ts";
import { BASE_ROUGE } from "../events/pass.ts";
import type { EtatDeLaBase, PassDeTicket } from "../projections/pass.ts";

export const ETAPES = ["CI running", "review", "waiting for main", "merging"] as const;
export type EtapeDePass = (typeof ETAPES)[number];

// L'activité de la pass, en anglais (activites.ts), et l'étape qu'elle est.
const PAR_ACTIVITE = new Map<string, EtapeDePass>([
  ["running the gates", "CI running"],
  ["judging", "CI running"],
  ["merging", "merging"],
]);

// Ce qu'une base rouge arrête : la livraison qui attend la pass, celle qu'elle juge, celle jugée verte qu'elle mergerait.
// Une livraison arrêtée, remontée ou renvoyée n'attend pas main : elle attend autre chose, que son activité dit.
const ARRETEES_PAR_LE_ROUGE: ReadonlySet<PassDeTicket["phase"]> = new Set(["delivered", "judging", "green"]);

// Le plus tardif des deux instants : une attente ne commence pas avant ce qu'elle attend.
const plusTard = (a: string, b: string) => (Date.parse(b) > Date.parse(a) ? b : a);

// L'activité d'un ticket en pass, avec son étape quand elle en est une. Une base rouge arrête jugements et merges : tant
// qu'elle l'est, la livraison qu'elle arrête attend main — depuis son entrée dans sa phase, ou depuis le rouge s'il est venu
// après —, sauf la relecture déjà partie, qui va à sa fin.
export function avecEtape(activite: ActiviteDeTicket | null, pass: Pick<PassDeTicket, "phase" | "reason"> | undefined, base: Pick<EtatDeLaBase, "outcome" | "at" | "redSince"> | null): ActiviteDeTicket | null {
  if (activite === null || pass === undefined) return activite;
  const etape: EtapeDePass | undefined = activite.faitEn.startsWith("review running since") || activite.faitEn === "review in progress" ? "review" : PAR_ACTIVITE.get(activite.faitEn);
  if (pass.phase === "waiting" && pass.reason === BASE_ROUGE) return { ...activite, etape: "waiting for main" };
  if (base?.outcome === "red" && ARRETEES_PAR_LE_ROUGE.has(pass.phase) && etape !== "review") return { ...activite, etape: "waiting for main", depuis: plusTard(activite.depuis, base.redSince ?? base.at) };
  return etape === undefined ? activite : { ...activite, etape };
}
