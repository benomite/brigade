// Ce que le manager prête aux relectures de son tour : le suivi d'un verdict `incomplete` (manager/verdict-incomplet.ts)
// et la roadmap écartée (manager/roadmap.ts).
import type { Reponse } from "../decoupage.ts";
import type { FaitManager } from "../events/manager.ts";
import type { GitHub } from "../github.ts";
import type { Journal } from "../journal.ts";

export type AtelierDuManager = {
  journal: Journal;
  projet: string;
  github: GitHub;
  depotGitHub: string;
  noter: (ticket: number | null, fait: FaitManager) => unknown;
  demander: <T>(
    sujet: { numero: number; prefixe: string; nom: string },
    consigne: string,
    lire: (message: string | null) => { valeur: T } | { illisible: string },
  ) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  arrete: () => boolean;
  avertir: (message: string) => void;
  signature: (run: string | null, verbe: string) => string;
};
