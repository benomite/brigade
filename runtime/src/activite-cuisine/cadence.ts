// À quelle allure la cuisine d'un projet sert ses tickets (#1811) : ce qu'elle a servi et ce qui a raté, heure par
// heure, sur les 24 dernières ; et combien de temps un ticket reste d'ordinaire pris, puis en pass. `facts` les donne
// à l'app dans `cadence`, qui en dessine un petit histogramme en tête du rail et marque la carte qui traîne.
//
// Tout se relit du journal, à la lecture, comme les comptes de l'heure et du jour (comptes.ts) : aucune table ni
// projection de plus, et l'histogramme est juste dès que l'app s'ouvre. Seuls comptent les faits du projet nommé.
import type { Base } from "../base.ts";
import { FINS_SANS_SUITE } from "../projections/rail.ts";
import { HEURE_MS, JOUR_MS, TYPES_SERVIS } from "./comptes.ts";

// Une heure de l'histogramme : son début (`at`, une heure pile UTC), les tickets servis — mergés, ou servis sans
// diff (`TYPES_SERVIS` de comptes.ts), un ticket comptant pour un sur les 24 heures, dans celle où il l'est d'abord —,
// et les ratés — une pass revenue rouge, ou un cook fini sans suite (`FINS_SANS_SUITE` du rail : échoué, garde-fou,
// arrêt), chacun comptant pour un.
export type HeureDeCadence = { at: string; served: number; failed: number };
// Le temps d'ordinaire passé pris (`taken`) et en pass (`pass`), en secondes : la médiane des séjours finis dans la
// fenêtre. Nulle tant qu'il y en a moins que `SEJOURS_MIN` — l'ordinaire ne se dit pas d'un ou deux.
export type Cadence = { hours: HeureDeCadence[]; medianSeconds: { taken: number | null; pass: number | null } };

// Vingt-quatre barres, l'heure en cours la dernière.
export const HEURES = 24;
// La fenêtre où se lisent les séjours, et ce qu'il en faut pour dire l'ordinaire.
export const FENETRE_DES_SEJOURS_MS = 7 * JOUR_MS;
export const SEJOURS_MIN = 3;

type Ligne = { ticket: number; at: string; type: string; payload: string };

// Le début de l'heure pile (UTC) qui contient cet instant.
const heurePile = (instant: Date) => Math.floor(instant.getTime() / HEURE_MS) * HEURE_MS;

// Les 24 heures du projet, la plus ancienne d'abord, la dernière étant celle en cours jusqu'à `maintenant` compris.
// Une heure sans rien est là, à zéro et zéro : la forme ne change pas d'une cuisine à l'autre.
export function heuresDeLaCuisine(base: Base, projet: string, maintenant: Date): HeureDeCadence[] {
  const debut = heurePile(maintenant) - (HEURES - 1) * HEURE_MS;
  const lignes = base.lire<Ligne>(
    `SELECT ticket, at, type, payload FROM events
     WHERE project = ?1 AND ticket IS NOT NULL AND at >= ?2 AND at <= ?3
       AND type IN (SELECT value FROM json_each(?4) UNION VALUES ('pass.judged'), ('cook.exited'))
     ORDER BY seq`,
    projet,
    new Date(debut).toISOString(),
    maintenant.toISOString(),
    JSON.stringify(TYPES_SERVIS),
  );
  const servis = Array.from({ length: HEURES }, () => 0);
  const rates = Array.from({ length: HEURES }, () => 0);
  // Mergé à 13 h 59, servi à 14 h 01 : un seul ticket, dans la barre de 13 h.
  const dejaServis = new Set<number>();
  for (const { ticket, at, type, payload } of lignes) {
    const rang = Math.floor((Date.parse(at) - debut) / HEURE_MS);
    if (rang < 0 || rang >= HEURES) continue;
    if ((TYPES_SERVIS as readonly string[]).includes(type)) {
      if (!dejaServis.has(ticket)) servis[rang] = (servis[rang] ?? 0) + 1;
      dejaServis.add(ticket);
      continue;
    }
    const p = JSON.parse(payload) as Record<string, unknown>;
    if ((type === "pass.judged" && p.verdict === "red") || (type === "cook.exited" && FINS_SANS_SUITE.includes(p.outcome))) rates[rang] = (rates[rang] ?? 0) + 1;
  }
  return servis.map((served, rang) => ({ at: new Date(debut + rang * HEURE_MS).toISOString(), served, failed: rates[rang] ?? 0 }));
}

// Combien de temps chaque ticket est resté pris, puis en pass, séjour par séjour : le rail relu comme sa projection
// le tient (projections/rail.ts), d'un changement d'état au suivant. Seuls comptent les séjours ouverts et fermés
// dans la fenêtre : celui qui a commencé avant n'a pas de début lu, celui qui dure encore n'a pas de fin.
function sejours(base: Base, projet: string, depuis: Date, maintenant: Date): { taken: number[]; pass: number[] } {
  const lignes = base.lire<Ligne>(
    `SELECT ticket, at, type, payload FROM events
     WHERE project = ?1 AND ticket IS NOT NULL AND at >= ?2 AND at <= ?3
       AND type IN ('ticket.arrived', 'ticket.taken', 'ticket.passing', 'ticket.released', 'ticket.served', 'ticket.86', 'ticket.left', 'cook.exited', 'cook.interrupted')
     ORDER BY seq`,
    projet,
    depuis.toISOString(),
    maintenant.toISOString(),
  );
  const finis = { taken: [] as number[], pass: [] as number[] };
  const ouverts = new Map<number, { etat: "taken" | "pass"; depuis: number }>();
  const fermer = (ticket: number, at: string) => {
    const ouvert = ouverts.get(ticket);
    if (ouvert === undefined) return;
    finis[ouvert.etat].push((Date.parse(at) - ouvert.depuis) / 1000);
    ouverts.delete(ticket);
  };
  for (const { ticket, at, type, payload } of lignes) {
    switch (type) {
      case "ticket.taken":
      case "ticket.passing":
        fermer(ticket, at);
        ouverts.set(ticket, { etat: type === "ticket.taken" ? "taken" : "pass", depuis: Date.parse(at) });
        break;
      case "cook.exited":
      case "cook.interrupted": {
        // Seul un ticket pris retourne sur le rail à la fin de son cook : la relecture d'un ticket en pass n'y change rien.
        const rendu = type === "cook.interrupted" || FINS_SANS_SUITE.includes((JSON.parse(payload) as Record<string, unknown>).outcome);
        if (rendu && ouverts.get(ticket)?.etat === "taken") fermer(ticket, at);
        break;
      }
      default:
        fermer(ticket, at);
    }
  }
  return finis;
}

function mediane(durees: number[]): number | null {
  if (durees.length < SEJOURS_MIN) return null;
  const tries = [...durees].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  const valeur = tries.length % 2 === 1 ? (tries[milieu] ?? 0) : ((tries[milieu - 1] ?? 0) + (tries[milieu] ?? 0)) / 2;
  return Math.round(valeur);
}

// La cadence du projet, vue de `maintenant`.
export function cadenceDeLaCuisine(base: Base, projet: string, maintenant: Date): Cadence {
  const { taken, pass } = sejours(base, projet, new Date(maintenant.getTime() - FENETRE_DES_SEJOURS_MS), maintenant);
  return { hours: heuresDeLaCuisine(base, projet, maintenant), medianSeconds: { taken: mediane(taken), pass: mediane(pass) } };
}
