// Ce que l'app demande à une station, et ce que la station en dit — le format
// est celui de la station (runtime/src/projets/demande.ts). Deux fichiers de
// plus dans le gist de chaque station appairée (stations/document.ts) :
//   - `brigade-projets.json`, écrit par l'app seule : les projets que le chef
//     demande à cette station, et si elle en est la principale — celle qui fait
//     tourner son manager et sa pass ;
//   - `brigade-projets-suivi.json`, écrit par la station seule : où en est
//     chacun — servi, à autoriser sur GitHub (avec les pages où le faire), en
//     préparation, refusé (et pourquoi), ou secondaire.
// Aucune liaison directe entre l'app et la station : c'est tout ce qu'elles se disent.

export const FICHIER_PROJETS = "brigade-projets.json";
export const FICHIER_SUIVI = "brigade-projets-suivi.json";
export const FORMAT = 1;

export type Calibre = { modele: string; effort: string };

export type ProjetDemande = {
  nom: string;
  depot: string;
  base: string;
  principale: boolean;
  cooks: number;
  manager: Calibre;
  reviewer: Calibre;
  // Quand le chef a ouvert le parcours, et quand il l'a validé.
  ouvertLe: string | null;
  demandeLe: string | null;
};

export type EtatDuProjet = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";
export type SuiviDuProjet = { nom: string; etat: EtatDuProjet; dit: string; autoriser: string[]; serviLe: string | null };

const ETATS: readonly string[] = ["servi", "a-autoriser", "en-preparation", "refuse", "secondaire"];
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const calibre = (lu: unknown): Calibre => {
  const { modele, effort } = (lu ?? {}) as Record<string, unknown>;
  return { modele: texte(modele) ? modele : "", effort: texte(effort) ? effort : "" };
};

// Le fichier que l'app écrit dans le gist d'une station.
export function documentDeDemande(projets: readonly ProjetDemande[]): string {
  return `${JSON.stringify({ brigade: "projets", format: FORMAT, projets }, null, 2)}\n`;
}

// Ce que l'app a écrit dans le gist d'une station, relu. Absent : rien de
// demandé. Illisible : null — l'app ne le réécrit pas sans le dire.
export function lireDemande(brut: string | undefined): ProjetDemande[] | null {
  if (brut === undefined) return [];
  let lu: { brigade?: unknown; projets?: unknown };
  try {
    lu = JSON.parse(brut) as typeof lu;
  } catch {
    return null;
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "projets" || !Array.isArray(lu.projets)) return null;
  return (lu.projets as unknown[]).flatMap((brut) => {
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe } = (brut ?? {}) as Record<string, unknown>;
    if (!texte(nom) || !texte(depot) || !texte(base)) return [];
    return [{ nom, depot, base, principale: principale === true, cooks: typeof cooks === "number" ? cooks : 0, manager: calibre(manager), reviewer: calibre(reviewer), ouvertLe: date(ouvertLe), demandeLe: date(demandeLe) }];
  });
}

// Ce que la station a écrit de ses projets demandés. Absent ou illisible : rien encore.
export function lireSuivi(brut: string | undefined): SuiviDuProjet[] {
  if (brut === undefined) return [];
  try {
    const lu = JSON.parse(brut) as { brigade?: unknown; projets?: unknown };
    if (lu?.brigade !== "projets-suivi" || !Array.isArray(lu.projets)) return [];
    return (lu.projets as unknown[]).flatMap((brut) => {
      const { nom, etat, dit, autoriser, serviLe: servedAt } = (brut ?? {}) as Record<string, unknown>;
      if (!texte(nom) || !texte(etat) || !ETATS.includes(etat)) return [];
      return [{ nom, etat: etat as EtatDuProjet, dit: texte(dit) ? dit : "", autoriser: Array.isArray(autoriser) ? autoriser.filter((url): url is string => texte(url) && /^https:\/\/github\.com\//.test(url)) : [], serviLe: date(servedAt) }];
    });
  } catch {
    return [];
  }
}
