// Ce que l'app demande à une station, et ce que la station en dit — le format
// est celui de la station (runtime/src/projets/demande.ts). Deux fichiers de
// plus dans le gist de chaque station appairée (stations/document.ts) :
//   - `brigade-projets.json`, écrit par l'app seule : les projets que le chef
//     demande à cette station, et si elle en est la principale — celle qui fait
//     tourner son manager et sa pass ;
//   - `brigade-projets-suivi.json`, écrit par la station seule : où en est
//     chacun — servi, à autoriser sur GitHub (avec les pages où le faire), en
//     préparation, refusé (et pourquoi), ou secondaire — et où il cuit (`cuitSur`, `ici`), et où en
//     est son déménagement (`bascule`).
// Un déménagement de sa cuisine (runtime/src/demenagement/) ajoute à la demande `remise`, sur la
// station qu'il quitte, et `reprise`, sur celle qui le reprend : l'app les relit et les réécrit tels
// quels — sans eux, le déménagement en cours ne serait plus qu'un changement de principale.
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
  // Le déménagement en cours, vu de la station qu'il quitte (`remise`) ou de celle qui le reprend
  // (`reprise`) : l'autre station, son gist, l'instant de la demande. Écrits par le runtime seul.
  remise?: { vers: string; gist: string; demandeLe: string };
  reprise?: { de: string; gist: string; demandeLe: string };
};

export type EtatDuProjet = "servi" | "a-autoriser" | "en-preparation" | "refuse" | "secondaire";
// Où en est un déménagement, vu d'une station (runtime/src/projets/demande.ts) : demandé, accepté
// par celle qui le reprend, refusé par elle, remis par celle qu'il quitte, reçu — fini.
export type EtapeDeBascule = "demandee" | "acceptee" | "refusee" | "remise" | "recue";
export type Bascule = { de: string; vers: string; demandeLe: string; etape: EtapeDeBascule };
// `cuitSur` : la station où il cuit, telle que celle-ci la connaît ; `ici` : il cuit sur celle-ci, et
// c'est l'ordinateur du chef. Une station d'avant le déménagement (#1094) n'en dit rien.
export type SuiviDuProjet = { nom: string; etat: EtatDuProjet; dit: string; autoriser: string[]; serviLe: string | null; cuitSur: string | null; ici: boolean; bascule: Bascule | null };

const ETATS: readonly string[] = ["servi", "a-autoriser", "en-preparation", "refuse", "secondaire"];
const ETAPES: readonly string[] = ["demandee", "acceptee", "refusee", "remise", "recue"];
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): string | null => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const nomDeStation = (valeur: unknown): valeur is string => texte(valeur) && valeur.trim() !== "" && valeur.length <= 100;
const gist = (valeur: unknown): valeur is string => texte(valeur) && /^[A-Za-z0-9]{1,64}$/.test(valeur);
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
    const { nom, depot, base, principale, cooks, manager, reviewer, ouvertLe, demandeLe, remise, reprise } = (brut ?? {}) as Record<string, unknown>;
    if (!texte(nom) || !texte(depot) || !texte(base)) return [];
    const laRemise = (remise ?? {}) as Record<string, unknown>;
    const laReprise = (reprise ?? {}) as Record<string, unknown>;
    return [
      {
        nom,
        depot,
        base,
        principale: principale === true,
        cooks: typeof cooks === "number" ? cooks : 0,
        manager: calibre(manager),
        reviewer: calibre(reviewer),
        ouvertLe: date(ouvertLe),
        demandeLe: date(demandeLe),
        ...(nomDeStation(laRemise.vers) && gist(laRemise.gist) && date(laRemise.demandeLe) !== null ? { remise: { vers: laRemise.vers, gist: laRemise.gist, demandeLe: laRemise.demandeLe as string } } : {}),
        ...(nomDeStation(laReprise.de) && gist(laReprise.gist) && date(laReprise.demandeLe) !== null ? { reprise: { de: laReprise.de, gist: laReprise.gist, demandeLe: laReprise.demandeLe as string } } : {}),
      },
    ];
  });
}

// Ce que la station a écrit de ses projets demandés. Absent ou illisible : rien encore.
export function lireSuivi(brut: string | undefined): SuiviDuProjet[] {
  if (brut === undefined) return [];
  try {
    const lu = JSON.parse(brut) as { brigade?: unknown; projets?: unknown };
    if (lu?.brigade !== "projets-suivi" || !Array.isArray(lu.projets)) return [];
    return (lu.projets as unknown[]).flatMap((brut) => {
      const { nom, etat, dit, autoriser, serviLe, cuitSur, ici, bascule } = (brut ?? {}) as Record<string, unknown>;
      if (!texte(nom) || !texte(etat) || !ETATS.includes(etat)) return [];
      return [
        {
          nom,
          etat: etat as EtatDuProjet,
          dit: texte(dit) ? dit : "",
          autoriser: Array.isArray(autoriser) ? autoriser.filter((url): url is string => texte(url) && /^https:\/\/github\.com\//.test(url)) : [],
          serviLe: date(serviLe),
          cuitSur: nomDeStation(cuitSur) ? cuitSur : null,
          ici: ici === true,
          bascule: lireBascule(bascule),
        },
      ];
    });
  } catch {
    return [];
  }
}

// Ce qu'une station dit d'un déménagement, ou null.
export function lireBascule(lue: unknown): Bascule | null {
  const { de, vers, demandeLe, etape } = (lue ?? {}) as Record<string, unknown>;
  return nomDeStation(de) && nomDeStation(vers) && date(demandeLe) !== null && texte(etape) && ETAPES.includes(etape) ? { de, vers, demandeLe: demandeLe as string, etape: etape as EtapeDeBascule } : null;
}
