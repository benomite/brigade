// Les stations enregistrées sous le compte GitHub du chef (#1706, épique #1702), et les projets que le chef choisit
// pour chacune. La lecture est celle du runtime (`runtime/src/enregistrement-station/stations-du-compte.ts`), que
// main.ts appelle telle quelle ; ce module écrit la sélection, selon le contrat que le runtime documente
// (`runtime/src/enregistrement-station/README.md`, « The selection the app writes ») : le fichier
// `brigade-selection.json` du gist de la station, réécrit en entier à chaque changement. L'app n'écrit que ce
// fichier-là — l'enregistrement est à la station seule, et un `PATCH` ne touche que les fichiers qu'il nomme.
//
// Et ce que chaque station a fait d'un dépôt choisi pour elle (#1790, épique #1785) : quand une autre station le servait
// déjà, elle en a rejoint la cuisine, ou elle refuse en une phrase (runtime/src/projets/rejoindre.ts). Elle l'écrit dans
// le suivi de ce même gist (`brigade-projets-suivi.json`, `rejoindre`) : l'app l'y lit, pour chaque station à qui un dépôt
// est choisi, et le joint à ce que le runtime en a lu (`ajouts`).
import type { StationEnregistree as Enregistree, StationsDuCompte as DuCompte } from "../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { FICHIER_SUIVI, lireSuivi } from "./projets/demande.ts";
// Le nom du projet tiré de son dépôt : celui que la station en fait (runtime/src/projets/ajout-de-station.ts, `nomDuDepot`).
import { nomDuProjet } from "./projets/projets.ts";

// Ce qu'une station a fait d'un dépôt choisi pour elle, une fois lu : `seule` — aucune autre ne le servait, elle le
// prépare elle-même, comme avant ; `rejointe` — elle cuit dans la cuisine que `principale` fait tourner ; `refusee` —
// elle ne peut pas la rejoindre, n'en ouvre pas une seconde, et `phrase` dit pourquoi. Un dépôt qu'elle n'a pas encore
// lu n'y est pas.
export type IssueDeLAjout = { depot: string; issue: "seule" } | { depot: string; issue: "rejointe"; principale: string } | { depot: string; issue: "refusee"; phrase: string };
export type StationEnregistree = Enregistree & { ajouts?: IssueDeLAjout[] };
export type StationsDuCompte = Exclude<DuCompte, { state: "listed" }> | (Omit<Extract<DuCompte, { state: "listed" }>, "stations"> & { stations: StationEnregistree[] });

// Ce que le contrat fixe de la sélection : son fichier et son format (`contrat.ts` du runtime, lu par main.ts).
export type ContratDeLaSelection = { FICHIER_SELECTION: string; FORMAT: number };

export type OptionsDuChoix = {
  // Réécrit ces fichiers du gist, sans toucher aux autres (stations/github.ts, `ecrire`).
  ecrire(id: string, fichiers: Record<string, string>): Promise<void>;
  contrat(): Promise<ContratDeLaSelection>;
  maintenant?: () => number;
};

// La sélection écrite — les dépôts tels qu'ils sont dans le gist —, ou pourquoi elle ne l'est pas : une ligne, son
// détail au survol.
export type Choix = { selection: string[] } | { refus: string; detail?: string };

// Un gist s'appelle par son identifiant hexadécimal ; un dépôt est `owner/repo`, comme le contrat le relit.
const GIST = /^[A-Za-z0-9]+$/;
const DEPOT = /^[\w.-]+\/[\w.-]+$/;

export const REFUS_STATION = "not saved: this is not a station the app has read";
export const REFUS_PROJETS = "not saved: these are not GitHub repositories";
export const REFUS_GITHUB = "not saved: GitHub did not take the change";

// Le contenu du fichier : la sélection entière, et l'instant où l'app l'écrit.
export function contenuDeLaSelection(contrat: ContratDeLaSelection, depots: readonly string[], instant: number): string {
  return `${JSON.stringify({ brigade: "station-selection", format: contrat.FORMAT, repositories: depots, updatedAt: new Date(instant).toISOString() }, null, 2)}\n`;
}

// Le geste « choisir les projets d'une station » : ce que la vue envoie est vérifié, puis écrit dans son gist.
export function choixDesProjets(options: OptionsDuChoix): (id: unknown, depots: unknown) => Promise<Choix> {
  const maintenant = options.maintenant ?? Date.now;
  return async (id, depots) => {
    if (typeof id !== "string" || !GIST.test(id)) return { refus: REFUS_STATION };
    if (!Array.isArray(depots) || !depots.every((depot) => typeof depot === "string" && DEPOT.test(depot))) return { refus: REFUS_PROJETS };
    const selection = [...new Set(depots as string[])];
    try {
      const contrat = await options.contrat();
      await options.ecrire(id, { [contrat.FICHIER_SELECTION]: contenuDeLaSelection(contrat, selection, maintenant()) });
    } catch (erreur) {
      return { refus: REFUS_GITHUB, detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    return { selection };
  };
}

// Ce que le suivi d'une station dit des dépôts choisis pour elle : un par dépôt qu'elle a lu, dans l'ordre de sa sélection.
export function ajoutsDuSuivi(brut: string | undefined, selection: readonly string[]): IssueDeLAjout[] {
  const suivi = lireSuivi(brut);
  return selection.flatMap((depot): IssueDeLAjout[] => {
    const dit = suivi.find(({ nom }) => nom === nomDuProjet(depot));
    if (dit === undefined) return [];
    const { rejoindre } = dit;
    if (rejoindre === undefined) return [{ depot, issue: "seule" }];
    return [rejoindre.issue === "rejointe" ? { depot, issue: "rejointe", principale: rejoindre.principale } : { depot, issue: "refusee", phrase: rejoindre.phrase }];
  });
}

// Les stations du compte, avec ce que chacune a fait des dépôts choisis pour elle, lu dans son gist (`lire`, celui de
// stations/github.ts). Un gist qui ne se lit pas n'en dit rien : la station reste telle que le runtime l'a lue.
export async function avecLeursAjouts(lues: DuCompte, lire: (id: string) => Promise<Record<string, string> | null>): Promise<StationsDuCompte> {
  if (lues.state !== "listed") return lues;
  const stations = await Promise.all(
    lues.stations.map(async (station): Promise<StationEnregistree> => {
      const selection = station.selection ?? [];
      if (selection.length === 0) return station;
      let fichiers: Record<string, string> | null;
      try {
        fichiers = await lire(station.id);
      } catch {
        return station;
      }
      const ajouts = ajoutsDuSuivi(fichiers?.[FICHIER_SUIVI], selection);
      return ajouts.length === 0 ? station : { ...station, ajouts };
    }),
  );
  return { ...lues, stations };
}
