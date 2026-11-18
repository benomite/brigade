// La part de chaque projet dans le budget horaire d'appels GitHub de la station
// (#3683). Un projet qui appelait trop (1217 appels sur 2700 en une heure) a
// arrêté les autres plus d'une heure : la limite de GitHub tombait sur tous. Le
// compteur partagé (`limite-github.ts`, `prendre`) lit ici, à chaque appel de la
// cuisine d'un projet, combien ce projet en a fait sur l'heure glissante : à sa
// part, son appel attend dans la file que le plus ancien sorte de l'heure, et
// seuls les appels de ce projet attendent derrière lui — les autres partent.
//
// Choix : le budget de la station divisé par les projets qui ont appelé GitHub
// dans l'heure glissante, celui qui appelle compris (ticket 3821). Une part fixe
// d'un sixième retenait un projet occupé à 666 appels — sa lecture du rail les
// prenait tous — pendant que des projets au repos gardaient la leur. Les projets
// actifs à leur part restent, ensemble, sous le budget ; un projet qui se réveille
// réduit la part des autres, qui attendent alors leur nouvelle part. Les appels de la station elle-même
// (signe de vie, canal du gist : le projet « station ») et les gestes du chef
// comptent dans le total, jamais ne sont retenus par une part.
// `limite-github.ts` importe ce module : ce qui en vient ne se lit que dans les fonctions.
import { FENETRE_MS, PROJET_DE_LA_STATION } from "../limite-github.ts";

// Le budget horaire d'appels de la station, tous projets ensemble : les 5000
// appels par heure que GitHub donne à un compte, moins la réserve des gestes du
// chef (un dixième, `RESERVE_DES_GESTES`) et une marge pour son Mac, qui
// partage le compte de la machine.
export const BUDGET_DE_LA_STATION_PAR_HEURE = 4000;
type Lire = <T>(sql: string, ...params: Array<string | number>) => T[];

// La part de chacun de `actifs` projets : le budget divisé.
const partDe = (actifs: number): number => Math.floor(BUDGET_DE_LA_STATION_PAR_HEURE / Math.max(1, actifs));

// La part d'un projet à cet instant : les appels qu'il fait sur l'heure glissante
// avant d'attendre — le budget divisé par les projets qui y ont appelé, `projet`
// compté même s'il n'a pas encore appelé.
export function partDeLHeure(lire: Lire, projet: string, instant: number): number {
  const actifs = lire<{ projet: string }>("SELECT DISTINCT projet FROM appels WHERE projet IS NOT NULL AND projet <> ? AND instant > ?", PROJET_DE_LA_STATION, instant - FENETRE_MS).map(({ projet: nom }) => nom);
  return partDe(actifs.includes(projet) ? actifs.length : actifs.length + 1);
}

// L'appel d'un projet qui a fait sa part de l'heure : il ne part pas, n'est pas
// compté, et attend dans la file jusqu'à `jusqua`. Ce n'est pas un refus de
// GitHub, et il ne retient que les appels de son projet.
export class PartAtteinte extends Error {
  readonly projet: string;
  readonly jusqua: number;
  // Les appels du projet sur l'heure écoulée.
  readonly appels: number;
  // Sa part à cet instant (`partDeLHeure`).
  readonly part: number;
  constructor(projet: string, jusqua: number, dansMs: number, appels: number, part: number) {
    super(`project ${projet} has made its share of GitHub calls — ${appels} of ${part} in the last hour, the next one in ${Math.ceil(dansMs / 1000)} s`);
    this.name = "PartAtteinte";
    this.projet = projet;
    this.jusqua = jusqua;
    this.appels = appels;
    this.part = part;
  }
}

// À lire dans la transaction de `prendre`, avant d'inscrire un appel de la
// cuisine de `projet` : null s'il part, sinon l'instant où il peut partir et ses
// appels. Il attend à sa part, et aussi quand les projets ensemble ont fait le
// budget de la station : une part qui grandit quand d'autres se couchent ne
// laisse pas la somme passer le budget (ticket 3821).
export function retenueDeLaPart(lire: Lire, projet: string, instant: number, part = partDeLHeure(lire, projet, instant)): { jusqua: number; appels: number; part: number } | null {
  if (projet === PROJET_DE_LA_STATION) return null;
  const depuis = instant - FENETRE_MS;
  const tous = lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE projet IS NOT NULL AND projet <> ? AND instant > ?", PROJET_DE_LA_STATION, depuis)[0]?.n ?? 0;
  // Le compte seul, sur l'index : presque toujours, le projet est sous sa part.
  const aSaPart = lire("SELECT 1 FROM appels WHERE projet = ? AND instant > ? LIMIT 1 OFFSET ?", projet, depuis, part - 1).length > 0;
  if (!aSaPart && tous < BUDGET_DE_LA_STATION_PAR_HEURE) return null;
  const appels = lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE projet = ? AND instant > ?", projet, depuis)[0]?.n ?? 0;
  let jusqua = instant;
  if (aSaPart) {
    const [sortant] = lire<{ instant: number }>("SELECT instant FROM appels WHERE projet = ? AND instant > ? ORDER BY instant ASC LIMIT 1 OFFSET ?", projet, depuis, appels - part);
    jusqua = Math.max(jusqua, (sortant?.instant ?? instant) + FENETRE_MS);
  }
  if (tous >= BUDGET_DE_LA_STATION_PAR_HEURE) {
    // Le budget de la station est fait : le prochain appel part quand assez d'appels de tous en sortent.
    const [sortant] = lire<{ instant: number }>("SELECT instant FROM appels WHERE projet IS NOT NULL AND projet <> ? AND instant > ? ORDER BY instant ASC LIMIT 1 OFFSET ?", PROJET_DE_LA_STATION, depuis, tous - BUDGET_DE_LA_STATION_PAR_HEURE);
    jusqua = Math.max(jusqua, (sortant?.instant ?? instant) + FENETRE_MS);
  }
  return { jusqua, appels, part };
}

// Un projet, ses appels de l'heure glissante, et, s'il attend sa part,
// l'instant où elle le laisse repartir (#3705) ; null s'il part.
export type PartDuProjet = { projet: string; appels: number; part: number; reprise: number | null };

export function partsDe(lire: Lire, instant: number): PartDuProjet[] {
  const lus = lire<{ projet: string; appels: number }>(
    "SELECT projet, count(*) AS appels FROM appels WHERE projet IS NOT NULL AND projet <> ? AND instant > ? GROUP BY projet ORDER BY appels DESC, projet ASC",
    PROJET_DE_LA_STATION,
    instant - FENETRE_MS,
  );
  const part = partDe(lus.length);
  return lus.map(({ projet, appels }) => ({ projet, appels, part, reprise: retenueDeLaPart(lire, projet, instant, part)?.jusqua ?? null }));
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
