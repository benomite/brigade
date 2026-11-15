// Le rail bloqué dans `brigade <project> status` (#3358) : la ligne que la file
// du second porte, sous la tête du bloc `awaiting` — la même que l'app écrit
// (tableau/rail.ts, `blocAwaiting`), du même diagnostic (`rail-bloque.ts`).
//
// Seule une station GitHub seul la cherche (`github-seul-etat.ts`) : le rail y
// est sur GitHub, et ses tickets `fire` se lisent là, avec les stations du
// compte (`enregistrement-station/stations-du-compte.ts`). Ailleurs, le rail
// est celui du journal, et la cuisine oisive le garde déjà (`cuisine-oisive.ts`).
//
// La cuisine retenue (#3601) se lit au journal de la station, avant les
// stations du compte : le 2026-11-15, le disjoncteur de Secondes, ouvert depuis
// 07:47 après trois échecs, la tenait, et la ligne disait que le manager ne
// prenait rien. Elle nomme désormais la cause que le journal tient — son
// disjoncteur, le « stop » du chef, la cause de son `kitchen.held` — et le
// geste qui la lève.
//
// Une lecture qui échoue le dit, sur la même ligne : jamais un rail dit calme
// faute de l'avoir lu.
import { BOUTON_REPRENDRE_LA_CUISINE } from "../attend.ts";
import type { Base } from "../base.ts";
import { lireLesStationsDuCompte } from "../enregistrement-station/stations-du-compte.ts";
import { lireGitHubSeul } from "../github-seul-etat.ts";
import { clientGh } from "../proteger-branche.ts";
import { echecsDuDisjoncteur, etatDesGardeFous } from "../projections/guardrails.ts";
import { retenueEnCours } from "../retenue/lire.ts";
import { direCause, GESTE_DU_DISJONCTEUR } from "../retenue/retenue.ts";
import { lireLesNonPris, type Lire } from "./lecture.ts";
import { diagnostiquer, heureUtc, ligneDeLaFile, ligneNonLue, type CuisineLue, type CuisineRetenue, type StationsLues } from "./rail-bloque.ts";

// Ce que le journal dit de ce qui retient la cuisine, la cause la plus forte
// d'abord : son disjoncteur ouvert (`breaker.opened`, ou le `kitchen.held` de
// cause `breaker` — celui d'une autre station) ; le « stop » du chef
// (`kitchen.stopped`) ; la cause du `kitchen.held` en cours. Null quand rien ne
// la retient — un `kitchen.held` de cause inconnue n'explique rien : les
// stations, elles, le peuvent.
export function cuisineDuJournal(base: Base): CuisineRetenue | null {
  const garde = etatDesGardeFous(base);
  const tenue = retenueEnCours(base);
  if (garde.breakerOpenedAt !== null) {
    const n = echecsDuDisjoncteur(base).length;
    return { kind: "breaker", dit: `its breaker has been open since ${heureUtc(garde.breakerOpenedAt)}${n === 0 ? "" : `, after ${n} failure${n > 1 ? "s" : ""} in a row`}, no cook leaves`, geste: `to lift it: ${GESTE_DU_DISJONCTEUR}` };
  }
  if (tenue?.cause.kind === "breaker") {
    const de = tenue.cause.station === undefined ? "its breaker" : `the breaker of station ${tenue.cause.station}`;
    return { kind: "breaker", dit: `${de} has been open since ${heureUtc(tenue.cause.since)}, no cook leaves`, geste: `to lift it: ${tenue.gesture ?? GESTE_DU_DISJONCTEUR}` };
  }
  if (garde.stoppedAt !== null) return { kind: "stop", dit: `the chef stopped it at ${heureUtc(garde.stoppedAt)}, no cook leaves`, geste: `to resume it: ${BOUTON_REPRENDRE_LA_CUISINE}` };
  if (tenue === null || tenue.cause.kind === "unknown") return null;
  return { kind: tenue.cause.kind, dit: direCause(tenue.cause).replace(/^cause: /, ""), geste: tenue.gesture === null ? null : `to lift it: ${tenue.gesture}` };
}

// Le journal lu, ou pourquoi il ne se lit pas.
function lireLaCuisine(cuisine: () => CuisineRetenue | null): CuisineLue {
  try {
    return cuisine();
  } catch (erreur) {
    return { illisible: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

// Les lignes du rail bloqué, d'après ce que `lire` rend de GitHub, ce que le journal dit de la cuisine et les stations
// lues : une, ou aucune. Les stations ne se lisent pas quand la cuisine est retenue : sa cause dit tout.
export async function lignesDuRailBloque(options: { depot: string; lire: Lire; stations: () => Promise<StationsLues>; maintenant: number; cuisine?: () => CuisineRetenue | null }): Promise<string[]> {
  const { depot, lire, maintenant } = options;
  let nonPris;
  try {
    nonPris = await lireLesNonPris({ depot, lire });
  } catch (erreur) {
    return [ligneNonLue(depot, erreur instanceof Error ? erreur.message : String(erreur))];
  }
  // Aucun ticket non pris : les stations n'ont rien à dire, elles ne se lisent pas.
  if (nonPris.length === 0) return [];
  const cuisine = options.cuisine === undefined ? null : lireLaCuisine(options.cuisine);
  const retenue = cuisine !== null && !("illisible" in cuisine);
  const bloque = diagnostiquer({ depot, nonPris, stations: retenue ? null : await options.stations(), maintenant, cuisine });
  return bloque === null ? [] : [ligneDeLaFile(bloque)];
}

// `status` le cherche-t-il ? Sur une station GitHub seul, au dépôt nommé : ailleurs, `status` reste sans lecture de GitHub.
export const railBloqueCherche = (env: Record<string, string | undefined>): boolean => Boolean(env.BRIGADE_GITHUB_REPO) && lireGitHubSeul(env.BRIGADE_STATE_DIR)?.etat === "accepted";

// Ce que `status` ajoute : rien hors d'une station GitHub seul, ou sans dépôt nommé.
export async function railBloqueDuStatus(env: Record<string, string | undefined>, maintenant: Date, base: Base): Promise<string[]> {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot || !railBloqueCherche(env)) return [];
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
  return lignesDuRailBloque({ depot, lire, stations, maintenant: maintenant.getTime(), cuisine: () => cuisineDuJournal(base) });
}

// Les lignes de `status`, le rail bloqué posé juste sous la tête du bloc `awaiting` — ou à la fin, sans bloc.
export function avecLeRailBloque(lignes: readonly string[], rail: readonly string[]): string[] {
  if (rail.length === 0) return [...lignes];
  const tete = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
  return tete === -1 ? [...lignes, ...rail] : [...lignes.slice(0, tete + 1), ...rail, ...lignes.slice(tete + 1)];
}
