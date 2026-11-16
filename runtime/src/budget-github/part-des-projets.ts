// La part de chaque projet dans le budget horaire d'appels GitHub de la station
// (#3683). Un projet qui appelait trop (1217 appels sur 2700 en une heure) a
// arrêté les autres plus d'une heure : la limite de GitHub tombait sur tous. Le
// compteur partagé (`limite-github.ts`, `prendre`) lit ici, à chaque appel de la
// cuisine d'un projet, combien ce projet en a fait sur l'heure glissante : à sa
// part, son appel attend dans la file que le plus ancien sorte de l'heure, et
// seuls les appels de ce projet attendent derrière lui — les autres partent.
//
// Choix : une part fixe, le budget de la station divisé par les six projets
// qu'elle sert. Six projets à leur part restent, à eux six, sous le budget, et un
// projet n'attend jamais à cause d'un autre. Les appels de la station elle-même
// (signe de vie, canal du gist : le projet « station ») et les gestes du chef
// comptent dans le total, jamais ne sont retenus par une part.
// `limite-github.ts` importe ce module : ce qui en vient ne se lit que dans les fonctions.
import { FENETRE_MS, PROJET_DE_LA_STATION } from "../limite-github.ts";

// Le budget horaire d'appels de la station, tous projets ensemble : les 5000
// appels par heure que GitHub donne à un compte, moins la réserve des gestes du
// chef (un dixième, `RESERVE_DES_GESTES`) et une marge pour son Mac, qui
// partage le compte de la machine.
export const BUDGET_DE_LA_STATION_PAR_HEURE = 4000;
// Les projets qu'une station sert : la part de chacun en est le diviseur.
export const PROJETS_DE_LA_STATION = 6;
// La part d'un projet : les appels qu'il fait sur l'heure glissante avant d'attendre.
export const PART_D_UN_PROJET = Math.floor(BUDGET_DE_LA_STATION_PAR_HEURE / PROJETS_DE_LA_STATION);

type Lire = <T>(sql: string, ...params: Array<string | number>) => T[];

// L'appel d'un projet qui a fait sa part de l'heure : il ne part pas, n'est pas
// compté, et attend dans la file jusqu'à `jusqua`. Ce n'est pas un refus de
// GitHub, et il ne retient que les appels de son projet.
export class PartAtteinte extends Error {
  readonly projet: string;
  readonly jusqua: number;
  // Les appels du projet sur l'heure écoulée.
  readonly appels: number;
  constructor(projet: string, jusqua: number, dansMs: number, appels: number) {
    super(`project ${projet} has made its share of GitHub calls — ${appels} of ${PART_D_UN_PROJET} in the last hour, the next one in ${Math.ceil(dansMs / 1000)} s`);
    this.name = "PartAtteinte";
    this.projet = projet;
    this.jusqua = jusqua;
    this.appels = appels;
  }
}

// À lire dans la transaction de `prendre`, avant d'inscrire un appel de la
// cuisine de `projet` : null s'il part, sinon l'instant où sa part le laisse
// partir — quand assez de ses appels de l'heure en sont sortis — et ses appels.
export function retenueDeLaPart(lire: Lire, projet: string, instant: number, part = PART_D_UN_PROJET): { jusqua: number; appels: number } | null {
  if (projet === PROJET_DE_LA_STATION) return null;
  const depuis = instant - FENETRE_MS;
  // Le compte seul, sur l'index : presque toujours, le projet est sous sa part.
  if (lire("SELECT 1 FROM appels WHERE projet = ? AND instant > ? LIMIT 1 OFFSET ?", projet, depuis, part - 1).length === 0) return null;
  const appels = lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE projet = ? AND instant > ?", projet, depuis)[0]?.n ?? 0;
  const [sortant] = lire<{ instant: number }>("SELECT instant FROM appels WHERE projet = ? AND instant > ? ORDER BY instant ASC LIMIT 1 OFFSET ?", projet, depuis, appels - part);
  return { jusqua: (sortant?.instant ?? instant) + FENETRE_MS, appels };
}

// Un projet, ses appels de l'heure glissante, et, s'il attend sa part,
// l'instant où elle le laisse repartir (#3705) ; null s'il part.
export type PartDuProjet = { projet: string; appels: number; part: number; reprise: number | null };

export function partsDe(lire: Lire, instant: number, part = PART_D_UN_PROJET): PartDuProjet[] {
  return lire<{ projet: string; appels: number }>(
    "SELECT projet, count(*) AS appels FROM appels WHERE projet IS NOT NULL AND projet <> ? AND instant > ? GROUP BY projet ORDER BY appels DESC, projet ASC",
    PROJET_DE_LA_STATION,
    instant - FENETRE_MS,
  ).map(({ projet, appels }) => ({ projet, appels, part, reprise: appels >= part ? (retenueDeLaPart(lire, projet, instant, part)?.jusqua ?? null) : null }));
}

// Ce qui se dit d'un projet que sa part retient : retenu, et l'heure (UTC) où il reprend (#3705).
export function direLaRetenueDeLaPart(reprise: number): string {
  return `held back for its GitHub share, resumes at ${new Date(reprise).toISOString().slice(11, 16)} UTC`;
}

// Les lignes de `status` : chaque projet, ses appels de l'heure contre sa part,
// et, pour le seul projet que sa part retient, l'heure où il reprend. Sans appel
// d'un projet dans l'heure, aucune ligne.
export function direLesParts(parts: readonly PartDuProjet[]): string[] {
  return parts.map(({ projet, appels, part, reprise }) => `${projet} ${appels}/${part} calls in the last hour${reprise === null ? "" : ` — ${direLaRetenueDeLaPart(reprise)}`}`);
}
