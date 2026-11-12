// Le rail bloqué dans `brigade <project> status` (#3358) : la ligne que la file
// du second porte, sous la tête du bloc `awaiting` — la même que l'app écrit
// (tableau/rail.ts, `blocAwaiting`), du même diagnostic (`rail-bloque.ts`).
//
// Seule une station GitHub seul la cherche (`github-seul-etat.ts`) : le rail y
// est sur GitHub, et ses tickets `fire` se lisent là, avec les stations du
// compte (`enregistrement-station/stations-du-compte.ts`). Ailleurs, le rail
// est celui du journal, et la cuisine oisive le garde déjà (`cuisine-oisive.ts`).
//
// Une lecture qui échoue le dit, sur la même ligne : jamais un rail dit calme
// faute de l'avoir lu.
import { lireLesStationsDuCompte } from "../enregistrement-station/stations-du-compte.ts";
import { lireGitHubSeul } from "../github-seul-etat.ts";
import { clientGh } from "../proteger-branche.ts";
import { lireLesNonPris, type Lire } from "./lecture.ts";
import { diagnostiquer, ligneDeLaFile, ligneNonLue, type StationsLues } from "./rail-bloque.ts";

// Les lignes du rail bloqué, d'après ce que `lire` rend de GitHub et les stations lues : une, ou aucune.
export async function lignesDuRailBloque(options: { depot: string; lire: Lire; stations: () => Promise<StationsLues>; maintenant: number }): Promise<string[]> {
  const { depot, lire, maintenant } = options;
  let nonPris;
  try {
    nonPris = await lireLesNonPris({ depot, lire });
  } catch (erreur) {
    return [ligneNonLue(depot, erreur instanceof Error ? erreur.message : String(erreur))];
  }
  // Aucun ticket non pris : les stations n'ont rien à dire, elles ne se lisent pas.
  if (nonPris.length === 0) return [];
  const bloque = diagnostiquer({ depot, nonPris, stations: await options.stations(), maintenant });
  return bloque === null ? [] : [ligneDeLaFile(bloque)];
}

// Ce que `status` ajoute : rien hors d'une station GitHub seul, ou sans dépôt nommé.
export async function railBloqueDuStatus(env: Record<string, string | undefined>, maintenant: Date): Promise<string[]> {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot || lireGitHubSeul(env.BRIGADE_STATE_DIR)?.etat !== "accepted") return [];
  const gh = env.BRIGADE_GH_BIN || "gh";
  const client = clientGh(gh, env as NodeJS.ProcessEnv);
  const lire: Lire = async (chemin) => {
    const { statut, corps } = await client({ methode: "GET", chemin });
    if (statut !== 200) throw new Error(`GitHub answered HTTP ${statut} to ${chemin}`);
    return corps;
  };
  const stations = async (): Promise<StationsLues> => {
    const lues = await lireLesStationsDuCompte({ gh, env: env as NodeJS.ProcessEnv, maintenant: () => maintenant.getTime() });
    return lues.state === "listed" ? { lues: lues.stations } : { illisibles: lues.reason };
  };
  return lignesDuRailBloque({ depot, lire, stations, maintenant: maintenant.getTime() });
}

// Les lignes de `status`, le rail bloqué posé juste sous la tête du bloc `awaiting` — ou à la fin, sans bloc.
export function avecLeRailBloque(lignes: readonly string[], rail: readonly string[]): string[] {
  if (rail.length === 0) return [...lignes];
  const tete = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
  return tete === -1 ? [...lignes, ...rail] : [...lignes.slice(0, tete + 1), ...rail, ...lignes.slice(tete + 1)];
}
