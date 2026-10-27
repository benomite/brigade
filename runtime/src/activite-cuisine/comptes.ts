// Ce que la cuisine d'un projet a fait de ses tickets dans la dernière heure et le dernier jour (#1272) :
// combien elle en a servis, renvoyés à un cook, remontés au chef. `facts` les donne à l'app dans
// `activiteCuisine`, qui les pose en tête de l'onglet Cooks — six nombres, rien d'autre.
//
// Tout se relit du journal, à la lecture : aucune table ni projection de plus, et le compte survit au
// redémarrage. Seuls comptent les faits du projet nommé : un journal qui en porterait un autre ne le
// mêle pas à celui-ci.
import type { Base } from "../base.ts";
import { REDECOUPE } from "../events/pass.ts";

// Les trois comptes d'une fenêtre, chacun en tickets — un ticket renvoyé deux fois dans l'heure compte
// pour un. `served` : sa livraison est mergée, ou il est servi sans diff — un ticket remonté puis mergé à
// la main par le chef l'est aussi. `sentBack` : la pass, le manager ou le chef l'a rendu à un cook.
// `escalated` : la pass l'a remonté au chef — renvois épuisés, choix du manager, ou livraison qu'elle n'a
// pas pu juger ; un ticket que le manager a redécoupé n'attend rien du chef, il n'y compte pas.
export type Comptes = { served: number; sentBack: number; escalated: number };
// La dernière heure et le dernier jour, chacun jusqu'à l'instant de la lecture compris.
export type ActiviteCuisine = { lastHour: Comptes; lastDay: Comptes };

export const HEURE_MS = 3_600_000;
export const JOUR_MS = 24 * HEURE_MS;

// Les faits que chaque compte lit, et ce qui en écarte un.
type Lecture = { types: readonly string[]; sauf?: { motif: string } };
// Ce qui sert un ticket : sa livraison mergée, ou son service sans diff. L'histogramme du rail (cadence.ts) le lit aussi.
export const TYPES_SERVIS = ["ticket.served", "merge.done"] as const;
const LECTURES: Record<keyof Comptes, Lecture> = {
  served: { types: TYPES_SERVIS },
  sentBack: { types: ["pass.returned"] },
  escalated: { types: ["pass.escalated"], sauf: { motif: REDECOUPE } },
};

function compter(base: Base, { types, sauf }: Lecture, projet: string, depuis: string, jusqua: string): number {
  const [ligne] = base.lire<{ combien: number }>(
    `SELECT count(DISTINCT ticket) AS combien FROM events
     WHERE type IN (SELECT value FROM json_each(?1)) AND project = ?2 AND ticket IS NOT NULL AND at >= ?3 AND at <= ?4
       AND (?5 IS NULL OR json_extract(payload, '$.reason') IS NOT ?5)`,
    JSON.stringify(types),
    projet,
    depuis,
    jusqua,
    sauf?.motif ?? null,
  );
  return ligne?.combien ?? 0;
}

// Les trois comptes des faits du projet écrits entre `depuis` et `jusqua`, l'un et l'autre compris.
export function comptesEntre(base: Base, projet: string, depuis: Date, jusqua: Date): Comptes {
  const [de, a] = [depuis.toISOString(), jusqua.toISOString()];
  const compte = (lecture: Lecture) => compter(base, lecture, projet, de, a);
  return { served: compte(LECTURES.served), sentBack: compte(LECTURES.sentBack), escalated: compte(LECTURES.escalated) };
}

// La dernière heure et le dernier jour du projet, vus de `maintenant`. Sans activité, six zéros : la
// forme ne change pas d'une cuisine à l'autre.
export function activiteDeLaCuisine(base: Base, projet: string, maintenant: Date): ActiviteCuisine {
  const depuis = (ms: number) => new Date(maintenant.getTime() - ms);
  return { lastHour: comptesEntre(base, projet, depuis(HEURE_MS), maintenant), lastDay: comptesEntre(base, projet, depuis(JOUR_MS), maintenant) };
}
