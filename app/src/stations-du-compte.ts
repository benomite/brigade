// Les stations enregistrées sous le compte GitHub du chef (#1706, épique #1702), et les projets que le chef choisit
// pour chacune. La lecture est celle du runtime (`runtime/src/enregistrement-station/stations-du-compte.ts`), que
// main.ts appelle telle quelle ; ce module écrit la sélection, selon le contrat que le runtime documente
// (`runtime/src/enregistrement-station/README.md`, « The selection the app writes ») : le fichier
// `brigade-selection.json` du gist de la station, réécrit en entier à chaque changement. L'app n'écrit que ce
// fichier-là — l'enregistrement est à la station seule, et un `PATCH` ne touche que les fichiers qu'il nomme.
import type { StationEnregistree, StationsDuCompte } from "../../runtime/src/enregistrement-station/stations-du-compte.ts";

export type { StationEnregistree, StationsDuCompte };

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
